import { useUIStore } from '../stores/uiStore';
import { useAgentStore } from '../stores/agentStore';
import type { ResolvedFeedbackDraft } from './types';

/**
 * Feedback Agent — pure executor.
 *
 * Drops the user's dictated feedback text into the Feedback tab's textarea
 * and navigates there. The user reviews it and submits themselves — we
 * deliberately do NOT auto-submit, because feedback is personal and should
 * never go out without a human glance.
 */

export function executeFeedbackDraft(data: ResolvedFeedbackDraft) {
  const store = useAgentStore.getState();
  const ui = useUIStore.getState();

  ui.setPrefillFeedbackText(data.text);

  store.replaceLastLoading({
    status: 'action_taken',
    actionLabel: 'Opening feedback...',
  });

  setTimeout(() => {
    store.closePanel();
    window.dispatchEvent(
      new CustomEvent('agent-navigate', { detail: '/feedback' })
    );
  }, 300);
}
