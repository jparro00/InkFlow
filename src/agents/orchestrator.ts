import { supabase } from '../lib/supabase';
import { useAgentStore } from '../stores/agentStore';
import { useClientStore } from '../stores/clientStore';
import { useBookingStore } from '../stores/bookingStore';
import { useMessageStore } from '../stores/messageStore';
import { resolveClient, resolveBooking, resolveConversation, findAllNameMatches } from './resolvers';
import { executeBookingCreate, executeBookingOpen, executeBookingEdit, executeBookingDelete } from './bookingAgent';
import { executeClientCreate, executeClientOpen, executeClientEdit, executeClientDelete } from './clientAgent';
import { executeScheduleQuery, findFirstAvailableSlot } from './scheduleAgent';
import { executeMessagingOpen, executeMessagingDraft, buildTemplates, applyDraftTemplate } from './messagingAgent';
import { executeFeedbackDraft } from './feedbackAgent';
import type { AgentIntent, DraftTemplate } from './types';

/**
 * Orchestrator — the central brain.
 *
 * 1. Calls the agent-parse edge function to classify intent
 * 2. Resolves all ambiguous entities (client, booking, conversation)
 * 3. If disambiguation needed → shows selection cards, stashes intent
 * 4. Once resolved → hands off to the appropriate sub-agent executor
 */

/**
 * Build a descriptive error message from a Supabase FunctionsError.
 *
 * Three shapes to handle:
 * - FunctionsHttpError: edge function returned a non-2xx — has a `context`
 *   Response we can read the body from (usually has a JSON `error` field)
 * - FunctionsRelayError: relay couldn't reach the function
 * - FunctionsFetchError: the fetch itself failed (network/CORS/offline) —
 *   no context, just the fetch error. The default message is the unhelpful
 *   "Failed to send a request to the Edge Function". We surface what we can:
 *   online status, error name, cause, and the function URL.
 */
async function describeFunctionError(error: unknown): Promise<string> {
  const e = error as Error & { context?: Response; cause?: unknown; name?: string };

  // HTTP error from the function — read the response body
  const ctx = e.context;
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = await ctx.clone().json();
      const msg = body?.error || JSON.stringify(body);
      return `HTTP ${ctx.status}: ${msg}`;
    } catch {
      try {
        const txt = await ctx.text();
        return `HTTP ${ctx.status}: ${txt || '(empty body)'}`;
      } catch {
        return `HTTP ${ctx.status} (couldn't read body)`;
      }
    }
  }

  // Network/fetch failure — enrich with whatever we can find
  const parts: string[] = [];
  parts.push(e.name || 'Error');
  parts.push(e.message || String(error));
  if (typeof navigator !== 'undefined' && 'onLine' in navigator && !navigator.onLine) {
    parts.push('(device appears offline)');
  }
  if (e.cause) {
    const causeMsg =
      e.cause instanceof Error ? `${e.cause.name}: ${e.cause.message}` : String(e.cause);
    parts.push(`cause: ${causeMsg}`);
  }
  return parts.join(' — ');
}

/**
 * Heuristic: does this user text clearly describe a booking on top of
 * whatever other action it mentions? Used as a safety net when agent-parse
 * misclassifies a compound "create X as a client and then book Y" prompt
 * as a plain client/create.
 */
function hasBookingIntent(text: string): boolean {
  const t = text.toLowerCase();
  // Booking verbs/nouns
  const keywords = [
    'book',
    'schedule',
    'appointment',
    'session',
    'touch up',
    'touchup',
    'touch-up',
    'consultation',
    'full day',
    'full-day',
    'cover up',
    'cover-up',
    'coverup',
    'regular',
    'tattoo',
  ];
  return keywords.some((k) => t.includes(k));
}

