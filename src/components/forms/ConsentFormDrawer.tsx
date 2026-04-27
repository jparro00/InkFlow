// Modal that opens when an artist taps a row in the Forms list. Renders the
// submitted form via the shared ConsentForm component (so the artist sees
// exactly the layout the client filled out) plus contextual chrome:
//   - status + submitted-at + attached-booking (if any)
//   - finalize details (payment + tattoo) when approved_pending / finalized
//   - inline action buttons (approve / reject / finalize) at the bottom
//
// canCollapse is false: drag-down dismisses the drawer outright (matches
// BookingDrawer's behavior). Approve hands off to BookingPickerDrawer which
// is rendered at AppShell level — that drawer is collapsible so the artist
// can peek at the calendar / messages while it's open.

import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { Check, X, Trash2, AlertTriangle } from 'lucide-react';
import Modal from '../common/Modal';
import ConsentForm from './ConsentForm';
import { useConsentSubmissionStore } from '../../stores/consentSubmissionStore';
import { useBookingStore } from '../../stores/bookingStore';
import { useClientStore } from '../../stores/clientStore';
import { useUIStore } from '../../stores/uiStore';
import {
  consentSubmissionDisplayName,
  consentSubmissionIsComplete,
  getBookingLabel,
  type ConsentSubmission,
  type ConsentSubmissionStatus,
} from '../../types';

const statusLabels: Record<ConsentSubmissionStatus, string> = {
  submitted: 'Awaiting review',
  approved_pending: 'Pending paperwork',
  finalized: 'Finalized',
};

const statusStyles: Record<ConsentSubmissionStatus, string> = {
  submitted: 'bg-accent/10 text-accent border-accent/30',
  approved_pending: 'bg-today/10 text-today border-today/30',
  finalized: 'bg-success/10 text-success border-success/30',
};

