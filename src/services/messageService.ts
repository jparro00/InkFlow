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

interface GraphMessage {
  id: string;
  created_time: string;
  from: { id: string; name: string };
  to: { data: { id: string; name: string }[] };
  message?: string;
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
}

const profileCache = new Map<string, GraphProfile>();

export async function fetchProfile(psid: string): Promise<GraphProfile> {
  const cached = profileCache.get(psid);
  if (cached) return cached;

  const data = await graphGet(`${psid}?fields=first_name,last_name,name,profile_pic`) as GraphProfile;
  profileCache.set(psid, data);
  return data;
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

    // Fetch conversation detail to get last message
    let lastMessage: string | undefined;
    let lastMessageFromClient = false;
    let lastMessageTime = convo.updated_time;

    try {
      const detail = await graphGet(`${convo.id}?fields=messages,participants,updated_time`) as {
        messages?: { data: GraphMessage[] };
      };
      const msgs = detail.messages?.data;
      if (msgs && msgs.length > 0) {
        const latest = msgs[0];
        lastMessage = latest.message;
        lastMessageTime = latest.created_time;
        lastMessageFromClient = latest.from.id !== PAGE_ID && latest.from.id !== IG_USER_ID;
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
    });
  }

  return results;
}

export async function fetchAllConversations(): Promise<ConversationSummary[]> {
  const [messenger, instagram] = await Promise.all([
    fetchConversationsForId(PAGE_ID, 'messenger').catch(() => []),
    fetchConversationsForId(IG_USER_ID, 'instagram').catch(() => []),
  ]);

  // Merge and sort by most recent
  const all = [...messenger, ...instagram];
  all.sort((a, b) => new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime());
  return all;
}