/** Show a no-match message with fuzzy suggestions + search prompt */
function showNoMatch(query: string, suggestions: import('../types').Client[]) {
  const store = useAgentStore.getState();
  const pending = store.pendingIntent;
  const isBookingCreate = pending?.agent === 'booking' && pending.action === 'create';
  const suffix = isBookingCreate
    ? ' Tap "Create new client" to add them and continue the booking, or pick an existing match:'
    : '';
  if (suggestions.length > 0) {
    store.replaceLastLoading({
      text: `No exact match for "${query}".${suffix || ' Did you mean:'}`,
      selections: {
        type: 'client',
        items: suggestions,
        mode: 'single',
        context: 'no_match',
      },
    });
  } else {
    store.replaceLastLoading({
      text: `No client named "${query}".${suffix || ' Try a different name.'}`,
      selections: {
        type: 'client',
        items: useClientStore.getState().clients.slice(0, 8),
        mode: 'single',
        context: 'no_match',
      },
    });
  }
}

/**
 * When `resolveClient` commits to one client (exact/single) but that client
 * has no bookings matching the requested action, check whether other
 * name-siblings do. If so, show them as a disambiguation card so the user
 * can correct the pick rather than dead-ending on "No matching booking
 * found." Returns true if the fallback fired (caller must return).
 *
 * Triggered by e.g. a client named just "John" (exact match, no bookings)
 * eclipsing "John Taylor" (partial match, has the actual booking).
 */
function trySiblingClientFallback(
  nameQuery: string | undefined,
  committedClientId: string
): boolean {
  if (!nameQuery) return false;
  const store = useAgentStore.getState();
  const clients = useClientStore.getState().clients;
  const bookings = useBookingStore.getState().bookings;
  const siblings = findAllNameMatches(nameQuery, clients).filter(
    (c) =>
      c.id !== committedClientId &&
      bookings.some(
        (b) =>
          b.client_id === c.id &&
          b.status !== 'Cancelled' &&
          b.status !== 'No-show'
      )
  );
  if (siblings.length === 0) return false;
  store.logTrace('client_sibling_fallback', {
    reason: 'primary_had_no_bookings',
    sibling_count: siblings.length,
  });
  // Un-commit the primary pick so the user's selection replaces it when
  // routing resumes in handleSelection.
  store.updatePendingResolved('client_id', undefined);
  store.replaceLastLoading({
    text: `Which ${nameQuery}?`,
    selections: {
      type: 'client',
      items: siblings,
      mode: 'single',
      context: 'ambiguous_client',
    },
  });
  return true;
}

export async function processInput(text: string) {
  const store = useAgentStore.getState();

  // Start a fresh trace for this exchange
  store.startTrace();
  store.logTrace('user_input', { text });

  store.addUserMessage(text);
  store.setLoading(true);

  try {
    store.logTrace('edge_call', { fn: 'agent-parse', body: { text } });

    // Timeout wrapper — supabase.functions.invoke has no built-in timeout,
    // so if the Anthropic API hangs or the network stalls the await would
    // never resolve and the spinner would clock forever. Cap at 30s.
    const invokePromise = supabase.functions.invoke('agent-parse', {
      body: { text },
    });
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('agent-parse timed out after 30s')), 30000)
    );
    const { data, error } = (await Promise.race([
      invokePromise,
      timeoutPromise,
    ])) as Awaited<typeof invokePromise>;

    if (error) {
      const errMsg = await describeFunctionError(error);
      console.error('Agent parse error:', errMsg, error);
      store.logTrace('edge_error', { fn: 'agent-parse', message: errMsg });
      store.replaceLastLoading({
        text: `Error: ${errMsg}`,
      });
      return;
    }

    // Check if the response itself contains an error (from the edge function)
    if (data?.error) {
      console.error('Agent parse returned error:', data.error);
      store.logTrace('edge_error', { fn: 'agent-parse', message: data.error });
      store.replaceLastLoading({
        text: `Error: ${data.error}`,
      });
      return;
    }

    store.logTrace('edge_response', { fn: 'agent-parse', data });

    const intent = data as AgentIntent;

    if (intent.agent === 'unknown' || intent.action === 'unknown') {
      store.logTrace('unknown_intent', { intent });
      store.replaceLastLoading({
        text: "I'm not sure what you'd like to do. Try something like \"book Chris Friday 2pm\" or \"how many tattoos this week\".",
      });
      return;
    }

    store.logTrace('intent_parsed', { agent: intent.agent, action: intent.action, entities: intent.entities });

    // Safety net for compound "create-and-book" prompts.
    // If the AI misclassified (returned client/create even though the text
    // also mentions scheduling an appointment), reroute to booking/create.
    // The no-match flow will then offer to create the new client first and
    // auto-continue into the booking form.
    if (
      intent.agent === 'client' &&
      intent.action === 'create' &&
      hasBookingIntent(text)
    ) {
      const clientName = intent.entities.name || intent.entities.client_name;
      if (clientName) {
        store.logTrace('compound_rewrite', {
          from: 'client/create',
          to: 'booking/create',
          clientName,
        });
        const rewritten: AgentIntent = {
          agent: 'booking',
          action: 'create',
          entities: {
            ...intent.entities,
            client_name: clientName,
            name: undefined,
          },
        };
        store.setPending(rewritten);
        store.updatePendingResolved('originalText', text);
        await routeIntent(rewritten);
        return;
      }
    }

    // Stash intent and original text for potential follow-up AI calls
    store.setPending(intent);
    store.updatePendingResolved('originalText', text);
    await routeIntent(intent);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Agent parse error:', err);
    store.logTrace('exception', { message: msg });
    store.replaceLastLoading({
      text: `Something went wrong: ${msg}`,
    });
  }
}

