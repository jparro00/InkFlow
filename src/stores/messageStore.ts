import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import {
  fetchConversationsFromDB,
  fetchMessagesFromDB,
  fetchOlderMessages,
  sendMessage as sendMessageApi,
  sendImageMessage as sendImageApi,
  storeOutgoingMessage,
  isBusinessMessage,
  fetchReadStates,
  markConversationRead,
  invalidateProfileCache,
} from '../services/messageService';
import type { ConversationSummary, GraphMessage } from '../services/messageService';

interface DBMessageRow {
  mid: string;
  conversation_id: string;
  sender_id: string;
  sender_name: string | null;
  recipient_id: string;
  platform: string;
  text: string | null;
  attachments: { type: string; payload?: { url?: string } }[] | null;
  created_at: string;
  is_echo: boolean;
  user_id: string;
}

interface ParticipantProfileRow {
  psid: string;
  user_id: string;
  name: string | null;
  profile_pic: string | null;
}

interface MessageStore {
  conversations: ConversationSummary[];
  isLoading: boolean;
  error: string | null;
  readMids: Record<string, string>;
  fetchConversations: () => Promise<void>;
  markRead: (conversationId: string) => void;
  startRealtime: () => Promise<void>;
  stopRealtime: () => void;
  _realtimeChannel: ReturnType<typeof supabase.channel> | null;
  _pollInterval: ReturnType<typeof setInterval> | null;
  _handleNewMessage: (row: DBMessageRow) => void;
  _startPolling: () => void;

  // Chat detail state
  currentMessages: GraphMessage[];
  olderMessages: GraphMessage[];
  currentConversationId: string | null;
  isLoadingMessages: boolean;
  isSending: boolean;
  hasOlderMessages: boolean;
  isLoadingOlder: boolean;
  olderCursor: string | null;
  messageCache: Record<string, GraphMessage[]>;
  fetchMessages: (conversationId: string) => Promise<void>;
  loadOlderMessages: (conversationId: string) => Promise<void>;
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
  _realtimeChannel: null,
  _pollInterval: null,

