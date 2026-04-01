import { useState } from 'react';
import Modal from './common/Modal';
import { useUIStore } from '../stores/uiStore';
import { parseQuickBooking } from '../utils/quickBookingParser';

export default function QuickBooking() {
  const { setQuickBookingOpen, openBookingForm, setPrefillBookingData } = useUIStore();
  const [text, setText] = useState('');

  const handleSubmit = () => {
    if (!text.trim()) return;
    const parsed = parseQuickBooking(text);
    setPrefillBookingData(parsed);
    setQuickBookingOpen(false);
    openBookingForm();
  };

  return (
    <Modal
      title="Quick Booking"
      onClose={() => setQuickBookingOpen(false)}
      width="lg:max-w-[520px]"
      fullScreenMobile={false}
    >
      <div className="space-y-4">
        <p className="text-base text-text-s">
          Tap the mic on your keyboard to dictate, or type below.
        </p>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          placeholder='e.g. "Sarah, left wrist floral, black & grey, Thursday 2pm, 2 hours"'
          className="w-full bg-input border border-border/60 rounded-xl px-4 py-4 text-base text-text-p placeholder:text-text-t focus:outline-none focus:border-accent/40 resize-none transition-colors"
          autoFocus
        />

        <button
          onClick={handleSubmit}
          disabled={!text.trim()}
          className="w-full py-4 bg-accent text-bg text-base rounded-xl font-medium cursor-pointer press-scale transition-all disabled:opacity-40 disabled:cursor-not-allowed active:shadow-glow min-h-[52px]"
        >
          Submit &rarr;
        </button>
      </div>
    </Modal>
  );
}
