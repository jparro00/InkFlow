import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { ConsentSubmission, ConsentSubmissionStatus } from '../types';
import { supabase } from '../lib/supabase';
import * as consentSubmissionService from '../services/consentSubmissionService';

interface ConsentSubmissionStore {
  submissions: ConsentSubmission[];
  isLoading: boolean;
  _fetchedAt: number | null;
  _realtimeChannel: RealtimeChannel | null;

  fetchSubmissions: (force?: boolean) => Promise<void>;
  getSubmission: (id: string) => ConsentSubmission | undefined;
  getSubmissionsByStatus: (status: ConsentSubmissionStatus) => ConsentSubmission[];

  /** Subscribe to postgres_changes on consent_submissions for the signed-in artist. */
  startRealtime: () => Promise<void>;
  /** Tear down the realtime channel (called on sign-out / unmount). */
  stopRealtime: () => void;

  /** Approve: submitted → approved_pending. Optimistic; rolls back on failure. */
  approveSubmission: (id: string, bookingId: string) => Promise<void>;

  /** Reject: hard-delete the row (and image keys, once those exist). Optimistic. */
  rejectSubmission: (id: string) => Promise<void>;

  /** Finalize: approved_pending → finalized. Optimistic. */
  finalizeSubmission: (
    id: string,
    fields: {
      payment_type: string;
      payment_amount: number;
    },
  ) => Promise<void>;
}

// Map a row from the realtime payload into our ConsentSubmission shape. The
// payload uses the same column names as the DB row, just with a couple fields
// that may be null on disk but undefined on the type.
function rowToConsentSubmission(row: Record<string, unknown>): ConsentSubmission {
  const get = <T,>(k: string): T | undefined => {
    const v = row[k];
    return v === null || v === undefined ? undefined : (v as T);
  };
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    status: row.status as ConsentSubmissionStatus,
    license_image_key: get('license_image_key'),
    license_first_name: get('license_first_name'),
    license_last_name: get('license_last_name'),
    license_dob: get('license_dob'),
    license_number: get('license_number'),
    license_address: get('license_address'),
    license_state: get('license_state'),
    license_expiry: get('license_expiry'),
    license_raw_data: get('license_raw_data'),
    form_data: (row.form_data as Record<string, unknown>) ?? {},
    signature_image_key: get('signature_image_key'),
    pdf_key: get('pdf_key'),
    pdf_sha256: get('pdf_sha256'),
    booking_id: get('booking_id'),
    payment_type: get('payment_type'),
    payment_amount: get('payment_amount'),
    tattoo_location: get('tattoo_location'),
    tattoo_description: get('tattoo_description'),
    submitted_at: row.submitted_at as string,
    approved_at: get('approved_at'),
    finalized_at: get('finalized_at'),
    created_at: row.created_at as string,
  };
}

const FETCH_TTL = 60_000;

export const useConsentSubmissionStore = create<ConsentSubmissionStore>()(persist((set, get) => ({
  submissions: [],
  isLoading: false,
  _fetchedAt: null,
  _realtimeChannel: null,

  fetchSubmissions: async (force = false) => {
    const fetchedAt = get()._fetchedAt;
    if (!force && fetchedAt && Date.now() - fetchedAt < FETCH_TTL) return;

    if (get().submissions.length === 0) set({ isLoading: true });
    try {
      const submissions = await consentSubmissionService.fetchConsentSubmissions();
      set({ submissions, isLoading: false, _fetchedAt: Date.now() });
    } catch {
      set({ isLoading: false });
    }
  },

  getSubmission: (id) => get().submissions.find((s) => s.id === id),

  getSubmissionsByStatus: (status) =>
    get().submissions.filter((s) => s.status === status),

  startRealtime: async () => {
    if (get()._realtimeChannel) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;

    const channel = supabase
      .channel(`consent-submissions-${session.user.id}`)
      .on(
        // Filter server-side by user_id so the artist only ever sees their own
        // events. RLS would block cross-user reads anyway, but the filter saves
        // bandwidth and keeps the broadcast tight on the WAL side.
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'consent_submissions',
          filter: `user_id=eq.${session.user.id}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const row = rowToConsentSubmission(payload.new as Record<string, unknown>);
            set((s) => {
              if (s.submissions.some((sub) => sub.id === row.id)) return s;
              return { submissions: [row, ...s.submissions] };
            });
          } else if (payload.eventType === 'UPDATE') {
            const row = rowToConsentSubmission(payload.new as Record<string, unknown>);
            set((s) => ({
              submissions: s.submissions.map((sub) => (sub.id === row.id ? row : sub)),
            }));
          } else if (payload.eventType === 'DELETE') {
            const oldId = (payload.old as { id?: string })?.id;
            if (!oldId) return;
            set((s) => ({
              submissions: s.submissions.filter((sub) => sub.id !== oldId),
            }));
          }
        },
      )
      .subscribe();

    set({ _realtimeChannel: channel });
  },

  stopRealtime: () => {
    const channel = get()._realtimeChannel;
    if (!channel) return;
    supabase.removeChannel(channel);
    set({ _realtimeChannel: null });
  },

  approveSubmission: async (id, bookingId) => {
    const prev = get().submissions.find((s) => s.id === id);
    if (!prev) return;

    const optimistic: ConsentSubmission = {
      ...prev,
      status: 'approved_pending',
      booking_id: bookingId,
      approved_at: new Date().toISOString(),
    };
    set((s) => ({ submissions: s.submissions.map((sub) => (sub.id === id ? optimistic : sub)) }));

    try {
      const updated = await consentSubmissionService.approveConsentSubmission(id, bookingId);
      set((s) => ({ submissions: s.submissions.map((sub) => (sub.id === id ? updated : sub)) }));
    } catch (e) {
      set((s) => ({ submissions: s.submissions.map((sub) => (sub.id === id ? prev : sub)) }));
      throw e;
    }
  },

  rejectSubmission: async (id) => {
    const prev = get().submissions.find((s) => s.id === id);
    if (!prev) return;

    set((s) => ({ submissions: s.submissions.filter((sub) => sub.id !== id) }));

    try {
      await consentSubmissionService.deleteConsentSubmission(id);
    } catch (e) {
      set((s) => ({ submissions: [prev, ...s.submissions] }));
      throw e;
    }
  },

  finalizeSubmission: async (id, fields) => {
    const prev = get().submissions.find((s) => s.id === id);
    if (!prev) return;

    const optimistic: ConsentSubmission = {
      ...prev,
      ...fields,
      status: 'finalized',
      finalized_at: new Date().toISOString(),
    };
    set((s) => ({ submissions: s.submissions.map((sub) => (sub.id === id ? optimistic : sub)) }));

    try {
      const updated = await consentSubmissionService.finalizeConsentSubmission(id, fields);
      set((s) => ({ submissions: s.submissions.map((sub) => (sub.id === id ? updated : sub)) }));
    } catch (e) {
      set((s) => ({ submissions: s.submissions.map((sub) => (sub.id === id ? prev : sub)) }));
      throw e;
    }
  },
}), {
  name: 'inkbloop-consent-submissions',
  // _realtimeChannel deliberately excluded — RealtimeChannel is a live
  // connection object that can't (and shouldn't) be serialized.
  partialize: (state) => ({ submissions: state.submissions, _fetchedAt: state._fetchedAt }),
}));