function StatusBadge({ status }: { status: ConsentSubmissionStatus }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-medium ${statusStyles[status]}`}>
      {statusLabels[status]}
    </span>
  );
}

export default function ConsentFormDrawer() {
  // Open state lives in uiStore so AppShell can render this drawer at the
  // root level (correct z-index against tab bar + FAB). Mirrors the same
  // pattern used by BookingDrawer / ConversationDrawer.
  const submissionId = useUIStore((s) => s.selectedConsentSubmissionId);
  const setSelectedConsentSubmissionId = useUIStore(
    (s) => s.setSelectedConsentSubmissionId,
  );
  const submission = useConsentSubmissionStore((s) =>
    submissionId ? s.submissions.find((sub) => sub.id === submissionId) : undefined,
  );
  if (!submissionId || !submission) return null;
  const onClose = () => setSelectedConsentSubmissionId(null);
  return (
    <Modal
      title={consentSubmissionDisplayName(submission)}
      onClose={onClose}
      canCollapse={false}
    >
      <DrawerBody submission={submission} />
    </Modal>
  );
}

function DrawerBody({ submission }: { submission: ConsentSubmission }) {
  const bookings = useBookingStore((s) => s.bookings);
  const clients = useClientStore((s) => s.clients);
  const rejectSubmission = useConsentSubmissionStore((s) => s.rejectSubmission);
  const addToast = useUIStore((s) => s.addToast);
  const setSelectedConsentSubmissionId = useUIStore(
    (s) => s.setSelectedConsentSubmissionId,
  );
  const setAttachToBookingSubmissionId = useUIStore(
    (s) => s.setAttachToBookingSubmissionId,
  );
  const setFinalizeSubmissionId = useUIStore((s) => s.setFinalizeSubmissionId);

  const attachedBooking = useMemo(() => {
    if (!submission.booking_id) return undefined;
    return bookings.find((b) => b.id === submission.booking_id);
  }, [submission.booking_id, bookings]);

  const attachedClientName = useMemo(() => {
    if (!attachedBooking?.client_id) return undefined;
    return clients.find((c) => c.id === attachedBooking.client_id)?.name;
  }, [attachedBooking, clients]);

  const [confirmReject, setConfirmReject] = useState(false);
  const [busy, setBusy] = useState(false);

  // Approve = hand off to the booking picker rendered at AppShell level. We
  // dismiss this drawer first so the picker isn't stacked behind it; if the
  // user dismisses the picker without choosing a booking, the submission stays
  // in 'submitted' (no API call is made on dismiss).
  const onApprove = () => {
    const id = submission.id;
    setSelectedConsentSubmissionId(null);
    setAttachToBookingSubmissionId(id);
  };

  // Same handoff for the payment + tattoo step — close this drawer, then
  // open the finalize sheet at the root.
  const onFinalize = () => {
    const id = submission.id;
    setSelectedConsentSubmissionId(null);
    setFinalizeSubmissionId(id);
  };

  const handleReject = async () => {
    setBusy(true);
    try {
      await rejectSubmission(submission.id);
      addToast('Form rejected');
      setSelectedConsentSubmissionId(null);
    } catch (e) {
      console.error(e);
      addToast('Failed to reject form');
      setBusy(false);
    }
  };

  const cardClass = 'bg-surface/60 rounded-lg border border-border/30 p-4';

  return (
    <div className="space-y-5">
      {/* Status row */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <StatusBadge status={submission.status} />
        <span className="text-sm text-text-t">
          Submitted {format(new Date(submission.submitted_at), 'PPp')}
        </span>
      </div>

      {/* The form, exactly as the client saw it */}
      <ConsentForm submission={submission} />

      {/* Attached booking — only after approve */}
      {submission.status !== 'submitted' && (
        <section className={cardClass}>
          <div className="text-xs text-text-t uppercase tracking-wider mb-2">
            Attached booking
          </div>
          {attachedBooking ? (
            <div>
              <div className="text-base text-text-p">
                {getBookingLabel(attachedBooking, attachedClientName)}
              </div>
              <div className="text-sm text-text-t mt-0.5">
                {format(new Date(attachedBooking.date), 'PPp')} · {attachedBooking.type}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-today">
              <AlertTriangle size={16} />
              <span>Booking no longer attached.</span>
            </div>
          )}
        </section>
      )}

      {/* Payment & tattoo — once finalize info is present */}
      {submission.status !== 'submitted' && (
        <section className={cardClass}>
          <div className="text-xs text-text-t uppercase tracking-wider mb-2">
            Payment &amp; tattoo
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <div>
              <dt className="text-xs text-text-t mb-0.5">Type</dt>
              <dd className="text-sm text-text-p">
                {submission.payment_type || <span className="text-text-t italic">—</span>}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-t mb-0.5">Amount</dt>
              <dd className="text-sm text-text-p">
                {submission.payment_amount != null ? `$${submission.payment_amount.toFixed(2)}` : <span className="text-text-t italic">—</span>}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-text-t mb-0.5">Tattoo location</dt>
              <dd className="text-sm text-text-p">
                {submission.tattoo_location || <span className="text-text-t italic">—</span>}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-text-t mb-0.5">Description</dt>
              <dd className="text-sm text-text-p">
                {submission.tattoo_description || <span className="text-text-t italic">—</span>}
              </dd>
            </div>
          </dl>
        </section>
      )}

      {/* Inline action footer — at the natural bottom of the form. Both the
          approve and finalize triggers hand off to AppShell-level drawers
          (BookingPickerDrawer, FinalizeFormDrawer) after dismissing this one,
          so they never stack. */}
      <div className="pt-2">
        <ActionFooter
          submission={submission}
          busy={busy}
          confirmReject={confirmReject}
          onCancelReject={() => setConfirmReject(false)}
          onAskReject={() => setConfirmReject(true)}
          onConfirmReject={handleReject}
          onAskApprove={onApprove}
          onAskFinalize={onFinalize}
        />
      </div>
    </div>
  );
}

interface ActionFooterProps {
  submission: ConsentSubmission;
  busy: boolean;
  confirmReject: boolean;
  onCancelReject: () => void;
  onAskReject: () => void;
  onConfirmReject: () => void;
  onAskApprove: () => void;
  onAskFinalize: () => void;
}

function ActionFooter({
  submission,
  busy,
  confirmReject,
  onCancelReject,
  onAskReject,
  onConfirmReject,
  onAskApprove,
  onAskFinalize,
}: ActionFooterProps) {
  if (submission.status === 'submitted') {
    if (confirmReject) {
      return (
        <div className="flex gap-3">
          <button
            onClick={onCancelReject}
            disabled={busy}
            className="flex-1 py-3.5 text-base text-text-s rounded-md border border-border/40 cursor-pointer press-scale transition-all disabled:opacity-40 min-h-[48px] flex items-center justify-center gap-2"
          >
            <X size={18} />
            Cancel
          </button>
          <button
            onClick={onConfirmReject}
            disabled={busy}
            className="flex-1 py-3.5 text-base bg-danger text-bg rounded-md font-medium cursor-pointer press-scale transition-all disabled:opacity-40 min-h-[48px] flex items-center justify-center gap-2"
          >
            <Trash2 size={18} />
            {busy ? 'Rejecting…' : 'Confirm reject'}
          </button>
        </div>
      );
    }
    return (
      <div className="flex gap-3">
        <button
          onClick={onAskReject}
          disabled={busy}
          className="flex-1 py-3.5 text-base text-danger rounded-md border border-danger/30 cursor-pointer press-scale transition-all active:bg-danger/10 disabled:opacity-40 min-h-[48px] flex items-center justify-center gap-2"
        >
          <Trash2 size={18} />
          Reject
        </button>
        <button
          onClick={onAskApprove}
          disabled={busy}
          className="flex-1 py-3.5 text-base bg-accent text-bg rounded-md font-medium cursor-pointer press-scale transition-all shadow-glow active:shadow-glow-strong disabled:opacity-40 min-h-[48px] flex items-center justify-center gap-2"
        >
          <Check size={18} />
          Approve
        </button>
      </div>
    );
  }

  if (submission.status === 'approved_pending') {
    return (
      <button
        onClick={onAskFinalize}
        disabled={busy || consentSubmissionIsComplete(submission)}
        className="w-full py-3.5 text-base bg-accent text-bg rounded-md font-medium cursor-pointer press-scale transition-all shadow-glow active:shadow-glow-strong disabled:opacity-40 min-h-[48px] flex items-center justify-center gap-2"
      >
        <Check size={18} />
        Enter payment &amp; tattoo details
      </button>
    );
  }

  return (
    <div className="text-center text-sm text-text-t py-3">
      Form complete.
    </div>
  );
}
