import { useState } from 'react';
import Modal, { useModalDismiss } from '../common/Modal';
import { useConsentSubmissionStore } from '../../stores/consentSubmissionStore';
import { useUIStore } from '../../stores/uiStore';
import type { ConsentSubmission } from '../../types';

interface Props {
  open: boolean;
  submission: ConsentSubmission;
  onClose: () => void;
}

const PAYMENT_TYPES = ['Cash', 'Card', 'Venmo', 'Zelle', 'Other'];

export default function FinalizeFormDrawer({ open, submission, onClose }: Props) {
  if (!open) return null;
  return (
    <Modal title="Payment & tattoo details" onClose={onClose}>
      <FinalizeFormBody submission={submission} />
    </Modal>
  );
}

function FinalizeFormBody({ submission }: { submission: ConsentSubmission }) {
  const dismiss = useModalDismiss();
  const finalizeSubmission = useConsentSubmissionStore((s) => s.finalizeSubmission);
  const addToast = useUIStore((s) => s.addToast);

  const [paymentType, setPaymentType] = useState(submission.payment_type ?? '');
  const [paymentAmount, setPaymentAmount] = useState(
    submission.payment_amount != null ? String(submission.payment_amount) : '',
  );
  const [tattooLocation, setTattooLocation] = useState(submission.tattoo_location ?? '');
  const [tattooDescription, setTattooDescription] = useState(submission.tattoo_description ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputClass =
    'w-full bg-input border border-border/60 rounded-md px-4 py-3.5 text-base text-text-p placeholder:text-text-t focus:outline-none focus:border-accent/40 transition-colors min-h-[48px]';

  const canSubmit =
    paymentType.trim() &&
    paymentAmount.trim() &&
    !isNaN(Number(paymentAmount)) &&
    Number(paymentAmount) >= 0 &&
    tattooLocation.trim() &&
    tattooDescription.trim();

  const handleSave = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await finalizeSubmission(submission.id, {
        payment_type: paymentType.trim(),
        payment_amount: Number(paymentAmount),
        tattoo_location: tattooLocation.trim(),
        tattoo_description: tattooDescription.trim(),
      });
      addToast('Form finalized');
      dismiss();
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
        <div className="flex flex-wrap gap-2 mb-2">
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
        {paymentType === 'Other' && (
          <input
            type="text"
            value={paymentType === 'Other' ? '' : paymentType}
            onChange={(e) => setPaymentType(e.target.value)}
            placeholder="Specify..."
            className={inputClass}
          />
        )}
      </div>

      <div>
        <label className="text-sm text-text-s mb-2 block font-medium">Amount</label>
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          value={paymentAmount}
          onChange={(e) => setPaymentAmount(e.target.value)}
          placeholder="0.00"
          className={inputClass}
        />
      </div>

      <div>
        <label className="text-sm text-text-s mb-2 block font-medium">Tattoo location</label>
        <input
          type="text"
          value={tattooLocation}
          onChange={(e) => setTattooLocation(e.target.value)}
          placeholder="e.g. Right forearm"
          className={inputClass}
        />
      </div>

      <div>
        <label className="text-sm text-text-s mb-2 block font-medium">Description</label>
        <textarea
          value={tattooDescription}
          onChange={(e) => setTattooDescription(e.target.value)}
          placeholder="Brief description of the design..."
          className={`${inputClass} h-28 resize-none`}
        />
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
