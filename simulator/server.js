import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  getConfig, setConfig, getProfile, getAllProfiles, hasProfile,
  listConversations, getConversation, getMessage,
  addBusinessMessage, addClientMessage, getSimConversations,
  markConversationSeen, createContact, updateProfilePic,
} from './lib/store.js';
import {
  deliverMessageWithReceipts, deliverProfileUpdate, getDeliveryLog, signPayload,
} from './lib/webhook.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const server = createServer(app);

// ── WebSocket for real-time simulator UI updates ─────────────────────────────

const wss = new WebSocketServer({ server });
const wsClients = new Set();

wss.on('connection', (ws) => {
  wsClients.add(ws);
  ws.on('close', () => wsClients.delete(ws));
});

function broadcast(event) {
  const data = JSON.stringify(event);
  for (const ws of wsClients) {
    if (ws.readyState === 1) ws.send(data);
  }
}

// ── Middleware ────────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.static(join(__dirname, 'public')));

// ── Simulator config ─────────────────────────────────────────────────────────

let simConfig = {
  webhookUrl: process.env.WEBHOOK_URL || 'https://jpjvexfldouobiiczhax.supabase.co/functions/v1/webhook',
  verifyToken: process.env.VERIFY_TOKEN || 'inkbloop-dev-token',
  appSecret: process.env.APP_SECRET || 'inkbloop-dev-secret',
  accessToken: process.env.ACCESS_TOKEN || 'SIM_ACCESS_TOKEN_DEV',
  enforce24hrWindow: false,
  deliveryReceiptDelay: 500,
  readReceiptDelay: 2000,
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GRAPH API — Matches Meta's exact endpoint format and response shapes.
// Spec: https://developers.facebook.com/docs/graph-api
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Validate access token from Authorization header or query param.
 * Meta accepts both: `Authorization: Bearer TOKEN` or `?access_token=TOKEN`
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const queryToken = req.query.access_token;
  let token = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else if (queryToken) {
    token = queryToken;
  }

  if (token !== simConfig.accessToken) {
    return res.status(401).json({
      error: {
        message: 'Invalid OAuth access token - Cannot parse access token',
        type: 'OAuthException',
        code: 190,
        fbtrace_id: 'sim_' + Date.now().toString(36),
      },
    });
  }
  next();
}

/**
 * Meta error response format.
 * Spec: https://developers.facebook.com/docs/graph-api/guides/error-handling
 */
function metaError(res, status, message, code, errorSubcode) {
  return res.status(status).json({
    error: {
      message,
      type: 'OAuthException',
      code,
      error_subcode: errorSubcode,
      fbtrace_id: 'sim_' + Date.now().toString(36),
    },
  });
}

// ── Send API ─────────────────────────────────────────────────────────────────
// POST /v25.0/{PAGE_ID}/messages    (Messenger)
// POST /v25.0/{IG_USER_ID}/messages (Instagram)
//
// Spec: https://developers.facebook.com/docs/messenger-platform/reference/send-api/
//
// Request body:
//   { recipient: { id: "PSID" },
//     messaging_type: "RESPONSE" | "UPDATE" | "MESSAGE_TAG",
//     message: { text: "..." }  OR  { attachment: { type, payload } }
//     sender_action: "typing_on" | "typing_off" | "mark_seen" }
//
// Success response:
//   { recipient_id: "PSID", message_id: "m_..." }

