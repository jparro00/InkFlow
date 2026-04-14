import { create } from 'zustand';
import { persist } from 'zustand/middleware';
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
  sendMarkSeen,
} from '../services/messageService';
import type { ConversationSummary, GraphMessage } from '../services/messageService';

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

function sortByRecent(convos: ConversationSummary[]): ConversationSummary[] {
  return [...convos].sort((a, b) => new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime());
}

export const useMessageStore = create<MessageStore>()(
  persist(
    (set, get) => ({
      conversations: [],
      isLoading: false,
      error: null,
      readMids: {},
      _realtimeChannel: null,

      startRealtime: async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;

        // Subscribe to Supabase Broadcast (pure pub/sub, no replication slots).
        // The webhook edge function broadcasts after storing each message.
        const channel = supabase
          .channel(`user-${session.user.id}`)
          .on('broadcast', { event: 'new-message' }, async ({ payload }) => {
            const openId = get().currentConversationId;
            // If the message is for the currently-open conversation, update
            // readMids BEFORE fetching conversations so the list shows it as read
            if (openId && payload?.conversation_id === openId && payload?.mid) {
              set((s) => ({
                readMids: { ...s.readMids, [openId]: payload.mid as string },
              }));
              markConversationRead(openId, payload.mid as string).catch(console.error);
            }
            // Refresh conversations list from DB
            await get().fetchConversations();
            // If the affected conversation is currently open, refresh its messages
            // and mark as read (which also sends read receipt + broadcasts to other devices)
            if (openId && payload?.conversation_id === openId) {
              await get().fetchMessages(openId);
              get().markRead(openId);
            }
          })
          .on('broadcast', { event: 'conversation-read' }, ({ payload }) => {
            // Another device marked a conversation as read — update local state
            if (payload?.conversation_id && payload?.last_read_mid) {
              set((s) => ({
                readMids: { ...s.readMids, [payload.conversation_id as string]: payload.last_read_mid as string },
                conversations: s.conversations.map((c) =>
                  c.id === payload.conversation_id
                    ? { ...c, lastMessageFromClient: false, unreadCount: 0 }
                    : c
                ),
              }));
            }
          })
          .on('broadcast', { event: 'profile-updated' }, async () => {
            // Profile changed — refresh conversations to pick up new name/pic
            await get().fetchConversations();
          })
          .subscribe();

        set({ _realtimeChannel: channel });
      },

      stopRealtime: () => {
        const ch = get()._realtimeChannel;
        if (ch) supabase.removeChannel(ch);
        set({ _realtimeChannel: null });
      },

      fetchConversations: async () => {
        set({ isLoading: true, error: null });
        try {
          const readMids = await fetchReadStates();
          // Local readMids take precedence — we may have marked something
          // read locally that hasn't been persisted to DB yet
          const currentReadMids = { ...readMids, ...get().readMids };
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

        // Send read receipt to Meta/simulator
        if (convo) {
          sendMarkSeen(convo.platform, convo.participantPsid).catch(console.error);
        }

        // Broadcast to other devices so they update read state too
        const ch = get()._realtimeChannel;
        if (ch && lastMid) {
          ch.send({
            type: 'broadcast',
            event: 'conversation-read',
            payload: { conversation_id: conversationId, last_read_mid: lastMid },
          });
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

            // Always mark the open conversation as read — this covers both
            // initial open and new messages arriving while it's open
            if (dbMessages.length > 0) {
              const latestMid = dbMessages[dbMessages.length - 1].id;
              set((s) => ({
                readMids: { ...s.readMids, [conversationId]: latestMid },
                conversations: s.conversations.map((c) =>
                  c.id === conversationId ? { ...c, lastMid: latestMid, lastMessageFromClient: false, unreadCount: 0 } : c
                ),
              }));
              markConversationRead(conversationId, latestMid).catch(console.error);
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
          storeOutgoingMessage(result.messageId, conversationId, recipientPsid, platform, text).then(() => {
            const ch = get()._realtimeChannel;
            if (ch) {
              ch.send({ type: 'broadcast', event: 'new-message', payload: { conversation_id: conversationId, mid: result.messageId } });
            }
          }).catch(console.error);

          set((s) => {
            const { [conversationId]: _, ...restDrafts } = s.drafts;
            return {
              readMids: { ...s.readMids, [conversationId]: result.messageId },
              conversations: sortByRecent(s.conversations.map((c) =>
                c.id === conversationId
                  ? { ...c, lastMessage: text, lastMessageTime: new Date().toISOString(), lastMessageFromClient: false, lastMid: result.messageId, unreadCount: 0 }
                  : c
              )),
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
            conversations: sortByRecent(s.conversations.map((c) =>
              c.id === conversationId
                ? { ...c, lastMessage: 'Sent an image', lastMessageTime: new Date().toISOString(), lastMessageFromClient: false, lastMid: result.messageId, unreadCount: 0 }
                : c
            )),
          }));
          storeOutgoingMessage(result.messageId, conversationId, recipientPsid, platform, undefined, [{ type: 'image', payload: { url: imageUrl } }]).then(() => {
            const ch = get()._realtimeChannel;
            if (ch) {
              ch.send({ type: 'broadcast', event: 'new-message', payload: { conversation_id: conversationId, mid: result.messageId } });
            }
          }).catch(console.error);
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
    }),
    {
      name: 'inkbloop-messages',
      // Cache conversations for instant render; strip profilePic (re-fetched
      // from DB) to keep the payload small for mobile localStorage quotas.
      partialize: (state) => ({
        conversations: state.conversations.map(({ profilePic: _, ...c }) => c),
        readMids: state.readMids,
        drafts: state.drafts,
      }),
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          return str ? JSON.parse(str) : null;
        },
        setItem: (name, value) => {
          try {
            localStorage.setItem(name, JSON.stringify(value));
          } catch {
            // Quota exceeded — drop stale cache and retry once
            try {
              localStorage.removeItem(name);
              localStorage.setItem(name, JSON.stringify(value));
            } catch {
              // Still full — app works fine without cache
            }
          }
        },
        removeItem: (name) => localStorage.removeItem(name),
      },
    },
  ),
);

export { isBusinessMessage };
