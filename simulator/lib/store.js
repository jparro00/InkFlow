import { messageId, conversationId } from './ids.js';
import { seedClients, seedConversations } from '../seed.js';

/**
 * In-memory store for conversations and messages.
 * Mirrors Meta's data model:
 *   - Conversations have an ID, participants, and a list of messages
 *   - Messages have a mid, sender, recipient, text, attachments, timestamp
 *   - The Conversations API only returns the 20 most recent messages
 */

// ── Client profiles (keyed by PSID) ─────────────────────────────────────────

/** @type {Map<string, {psid: string, firstName: string, lastName: string, name: string, platform: 'instagram' | 'messenger', profilePic: string | null, instagram?: string}>} */
const profiles = new Map();

// ── Conversations (keyed by conversation ID) ─────────────────────────────────

/**
 * @typedef {{
 *   mid: string,
 *   senderId: string,
 *   recipientId: string,
 *   text?: string,
 *   attachments?: Array<{type: string, payload: {url: string}}>,
 *   timestamp: number,
 *   isEcho: boolean
 * }} Message
 *
 * @typedef {{
 *   id: string,
 *   platform: 'instagram' | 'messenger',
 *   participantPsid: string,
 *   updatedTime: number,
 *   messages: Message[]
 * }} Conversation
 */

/** @type {Map<string, Conversation>} */
const conversations = new Map();

/** PSID → conversation ID lookup */
/** @type {Map<string, string>} */
const psidToConversation = new Map();

// ── Config ───────────────────────────────────────────────────────────────────

let config = {
  pageId: process.env.PAGE_ID || '111222333444555',
  igUserId: process.env.IG_USER_ID || '999888777666555',
};

export function getConfig() { return config; }
export function setConfig(c) { Object.assign(config, c); }

// ── Seed ─────────────────────────────────────────────────────────────────────

function seed() {
  // Register all client profiles
  for (const client of seedClients) {
    profiles.set(client.psid, {
      psid: client.psid,
      firstName: client.firstName,
      lastName: client.lastName,
      name: client.name,
      platform: client.platform,
      profilePic: client.profilePic,
      instagram: client.instagram,
    });
  }

  // Create conversations from seed data
  for (const conv of seedConversations) {
    const client = seedClients.find(c => c.psid === conv.psid);
    if (!client) continue;

    const convId = conversationId();
    const businessId = client.platform === 'instagram' ? config.igUserId : config.pageId;
    const messages = conv.messages.map(m => ({
      mid: messageId(),
      senderId: m.from === 'client' ? client.psid : businessId,
      recipientId: m.from === 'client' ? businessId : client.psid,
      text: m.text,
      timestamp: new Date(m.timestamp).getTime(),
      isEcho: m.from === 'business',
    }));

    const lastMsg = messages[messages.length - 1];
    conversations.set(convId, {
      id: convId,
      platform: client.platform,
      participantPsid: client.psid,
      updatedTime: lastMsg.timestamp,
      messages,
    });
    psidToConversation.set(client.psid, convId);
  }

  // Create empty conversations for clients with no seed messages
  for (const client of seedClients) {
    if (!psidToConversation.has(client.psid)) {
      const convId = conversationId();
      conversations.set(convId, {
        id: convId,
        platform: client.platform,
        participantPsid: client.psid,
        updatedTime: Date.now(),
        messages: [],
      });
      psidToConversation.set(client.psid, convId);
    }
  }
}

seed();

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Get a client profile by PSID.
 * Meta's format: { first_name, last_name, profile_pic, id }
 */
export function getProfile(psid) {
  return profiles.get(psid) || null;
}

/** Get all client profiles (for the simulator UI — not a real Meta endpoint). */
export function getAllProfiles() {
  return Array.from(profiles.values());
}

/**
 * List conversations for a page/IG account.
 * Meta's Conversations API returns: { data: [...], paging: { cursors, next } }
 */
export function listConversations(ownerId) {
  const results = [];
  for (const conv of conversations.values()) {
    const expectedOwner = conv.platform === 'instagram' ? config.igUserId : config.pageId;
    if (expectedOwner !== ownerId) continue;

    const participant = profiles.get(conv.participantPsid);
    results.push({
      id: conv.id,
      updated_time: new Date(conv.updatedTime).toISOString(),
      link: `/t/${conv.id}`,
      participants: {
        data: [
          { id: conv.participantPsid, name: participant?.name || 'Unknown' },
          { id: ownerId, name: 'Ink Bloop' },
        ],
      },
    });
  }

  // Sort by updated_time descending
  results.sort((a, b) => new Date(b.updated_time).getTime() - new Date(a.updated_time).getTime());

  return {
    data: results,
    paging: {
      cursors: { before: 'cursor_start', after: 'cursor_end' },
    },
  };
}