  startRealtime: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Try Supabase Realtime first
    const channel = supabase
      .channel('inkbloop-realtime')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
      }, (payload) => {
        const row = payload.new as DBMessageRow;
        get()._handleNewMessage(row);
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'participant_profiles',
      }, (payload) => {
        const row = (payload.new ?? {}) as ParticipantProfileRow;
        if (!row.psid) return;
        invalidateProfileCache(row.psid);
        set((s) => ({
          conversations: s.conversations.map(c =>
            c.participantPsid === row.psid
              ? {
                  ...c,
                  ...(row.profile_pic != null ? { profilePic: row.profile_pic } : {}),
                  ...(row.name ? { participantName: row.name } : {}),
                }
              : c
          ),
        }));
      })
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log('[Realtime] connected');
          // Stop polling if Realtime is working
          const pollId = get()._pollInterval;
          if (pollId) { clearInterval(pollId); set({ _pollInterval: null }); }
        } else if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
          console.warn('[Realtime] failed, falling back to polling:', err ?? status);
          get()._startPolling();
        }
      });

    set({ _realtimeChannel: channel });
  },

  _handleNewMessage: (row: DBMessageRow) => {
    const isFromClient = !row.is_echo;

    const newMsg: GraphMessage = {
      id: row.mid,
      created_time: row.created_at,
      from: { id: row.sender_id, name: row.sender_name || '' },
      to: { data: [{ id: row.recipient_id, name: '' }] },
      message: row.text || undefined,
      attachments: row.attachments?.length
        ? { data: row.attachments }
        : undefined,
    };

    const isOpen = row.conversation_id === get().currentConversationId;

    set((s) => {
      const exists = s.conversations.some(c => c.id === row.conversation_id);
      if (!exists) {
        get().fetchConversations();
        return {};
      }
      return {
        conversations: s.conversations.map(c => {
          if (c.id !== row.conversation_id) return c;
          const unreadCount = isFromClient && !isOpen ? c.unreadCount + 1 : 0;
          return {
            ...c,
            lastMessage: row.text || (row.attachments?.length ? 'Sent an image' : c.lastMessage),
            lastMessageTime: row.created_at,
            lastMessageFromClient: isFromClient,
            lastMid: row.mid,
            unreadCount,
          };
        }),
      };
    });

    if (isOpen && !row.is_echo) {
      const alreadyPresent = get().currentMessages.some(m => m.id === row.mid);
      if (!alreadyPresent) {
        set((s) => ({
          currentMessages: [...s.currentMessages, newMsg],
          messageCache: {
            ...s.messageCache,
            [row.conversation_id]: [...(s.messageCache[row.conversation_id] ?? []), newMsg],
          },
        }));
        get().markRead(row.conversation_id);
      }
    }
  },

  _startPolling: () => {
    if (get()._pollInterval) return;
    const id = setInterval(() => {
      get().fetchConversations();
      const openId = get().currentConversationId;
      if (openId) get().fetchMessages(openId);
    }, 3000);
    set({ _pollInterval: id });
  },

  stopRealtime: () => {
    const ch = get()._realtimeChannel;
    if (ch) supabase.removeChannel(ch);
    const pollId = get()._pollInterval;
    if (pollId) clearInterval(pollId);
    set({ _realtimeChannel: null, _pollInterval: null });
  },

  fetchConversations: async () => {
    set({ isLoading: true, error: null });
    try {
      const readMids = await fetchReadStates();
      const currentReadMids = { ...get().readMids, ...readMids };
      const conversations = await fetchConversationsFromDB(currentReadMids);

      set({ conversations, isLoading: false, readMids: currentReadMids });
    } catch (e) {
      set({ error: (e as Error).message, isLoading: false });
    }
  },

  markRead: (conversationId) => {
    const convo = get().conversations.find((c) => c.id === conversationId);
    const lastMid = convo?.lastMid;

    set((s) => ({
      readMids: lastMid ? { ...s.readMids, [conversationId]: lastMid } : s.readMids,
      conversations: s.conversations.map((c) =>
        c.id === conversationId ? { ...c, lastMessageFromClient: false, unreadCount: 0 } : c
      ),
    }));

    if (lastMid) {
      markConversationRead(conversationId, lastMid).catch(console.error);
    }
  },

  // Chat detail
  // olderMessages: ephemeral messages loaded from Graph API (not in DB)
  // dbMessages: messages from Supabase (last 20)
  // currentMessages: [...olderMessages, ...dbMessages] (computed on each update)
  currentMessages: [],
  olderMessages: [] as GraphMessage[],
  currentConversationId: null,
  isLoadingMessages: false,
  isSending: false,
  hasOlderMessages: true,
  isLoadingOlder: false,
  olderCursor: null as string | null,
  messageCache: {},

  fetchMessages: async (conversationId) => {
    // Show cached messages instantly while fetching fresh ones
    const cached = get().messageCache[conversationId];
    if (cached && get().currentConversationId !== conversationId) {
      set({
        currentMessages: cached,
        currentConversationId: conversationId,
        olderMessages: [],
        hasOlderMessages: cached.length >= 20,
      });
    }

    if (!cached) {
      set({ isLoadingMessages: true });
    }

    try {
      const dbMessages = await fetchMessagesFromDB(conversationId);
      if (get().currentConversationId === conversationId || !get().currentConversationId) {
        const older = get().olderMessages;
        // Only set hasOlderMessages to true if DB has 20+ AND we haven't already
        // confirmed there are no older messages via loadOlderMessages
        const currentHasOlder = get().hasOlderMessages;
        set((s) => ({
          currentMessages: [...older, ...dbMessages],
          currentConversationId: conversationId,
          hasOlderMessages: currentHasOlder && dbMessages.length >= 20,
          isLoadingMessages: false,
          messageCache: { ...s.messageCache, [conversationId]: dbMessages },
        }));

        // Update read state if new messages arrived
        if (dbMessages.length > 0) {
          const latestMid = dbMessages[dbMessages.length - 1].id;
          const convo = get().conversations.find((c) => c.id === conversationId);
          if (convo && convo.lastMid !== latestMid) {
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
      set({ isLoadingMessages: false });
      console.error('Failed to fetch messages:', e);
    }
  },

  loadOlderMessages: async (conversationId) => {
    if (get().isLoadingOlder) return;
    set({ isLoadingOlder: true });

    try {
      const { messages: older, nextCursor } = await fetchOlderMessages(conversationId, get().olderCursor);
      if (older.length === 0) {
        set({ hasOlderMessages: false, isLoadingOlder: false, olderCursor: null });
        return;
      }
      // Deduplicate against what we already have
      const knownMids = new Set(get().currentMessages.map(m => m.id));
      const newOlder = older.filter(m => !knownMids.has(m.id));

      if (newOlder.length === 0) {
        set({ hasOlderMessages: false, isLoadingOlder: false, olderCursor: null });
        return;
      }

      // Store in ephemeral olderMessages — these never go to DB
      set((s) => {
        const allOlder = [...newOlder, ...s.olderMessages];
        return {
          olderMessages: allOlder,
          currentMessages: [...allOlder, ...(s.messageCache[conversationId] || [])],
          hasOlderMessages: !!nextCursor,
          isLoadingOlder: false,
          olderCursor: nextCursor,
        };
      });
    } catch {
      set({ isLoadingOlder: false });
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

      // Store in Supabase and update conversation list
      storeOutgoingMessage(result.messageId, conversationId, recipientPsid, platform, text).catch(console.error);

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
      storeOutgoingMessage(result.messageId, conversationId, recipientPsid, platform, undefined, [{ type: 'image', payload: { url: imageUrl } }]).catch(console.error);
      markConversationRead(conversationId, result.messageId).catch(console.error);
    } catch (e) {
      set((s) => ({
        currentMessages: s.currentMessages.filter((m) => m.id !== optimistic.id),
        isSending: false,
      }));
      throw e;
    }
  },

  clearCurrentMessages: () => set({ currentMessages: [], olderMessages: [], currentConversationId: null, hasOlderMessages: true, isLoadingMessages: false, olderCursor: null }),

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
