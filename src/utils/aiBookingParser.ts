import { useClientStore } from '../stores/clientStore';
import { supabase } from '../lib/supabase';

export interface ParsedBooking {
  client_id?: string;
  date?: string;
  /** ISO end datetime. For all-day events: midnight of the day AFTER the last covered day. */
  end_date?: string;
  duration?: number;
  is_all_day?: boolean;
  /** False → informational (agent ignores for availability). Default true for timed, false for all-day. */
  blocks_availability?: boolean;
  type?: string;
  estimate?: number;
  rescheduled?: boolean;
  timeSlot?: 'morning' | 'evening';
  notes?: string;
  title?: string;
}

export async function parseBookingWithAI(text: string): Promise<ParsedBooking> {
  const clients = useClientStore.getState().clients;
  const clientList = clients.map((c) => ({ id: c.id, name: c.name }));

  // Check for legacy localStorage key (migration path)
  const legacyKey = localStorage.getItem('inkbloop-anthropic-key');
  if (legacyKey) {
    return parseLegacy(text, legacyKey, clientList);
  }

  // Use server-side Edge Function
  const { data, error } = await supabase.functions.invoke('parse-booking', {
    body: { text, clients: clientList },
  });

  if (error) throw error;
  return (data as ParsedBooking) ?? {};
}

/** Legacy direct API call for migration — used until user re-saves key via Settings. */
const DURATION_PATTERN = /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/i;

async function parseLegacy(
  text: string,
  apiKey: string,
  clientList: { id: string; name: string }[]
): Promise<ParsedBooking> {
  const now = new Date();

  const systemPrompt = `You extract booking details from text for a tattoo studio. Return a JSON object.

Today: ${now.toISOString().split('T')[0]} (${now.toLocaleDateString('en-US', { weekday: 'long' })}). Current year: ${now.getFullYear()}.

Clients: ${clientList.map((c) => `${c.id}="${c.name}"`).join(', ')}

Types: "Regular", "Touch Up", "Consultation", "Full Day", "Cover Up"

JSON fields (omit any you can't determine, NEVER add error messages):
- client_id: match to an ID above (fuzzy first-name match OK). If no match, omit this field entirely.
- date: ISO 8601 datetime (e.g. "2026-04-15T14:00:00"). Day names like "Sunday" or "next Thursday" mean the NEXT upcoming occurrence from today. Two adjacent digits like "52" or "five two" mean month/day (e.g. "52" = May 2nd, "121" = December 1st, "415" = April 15th).
- duration: number (hours). ONLY include if the user explicitly mentions a duration. Do NOT guess or infer a duration.
- type: one of the types above
- estimate: number (dollars)
- rescheduled: boolean (true ONLY if the user explicitly says this is a reschedule, rescheduled, or being moved from another date)
- timeSlot: "morning" or "evening" — if the user says "morning", "AM", "morning appointment", use "morning". If they say "evening", "afternoon", "PM", "evening appointment", use "evening". This overrides the time in the date field. If they give a specific time like "2pm", do NOT use timeSlot — put the time in the date field instead.
- notes: string (ONLY verbatim details the user provided about the tattoo — placement, style, design, special requests. NEVER use this field to communicate with the user, store client names, or add any information the user did not explicitly say.)

CRITICAL: Always extract every field you can. A missing client match must NOT prevent you from extracting date, time, type, duration, estimate, or notes. Never put error messages or explanations in any field. Return ONLY valid JSON.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: systemPrompt,
      messages: [{ role: 'user', content: text }],
    }),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const data = await response.json();
  const rawContent = data.content?.[0]?.text ?? '{}';
  const content = rawContent.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

  try {
    const parsed = JSON.parse(content);
    const result: ParsedBooking = {};

    if (parsed.client_id && clientList.some((c) => c.id === parsed.client_id)) {
      result.client_id = parsed.client_id;
    }
    if (parsed.date) result.date = parsed.date;
    if (typeof parsed.duration === 'number' && DURATION_PATTERN.test(text)) {
      result.duration = parsed.duration;
    }
    if (parsed.type && ['Regular', 'Touch Up', 'Consultation', 'Full Day', 'Cover Up'].includes(parsed.type)) {
      result.type = parsed.type;
    }
    if (typeof parsed.estimate === 'number') result.estimate = parsed.estimate;
    if (parsed.rescheduled === true) result.rescheduled = true;
    if (parsed.timeSlot === 'morning' || parsed.timeSlot === 'evening') result.timeSlot = parsed.timeSlot;
    if (parsed.notes) result.notes = parsed.notes;

    return result;
  } catch {
    return {};
  }
}