/**
 * Route an intent through entity resolution → sub-agent execution.
 * May pause for disambiguation (showing selection cards).
 */
async function routeIntent(intent: AgentIntent) {
  const store = useAgentStore.getState();
  const resolved = store.pendingResolved;

  switch (intent.agent) {
    case 'booking':
      return routeBooking(intent, resolved);
    case 'client':
      return routeClient(intent, resolved);
    case 'schedule':
      return routeSchedule(intent);
    case 'messaging':
      return routeMessaging(intent, resolved);
    case 'feedback':
      return routeFeedback(intent, resolved);
  }
}

// ─── Booking Routing ────────────────────────────────────────────────

async function routeBooking(
  intent: AgentIntent,
  resolved: Record<string, unknown>
) {
  const store = useAgentStore.getState();

  if (intent.action === 'create') {
    // Personal bookings skip client resolution — they use a free-text title instead.
    const isPersonal = intent.entities.type === 'Personal';

    // For create, try to resolve client if mentioned (skipped for Personal bookings)
    if (!isPersonal && intent.entities.client_name && !resolved.client_id) {
      const clients = useClientStore.getState().clients;
      const result = resolveClient(intent.entities.client_name, clients);
      store.logTrace('client_resolved', {
        outcome: result.type,
        count: result.type === 'multiple' ? result.clients.length : result.type === 'none' ? 0 : 1,
      });

      switch (result.type) {
        case 'exact':
        case 'single':
          resolved.client_id = result.client.id;
          break;
        case 'multiple':
          store.replaceLastLoading({
            text: `Which ${intent.entities.client_name}?`,
            selections: {
              type: 'client',
              items: result.clients,
              mode: 'single',
              context: 'ambiguous_client',
            },
          });
          return; // Wait for selection
        case 'none':
          showNoMatch(intent.entities.client_name!, result.suggestions);
          return; // Wait for selection or create
      }
    }

    // "first available" / "next open" — compute the slot from the schedule
    let resolvedDate = intent.entities.date;
    let resolvedTimeSlot = intent.entities.timeSlot;
    if (!resolvedDate && intent.entities.find_slot) {
      const slot = findFirstAvailableSlot(intent.entities.find_slot);
      if (!slot) {
        store.logTrace('no_slot_found', { preference: intent.entities.find_slot });
        store.replaceLastLoading({
          text: `No open ${intent.entities.find_slot === 'any' ? '' : intent.entities.find_slot + ' '}slots found in the next 60 days. Try picking a specific date.`,
        });
        return;
      }
      resolvedDate = slot.iso;
      resolvedTimeSlot = slot.timeSlot;
      store.logTrace('slot_found', { preference: intent.entities.find_slot, slot });
    }

    const bookingPayload = {
      client_id: isPersonal ? undefined : (resolved.client_id as string | undefined),
      date: resolvedDate,
      duration: intent.entities.duration,
      type: intent.entities.type,
      timeSlot: resolvedTimeSlot,
      estimate: intent.entities.estimate,
      notes: intent.entities.notes,
      rescheduled: intent.entities.rescheduled,
      title: isPersonal ? intent.entities.title : undefined,
    };
    store.logTrace('sub_agent', { agent: 'booking', action: 'create', payload: bookingPayload });
    executeBookingCreate(bookingPayload);
    return;
  }

  // Search — always show results as cards, never auto-open
  if (intent.action === 'search') {
    // If user tapped a booking card from search results, open it
    if (resolved.booking_id) {
      executeBookingOpen({ booking_id: resolved.booking_id as string });
      return;
    }

    // Resolve client first if mentioned
    if (intent.entities.client_name && !resolved.client_id) {
      const clients = useClientStore.getState().clients;
      const result = resolveClient(intent.entities.client_name, clients);
      store.logTrace('client_resolved', {
        outcome: result.type,
        count: result.type === 'multiple' ? result.clients.length : result.type === 'none' ? 0 : 1,
      });

      switch (result.type) {
        case 'exact':
        case 'single':
          resolved.client_id = result.client.id;
          break;
        case 'multiple':
          store.replaceLastLoading({
            text: `Which ${intent.entities.client_name}?`,
            selections: {
              type: 'client',
              items: result.clients,
              mode: 'single',
              context: 'ambiguous_client',
            },
          });
          return;
        case 'none':
          showNoMatch(intent.entities.client_name!, result.suggestions);
          return;
      }
    }

    // Find bookings matching the hints
    const bookings = useBookingStore.getState().bookings;
    const bookingResult = resolveBooking(
      {
        client_id: resolved.client_id as string | undefined,
        date: intent.entities.date,
        type: intent.entities.type,
      },
      bookings
    );
    store.logTrace('booking_resolved', {
      outcome: bookingResult.type,
      count: bookingResult.type === 'multiple' ? bookingResult.bookings.length : bookingResult.type === 'none' ? 0 : 1,
    });

    const clientName = intent.entities.client_name || '';

    switch (bookingResult.type) {
      case 'exact':
        store.replaceLastLoading({
          text: `Found 1 booking${clientName ? ` for ${clientName}` : ''}:`,
          selections: {
            type: 'booking',
            items: [bookingResult.booking],
            mode: 'single',
            context: 'ambiguous_booking',
          },
        });
        return;
      case 'multiple':
        store.replaceLastLoading({
          text: `Found ${bookingResult.bookings.length} bookings${clientName ? ` for ${clientName}` : ''}:`,
          selections: {
            type: 'booking',
            items: bookingResult.bookings,
            mode: 'single',
            context: 'ambiguous_booking',
          },
        });
        return;
      case 'none':
        store.replaceLastLoading({
          text: `No upcoming bookings found${clientName ? ` for ${clientName}` : ''}.`,
        });
        return;
    }
  }

  if (intent.action === 'open' || intent.action === 'edit' || intent.action === 'delete') {
    // For open/edit/delete, we need to find the booking.
    // Client is just one way to narrow down — not required.
    if (intent.entities.client_name && !resolved.client_id) {
      const clients = useClientStore.getState().clients;
      const result = resolveClient(intent.entities.client_name, clients);
      store.logTrace('client_resolved', {
        outcome: result.type,
        count: result.type === 'multiple' ? result.clients.length : result.type === 'none' ? 0 : 1,
      });

      switch (result.type) {
        case 'exact':
        case 'single':
          resolved.client_id = result.client.id;
          break;
        case 'multiple':
          store.replaceLastLoading({
            text: `Which ${intent.entities.client_name}?`,
            selections: {
              type: 'client',
              items: result.clients,
              mode: 'single',
              context: 'ambiguous_client',
            },
          });
          return;
        case 'none':
          showNoMatch(intent.entities.client_name!, result.suggestions);
          return;
      }
    }

    // Resolve booking
    if (!resolved.booking_id) {
      const bookings = useBookingStore.getState().bookings;
      // For edit/delete actions, the date in entities is the TARGET date
      // (what to change to), not the current booking date. Don't use it as
      // a filter or we'll fail to find the existing booking.
      const bookingResult = resolveBooking(
        {
          client_id: resolved.client_id as string | undefined,
          date: intent.action === 'open' ? intent.entities.date : undefined,
          type: intent.entities.type,
        },
        bookings
      );
      store.logTrace('booking_resolved', {
        outcome: bookingResult.type,
        count: bookingResult.type === 'multiple' ? bookingResult.bookings.length : bookingResult.type === 'none' ? 0 : 1,
      });

      switch (bookingResult.type) {
        case 'exact':
          resolved.booking_id = bookingResult.booking.id;
          break;
        case 'multiple':
          store.replaceLastLoading({
            text: 'Which booking?',
            selections: {
              type: 'booking',
              items: bookingResult.bookings,
              mode: 'single',
              context: 'ambiguous_booking',
            },
          });
          return;
        case 'none':
          // Before dead-ending, check if the user's name query had sibling
          // matches that DO have bookings (e.g. we committed to exact "John"
          // with zero bookings while "John Taylor" has one). If so, offer a
          // disambiguation card instead of a cold "not found."
          if (
            typeof resolved.client_id === 'string' &&
            trySiblingClientFallback(intent.entities.client_name, resolved.client_id)
          ) {
            return;
          }
          store.replaceLastLoading({
            text: 'No matching booking found.',
          });
          return;
      }
    }

    if (intent.action === 'open') {
      store.logTrace('sub_agent', { agent: 'booking', action: 'open', booking_id: resolved.booking_id });
      executeBookingOpen({ booking_id: resolved.booking_id as string });
    } else if (intent.action === 'edit') {
      const changes = {
        date: intent.entities.date,
        duration: intent.entities.duration,
        type: intent.entities.type as 'Regular' | 'Touch Up' | 'Consultation' | 'Full Day' | 'Cover Up' | 'Personal' | undefined,
        timeSlot: intent.entities.timeSlot,
        estimate: intent.entities.estimate,
        notes: intent.entities.notes,
        rescheduled: intent.entities.rescheduled,
        title: intent.entities.title,
      };
      store.logTrace('sub_agent', { agent: 'booking', action: 'edit', booking_id: resolved.booking_id, changes });
      executeBookingEdit({
        booking_id: resolved.booking_id as string,
        changes,
      });
    } else {
      // delete — show confirmation
      if (!resolved.confirmed) {
        const booking = useBookingStore
          .getState()
          .bookings.find((b) => b.id === resolved.booking_id);
        const clientName = booking
          ? useClientStore.getState().clients.find((c) => c.id === booking.client_id)?.name
          : undefined;
        const when = booking
          ? new Date(booking.date).toLocaleString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })
          : '';
        store.logTrace('confirm_requested', { agent: 'booking', action: 'delete', booking_id: resolved.booking_id });
        store.replaceLastLoading({
          text: `Delete ${clientName ? clientName + "'s " : ''}${booking?.type.toLowerCase() ?? 'booking'} on ${when}? This can't be undone.`,
          selections: {
            type: 'confirm',
            items: [
              { id: 'yes', label: 'Yes, delete', kind: 'destructive' },
              { id: 'cancel', label: 'Cancel', kind: 'safe' },
            ],
            mode: 'single',
            context: 'confirm_delete_booking',
          },
        });
        return;
      }
      store.logTrace('sub_agent', { agent: 'booking', action: 'delete', booking_id: resolved.booking_id });
      executeBookingDelete({ booking_id: resolved.booking_id as string });
    }
    return;
  }
}