app.post('/v25.0/:id/messages', requireAuth, (req, res) => {
  const { id } = req.params;
  const storeConfig = getConfig();

  // Determine platform from the target ID
  let platform;
  if (id === storeConfig.pageId) {
    platform = 'messenger';
  } else if (id === storeConfig.igUserId) {
    platform = 'instagram';
  } else {
    return metaError(res, 400, `(#100) Param id must be a valid Page or Instagram account ID`, 100);
  }

  const { recipient, message, sender_action, messaging_type } = req.body;

  // Handle sender_action (typing_on, typing_off, mark_seen) — acknowledge only
  if (sender_action) {
    if (!recipient?.id) {
      return metaError(res, 400, '(#100) param recipient must be non-empty', 100);
    }
    if (!hasProfile(recipient.id)) {
      return metaError(res, 400, '(#100) No matching user found', 100, 2018001);
    }
    // Handle mark_seen — track read watermark
    if (sender_action === 'mark_seen') {
      const result = markConversationSeen(recipient.id);
      if (result) {
        broadcast({ type: 'mark_seen', recipientPsid: recipient.id, readWatermark: result.readWatermark });
      }
    } else {
      // Broadcast typing indicator to simulator UI
      broadcast({ type: 'sender_action', action: sender_action, recipientPsid: recipient.id });
    }
    return res.json({ recipient_id: recipient.id });
  }

  // Validate required fields
  if (!recipient?.id) {
    return metaError(res, 400, '(#100) param recipient must be non-empty', 100);
  }
  if (!message) {
    return metaError(res, 400, '(#100) param message must be non-empty', 100);
  }
  if (!hasProfile(recipient.id)) {
    return metaError(res, 400, '(#100) No matching user found', 100, 2018001);
  }

  // Validate text length
  const text = message.text;
  if (text) {
    if (platform === 'messenger' && text.length > 2000) {
      return metaError(res, 400, '(#100) Message text exceeds 2000 character limit', 100);
    }
    if (platform === 'instagram' && Buffer.byteLength(text, 'utf-8') > 1000) {
      return metaError(res, 400, '(#100) Message text exceeds 1000 byte limit', 100);
    }
  }

  // Extract attachments if present
  let attachments;
  if (message.attachment) {
    attachments = [message.attachment];
  }

  // Store the message
  const msg = addBusinessMessage(recipient.id, text, attachments);
  if (!msg) {
    return metaError(res, 400, '(#100) No matching user found', 100, 2018001);
  }

  // Push to simulator chat UI
  broadcast({
    type: 'business_message',
    recipientPsid: recipient.id,
    message: { mid: msg.mid, text, attachments, timestamp: msg.timestamp },
  });

  // Meta's exact success response
  res.json({
    recipient_id: recipient.id,
    message_id: msg.mid,
  });
});

// ── Conversations API ────────────────────────────────────────────────────────
// GET /v25.0/{PAGE_ID}/conversations
//
// Spec: https://developers.facebook.com/docs/messenger-platform/reference/conversations-api/
//
// Returns: { data: [...], paging: { cursors: { before, after }, next? } }

app.get('/v25.0/:id/conversations', requireAuth, (req, res) => {
  const { id } = req.params;
  const result = listConversations(id);
  res.json(result);
});

// ── Conversation detail / Message detail ─────────────────────────────────────
// GET /v25.0/{CONVERSATION_ID}?fields=messages,participants,updated_time
// GET /v25.0/{MESSAGE_ID}?fields=id,created_time,from,to,message
//
// Meta uses the same endpoint pattern — the ID prefix determines the resource:
//   t_xxx → conversation
//   m_xxx → message
//   Other → user profile

app.get('/v25.0/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const fields = req.query.fields ? req.query.fields.split(',') : undefined;

  // Conversation (t_ prefix)
  if (id.startsWith('t_')) {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 20;
    const after = req.query.after || undefined;
    const before = req.query.before || undefined;
    const conv = getConversation(id, fields, { limit, after, before });
    if (!conv) return metaError(res, 404, `(#803) Some of the aliases you requested do not exist: ${id}`, 803);
    return res.json(conv);
  }

  // Message (m_ prefix)
  if (id.startsWith('m_')) {
    const msg = getMessage(id);
    if (!msg) return metaError(res, 404, `(#803) Some of the aliases you requested do not exist: ${id}`, 803);
    return res.json(msg);
  }

  // User profile (PSID)
  // GET /v25.0/{PSID}?fields=first_name,last_name,profile_pic
  // Spec: https://developers.facebook.com/docs/messenger-platform/identity/user-profile
  const profile = getProfile(id);
  if (profile) {
    const result = { id };
    if (!fields || fields.includes('first_name')) result.first_name = profile.firstName;
    if (!fields || fields.includes('last_name')) result.last_name = profile.lastName;
    if (!fields || fields.includes('name')) result.name = profile.name;
    if (!fields || fields.includes('profile_pic')) {
      result.profile_pic = profile.profilePic || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name)}&background=2C2C2C&color=B08CE8&size=200`;
    }
    return res.json(result);
  }

  return metaError(res, 404, `(#803) Some of the aliases you requested do not exist: ${id}`, 803);
});

// ── Webhook Verification ─────────────────────────────────────────────────────
// GET /webhook?hub.mode=subscribe&hub.verify_token=TOKEN&hub.challenge=CHALLENGE
//
// Spec: https://developers.facebook.com/docs/messenger-platform/webhooks#verification
//
// Meta sends this GET request when you configure a webhook URL.
// The server MUST echo the hub.challenge value to confirm ownership.

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === simConfig.verifyToken) {
    console.log('[webhook] Verification successful');
    return res.status(200).send(challenge);
  }

  console.log('[webhook] Verification failed — token mismatch');
  return res.sendStatus(403);
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SIMULATOR ENDPOINTS — These power the chat UI. NOT part of Meta's API.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Get all conversations (full history, no 20-msg limit)
app.get('/sim/conversations', (req, res) => {
  res.json(getSimConversations());
});