/**
 * Get a single conversation with its messages.
 * Meta returns last 25 by default; we cap at 20 to match their documented limit.
 */
export function getConversation(convId, fields) {
  const conv = conversations.get(convId);
  if (!conv) return null;

  const result = { id: conv.id };

  if (!fields || fields.includes('messages')) {
    const msgs = conv.messages.slice(-20).map(m => ({
      id: m.mid,
      created_time: new Date(m.timestamp).toISOString(),
      from: { id: m.senderId, name: profileNameOrBusiness(m.senderId) },
      to: { data: [{ id: m.recipientId, name: profileNameOrBusiness(m.recipientId) }] },
      message: m.text || '',
    }));

    result.messages = {
      data: msgs,
      paging: {
        cursors: { before: 'cursor_start', after: 'cursor_end' },
      },
    };
  }

  if (!fields || fields.includes('participants')) {
    const participant = profiles.get(conv.participantPsid);
    const ownerId = conv.platform === 'instagram' ? config.igUserId : config.pageId;
    result.participants = {
      data: [
        { id: conv.participantPsid, name: participant?.name || 'Unknown' },
        { id: ownerId, name: 'Ink Bloop' },
      ],
    };
  }

  if (!fields || fields.includes('updated_time')) {
    result.updated_time = new Date(conv.updatedTime).toISOString();
  }

  return result;
}

/**
 * Get a single message by mid.
 */
export function getMessage(mid) {
  for (const conv of conversations.values()) {
    const msg = conv.messages.find(m => m.mid === mid);
    if (msg) {
      return {
        id: msg.mid,
        created_time: new Date(msg.timestamp).toISOString(),
        from: { id: msg.senderId, name: profileNameOrBusiness(msg.senderId) },
        to: { data: [{ id: msg.recipientId, name: profileNameOrBusiness(msg.recipientId) }] },
        message: msg.text || '',
        attachments: msg.attachments ? { data: msg.attachments } : undefined,
      };
    }
  }
  return null;
}

/**
 * Add a message sent BY THE BUSINESS (via Send API).
 * Returns the created message.
 */
export function addBusinessMessage(recipientPsid, text, attachments) {
  const profile = profiles.get(recipientPsid);
  if (!profile) return null;

  const convId = psidToConversation.get(recipientPsid);
  const conv = convId ? conversations.get(convId) : null;
  if (!conv) return null;

  const businessId = profile.platform === 'instagram' ? config.igUserId : config.pageId;
  const msg = {
    mid: messageId(),
    senderId: businessId,
    recipientId: recipientPsid,
    text,
    attachments,
    timestamp: Date.now(),
    isEcho: true,
  };

  conv.messages.push(msg);
  conv.updatedTime = msg.timestamp;
  return msg;
}

/**
 * Add a message sent BY THE CLIENT (from the simulator UI).
 * Returns { message, conversationId, platform }.
 */
export function addClientMessage(psid, text, attachments) {
  const profile = profiles.get(psid);
  if (!profile) return null;

  let convId = psidToConversation.get(psid);
  let conv = convId ? conversations.get(convId) : null;

  if (!conv) {
    convId = conversationId();
    conv = {
      id: convId,
      platform: profile.platform,
      participantPsid: psid,
      updatedTime: Date.now(),
      messages: [],
    };
    conversations.set(convId, conv);
    psidToConversation.set(psid, convId);
  }

  const businessId = profile.platform === 'instagram' ? config.igUserId : config.pageId;
  const msg = {
    mid: messageId(),
    senderId: psid,
    recipientId: businessId,
    text,
    attachments,
    timestamp: Date.now(),
    isEcho: false,
  };

  conv.messages.push(msg);
  conv.updatedTime = msg.timestamp;
  return { message: msg, conversationId: convId, platform: profile.platform };
}

/**
 * Get full conversation data for the simulator UI (no 20-message limit).
 */
export function getSimConversations() {
  const result = [];
  for (const conv of conversations.values()) {
    const profile = profiles.get(conv.participantPsid);
    result.push({
      id: conv.id,
      platform: conv.platform,
      participant: profile ? { psid: profile.psid, name: profile.name, instagram: profile.instagram } : null,
      updatedTime: conv.updatedTime,
      messages: conv.messages.map(m => ({
        mid: m.mid,
        senderId: m.senderId,
        text: m.text,
        attachments: m.attachments,
        timestamp: m.timestamp,
        isEcho: m.isEcho,
      })),
    });
  }
  result.sort((a, b) => b.updatedTime - a.updatedTime);
  return result;
}

/** Check if a PSID exists. */
export function hasProfile(psid) {
  return profiles.has(psid);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function profileNameOrBusiness(id) {
  const p = profiles.get(id);
  if (p) return p.name;
  if (id === config.pageId || id === config.igUserId) return 'Ink Bloop';
  return 'Unknown';
}