// ─── Client Routing ─────────────────────────────────────────────────

async function routeClient(
  intent: AgentIntent,
  resolved: Record<string, unknown>
) {
  const store = useAgentStore.getState();

  if (intent.action === 'create') {
    const payload = {
      name: intent.entities.name || intent.entities.client_name,
      phone: intent.entities.phone,
    };
    store.logTrace('sub_agent', { agent: 'client', action: 'create', payload });
    executeClientCreate(payload);
    return;
  }

  // Search — always show results as cards, never auto-open
  if (intent.action === 'search') {
    // If user already tapped a search result card, open that client
    if (resolved.client_id) {
      executeClientOpen({ client_id: resolved.client_id as string });
      return;
    }

    const nameQuery = intent.entities.client_name || intent.entities.name;
    const clients = useClientStore.getState().clients;

    if (!nameQuery) {
      store.replaceLastLoading({
        text: 'Search for a client:',
        selections: {
          type: 'client',
          items: clients.slice(0, 8),
          mode: 'single',
          context: 'search_results',
        },
      });
      return;
    }

    const result = resolveClient(nameQuery, clients);
    store.logTrace('client_resolved', {
      outcome: result.type,
      count: result.type === 'multiple' ? result.clients.length : result.type === 'none' ? 0 : 1,
    });
    switch (result.type) {
      case 'exact':
        store.replaceLastLoading({
          text: `Found "${nameQuery}":`,
          selections: {
            type: 'client',
            items: [result.client],
            mode: 'single',
            context: 'search_results',
          },
        });
        return;
      case 'single':
        store.replaceLastLoading({
          text: `Found a match for "${nameQuery}":`,
          selections: {
            type: 'client',
            items: [result.client],
            mode: 'single',
            context: 'search_results',
          },
        });
        return;
      case 'multiple':
        store.replaceLastLoading({
          text: `Found ${result.clients.length} clients matching "${nameQuery}":`,
          selections: {
            type: 'client',
            items: result.clients,
            mode: 'single',
            context: 'search_results',
          },
        });
        return;
      case 'none':
        showNoMatch(nameQuery, result.suggestions);
        return;
    }
  }

  // open / edit both need a resolved client
  const nameQuery =
    intent.entities.client_name || intent.entities.name;

  if (nameQuery && !resolved.client_id) {
    const clients = useClientStore.getState().clients;
    const result = resolveClient(nameQuery, clients);
    store.logTrace('client_resolved', {
      outcome: result.type,
      count: result.type === 'multiple' ? result.clients.length : result.type === 'none' ? 0 : 1,
    });

    switch (result.type) {
      case 'exact':
      case 'single':
        resolved.client_id = result.client.id;
        break;
      case 'multiple':
        store.replaceLastLoading({
          text: `Which ${nameQuery}?`,
          selections: {
            type: 'client',
            items: result.clients,
            mode: 'single',
            context: 'ambiguous_client',
          },
        });
        return;
      case 'none':
        showNoMatch(nameQuery, result.suggestions);
        return;
    }
  }

  if (!resolved.client_id) {
    store.replaceLastLoading({
      text: 'Which client?',
      selections: {
        type: 'client',
        items: useClientStore.getState().clients,
        mode: 'single',
        context: 'ambiguous_client',
      },
    });
    return;
  }

  if (intent.action === 'open') {
    store.logTrace('sub_agent', { agent: 'client', action: 'open', client_id: resolved.client_id });
    executeClientOpen({ client_id: resolved.client_id as string });
  } else if (intent.action === 'edit') {
    // Use a second AI call to compute the actual changes from the user's
    // natural language request + the client's current data. This handles
    // contextual edits like "change the last name to have two t's" where
    // the first AI call can't compute the value without knowing the current data.
    const client = useClientStore.getState().clients.find(
      (c) => c.id === resolved.client_id
    );
    if (!client) {
      store.replaceLastLoading({ text: 'Client not found.' });
      return;
    }

    const originalText = resolved.originalText as string | undefined;
    if (originalText) {
      try {
        store.logTrace('edge_call', { fn: 'agent-resolve-edit', body: { text: originalText, client: { name: client.name } } });
        const { data, error } = await supabase.functions.invoke('agent-resolve-edit', {
          body: {
            text: originalText,
            client: {
              name: client.name,
              phone: client.phone || '',
              tags: client.tags || [],
              dob: client.dob || '',
            },
          },
        });

        if (error) {
          const errMsg = await describeFunctionError(error);
          console.error('agent-resolve-edit returned error:', errMsg, error);
          store.logTrace('edge_error', { fn: 'agent-resolve-edit', message: errMsg });
        } else if (data?.error) {
          console.error('agent-resolve-edit data error:', data.error);
          store.logTrace('edge_error', { fn: 'agent-resolve-edit', message: data.error });
        } else if (data) {
          store.logTrace('edge_response', { fn: 'agent-resolve-edit', data });
          const payload = {
            client_id: resolved.client_id as string,
            changes: {
              name: data.name,
              phone: data.phone,
              tags: data.tags,
              dob: data.dob,
            },
          };
          store.logTrace('sub_agent', { agent: 'client', action: 'edit', ...payload });
          executeClientEdit(payload);
          return;
        }
      } catch (err) {
        console.error('agent-resolve-edit exception:', err);
        store.logTrace('exception', { fn: 'agent-resolve-edit', message: err instanceof Error ? err.message : String(err) });
      }
    } else {
      console.warn('No originalText in resolved — skipping second AI call');
    }

    // Fallback: use raw entities from the first parse (only for
    // direct-value edits like "update phone to 555-1234" where
    // the first parse already has the correct value)
    const fallbackPayload = {
      client_id: resolved.client_id as string,
      changes: {
        name: intent.entities.name,
        phone: intent.entities.phone,
        tags: intent.entities.tags,
        dob: intent.entities.dob,
      },
    };
    store.logTrace('sub_agent', { agent: 'client', action: 'edit', fallback: true, ...fallbackPayload });
    executeClientEdit(fallbackPayload);
  } else if (intent.action === 'delete') {
    if (!resolved.confirmed) {
      const client = useClientStore
        .getState()
        .clients.find((c) => c.id === resolved.client_id);
      const bookingCount = useBookingStore
        .getState()
        .bookings.filter((b) => b.client_id === resolved.client_id).length;
      store.logTrace('confirm_requested', { agent: 'client', action: 'delete', client_id: resolved.client_id });
      store.replaceLastLoading({
        text: `Delete ${client?.name ?? 'client'}?${
          bookingCount > 0
            ? ` This will also remove ${bookingCount} booking${bookingCount === 1 ? '' : 's'} and associated history.`
            : " This can't be undone."
        }`,
        selections: {
          type: 'confirm',
          items: [
            { id: 'yes', label: 'Yes, delete', kind: 'destructive' },
            { id: 'cancel', label: 'Cancel', kind: 'safe' },
          ],
          mode: 'single',
          context: 'confirm_delete_client',
        },
      });
      return;
    }
    store.logTrace('sub_agent', { agent: 'client', action: 'delete', client_id: resolved.client_id });
    executeClientDelete({ client_id: resolved.client_id as string });
  }
}

