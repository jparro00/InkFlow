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
  fetchSingleMessage,
  fetchParticipantProfile,
} from '../services/messageService';
import type { ConversationSummary, GraphMessage } from '../services/messageService';

interface MessageStore {
  conversations: ConversationSummary[];
  isLoading: boolean;
  error: string | null;
  readMids: Record<string, string>;
  fetchConversations: (force?: boolean) => Promise<void>;
  markRead: (conversationId: string) => void;
  startRealtime: () => Promise<void>;
  stopRealtime: () => void;
  _realtimeChannel: ReturnType<typeof supabase.channel> | null;
  _conversationsFetchedAt: number | null;

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
      _conversationsFetchedAt: null,

      startRealtime: async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;

        // Subscribe to Supabase Broadcast (pure pub/sub, no replication slots).
        // The webhook edge function broadcasts after storing each message.
        const channel = supabase
          .channel(`user-${session.user.id}`)
          .on('broadcast', { event: 'new-message' }, async ({ payload }) => {
            const conversationId = payload?.conversation_id as string | undefined;
            const mid = payload?.mid as string | undefined;
            if (!conversationId || !mid) return;

            const openId = get().currentConversationId;

            // If the message is for the currently-open conversation, update
            // readMids BEFORE updating so the list shows it as read
            if (openId && conversationId === openId) {
              set((s) => ({
                readMids: { ...s.readMids, [openId]: mid },
              }));
              markConversationRead(openId, mid).catch(console.error);
            }

            // Fetch ONLY the single new message (not the entire messages table)
            const msg = await fetchSingleMessage(mid);

            if (!msg) {
              // Message not found (race condition / replication delay) — fall back
              await get().fetchConversations(true);
            } else {
              const existingConvo = get().conversations.find(c => c.id === conversationId);

              if (existingConvo) {
                // Existing conversation — update inline (1 row instead of full table)
                const isOpenAndRead = openId === conversationId;
                const lastMessage = msg.text || (msg.has_attachments ? 'Sent an image' : undefined);

                set((s) => ({
                  conversations: sortByRecent(s.conversations.map(c =>
                    c.id === conversationId
                      ? {
                          ...c,
                          lastMessage,
                          lastMessageTime: msg.created_at,
                          lastMessageFromClient: !msg.is_echo && !isOpenAndRead,
                          lastMid: msg.mid,
                          unreadCount: isOpenAndRead ? 0 : (msg.is_echo ? 0 : c.unreadCount + 1),
                        }
                      : c
                  )),
                }));
              } else {
                // New conversation — fetch participant profile to build entry
                const clientPsid = msg.is_echo ? msg.recipient_id : msg.sender_id;
                const profile = await fetchParticipantProfile(clientPsid);
                const lastMessage = msg.text || (msg.has_attachments ? 'Sent an image' : undefined);
                const isOpenAndRead = openId === conversationId;

                const newConvo: ConversationSummary = {
                  id: conversationId,
                  platform: msg.platform as 'instagram' | 'messenger',
                  participantName: profile?.name || msg.sender_name || clientPsid,
                  participantPsid: clientPsid,
                  profilePic: profile?.profilePic || undefined,
                  lastMessage,
                  lastMessageTime: msg.created_at,
                  lastMessageFromClient: !msg.is_echo && !isOpenAndRead,
                  lastMid: msg.mid,
                  unreadCount: isOpenAndRead ? 0 : (msg.is_echo ? 0 : 1),
                };

                set((s) => ({
                  conversations: sortByRecent([...s.conversations, newConvo]),
                }));
              }
            }

            // If the affected conversation is currently open, refresh its messages
            // and mark as read (which also sends read receipt + broadcasts to other devices)
            if (openId && conversationId === openId) {
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
          .on('broadcast', { event: 'profile-updated' }, async ({ payload }) => {
            // Webhook broadcasts { psid } for the specific profile that changed,
            // so fetch just that one row instead of every participant profile.
            const psid = payload?.psid as string | undefined;
            if (!psid) return;

            const profile = await fetchParticipantProfile(psid);
            if (!profile) return;

            set((s) => ({
              conversations: s.conversations.map(c =>
                c.participantPsid === psid
                  ? {
                      ...c,
                      participantName: profile.name || c.participantName,
                      profilePic: profile.profilePic || undefined,
                    }
                  : c
              ),
            }));
          })
          .subscribe();

        set({ _realtimeChannel: channel });
      },

      stopRealtime: () => {
        const ch = get()._realtimeChannel;
        if (ch) supabase.removeChannel(ch);
        set({ _realtimeChannel: null });
      },

      fetchConversations: async (force = false) => {
        // Skip re-fetch if data is fresh (< 30s old) and we already have
        // conversations — the realtime subscription keeps data current.
        // Callers that need guaranteed-fresh data (e.g. realtime handlers)
        // can pass force=true.
        const now = Date.now();
        const fetchedAt = get()._conversationsFetchedAt;
        if (!force && fetchedAt && now - fetchedAt < 30_000 && get().conversations.length > 0) {
          return;
        }

        if (get().conversations.length === 0) set({ isLoading: true });
        set({ error: null });
        try {
          const readMids = await fetchReadStates();
          // Local readMids take precedence — we may have marked something
          // read locally that hasn't been persisted to DB yet
          const currentReadMids = { ...readMids, ...get().readMids };
          const conversations = await fetchConversationsFromDB(currentReadMids);

          set({ conversations, isLoading: false, readMids: currentReadMids, _conversationsFetchedAt: Date.now() });
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
      // Bump on any change to the persisted shape — most importantly, the
      // profilePic semantics. Before v1, profilePic was sometimes persisted
      // as a raw Storage path (not a signed URL), which caused <img> tags
      // to resolve relative to the Vercel origin on hydration and 404 via
      // the service worker's static-asset fallback. From v1 forward,
      // profilePic is never persisted — it's always re-fetched (through
      // resolveAvatarUrls) by the first fetchConversations call after
      // hydration.
      version: 1,
      migrate: (persistedState) => {
        // Clear any profilePic left over from the pre-v1 shape. Cheap no-op
        // if the field is already absent.
        const state = persistedState as { conversations?: Array<{ profilePic?: unknown }> } | null | undefined;
        if (state?.conversations) {
          state.conversations = state.conversations.map((c) => ({ ...c, profilePic: undefined }));
        }
        return state;
      },
      // Cache conversations for instant render; strip profilePic (re-fetched
      // from DB) to keep the payload small for mobile localStorage quotas
      // and to avoid stale-URL renders on hydration (see version bump above).
      partialize: (state) => ({
        conversations: state.conversations.map((c) => ({ ...c, profilePic: undefined })),
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
