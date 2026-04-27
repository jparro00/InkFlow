import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, X, Trash2, FileSignature, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { useUIStore } from '../stores/uiStore';
import { useConsentSubmissionStore } from '../stores/consentSubmissionStore';
import { useBookingStore } from '../stores/bookingStore';
import { useClientStore } from '../stores/clientStore';
import { consentSubmissionDisplayName, consentSubmissionIsComplete, getBookingLabel } from '../types';
import type { ConsentSubmission, ConsentSubmissionStatus } from '../types';
import BookingPickerDrawer from '../components/forms/BookingPickerDrawer';
import FinalizeFormDrawer from '../components/forms/FinalizeFormDrawer';

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

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div className="text-xs text-text-t uppercase tracking-wider mb-1">{label}</div>
      <div className="text-base text-text-p">{value || <span className="text-text-t italic">—</span>}</div>
    </div>
  );
}

export default function FormDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { setHeaderLeft, setHeaderRight, addToast } = useUIStore();
  const submissions = useConsentSubmissionStore((s) => s.submissions);
  const bookings = useBookingStore((s) => s.bookings);
  const clients = useClientStore((s) => s.clients);
  const fetchSubmissions = useConsentSubmissionStore((s) => s.fetchSubmissions);
  const approveSubmission = useConsentSubmissionStore((s) => s.approveSubmission);
  const rejectSubmission = useConsentSubmissionStore((s) => s.rejectSubmission);

  const submission = useMemo<ConsentSubmission | undefined>(
    () => submissions.find((s) => s.id === id),
    [submissions, id],
  );

  const attachedBooking = useMemo(() => {
    if (!submission?.booking_id) return undefined;
    return bookings.find((b) => b.id === submission.booking_id);
  }, [submission?.booking_id, bookings]);

  const attachedClientName = useMemo(() => {
    if (!attachedBooking?.client_id) return undefined;
    return clients.find((c) => c.id === attachedBooking.client_id)?.name;
  }, [attachedBooking?.client_id, clients]);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [confirmReject, setConfirmReject] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setHeaderLeft(
      <button
        onClick={() => navigate('/forms')}
        className="w-12 h-12 flex items-center justify-center text-text-s active:text-accent transition-colors cursor-pointer press-scale"
        aria-label="Back to forms"
      >
        <ArrowLeft size={22} strokeWidth={1.75} />
      </button>
    );
    setHeaderRight(null);
    return () => { setHeaderLeft(null); setHeaderRight(null); };
  }, [setHeaderLeft, setHeaderRight, navigate]);

  useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);

  if (!submission) {
    return (
      <div className="px-5 pt-12 text-center">
        <FileSignature size={36} strokeWidth={1.25} className="text-text-t mx-auto mb-3" />
        <div className="text-base text-text-s">Form not found.</div>
        <button onClick={() => navigate('/forms')} className="mt-4 text-sm text-accent press-scale cursor-pointer">
          Back to Forms
        </button>
      </div>
    );
  }

  const formEntries = Object.entries(submission.form_data ?? {});

  const handleApprove = async (bookingId: string) => {
    setBusy(true);
    try {
      await approveSubmission(submission.id, bookingId);
      setPickerOpen(false);
      addToast('Form approved');
    } catch (e) {
      console.error(e);
      addToast('Failed to approve form');
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async () => {
    setBusy(true);
    try {
      await rejectSubmission(submission.id);
      addToast('Form rejected');
      navigate('/forms');
    } catch (e) {
      console.error(e);
      addToast('Failed to reject form');
      setBusy(false);
    }
  };

  const sectionClass = 'mb-6';
  const cardClass = 'bg-surface/60 rounded-lg border border-border/30 p-5';

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto px-3 pb-32 lg:px-6 max-w-2xl">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-2xl text-text-p">
              {consentSubmissionDisplayName(submission)}
            </h1>
            <div className="text-sm text-text-t mt-1">
              Submitted {format(new Date(submission.submitted_at), 'PPp')}
            </div>
          </div>
          <StatusBadge status={submission.status} />
        </div>

        {/* License */}
        <section className={sectionClass}>
          <h2 className="text-md text-text-p font-display mb-3">ID / License</h2>
          <div className={cardClass}>
            {submission.license_image_key ? (
              <div className="mb-4 rounded-md overflow-hidden bg-bg/40 border border-border/40">
                {/* Image will be served by the existing R2 worker once phase 2 lands. */}
                <div className="aspect-[1.586] flex items-center justify-center text-text-t text-sm">
                  License image preview
                </div>
              </div>
            ) : (
              <div className="mb-4 rounded-md bg-bg/40 border border-border/40 border-dashed p-6 text-center text-sm text-text-t">
                No license image yet.
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <Field label="First name" value={submission.license_first_name} />
              <Field label="Last name" value={submission.license_last_name} />
              <Field label="Date of birth" value={submission.license_dob} />
              <Field label="License #" value={submission.license_number} />
              <Field label="State" value={submission.license_state} />
              <Field label="Expires" value={submission.license_expiry} />
              <div className="col-span-2">
                <Field label="Address" value={submission.license_address} />
              </div>
            </div>
          </div>
        </section>

        {/* Consent form */}
        <section className={sectionClass}>
          <h2 className="text-md text-text-p font-display mb-3">Consent form</h2>
          <div className={cardClass}>
            {formEntries.length === 0 ? (
              <div className="text-sm text-text-t italic">No form data yet.</div>
            ) : (
              <div className="space-y-3">
                {formEntries.map(([key, value]) => (
                  <div key={key} className="flex items-start justify-between gap-4">
                    <div className="text-sm text-text-s">{key}</div>
                    <div className="text-sm text-text-p text-right">{String(value)}</div>
                  </div>
                ))}
              </div>
            )}
            {submission.signature_image_key ? (
              <div className="mt-4 pt-4 border-t border-border/30">
                <div className="text-xs text-text-t uppercase tracking-wider mb-2">Signature</div>
                <div className="rounded-md bg-bg/40 border border-border/40 aspect-[3/1] flex items-center justify-center text-sm text-text-t">
                  Signature preview
                </div>
              </div>
            ) : (
              <div className="mt-4 pt-4 border-t border-border/30 text-sm text-text-t italic">
                No signature yet.
              </div>
            )}
          </div>
        </section>

        {/* Booking attachment (post-approve) */}
        {submission.status !== 'submitted' && (
          <section className={sectionClass}>
            <h2 className="text-md text-text-p font-display mb-3">Attached booking</h2>
            <div className={cardClass}>
              {attachedBooking ? (
                <div>
                  <div className="text-base text-text-p">
                    {getBookingLabel(attachedBooking, attachedClientName)}
                  </div>
                  <div className="text-sm text-text-t mt-1">
                    {format(new Date(attachedBooking.date), 'PPp')} · {attachedBooking.type}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-today">
                  <AlertTriangle size={16} />
                  <span>Booking no longer attached.</span>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Payment & tattoo (post-approve) */}
        {submission.status !== 'submitted' && (
          <section className={sectionClass}>
            <h2 className="text-md text-text-p font-display mb-3">Payment & tattoo</h2>
            <div className={cardClass}>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Payment type" value={submission.payment_type} />
                <Field label="Amount" value={submission.payment_amount != null ? `$${submission.payment_amount.toFixed(2)}` : undefined} />
                <div className="col-span-2">
                  <Field label="Tattoo location" value={submission.tattoo_location} />
                </div>
                <div className="col-span-2">
                  <Field label="Description" value={submission.tattoo_description} />
                </div>
              </div>
            </div>
          </section>
        )}
      </div>

      {/* Action bar — sticks to the bottom on mobile, sits in flow on desktop */}
      <div className="shrink-0 border-t border-border/30 bg-surface/80 backdrop-blur-xl px-3 py-3 lg:px-6">
        <div className="max-w-2xl flex gap-3">
          {submission.status === 'submitted' && !confirmReject && (
            <>
              <button
                onClick={() => setConfirmReject(true)}
                disabled={busy}
                className="flex-1 py-3.5 text-base text-danger rounded-md border border-danger/30 cursor-pointer press-scale transition-all active:bg-danger/10 disabled:opacity-40 min-h-[48px] flex items-center justify-center gap-2"
              >
                <Trash2 size={18} />
                Reject
              </button>
              <button
                onClick={() => setPickerOpen(true)}
                disabled={busy}
                className="flex-1 py-3.5 text-base bg-accent text-bg rounded-md font-medium cursor-pointer press-scale transition-all shadow-glow active:shadow-glow-strong disabled:opacity-40 min-h-[48px] flex items-center justify-center gap-2"
              >
                <Check size={18} />
                Approve
              </button>
            </>
          )}

          {submission.status === 'submitted' && confirmReject && (
            <>
              <button
                onClick={() => setConfirmReject(false)}
                disabled={busy}
                className="flex-1 py-3.5 text-base text-text-s rounded-md border border-border/40 cursor-pointer press-scale transition-all disabled:opacity-40 min-h-[48px] flex items-center justify-center gap-2"
              >
                <X size={18} />
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={busy}
                className="flex-1 py-3.5 text-base bg-danger text-bg rounded-md font-medium cursor-pointer press-scale transition-all disabled:opacity-40 min-h-[48px] flex items-center justify-center gap-2"
              >
                <Trash2 size={18} />
                {busy ? 'Rejecting…' : 'Confirm reject'}
              </button>
            </>
          )}

          {submission.status === 'approved_pending' && (
            <button
              onClick={() => setFinalizeOpen(true)}
              disabled={busy || consentSubmissionIsComplete(submission)}
              className="flex-1 py-3.5 text-base bg-accent text-bg rounded-md font-medium cursor-pointer press-scale transition-all shadow-glow active:shadow-glow-strong disabled:opacity-40 min-h-[48px] flex items-center justify-center gap-2"
            >
              <Check size={18} />
              Enter payment & tattoo details
            </button>
          )}

          {submission.status === 'finalized' && (
            <div className="flex-1 py-3.5 text-base text-text-t text-center">
              Form complete.
            </div>
          )}
        </div>
      </div>

      <BookingPickerDrawer
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={handleApprove}
        busy={busy}
      />

      <FinalizeFormDrawer
        open={finalizeOpen}
        submission={submission}
        onClose={() => setFinalizeOpen(false)}
      />
    </div>
  );
}
