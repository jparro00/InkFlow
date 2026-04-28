// Picks a booking to attach to a consent submission. Rendered at the AppShell
// root and driven by uiStore.attachToBookingSubmissionId — the consent drawer
// dismisses itself before opening this so they don't stack. Drag-down on the
// sheet collapses to a peek (canCollapse defaults to true on Modal); only an
// explicit pick mutates the submission.

import { useMemo, useState } from 'react';
import { format, isSameDay } from 'date-fns';
import { CalendarIcon, Search, Plus } from 'lucide-react';
import Modal, { useModalDismiss } from '../common/Modal';
import { useBookingStore } from '../../stores/bookingStore';
import { useClientStore } from '../../stores/clientStore';
import { useConsentSubmissionStore } from '../../stores/consentSubmissionStore';
import { useUIStore } from '../../stores/uiStore';
import {
  consentSubmissionDisplayName,
  getBookingLabel,
  type Booking,
} from '../../types';

export default function BookingPickerDrawer() {
  const submissionId = useUIStore((s) => s.attachToBookingSubmissionId);
  const setAttachToBookingSubmissionId = useUIStore(
    (s) => s.setAttachToBookingSubmissionId,
  );
  const submission = useConsentSubmissionStore((s) =>
    submissionId ? s.submissions.find((sub) => sub.id === submissionId) : undefined,
  );
  if (!submissionId || !submission) return null;
  const onClose = () => setAttachToBookingSubmissionId(null);
  return (
    <Modal title="Attach to booking" onClose={onClose}>
      <BookingPickerBody />
    </Modal>
  );
}

function BookingPickerBody() {
  const dismiss = useModalDismiss();
  const submissionId = useUIStore((s) => s.attachToBookingSubmissionId);
  const setAttachToBookingSubmissionId = useUIStore(
    (s) => s.setAttachToBookingSubmissionId,
  );
  const submission = useConsentSubmissionStore((s) =>
    submissionId ? s.submissions.find((sub) => sub.id === submissionId) : undefined,
  );
  const approveSubmission = useConsentSubmissionStore((s) => s.approveSubmission);

  const allBookings = useBookingStore((s) => s.bookings);
  const searchBookings = useBookingStore((s) => s.searchBookings);
  const clients = useClientStore((s) => s.clients);
  const openBookingForm = useUIStore((s) => s.openBookingForm);
  const setPendingConsentSubmissionId = useUIStore((s) => s.setPendingConsentSubmissionId);
  const setPrefillClientData = useUIStore((s) => s.setPrefillClientData);
  const addToast = useUIStore((s) => s.addToast);

  const today = useMemo(() => new Date(), []);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);

  // Personal appointments are never tattoo work, so they can't host a consent
  // submission — exclude them from both the today list and search results.
  const todaysBookings = useMemo<Booking[]>(() => {
    return allBookings
      .filter((b) => b.type !== 'Personal' && isSameDay(new Date(b.date), today))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [allBookings, today]);

  const searchResults = useMemo<Booking[]>(() => {
    if (!query.trim()) return [];
    return searchBookings(query.trim(), clients)
      .filter((b) => b.type !== 'Personal')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 30);
  }, [query, searchBookings, clients]);

  if (!submission) return null;

  const handlePick = async (bookingId: string) => {
    setBusy(true);
    const id = submission.id;
    try {
      await approveSubmission(id, bookingId);
      addToast('Form approved');
      // Only dismiss THIS picker. If the user navigated to another
      // submission while approve was in flight, leave the new drawer
      // alone — otherwise the late "Form approved" toast would close it.
      if (useUIStore.getState().attachToBookingSubmissionId === id) {
        setAttachToBookingSubmissionId(null);
      }
    } catch (e) {
      console.error(e);
      addToast('Failed to approve form');
      setBusy(false);
    }
  };

  const handleCreateNew = () => {
    setPendingConsentSubmissionId(submission.id);
    setPrefillClientData({ name: consentSubmissionDisplayName(submission) });
    // Animate the picker out, then open BookingForm. setAttachToBookingSubmissionId
    // is cleared in the dismiss callback chain via the parent's onClose.
    dismiss();
    setAttachToBookingSubmissionId(null);
    openBookingForm();
  };

  const renderBookingRow = (b: Booking) => {
    const clientName = b.client_id
      ? clients.find((c) => c.id === b.client_id)?.name
      : undefined;
    const dateText = isSameDay(new Date(b.date), today)
      ? format(new Date(b.date), 'p')
      : format(new Date(b.date), 'MMM d, p');
    return (
      <button
        key={b.id}
        onClick={() => handlePick(b.id)}
        disabled={busy}
        className="w-full bg-surface/60 rounded-lg border border-border/30 px-4 py-3.5 flex items-center justify-between cursor-pointer press-scale transition-all active:bg-elevated/40 text-left disabled:opacity-40"
      >
        <div className="min-w-0 flex-1">
          <div className="text-base text-text-p truncate">
            {getBookingLabel(b, clientName)}
          </div>
          <div className="text-sm text-text-t mt-0.5">
            {dateText} · {b.type}
          </div>
        </div>
        <CalendarIcon size={18} className="text-text-t shrink-0 ml-3" />
      </button>
    );
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-text-t">
        Pick a booking to attach this consent form to, or create a new one.
      </p>

      {/* Search */}
      <div className="relative">
        <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-t pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by client, type, notes…"
          className="w-full bg-input border border-border/60 rounded-md pl-10 pr-4 py-3 text-base text-text-p placeholder:text-text-t focus:outline-none focus:border-accent/40 transition-colors min-h-[44px]"
        />
      </div>

      {query.trim() ? (
        <div>
          <h3 className="text-xs text-text-t uppercase tracking-wider mb-2">
            Search results
            <span className="ml-2 normal-case tracking-normal text-text-t/70">{searchResults.length}</span>
          </h3>
          {searchResults.length === 0 ? (
            <div className="rounded-md bg-bg/40 border border-border/40 border-dashed p-6 text-center text-sm text-text-t">
              No bookings match.
            </div>
          ) : (
            <div className="space-y-2">{searchResults.map(renderBookingRow)}</div>
          )}
        </div>
      ) : (
        <div>
          <h3 className="text-xs text-text-t uppercase tracking-wider mb-2">Today</h3>
          {todaysBookings.length === 0 ? (
            <div className="rounded-md bg-bg/40 border border-border/40 border-dashed p-6 text-center text-sm text-text-t">
              No bookings scheduled for today.
            </div>
          ) : (
            <div className="space-y-2">{todaysBookings.map(renderBookingRow)}</div>
          )}
        </div>
      )}

      {/* Create new booking */}
      <button
        onClick={handleCreateNew}
        disabled={busy}
        className="w-full py-3.5 text-base text-accent rounded-md border border-accent/40 cursor-pointer press-scale transition-all active:bg-accent/10 min-h-[48px] flex items-center justify-center gap-2 disabled:opacity-40"
      >
        <Plus size={18} />
        Create new booking
      </button>
    </div>
  );
}
