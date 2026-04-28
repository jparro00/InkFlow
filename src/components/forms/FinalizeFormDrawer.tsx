// Sheet for entering payment on an approved submission. Tattoo location and
// description used to live here too, but as of the PDF redesign they are
// CLIENT-entered during the wizard and baked into the signed PDF — payment is
// the only thing left for the artist to fill in for bookkeeping.
//
// Rendered at AppShell root and driven by uiStore.finalizeSubmissionId — the
// consent drawer dismisses itself before opening this so they don't stack.

import { useState } from 'react';
import Modal, { useModalDismiss } from '../common/Modal';
import { useConsentSubmissionStore } from '../../stores/consentSubmissionStore';
import { useUIStore } from '../../stores/uiStore';
import type { ConsentSubmission } from '../../types';

const PAYMENT_TYPES = ['Cash', 'Card', 'Cash App'] as const;

export default function FinalizeFormDrawer() {
  const submissionId = useUIStore((s) => s.finalizeSubmissionId);
  const setFinalizeSubmissionId = useUIStore((s) => s.setFinalizeSubmissionId);
  const submission = useConsentSubmissionStore((s) =>
    submissionId ? s.submissions.find((sub) => sub.id === submissionId) : undefined,
  );
  if (!submissionId || !submission) return null;
  const onClose = () => setFinalizeSubmissionId(null);
  return (
    <Modal title="Payment" onClose={onClose}>
      <FinalizeFormBody submission={submission} />
    </Modal>
  );
}

function FinalizeFormBody({ submission }: { submission: ConsentSubmission }) {
  const dismiss = useModalDismiss();
  const finalizeSubmission = useConsentSubmissionStore((s) => s.finalizeSubmission);
  const addToast = useUIStore((s) => s.addToast);
  const setFinalizeSubmissionId = useUIStore((s) => s.setFinalizeSubmissionId);

  const [paymentType, setPaymentType] = useState(submission.payment_type ?? '');
  const [price, setPrice] = useState(
    submission.payment_amount != null ? String(submission.payment_amount) : '',
  );
  const [tip, setTip] = useState(
    submission.payment_tip != null ? String(submission.payment_tip) : '',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputClass =
    'w-full bg-input border border-border/60 rounded-md pl-7 pr-4 py-3.5 text-base text-text-p placeholder:text-text-t focus:outline-none focus:border-accent/40 transition-colors min-h-[48px]';

  const priceNum = price.trim() === '' ? NaN : Number(price);
  // Tip is optional — empty means $0, not invalid.
  const tipNum = tip.trim() === '' ? 0 : Number(tip);
  const canSubmit =
    paymentType.trim() &&
    !isNaN(priceNum) && priceNum >= 0 &&
    !isNaN(tipNum) && tipNum >= 0;

  const handleSave = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    const id = submission.id;
    try {
      await finalizeSubmission(id, {
        payment_type: paymentType.trim(),
        payment_amount: priceNum,
        payment_tip: tipNum,
      });
      addToast('Form finalized');
      // Only dismiss THIS finalize sheet. If the user moved on to another
      // submission while save was in flight, the late "Form finalized"
      // toast shouldn't close their new drawer.
      if (useUIStore.getState().finalizeSubmissionId === id) {
        dismiss();
        setFinalizeSubmissionId(null);
      }
    } catch (e) {
      console.error(e);
      setError('Failed to save. Try again.');
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <label className="text-sm text-text-s mb-2 block font-medium">Payment type</label>
        <div className="flex flex-wrap gap-2">
          {PAYMENT_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setPaymentType(t)}
              className={`px-3 py-2 rounded-md text-sm cursor-pointer press-scale transition-all border ${
                paymentType === t
                  ? 'bg-accent/15 border-accent/50 text-accent'
                  : 'bg-input border-border/60 text-text-s active:bg-elevated/40'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm text-text-s mb-2 block font-medium">Price</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-t text-base pointer-events-none">$</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
              className={inputClass}
            />
          </div>
        </div>
        <div>
          <label className="text-sm text-text-s mb-2 block font-medium">Tip</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-t text-base pointer-events-none">$</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={tip}
              onChange={(e) => setTip(e.target.value)}
              placeholder="0.00"
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {error && <div className="text-sm text-danger">{error}</div>}

      <button
        onClick={handleSave}
        disabled={!canSubmit || busy}
        className="w-full py-3.5 text-base bg-accent text-bg rounded-md font-medium cursor-pointer press-scale transition-all shadow-glow active:shadow-glow-strong disabled:opacity-40 disabled:cursor-not-allowed min-h-[52px]"
      >
        {busy ? 'Saving…' : 'Finalize'}
      </button>
    </div>
  );
}