// ─── Schedule Routing ───────────────────────────────────────────────

async function routeSchedule(intent: AgentIntent) {
  const payload = {
    query_type: intent.entities.query_type || 'list',
    date_range_start: intent.entities.date_range_start,
    date_range_end: intent.entities.date_range_end,
    booking_type: intent.entities.booking_type,
  };
  useAgentStore.getState().logTrace('sub_agent', { agent: 'schedule', action: 'query', payload });
  executeScheduleQuery(payload);
}

// ─── Messaging Routing ──────────────────────────────────────────────

async function routeMessaging(
  intent: AgentIntent,
  resolved: Record<string, unknown>
) {
  const store = useAgentStore.getState();

  // Resolve client first
  const nameQuery = intent.entities.client_name || intent.entities.name;
  if (nameQuery && !resolved.client_id) {
    const clients = useClientStore.getState().clients;
    const result = resolveClient(nameQuery, clients);
    store.logTrace('client_resolved', {
      outcome: result.type,
      count: result.type === 'multiple' ? result.clients.length : result.type === 'none' ? 0 : 1,
    });

    switch (result.type) {
      case 'exact':
      case 'single':
        resolved.client_id = result.client.id;
        resolved.client_name = result.client.name;
        break;
      case 'multiple':
        store.replaceLastLoading({
          text: `Which ${nameQuery}?`,
          selections: {
            type: 'client',
            items: result.clients,
            mode: 'single',
            context: 'ambiguous_client',
          },
        });
        return;
      case 'none':
        showNoMatch(nameQuery, result.suggestions);
        return;
    }
  }

  if (!resolved.client_id) {
    store.replaceLastLoading({
      text: 'Who would you like to message?',
      selections: {
        type: 'client',
        items: useClientStore.getState().clients,
        mode: 'single',
        context: 'ambiguous_client',
      },
    });
    return;
  }

  // Resolve conversation thread
  if (!resolved.conversation_id) {
    const client = useClientStore
      .getState()
      .clients.find((c) => c.id === resolved.client_id);
    if (!client) {
      store.replaceLastLoading({ text: 'Client not found.' });
      return;
    }

    const conversations = useMessageStore.getState().conversations;
    const convoResult = resolveConversation(client, conversations);

    switch (convoResult.type) {
      case 'exact':
        resolved.conversation_id = convoResult.conversation.id;
        break;
      case 'multiple':
        store.replaceLastLoading({
          text: `${client.name} has multiple message threads. Which one?`,
          selections: {
            type: 'conversation',
            items: convoResult.conversations,
            mode: 'single',
            context: 'platform_choice',
          },
        });
        return;
      case 'none':
        store.replaceLastLoading({
          text: `No conversation thread found for ${client.name}. They may not have messaged through Instagram or Facebook yet.`,
        });
        return;
    }
  }

  // Execute
  if (intent.action === 'open') {
    store.logTrace('sub_agent', { agent: 'messaging', action: 'open', conversation_id: resolved.conversation_id });
    executeMessagingOpen({
      conversation_id: resolved.conversation_id as string,
    });
  } else if (intent.action === 'draft') {
    const templates = buildTemplates(
      resolved.client_id as string,
      (resolved.client_name as string) || '',
      intent.entities.draft_context
    );
    store.logTrace('sub_agent', { agent: 'messaging', action: 'draft', conversation_id: resolved.conversation_id });
    executeMessagingDraft({
      conversation_id: resolved.conversation_id as string,
      client_name: (resolved.client_name as string) || '',
      templates,
    });
  }
}

