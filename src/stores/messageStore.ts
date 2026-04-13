import { create } from 'zustand';
import {
  fetchAllConversations,
  fetchConversationMessages,
  sendMessage as sendMessageApi,
  sendImageMessage as sendImageApi,
  isBusinessMessage,
  markConversationRead,
  fetchReadStates,
} from '../services/messageService';
import type { ConversationSummary, GraphMessage } from '../services/messageService';

interface MessageStore {
  conversations: ConversationSummary[];
  isLoading: boolean;
  error: string | null;
  readMids: Record<string, string>; // conversationId → last_read_mid (from Supabase)
  fetchConversations: () => Promise<void>;
  markRead: (conversationId: string) => void;

  // Chat detail state
  currentMessages: GraphMessage[];
  currentConversationId: string | null;
  isSending: boolean;
  fetchMessages: (conversationId: string) => Promise<void>;
  sendMessage: (conversationId: string, platform: 'instagram' | 'messenger', recipientPsid: string, text: string) => Promise<void>;
  sendImage: (conversationId: string, platform: 'instagram' | 'messenger', recipientPsid: string, imageUrl: string) => Promise<void>;
  clearCurrentMessages: () => void;

  // Draft persistence
  drafts: Record<string, string>;
  setDraft: (conversationId: string, text: string) => void;
  clearDraft: (conversationId: string) => void;
}

export const useMessageStore = create<MessageStore>((set, get) => ({
  conversations: [],
  isLoading: false,
  error: null,
  readMids: {},

  fetchConversations: async () => {
    set({ isLoading: true, error: null });
    try {
      const [conversations, readMids] = await Promise.all([
        fetchAllConversations(),
        fetchReadStates(),
      ]);

      const currentReadMids = { ...get().readMids, ...readMids };

      // Apply read state: if last message mid matches what we last read, it's read
      const merged = conversations.map((c) => {
        const readMid = currentReadMids[c.id];
        if (readMid && c.lastMid && readMid === c.lastMid) {
          return { ...c, lastMessageFromClient: false, unreadCount: 0 };
        }
        return c;
      });

      set({ conversations: merged, isLoading: false, readMids: currentReadMids });
    } catch (e) {
      set({ error: (e as Error).message, isLoading: false });
    }
  },

  markRead: (conversationId) => {
    const convo = get().conversations.find((c) => c.id === conversationId);
    const lastMid = convo?.lastMid;

    // Optimistic local update
    set((s) => ({
      readMids: lastMid ? { ...s.readMids, [conversationId]: lastMid } : s.readMids,
      conversations: s.conversations.map((c) =>
        c.id === conversationId ? { ...c, lastMessageFromClient: false, unreadCount: 0 } : c
      ),
    }));

    // Persist to Supabase (fire-and-forget)
    if (lastMid) {
      markConversationRead(conversationId, lastMid).catch(console.error);
    }
  },

  // Chat detail
  currentMessages: [],
  currentConversationId: null,
  isSending: false,

  fetchMessages: async (conversationId) => {
    try {
      const messages = await fetchConversationMessages(conversationId);
      if (get().currentConversationId === conversationId || !get().currentConversationId) {
        set({ currentMessages: messages, currentConversationId: conversationId });

        // Update lastMid if new messages arrived while viewing
        if (messages.length > 0) {
          const latestMid = messages[messages.length - 1].id;
          const convo = get().conversations.find((c) => c.id === conversationId);
          if (convo && convo.lastMid !== latestMid) {
            // Mark read with the new latest mid
            set((s) => ({
              readMids: { ...s.readMids, [conversationId]: latestMid },
              conversations: s.conversations.map((c) =>
                c.id === conversationId ? { ...c, lastMid: latestMid, lastMessageFromClient: false, unreadCount: 0 } : c
              ),
            }));
            markConversationRead(conversationId, latestMid).catch(console.error);
          }
        }
      }
    } catch (e) {
      console.error('Failed to fetch messages:', e);
    }
  },

  sendMessage: async (conversationId, platform, recipientPsid, text) => {
    const optimistic: GraphMessage = {
      id: 'pending_' + Date.now(),
      created_time: new Date().toISOString(),
      from: { id: '__self__', name: 'Ink Bloop' },
      to: { data: [{ id: recipientPsid, name: '' }] },
      message: text,
    };
    set((s) => ({ currentMessages: [...s.currentMessages, optimistic], isSending: true }));

    try {
      const result = await sendMessageApi(platform, recipientPsid, text);
      set((s) => ({
        currentMessages: s.currentMessages.map((m) =>
          m.id === optimistic.id ? { ...m, id: result.messageId } : m
        ),
        isSending: false,
      }));
      // Update snippet, clear draft, mark read with our own message
      set((s) => {
        const { [conversationId]: _, ...restDrafts } = s.drafts;
        return {
          readMids: { ...s.readMids, [conversationId]: result.messageId },
          conversations: s.conversations.map((c) =>
            c.id === conversationId
              ? { ...c, lastMessage: text, lastMessageTime: new Date().toISOString(), lastMessageFromClient: false, lastMid: result.messageId, unreadCount: 0 }
              : c
          ),
          drafts: restDrafts,
        };
      });
      markConversationRead(conversationId, result.messageId).catch(console.error);
    } catch (e) {
      set((s) => ({
        currentMessages: s.currentMessages.filter((m) => m.id !== optimistic.id),
        isSending: false,
      }));
      throw e;
    }
  },

  sendImage: async (conversationId, platform, recipientPsid, imageUrl) => {
    const optimistic: GraphMessage = {
      id: 'pending_' + Date.now(),
      created_time: new Date().toISOString(),
      from: { id: '__self__', name: 'Ink Bloop' },
      to: { data: [{ id: recipientPsid, name: '' }] },
      attachments: { data: [{ type: 'image', payload: { url: imageUrl } }] },
    };
    set((s) => ({ currentMessages: [...s.currentMessages, optimistic], isSending: true }));

    try {
      const result = await sendImageApi(platform, recipientPsid, imageUrl);
      set((s) => ({
        currentMessages: s.currentMessages.map((m) =>
          m.id === optimistic.id ? { ...m, id: result.messageId } : m
        ),
        isSending: false,
        readMids: { ...s.readMids, [conversationId]: result.messageId },
        conversations: s.conversations.map((c) =>
          c.id === conversationId
            ? { ...c, lastMessage: 'Sent an image', lastMessageTime: new Date().toISOString(), lastMessageFromClient: false, lastMid: result.messageId, unreadCount: 0 }
            : c
        ),
      }));
      markConversationRead(conversationId, result.messageId).catch(console.error);
    } catch (e) {
      set((s) => ({
        currentMessages: s.currentMessages.filter((m) => m.id !== optimistic.id),
        isSending: false,
      }));
      throw e;
    }
  },

  clearCurrentMessages: () => set({ currentMessages: [], currentConversationId: null }),

  // Draft persistence
  drafts: {},
  setDraft: (conversationId, text) =>
    set((s) => ({ drafts: { ...s.drafts, [conversationId]: text } })),
  clearDraft: (conversationId) =>
    set((s) => {
      const { [conversationId]: _, ...rest } = s.drafts;
      return { drafts: rest };
    }),
}));

export { isBusinessMessage };
