import { useState, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import Modal from './common/Modal';
import { useUIStore } from '../stores/uiStore';
import { parseQuickBooking } from '../utils/quickBookingParser';
import { parseBookingWithAI } from '../utils/aiBookingParser';

const API_KEY_STORAGE = 'inkflow-anthropic-key';

export default function QuickBooking() {
  const { setQuickBookingOpen, openBookingForm, setPrefillBookingData, addToast } = useUIStore();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = async () => {
    if (!text.trim()) return;

    const apiKey = localStorage.getItem(API_KEY_STORAGE);

    if (apiKey) {
      // Use AI parsing
      setLoading(true);
      try {
        const parsed = await parseBookingWithAI(text, apiKey);
        setPrefillBookingData(parsed);
        setQuickBookingOpen(false);
        openBookingForm();
      } catch (err) {
        // Fall back to regex parser
        addToast('AI parsing failed, using basic parser');
        const parsed = parseQuickBooking(text);
        setPrefillBookingData(parsed);
        setQuickBookingOpen(false);
        openBookingForm();
      } finally {
        setLoading(false);
      }
    } else {
      // No API key — use regex parser
      const parsed = parseQuickBooking(text);
      setPrefillBookingData(parsed);
      setQuickBookingOpen(false);
      openBookingForm();
    }
  };

  return (
    <Modal
      title="Quick Booking"
      onClose={() => setQuickBookingOpen(false)}
      width="lg:max-w-[520px]"
      fullScreenMobile={true}
      onReady={() => textareaRef.current?.focus()}
    >
      <div className="space-y-4">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          ref={textareaRef}
          placeholder="Describe the booking in your own words..."
          className="w-full bg-input border border-border/60 rounded-xl px-4 py-4 text-base text-text-p placeholder:text-text-t focus:outline-none focus:border-accent/40 resize-none transition-colors"
          disabled={loading}
        />

        <button
          onClick={handleSubmit}
          disabled={!text.trim() || loading}
          className="w-full py-4 bg-accent text-bg text-base rounded-xl font-medium cursor-pointer press-scale transition-all disabled:opacity-40 disabled:cursor-not-allowed active:shadow-glow min-h-[52px] flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Parsing...
            </>
          ) : (
            'Create Booking →'
          )}
        </button>
      </div>
    </Modal>
  );
}
