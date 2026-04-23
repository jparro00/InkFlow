import { supabase } from '../lib/supabase';
import { fetchR2Blob, isR2Enabled } from '../lib/r2';
import type { StorageBackend } from '../types';
import type { Json } from '../types/database';

const API_URL = import.meta.env.VITE_META_API_URL || 'http://localhost:3001';
const PAGE_ID = import.meta.env.VITE_META_PAGE_ID || '111222333444555';
const IG_USER_ID = import.meta.env.VITE_META_IG_USER_ID || '999888777666555';
const ACCESS_TOKEN = import.meta.env.VITE_META_ACCESS_TOKEN || 'SIM_ACCESS_TOKEN_DEV';

async function graphGet(path: string): Promise<unknown> {
  const sep = path.includes('?') ? '&' : '?';
  const url = `${API_URL}/v25.0/${path}${sep}access_token=${ACCESS_TOKEN}&_t=${Date.now()}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Graph API error: ${res.status}`);
  return res.json();
}

interface GraphConversation {
  id: string;
  updated_time: string;
  participants: { data: { id: string; name: string }[] };
}

export interface GraphMessage {
  id: string;
  created_time: string;
  from: { id: string; name: string };
  to: { data: { id: string; name: string }[] };
  message?: string;
  attachments?: { data: { type: string; payload?: { url?: string } }[] };
}

interface GraphProfile {
  id: string;
  first_name?: string;
  last_name?: string;
  name: string;
  profile_pic?: string;
}

export interface ConversationSummary {
  id: string;
  platform: 'instagram' | 'messenger';
  participantName: string;
  participantPsid: string;
  profilePic?: string;
  lastMessage?: string;
  lastMessageTime: string;
  lastMessageFromClient: boolean;
  lastMid?: string;
  unreadCount: number;
}

const profileCache = new Map<string, GraphProfile>();

/**
 * Fetch a profile from the Meta Graph API.
 *
 * RESERVED FOR FUTURE REAL-META PRODUCTION USE. Currently DORMANT.
 *
 * In the simulator flow (dev and today's prod), profile data flows
 * through sim_profiles → webhook → participant_profiles → `fetchAllParticipantProfiles`.
 * Nothing in the active code path calls this function.
 *
 * When the app is wired to real Meta webhooks, there will be no
 * sim_profiles to read from. The intended future flow is:
 *   1. Webhook arrives with an unknown PSID → participant_profiles row
 *      is created with null name / profile_pic.
 *   2. First time the UI renders that PSID, it detects missing data and
 *      calls this function exactly ONCE.
 *   3. The result is written into participant_profiles (via
 *      upsertParticipantProfile) and the avatar bytes copied into our
 *      own `avatars` Storage bucket (so we don't depend on Meta's CDN
 *      per render and don't count toward the 200/hr rate limit).
 *   4. Subsequent renders read from participant_profiles — no Graph
 *      API calls.
 *
 * Leaving this function (and invalidateProfileCache / fetchConversationsForId
 * below) in place so that future integration doesn't require re-implementing
 * the Graph-side profile fetch from scratch.
 */
export async function fetchProfile(psid: string): Promise<GraphProfile> {
  const cached = profileCache.get(psid);
  if (cached) return cached;

  const data = await graphGet(`${psid}?fields=first_name,last_name,name,profile_pic`) as GraphProfile;
  profileCache.set(psid, data);
  return data;
}

/** Invalidate a cached profile so the next fetchProfile call goes to the API. */
export function invalidateProfileCache(psid: string): void {
  profileCache.delete(psid);
}

/** Upsert participant profile info into Supabase so Realtime can broadcast changes. */
export async function upsertParticipantProfile(
  psid: string,
  name: string,
  profilePic?: string
): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return;
  await supabase.from('participant_profiles').upsert({
    psid,
    user_id: user.id,
    name,
    profile_pic: profilePic ?? null,
    updated_at: new Date().toISOString(),
  });
}

