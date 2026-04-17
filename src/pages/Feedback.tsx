import { useState, useEffect, useRef } from 'react';
import { useUIStore } from '../stores/uiStore';
import { supabase } from '../lib/supabase';

export default function FeedbackPage() {
  const { setHeaderLeft, setHeaderRight } = useUIStore();
  // Pull the agent-authored prefill (set by the feedback sub-agent before
  // navigating here) as the initial value so the user lands on the tab with
  // their dictated words already in the textarea, ready to review + submit.
  const prefill = useUIStore((s) => s.prefillFeedbackText);
  const setPrefillFeedbackText = useUIStore((s) => s.setPrefillFeedbackText);
  const [text, setText] = useState(prefill ?? '');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setHeaderLeft(null);
    setHeaderRight(null);
    return () => { setHeaderLeft(null); setHeaderRight(null); };
  }, [setHeaderLeft, setHeaderRight]);

  // Consume the prefill exactly once on mount. If the user comes back to
  // the tab without going through the agent, prefill is null and nothing
  // happens. Clearing the store value prevents a stale dictation from
  // reappearing on the next visit.
  useEffect(() => {
    if (prefill) {
      setText(prefill);
      setPrefillFeedbackText(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-focus and open keyboard on mount
  useEffect(() => {
    // Small delay lets the page finish rendering so the keyboard
    // doesn't push layout around before the textarea is visible
    const t = setTimeout(() => {
      textareaRef.current?.focus();
      // Place caret at end so the user can keep dictating/typing if the
      // prefill covered most of what they wanted to say.
      const el = textareaRef.current;
      if (el) el.setSelectionRange(el.value.length, el.value.length);
    }, 150);
    return () => clearTimeout(t);
  }, []);

  const handleSubmit = async () => {
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      await supabase.from('feedback').insert({
        user_id: session.user.id,
        feedback: text.trim(),
      });
      setText('');
      setSubmitted(true);
      // Blur to close the keyboard
      textareaRef.current?.blur();
    } catch (e) {
      console.error('Failed to submit feedback:', e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="px-5 pt-2 pb-4">
      {submitted ? (
        <div className="text-center pt-16">
          <div className="text-2xl mb-2">Thanks for the feedback!</div>
          <button
            onClick={() => setSubmitted(false)}
            className="mt-4 text-sm text-accent cursor-pointer press-scale"
          >
            Send more
          </button>
        </div>
      ) : (
        <>
          <textarea
            ref={textareaRef}
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What's on your mind?"
            className="w-full h-32 bg-input border border-border/60 rounded-md px-4 py-3.5 text-base text-text-p placeholder:text-text-t focus:outline-none focus:border-accent/40 transition-colors resize-none"
          />
          <button
            onClick={handleSubmit}
            disabled={!text.trim() || submitting}
            className="mt-3 w-full px-6 py-4 text-base bg-accent text-bg rounded-md font-medium cursor-pointer press-scale transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-glow active:shadow-glow-strong min-h-[52px]"
          >
            {submitting ? 'Sending...' : 'Submit'}
          </button>
        </>
      )}
    </div>
  );
}
