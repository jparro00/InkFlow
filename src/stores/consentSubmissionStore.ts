import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ConsentSubmission, ConsentSubmissionStatus } from '../types';
import * as consentSubmissionService from '../services/consentSubmissionService';

interface ConsentSubmissionStore {
  submissions: ConsentSubmission[];
  isLoading: boolean;
  _fetchedAt: number | null;

  fetchSubmissions: (force?: boolean) => Promise<void>;
  getSubmission: (id: string) => ConsentSubmission | undefined;
  getSubmissionsByStatus: (status: ConsentSubmissionStatus) => ConsentSubmission[];

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
      tattoo_location: string;
      tattoo_description: string;
    },
  ) => Promise<void>;
}

const FETCH_TTL = 60_000;

export const useConsentSubmissionStore = create<ConsentSubmissionStore>()(persist((set, get) => ({
  submissions: [],
  isLoading: false,
  _fetchedAt: null,

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
  partialize: (state) => ({ submissions: state.submissions, _fetchedAt: state._fetchedAt }),
}));
