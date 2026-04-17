import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { useAgentStore } from '../../stores/agentStore';
import { supabase } from '../../lib/supabase';

const VISIBLE_MS = 3000;

/**
 * Small prompt that appears above the agent FAB for 3s after an exchange
 * completes (all modals closed). Tapping thumbs-up/down records the rating
 * and the full trace of the exchange to `agent_feedback`. If the user
 * ignores it, the trace is discarded.
 */
export default function AgentFeedbackPrompt() {
  const prompt = useAgentStore((s) => s.feedbackPrompt);
  const clearFeedback = useAgentStore((s) => s.clearFeedback);
  const [submitting, setSubmitting] = useState(false);
  const submittedRef = useRef(false);

  // Auto-dismiss after 3s
  useEffect(() => {
    if (!prompt) return;
    submittedRef.current = false;
    const timer = setTimeout(() => {
      if (!submittedRef.current) clearFeedback();
    }, VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [prompt, clearFeedback]);

  const submit = async (rating: 'up' | 'down') => {
    if (!prompt || submitting) return;
    submittedRef.current = true;
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { error } = await supabase.from('agent_feedback').insert({
          user_id: user.id,
          rating,
          trace: prompt.trace,
        } as never);
        if (error) console.error('Failed to save feedback:', error);
      }
    } catch (err) {
      console.error('Feedback submission error:', err);
    } finally {
      setSubmitting(false);
      clearFeedback();
    }
  };

  return (
    <AnimatePresence>
      {prompt && (
        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.9 }}
          transition={{ duration: 0.2 }}
          className="fixed bottom-[208px] right-5 lg:bottom-[124px] lg:right-8 flex gap-2 z-30"
        >
          <button
            onClick={() => submit('up')}
            disabled={submitting}
            className="w-12 h-12 bg-elevated border border-border/60 rounded-xl flex items-center justify-center shadow-lg cursor-pointer press-scale transition-colors active:bg-accent/20 disabled:opacity-50"
            title="This worked"
          >
            <ThumbsUp size={20} className="text-text-p" />
          </button>
          <button
            onClick={() => submit('down')}
            disabled={submitting}
            className="w-12 h-12 bg-elevated border border-border/60 rounded-xl flex items-center justify-center shadow-lg cursor-pointer press-scale transition-colors active:bg-accent/20 disabled:opacity-50"
            title="This didn't work"
          >
            <ThumbsDown size={20} className="text-text-p" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
