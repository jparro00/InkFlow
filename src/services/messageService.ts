import { supabase } from '../lib/supabase';

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

export async function fetchProfile(psid: string): Promise<GraphProfile> {
  const cached = profileCache.get(psid);
  if (cached) return cached;

  const data = await graphGet(`${psid}?fields=first_name,last_name,name,profile_pic`) as GraphProfile;
  profileCache.set(psid, data);
  return data;
}

/** Upsert participant profile info into Supabase so Realtime can broadcast changes. */
export async function upsertParticipantProfile(
  psid: string,
  name: string,
  profilePic?: string
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
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
  return res.json();
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
  return res.json();
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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from('conversation_reads').upsert({
    user_id: user.id,
    conversation_id: conversationId,
    last_read_mid: lastMid,
  });
}

export async function fetchReadStates(): Promise<Record<string, string>> {
  const { data: { user } } = await supabase.auth.getUser();
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
export async function fetchConversationsFromDB(): Promise<ConversationSummary[]> {
  const { data: { user } } = await supabase.auth.getUser();
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
    countingDone: boolean; // stop counting after hitting an echo
  }>();

  for (const msg of messages) {
    const existing = convMap.get(msg.conversation_id);
    if (!existing) {
      convMap.set(msg.conversation_id, {
        lastMsg: msg,
        unreadCount: !msg.is_echo ? 1 : 0,
        countingDone: msg.is_echo, // if latest is echo, no unreads
      });
    } else if (!existing.countingDone) {
      // Count consecutive client messages from the end (newest-first)
      if (!msg.is_echo) {
        existing.unreadCount++;
      } else {
        existing.countingDone = true; // hit a business reply, stop counting
      }
    }
  }

  // Build summaries
  const results: ConversationSummary[] = [];
  for (const [convId, { lastMsg, unreadCount }] of convMap) {
    const clientPsid = lastMsg.is_echo ? lastMsg.recipient_id : lastMsg.sender_id;
    const lastMessageFromClient = !lastMsg.is_echo;

    // Fetch profile for name and pic
    let participantName = lastMsg.sender_name || clientPsid;
    let profilePic: string | undefined;
    try {
      const profile = await fetchProfile(clientPsid);
      participantName = profile.name;
      profilePic = profile.profile_pic;
      // Persist in Supabase so Realtime can broadcast future profile changes
      upsertParticipantProfile(clientPsid, profile.name, profile.profile_pic).catch(() => {});
    } catch {
      // Use sender_name or PSID as fallback
    }

    const lastMessage = lastMsg.text || (lastMsg.attachments ? 'Sent an image' : undefined);

    results.push({
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
    });
  }

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
  attachments?: unknown
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
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
  const { data: { user } } = await supabase.auth.getUser();
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
