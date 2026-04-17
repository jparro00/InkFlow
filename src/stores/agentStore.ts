import { create } from 'zustand';
import type { AgentIntent, AgentMessage } from '../agents/types';

export interface TraceEvent {
  t: number;          // ms since trace start
  type: string;       // event type (user_input, edge_call, resolver, sub_agent, error, ...)
  data?: unknown;     // event-specific payload
}

export interface FeedbackPromptState {
  trace: TraceEvent[];
  shownAt: number;
}

interface AgentStore {
  messages: AgentMessage[];
  isProcessing: boolean;
  panelOpen: boolean;

  // Stashed intent for resuming after user makes a selection
  pendingIntent: AgentIntent | null;
  // Resolved entities accumulated so far (e.g. after client selection)
  pendingResolved: Record<string, unknown>;

  // Trace of the current exchange (from processInput → all modals closed).
  // Cleared when a new exchange starts or when the feedback prompt resolves.
  trace: TraceEvent[];
  traceStartedAt: number | null;
  // True when an exchange is in-flight and eligible for feedback once it
  // completes (panel closed, no modals open, not processing).
  traceActive: boolean;
  // When set, the feedback prompt is shown above the FAB for 3s.
  feedbackPrompt: FeedbackPromptState | null;

  // Actions
  openPanel: () => void;
  closePanel: () => void;
  addUserMessage: (text: string) => void;
  addAgentMessage: (message: Omit<AgentMessage, 'id' | 'role'>) => void;
  setLoading: (loading: boolean) => void;
  replaceLastLoading: (message: Omit<AgentMessage, 'id' | 'role'>) => void;
  setPending: (intent: AgentIntent | null, resolved?: Record<string, unknown>) => void;
  updatePendingResolved: (key: string, value: unknown) => void;
  reset: () => void;

  // Trace actions
  startTrace: () => void;
  logTrace: (type: string, data?: unknown) => void;
  showFeedbackPrompt: () => void;
  clearFeedback: () => void;
}

export const useAgentStore = create<AgentStore>((set, get) => ({
  messages: [],
  isProcessing: false,
  panelOpen: false,
  pendingIntent: null,
  pendingResolved: {},
  trace: [],
  traceStartedAt: null,
  traceActive: false,
  feedbackPrompt: null,

  openPanel: () => set({ panelOpen: true, messages: [], pendingIntent: null, pendingResolved: {}, isProcessing: false }),

  closePanel: () => set({ panelOpen: false }),

  addUserMessage: (text) =>
    set((s) => ({
      messages: [
        ...s.messages,
        { id: crypto.randomUUID(), role: 'user' as const, text },
      ],
    })),

  addAgentMessage: (message) =>
    set((s) => ({
      messages: [
        ...s.messages,
        { id: crypto.randomUUID(), role: 'agent' as const, ...message },
      ],
    })),

  setLoading: (loading) => {
    if (loading) {
      // Add a loading message
      set((s) => ({
        isProcessing: true,
        messages: [
          ...s.messages,
          { id: crypto.randomUUID(), role: 'agent' as const, status: 'loading' as const },
        ],
      }));
    } else {
      set({ isProcessing: false });
    }
  },

  replaceLastLoading: (message) =>
    set((s) => {
      const msgs = [...s.messages];
      const lastLoadingIdx = msgs.findLastIndex((m) => m.status === 'loading');
      if (lastLoadingIdx >= 0) {
        msgs[lastLoadingIdx] = { id: msgs[lastLoadingIdx].id, role: 'agent', ...message };
      } else {
        msgs.push({ id: crypto.randomUUID(), role: 'agent', ...message });
      }
      return { messages: msgs, isProcessing: false };
    }),

  setPending: (intent, resolved = {}) =>
    set({ pendingIntent: intent, pendingResolved: resolved }),

  updatePendingResolved: (key, value) =>
    set((s) => ({
      pendingResolved: { ...s.pendingResolved, [key]: value },
    })),

  reset: () =>
    set({
      messages: [],
      isProcessing: false,
      pendingIntent: null,
      pendingResolved: {},
    }),

  // Start a new trace. Any prior un-submitted trace is discarded.
  startTrace: () =>
    set({
      trace: [],
      traceStartedAt: Date.now(),
      traceActive: true,
      feedbackPrompt: null,
    }),

  logTrace: (type, data) => {
    const started = get().traceStartedAt;
    if (!get().traceActive || started === null) return;
    set((s) => ({
      trace: [...s.trace, { t: Date.now() - started, type, data }],
    }));
  },

  // Called when the exchange is fully complete (all modals closed).
  // Captures the current trace into feedbackPrompt for 3s display.
  showFeedbackPrompt: () =>
    set((s) => {
      if (!s.traceActive || s.trace.length === 0) {
        return { traceActive: false };
      }
      return {
        feedbackPrompt: { trace: s.trace, shownAt: Date.now() },
        trace: [],
        traceStartedAt: null,
        traceActive: false,
      };
    }),

  clearFeedback: () => set({ feedbackPrompt: null }),
}));