async function fetchConversationsForId(
  id: string,
  platform: 'instagram' | 'messenger'
): Promise<ConversationSummary[]> {
  const data = await graphGet(`${id}/conversations`) as { data: GraphConversation[] };
  const convos = data.data ?? [];

  const results: ConversationSummary[] = [];

  for (const convo of convos) {
    // Find the client participant (not the business)
    const client = convo.participants.data.find((p) => p.id !== PAGE_ID && p.id !== IG_USER_ID);
    if (!client) continue;

    // Fetch conversation detail to get last message + unread count
    let lastMessage: string | undefined;
    let lastMessageFromClient = false;
    let lastMessageTime = convo.updated_time;
    let lastMid: string | undefined;
    let unreadCount = 0;

    try {
      const detail = await graphGet(`${convo.id}?fields=messages,participants,updated_time`) as {
        messages?: { data: GraphMessage[] };
      };
      const msgs = detail.messages?.data;
      if (msgs && msgs.length > 0) {
        const latest = msgs[msgs.length - 1]; // API returns oldest-first
        lastMid = latest.id;
        lastMessage = latest.message || (latest.attachments?.data?.length ? 'Sent an image' : undefined);
        lastMessageTime = latest.created_time;
        lastMessageFromClient = latest.from.id !== PAGE_ID && latest.from.id !== IG_USER_ID;

        // Count consecutive client messages from the end (unread)
        if (lastMessageFromClient) {
          for (let i = msgs.length - 1; i >= 0; i--) {
            const isFromClient = msgs[i].from.id !== PAGE_ID && msgs[i].from.id !== IG_USER_ID;
            if (!isFromClient) break;
            unreadCount++;
          }
        }
      }
    } catch {
      // Fall back to no snippet
    }

    // Fetch profile pic
    let profilePic: string | undefined;
    try {
      const profile = await fetchProfile(client.id);
      profilePic = profile.profile_pic;
    } catch {
      // Fall back to no pic
    }

    results.push({
      id: convo.id,
      platform,
      participantName: client.name,
      participantPsid: client.id,
      profilePic,
      lastMessage,
      lastMessageTime,
      lastMessageFromClient,
      lastMid,
      unreadCount,
    });
  }

  return results;
}

export function isBusinessMessage(msg: GraphMessage): boolean {
  return msg.from.id === PAGE_ID || msg.from.id === IG_USER_ID;
}

export async function fetchConversationMessages(conversationId: string): Promise<GraphMessage[]> {
  const data = await graphGet(`${conversationId}?fields=messages,participants,updated_time`) as {
    messages?: { data: GraphMessage[] };
  };
  return data.messages?.data ?? [];
}

export async function sendMessage(
  platform: 'instagram' | 'messenger',
  recipientPsid: string,
  text: string
): Promise<{ recipientId: string; messageId: string }> {
  const id = platform === 'instagram' ? IG_USER_ID : PAGE_ID;
  const res = await fetch(`${API_URL}/v25.0/${id}/messages?access_token=${ACCESS_TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: recipientPsid },
      messaging_type: 'RESPONSE',
      message: { text },
    }),
  });
  if (!res.ok) throw new Error(`Send API error: ${res.status}`);
  const data = await res.json();
  return { recipientId: data.recipient_id, messageId: data.message_id };
}

export async function sendImageMessage(
  platform: 'instagram' | 'messenger',
  recipientPsid: string,
  imageUrl: string
): Promise<{ recipientId: string; messageId: string }> {
  const id = platform === 'instagram' ? IG_USER_ID : PAGE_ID;
  const res = await fetch(`${API_URL}/v25.0/${id}/messages?access_token=${ACCESS_TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: recipientPsid },
      messaging_type: 'RESPONSE',
      message: {
        attachment: { type: 'image', payload: { url: imageUrl } },
      },
    }),
  });
  if (!res.ok) throw new Error(`Send API error: ${res.status}`);
  const data = await res.json();
  return { recipientId: data.recipient_id, messageId: data.message_id };
}