// ─── Feedback Routing ──────────────────────────────────────────────

async function routeFeedback(
  intent: AgentIntent,
  resolved: Record<string, unknown>
) {
  const store = useAgentStore.getState();

  if (intent.action !== 'draft') {
    store.replaceLastLoading({
      text: "I can only draft feedback right now. Try something like \"feedback: the calendar feels slow on mobile\".",
    });
    return;
  }

  // Prefer the verbatim body the parser isolated; fall back to the raw
  // input if the parser didn't extract one (happens on very short prompts).
  const extracted = intent.entities.feedback_text?.trim();
  const originalText = (resolved.originalText as string | undefined)?.trim();
  const text = extracted && extracted.length > 0 ? extracted : originalText;

  if (!text) {
    store.replaceLastLoading({
      text: "What feedback should I capture?",
    });
    return;
  }

  store.logTrace('sub_agent', { agent: 'feedback', action: 'draft', length: text.length });
  executeFeedbackDraft({ text });
}

// ─── Selection Handler ──────────────────────────────────────────────

/**
 * Called when the user taps a selection card in the agent panel.
 * Resumes the pending intent with the selected entity.
 */
export async function handleSelection(
  selectionType: string,
  selectedId: string
) {
  const store = useAgentStore.getState();
  const intent = store.pendingIntent;
  if (!intent) return;

  store.logTrace('selection_made', { selectionType, selectedId });
  store.setLoading(true);

  switch (selectionType) {
    case 'client': {
      const client = useClientStore
        .getState()
        .clients.find((c) => c.id === selectedId);
      store.updatePendingResolved('client_id', selectedId);
      if (client) {
        store.updatePendingResolved('client_name', client.name);
      }
      break;
    }
    case 'booking':
      store.updatePendingResolved('booking_id', selectedId);
      break;
    case 'conversation':
      store.updatePendingResolved('conversation_id', selectedId);
      break;
    case 'template': {
      // Template selection — find the template and apply it
      const lastMsg = store.messages.findLast(
        (m) => m.selections?.type === 'template'
      );
      const template = (lastMsg?.selections?.items as DraftTemplate[])?.find(
        (t) => t.id === selectedId
      );
      if (template && store.pendingResolved.conversation_id) {
        applyDraftTemplate(
          store.pendingResolved.conversation_id as string,
          template.text
        );
      }
      return;
    }
    case 'confirm': {
      if (selectedId === 'cancel') {
        store.replaceLastLoading({ text: 'Cancelled.' });
        store.setPending(null);
        return;
      }
      // selectedId === 'yes' — mark confirmed and continue routing
      store.updatePendingResolved('confirmed', true);
      break;
    }
  }

  // Resume routing with the updated resolved entities
  await routeIntent(intent);
}