// Get all client profiles
app.get('/sim/profiles', (req, res) => {
  res.json(getAllProfiles());
});

// Send a message as a client → fires webhook to Ink Bloop
app.post('/sim/send', async (req, res) => {
  const { psid, text, attachments } = req.body;
  if (!psid || (!text && !attachments)) {
    return res.status(400).json({ error: 'psid and (text or attachments) required' });
  }

  const result = addClientMessage(psid, text, attachments);
  if (!result) {
    return res.status(400).json({ error: 'Unknown PSID' });
  }

  const { message, platform } = result;
  const storeConfig = getConfig();
  const pageOrIgId = platform === 'instagram' ? storeConfig.igUserId : storeConfig.pageId;

  // Broadcast to all simulator UI tabs
  broadcast({
    type: 'client_message',
    senderPsid: psid,
    message: { mid: message.mid, text, attachments: message.attachments, timestamp: message.timestamp },
  });

  // Deliver webhook to Ink Bloop's endpoint
  const webhookResult = await deliverMessageWithReceipts(
    simConfig.webhookUrl,
    simConfig.appSecret,
    {
      platform,
      pageOrIgId,
      senderPsid: psid,
      recipientId: pageOrIgId,
      mid: message.mid,
      text,
      attachments: message.attachments,
      timestamp: message.timestamp,
    },
  );

  // Broadcast webhook result for the log panel
  broadcast({ type: 'webhook_log', entry: getDeliveryLog(1)[0] });

  res.json({ success: true, messageId: message.mid, webhookResult });
});

// Create a new contact + conversation
app.post('/sim/contacts', (req, res) => {
  const { name, instagram, platform, profilePic } = req.body;
  if (!name?.trim() || !platform) return res.status(400).json({ error: 'name and platform required' });
  const parts = name.trim().split(' ');
  const profile = createContact({
    name: name.trim(),
    firstName: parts[0],
    lastName: parts.slice(1).join(' ') || '',
    platform,
    instagram: instagram || undefined,
    profilePic: profilePic || null,
  });
  broadcast({ type: 'contact_created', profile });
  res.json(profile);
});

// Update a contact's profile picture
app.post('/sim/contacts/:psid/avatar', async (req, res) => {
  const profile = updateProfilePic(req.params.psid, req.body.dataUrl);
  if (!profile) return res.status(404).json({ error: 'Unknown PSID' });

  broadcast({ type: 'avatar_updated', psid: req.params.psid, profilePic: profile.profilePic });

  // Fire a profile_update webhook so Ink Bloop updates in real time via Supabase Realtime
  if (simConfig.webhookUrl) {
    deliverProfileUpdate(simConfig.webhookUrl, simConfig.appSecret, {
      psid: req.params.psid,
      name: profile.name,
      profilePic: profile.profilePic,
    }).catch(err => console.error('[webhook] profile_update failed:', err.message));
  }

  res.json(profile);
});

// Get/update simulator config
app.get('/sim/config', (req, res) => {
  res.json(simConfig);
});

app.post('/sim/config', (req, res) => {
  Object.assign(simConfig, req.body);
  // Sync page/IG IDs to the store
  if (req.body.pageId || req.body.igUserId) {
    const storeConfig = getConfig();
    if (req.body.pageId) storeConfig.pageId = req.body.pageId;
    if (req.body.igUserId) storeConfig.igUserId = req.body.igUserId;
    setConfig(storeConfig);
  }
  res.json(simConfig);
});

// Get webhook delivery log
app.get('/sim/webhooklog', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json(getDeliveryLog(limit));
});

// ── Start server ─────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log('');
  console.log('  ┌──────────────────────────────────────────────────┐');
  console.log('  │  Meta API Simulator for Ink Bloop                  │');
  console.log('  ├──────────────────────────────────────────────────┤');
  console.log(`  │  Simulator UI:  http://localhost:${PORT}             │`);
  console.log(`  │  Graph API:     http://localhost:${PORT}/v25.0/      │`);
  console.log('  │                                                  │');
  console.log(`  │  Webhook URL:   ${simConfig.webhookUrl.padEnd(33)}│`);
  console.log(`  │  Page ID:       ${getConfig().pageId.padEnd(33)}│`);
  console.log(`  │  IG User ID:    ${getConfig().igUserId.padEnd(33)}│`);
  console.log(`  │  Access Token:  ${simConfig.accessToken.padEnd(33)}│`);
  console.log('  └──────────────────────────────────────────────────┘');
  console.log('');
});