export async function sendMarkSeen(
  platform: 'instagram' | 'messenger',
  recipientPsid: string
): Promise<void> {
  const id = platform === 'instagram' ? IG_USER_ID : PAGE_ID;
  await fetch(`${API_URL}/v25.0/${id}/messages?access_token=${ACCESS_TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: recipientPsid },
      sender_action: 'mark_seen',
    }),
  });
}

// ── Read State (Supabase) ────────────────────────────────────────────────────

export async function markConversationRead(conversationId: string, lastMid: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return;

  await supabase.from('conversation_reads').upsert({
    user_id: user.id,
    conversation_id: conversationId,
    last_read_mid: lastMid,
  });
}

export async function fetchReadStates(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return {};

  const { data } = await supabase
    .from('conversation_reads')
    .select('conversation_id, last_read_mid')
    .eq('user_id', user.id);

  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    map[row.conversation_id] = row.last_read_mid;
  }
  return map;
}

// ── Incremental Broadcast Updates ──────────────────────────────────────────

/** Data returned by fetchSingleMessage for incremental conversation updates. */
export interface BroadcastMessageData {
  mid: string;
  conversation_id: string;
  sender_id: string;
  sender_name: string | null;
  recipient_id: string;
  platform: string;
  text: string | null;
  has_attachments: boolean;
  is_echo: boolean;
  created_at: string;
}

/** Fetch a single message by mid (for incremental broadcast updates).
 *  Returns a minimal object — attachments are reduced to a boolean flag
 *  since callers only need to know if an attachment exists. */
export async function fetchSingleMessage(mid: string): Promise<BroadcastMessageData | null> {
  const { data } = await supabase
    .from('messages')
    .select('mid, conversation_id, sender_id, sender_name, recipient_id, platform, text, attachments, is_echo, created_at')
    .eq('mid', mid)
    .maybeSingle();

  if (!data) return null;

  return {
    mid: data.mid,
    conversation_id: data.conversation_id,
    sender_id: data.sender_id,
    sender_name: data.sender_name,
    recipient_id: data.recipient_id,
    platform: data.platform,
    text: data.text,
    has_attachments: !!data.attachments,
    is_echo: data.is_echo,
    created_at: data.created_at,
  };
}

// ── Avatar URL resolution ───────────────────────────────────────────────────
// participant_profiles.profile_pic holds one of three kinds of value:
//   (a) null — no avatar
//   (b) a legacy base64 data URL (`data:image/...`) — pre-refactor rows we
//       haven't cleaned up yet; these render directly in <img src>
//   (c) a short Storage path (e.g. `igsid-abc12345-1713369600000.jpg`) —
//       the current format; needs a signed URL to render
//
// This module-level cache avoids re-signing paths on every fetch. Signed
// URLs are granted for 24 h but we refresh at 20 h to give a margin of
// safety for long-lived sessions. The cache key is the PATH (not the
// PSID) — if the path changes, the new path is signed fresh and the old
// entry is left to be overwritten on next hit for that path (which will
// not happen since we never reuse paths).
//
// SECURITY NOTE: signed URLs are effectively bearer tokens for the
// underlying Storage object. Do not log them, do not send them to
// analytics, do not embed them in URLs. Treat as credential material.

const SIGNED_URL_TTL_SECONDS = 86400; // 24 h
const SIGNED_URL_REFRESH_MS = 20 * 60 * 60 * 1000; // 20 h
const signedUrlCache = new Map<string, { url: string; generatedAt: number }>();
// Per-page-load blob URL cache for R2-backed avatars. Object URLs are tied to
// the document, so we don't try to persist across reloads — just avoid
// re-fetching the same avatar repeatedly within a session.
const r2BlobUrlCache = new Map<string, string>();

/**
 * Resolve a list of {id, pic, backend?} entries into an id → renderable URL map.
 *
 * The `id` is any string — PSID, client UUID, whatever — the caller uses
 * it only to look up the resolved URL in the returned map. `pic` is the
 * raw value stored in a profile_pic column.
 *
 * - Null/empty pic → null (no avatar)
 * - `data:` prefix → passes through (legacy base64 rows)
 * - `backend === 'r2'` → fetched via the Worker (bearer auth) and returned
 *   as an Object URL. Falls back to the Supabase signed-URL path if the
 *   Worker read fails (shadow-write era safety net).
 * - Otherwise → treated as a Storage path, batch-signed via the `avatars`
 *   bucket with a 24 h TTL, and cached.
 *
 * All Supabase-backed paths are collected into ONE createSignedUrls call so
 * we don't round-trip per avatar.
 */
export async function resolveAvatarUrls(
  entries: { id: string; pic: string | null | undefined; backend?: StorageBackend }[]
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  const toSign: { id: string; path: string }[] = [];
  const toFetchR2: { id: string; path: string }[] = [];
  const now = Date.now();

  for (const e of entries) {
    const pic = e.pic;
    if (!pic) {
      result.set(e.id, null);
      continue;
    }
    if (pic.startsWith('data:')) {
      result.set(e.id, pic);
      continue;
    }
    if (e.backend === 'r2' && isR2Enabled()) {
      const cached = r2BlobUrlCache.get(pic);
      if (cached) {
        result.set(e.id, cached);
        continue;
      }
      toFetchR2.push({ id: e.id, path: pic });
      continue;
    }
    const cached = signedUrlCache.get(pic);
    if (cached && now - cached.generatedAt < SIGNED_URL_REFRESH_MS) {
      result.set(e.id, cached.url);
      continue;
    }
    toSign.push({ id: e.id, path: pic });
  }

  // Fetch R2-backed avatars in parallel. Per-avatar fetch, but small blobs
  // (~1 MB cap) and edge-cached after the first origin hit. Failures fall
  // through to Supabase as a safety net.
  if (toFetchR2.length > 0) {
    await Promise.all(
      toFetchR2.map(async ({ id, path }) => {
        try {
          const blob = await fetchR2Blob(`avatars/${path}`);
          if (blob) {
            const objectUrl = URL.createObjectURL(blob);
            r2BlobUrlCache.set(path, objectUrl);
            result.set(id, objectUrl);
            return;
          }
        } catch (e) {
          console.error(`[resolveAvatarUrls] R2 fetch failed for ${path}:`, e);
        }
        // R2 miss or error — fall back to Supabase signed URL.
        toSign.push({ id, path });
      }),
    );
  }

  if (toSign.length > 0) {
    const { data, error } = await supabase.storage
      .from('avatars')
      .createSignedUrls(
        toSign.map((x) => x.path),
        SIGNED_URL_TTL_SECONDS
      );
    if (error || !data) {
      // Signing failed for the whole batch — surface null and let the
      // UI render a placeholder avatar. Don't throw: a missing avatar
      // should never take down the conversation list.
      for (const { id } of toSign) result.set(id, null);
    } else {
      for (let i = 0; i < toSign.length; i++) {
        const { id, path } = toSign[i];
        const row = data[i];
        if (row?.signedUrl) {
          signedUrlCache.set(path, { url: row.signedUrl, generatedAt: now });
          result.set(id, row.signedUrl);
        } else {
          result.set(id, null);
        }
      }
    }
  }

  return result;
}

/** Invalidate the signed-URL cache for a specific path. Call after an avatar
 *  update so the next render re-signs (or re-fetches) with the fresh URL. */
export function invalidateAvatarUrlCache(path: string | null | undefined): void {
  if (!path) return;
  signedUrlCache.delete(path);
  const cachedBlobUrl = r2BlobUrlCache.get(path);
  if (cachedBlobUrl) {
    URL.revokeObjectURL(cachedBlobUrl);
    r2BlobUrlCache.delete(path);
  }
}

/** Fetch all participant profiles for the current user (for profile-updated broadcasts).
 *  The returned `profilePic` is always renderable: either null, a legacy data URL,
 *  or a fresh (or cached) signed URL for the Storage-backed avatar. */
export async function fetchAllParticipantProfiles(): Promise<Map<string, { name: string | null; profilePic: string | null }>> {
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return new Map();

  const { data } = await supabase
    .from('participant_profiles')
    .select('psid, name, profile_pic, profile_pic_backend')
    .eq('user_id', user.id);

  const rows = data ?? [];
  // Batch-resolve all avatar paths → signed URLs in one round trip.
  const urlMap = await resolveAvatarUrls(
    rows.map((p) => ({
      id: p.psid,
      pic: p.profile_pic,
      backend: p.profile_pic_backend,
    }))
  );

  const map = new Map<string, { name: string | null; profilePic: string | null }>();
  for (const p of rows) {
    map.set(p.psid, { name: p.name, profilePic: urlMap.get(p.psid) ?? null });
  }
  return map;
}

/** Fetch a single participant profile by psid (for new conversations via broadcast).
 *  `profilePic` is resolved (signed URL or legacy data URL) so it's render-ready. */
export async function fetchParticipantProfile(psid: string): Promise<{ name: string | null; profilePic: string | null } | null> {
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return null;

  const { data } = await supabase
    .from('participant_profiles')
    .select('name, profile_pic, profile_pic_backend')
    .eq('psid', psid)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!data) return null;
  const urlMap = await resolveAvatarUrls([
    { id: psid, pic: data.profile_pic, backend: data.profile_pic_backend },
  ]);
  return { name: data.name, profilePic: urlMap.get(psid) ?? null };
}

// ── Graph API (legacy, used for send + load older) ──────────────────────────

export async function fetchAllConversations(): Promise<ConversationSummary[]> {
  const [messenger, instagram] = await Promise.all([
    fetchConversationsForId(PAGE_ID, 'messenger').catch(() => []),
    fetchConversationsForId(IG_USER_ID, 'instagram').catch(() => []),
  ]);

  const all = [...messenger, ...instagram];
  all.sort((a, b) => new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime());
  return all;
}

// ── Supabase DB (primary source for messages) ───────────────────────────────

interface DBMessage {
  mid: string;
  conversation_id: string;
  sender_id: string;
  sender_name: string | null;
  recipient_id: string;
  platform: string;
  text: string | null;
  attachments: unknown;
  created_at: string;
  is_echo: boolean;
}

/** Convert a DB row to the GraphMessage shape used by the UI. */
function dbToGraphMessage(row: DBMessage): GraphMessage {
  return {
    id: row.mid,
    created_time: row.created_at,
    from: { id: row.sender_id, name: row.sender_name || '' },
    to: { data: [{ id: row.recipient_id, name: '' }] },
    message: row.text || undefined,
    attachments: row.attachments
      ? { data: row.attachments as { type: string; payload?: { url?: string } }[] }
      : undefined,
  };
}

/** Fetch messages for a conversation from Supabase (last 20). */
export async function fetchMessagesFromDB(conversationId: string): Promise<GraphMessage[]> {
  const { data } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  return (data ?? []).map(dbToGraphMessage);
}

/** Fetch conversation list from Supabase messages table. */
export async function fetchConversationsFromDB(readMids?: Record<string, string>): Promise<ConversationSummary[]> {
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return [];

  // Get all messages grouped by conversation (Supabase doesn't support GROUP BY,
  // so we fetch recent messages and aggregate client-side)
  const { data: messages } = await supabase
    .from('messages')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (!messages?.length) return [];

  // Group by conversation_id, take the latest message per conversation
  const convMap = new Map<string, {
    lastMsg: DBMessage;
    unreadCount: number;
    countingDone: boolean;
  }>();

  for (const msg of messages) {
    const existing = convMap.get(msg.conversation_id);
    const readMid = readMids?.[msg.conversation_id];
    if (!existing) {
      // If this latest message is the read watermark, nothing is unread
      const alreadyRead = msg.mid === readMid;
      convMap.set(msg.conversation_id, {
        lastMsg: msg,
        unreadCount: !msg.is_echo && !alreadyRead ? 1 : 0,
        countingDone: msg.is_echo || alreadyRead,
      });
    } else if (!existing.countingDone) {
      // Stop counting at read watermark or at a business reply
      if (msg.mid === readMid || msg.is_echo) {
        existing.countingDone = true;
      } else {
        existing.unreadCount++;
      }
    }
  }

  // Load all participant profiles from DB in one query (no API calls)
  const entries = Array.from(convMap.entries());
  const psids = entries.map(([, { lastMsg }]) =>
    lastMsg.is_echo ? lastMsg.recipient_id : lastMsg.sender_id
  );
  const { data: dbProfiles } = await supabase
    .from('participant_profiles')
    .select('psid, name, profile_pic, profile_pic_backend')
    .eq('user_id', user.id)
    .in('psid', psids);

  const profileMap = new Map(
    (dbProfiles ?? []).map(p => [p.psid, p])
  );

  // Resolve all avatar paths → signed URLs in a single batched call
  // before building the conversation summaries. Avoids per-conversation
  // round-trips to Storage and shares the cache across fetches.
  const urlMap = await resolveAvatarUrls(
    (dbProfiles ?? []).map((p) => ({
      id: p.psid,
      pic: p.profile_pic,
      backend: p.profile_pic_backend,
    }))
  );

  const results: ConversationSummary[] = entries.map(([convId, { lastMsg, unreadCount }], i) => {
    const clientPsid = psids[i];
    // Only flag as "from client" (= unread) if there are actually unread messages.
    // Without this check, every fetchConversations() call reverts read conversations
    // back to "unread" just because the latest message happens to be from the client.
    const lastMessageFromClient = !lastMsg.is_echo && unreadCount > 0;
    const profile = profileMap.get(clientPsid);
    const participantName = profile?.name || lastMsg.sender_name || clientPsid;
    const profilePic = urlMap.get(clientPsid) ?? undefined;
    const lastMessage = lastMsg.text || (lastMsg.attachments ? 'Sent an image' : undefined);

    return {
      id: convId,
      platform: lastMsg.platform as 'instagram' | 'messenger',
      participantName,
      participantPsid: clientPsid,
      profilePic,
      lastMessage,
      lastMessageTime: lastMsg.created_at,
      lastMessageFromClient,
      lastMid: lastMsg.mid,
      unreadCount: lastMessageFromClient ? unreadCount : 0,
    };
  });

  results.sort((a, b) => new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime());
  return results;
}

/** Store a sent message in Supabase (when we send via Graph API). */
export async function storeOutgoingMessage(
  mid: string,
  conversationId: string,
  recipientPsid: string,
  platform: 'instagram' | 'messenger',
  text?: string,
  attachments?: Json | null
): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return;

  const businessId = platform === 'instagram' ? IG_USER_ID : PAGE_ID;

  await supabase.from('messages').upsert({
    mid,
    conversation_id: conversationId,
    sender_id: businessId,
    sender_name: 'Ink Bloop',
    recipient_id: recipientPsid,
    platform,
    text: text || null,
    attachments: attachments || null,
    created_at: new Date().toISOString(),
    is_echo: true,
    user_id: user.id,
  });

  // Prune old messages
  const { data: toDelete } = await supabase
    .from('messages')
    .select('mid')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .range(20, 999);

  if (toDelete?.length) {
    await supabase.from('messages').delete().in('mid', toDelete.map(m => m.mid));
  }
}

/** Resolve the real Graph API conversation ID for a given internal conversationId.
 *  Checks the conversation_map cache first; falls back to a full conversation-list
 *  scan and writes the result to the cache so future calls are instant. */
async function resolveGraphConvId(conversationId: string, platform: string): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return null;

  // Check cache
  const { data: cached } = await supabase
    .from('conversation_map')
    .select('graph_conversation_id')
    .eq('conversation_id', conversationId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (cached?.graph_conversation_id) return cached.graph_conversation_id;

  // Cache miss — scan the conversations list from Graph API
  const ownerId = platform === 'instagram' ? IG_USER_ID : PAGE_ID;
  const clientPsid = conversationId.startsWith('t_') ? conversationId.slice(2) : conversationId;

  const convList = await graphGet(`${ownerId}/conversations`) as { data: GraphConversation[] };
  const match = (convList.data ?? []).find(c =>
    c.participants.data.some(p => p.id === clientPsid)
  );
  if (!match) return null;

  // Write to cache
  await supabase.from('conversation_map').upsert({
    conversation_id: conversationId,
    graph_conversation_id: match.id,
    user_id: user.id,
  });

  return match.id;
}

/** Fetch older messages from Graph API using cursor pagination. */
export async function fetchOlderMessages(conversationId: string, beforeCursor: string | null): Promise<{ messages: GraphMessage[]; nextCursor: string | null }> {
  // Get platform from DB
  const { data: dbRows } = await supabase
    .from('messages')
    .select('platform')
    .eq('conversation_id', conversationId)
    .limit(1);

  if (!dbRows?.length) return { messages: [], nextCursor: null };

  const platform = dbRows[0].platform;

  try {
    const graphConvId = await resolveGraphConvId(conversationId, platform);
    if (!graphConvId) return { messages: [], nextCursor: null };

    // On first call (no cursor), bootstrap by fetching the most-recent page to
    // get the cursor pointing just before the DB window, then fetch that older page.
    let cursor = beforeCursor;
    if (!cursor) {
      const bootstrap = await graphGet(`${graphConvId}?fields=messages&limit=20`) as {
        messages?: { paging?: { cursors?: { before?: string | null } } };
      };
      cursor = bootstrap.messages?.paging?.cursors?.before ?? null;
      if (!cursor) return { messages: [], nextCursor: null }; // ≤20 messages total
    }

    // Fetch the page of older messages
    const detail = await graphGet(`${graphConvId}?fields=messages&limit=20&before=${cursor}`) as {
      messages?: {
        data: GraphMessage[];
        paging?: { cursors?: { before?: string | null } };
      };
    };

    const msgs = detail.messages?.data ?? [];
    const nextCursor = detail.messages?.paging?.cursors?.before ?? null;

    return { messages: msgs, nextCursor };
  } catch {
    return { messages: [], nextCursor: null };
  }
}
