import { createHmac } from 'crypto';

/**
 * Webhook delivery matching Meta's exact spec.
 *
 * Spec references:
 * - Signature: https://developers.facebook.com/docs/messenger-platform/webhooks#validate-payloads
 * - Payload format: https://developers.facebook.com/docs/messenger-platform/reference/webhook-events/messages
 *
 * Every POST includes:
 *   Content-Type: application/json
 *   X-Hub-Signature-256: sha256=<hex HMAC-SHA256 of raw body using app secret>
 */

/** @type {Array<{timestamp: number, method: string, url: string, status: number|null, latencyMs: number|null, payload: object, error?: string}>} */
const deliveryLog = [];
const MAX_LOG = 200;

/**
 * Build the HMAC-SHA256 signature exactly as Meta does.
 * @param {string} rawBody — JSON-stringified payload
 * @param {string} appSecret — the app secret key
 * @returns {string} "sha256=<hex>"
 */
export function signPayload(rawBody, appSecret) {
  const hmac = createHmac('sha256', appSecret);
  hmac.update(rawBody, 'utf-8');
  return 'sha256=' + hmac.digest('hex');
}

/**
 * Build a webhook event payload matching Meta's exact format.
 *
 * Messenger: { object: "page", entry: [{ id, time, messaging: [...] }] }
 * Instagram: { object: "instagram", entry: [{ id, time, messaging: [...] }] }
 */
export function buildMessageEvent({ platform, pageOrIgId, senderPsid, recipientId, mid, text, attachments, timestamp }) {
  const messagingEntry = {
    sender: { id: senderPsid },
    recipient: { id: recipientId },
    timestamp,
    message: {
      mid,
      text: text || undefined,
    },
  };

  // Attachments array (images, files, etc.)
  if (attachments && attachments.length > 0) {
    messagingEntry.message.attachments = attachments;
  }

  // Remove undefined text if only attachments
  if (!messagingEntry.message.text) {
    delete messagingEntry.message.text;
  }

  return {
    object: platform === 'instagram' ? 'instagram' : 'page',
    entry: [{
      id: pageOrIgId,
      time: timestamp,
      messaging: [messagingEntry],
    }],
  };
}

/**
 * Build a message_deliveries webhook event.
 * Spec: https://developers.facebook.com/docs/messenger-platform/reference/webhook-events/message-deliveries
 */
export function buildDeliveryEvent({ platform, pageOrIgId, senderPsid, recipientId, mids, watermark }) {
  return {
    object: platform === 'instagram' ? 'instagram' : 'page',
    entry: [{
      id: pageOrIgId,
      time: Date.now(),
      messaging: [{
        sender: { id: senderPsid },
        recipient: { id: recipientId },
        timestamp: Date.now(),
        delivery: {
          mids,
          watermark,
        },
      }],
    }],
  };
}

/**
 * Build a message_reads webhook event.
 * Spec: https://developers.facebook.com/docs/messenger-platform/reference/webhook-events/message-reads
 */
export function buildReadEvent({ platform, pageOrIgId, senderPsid, recipientId, watermark }) {
  return {
    object: platform === 'instagram' ? 'instagram' : 'page',
    entry: [{
      id: pageOrIgId,
      time: Date.now(),
      messaging: [{
        sender: { id: senderPsid },
        recipient: { id: recipientId },
        timestamp: Date.now(),
        read: {
          watermark,
        },
      }],
    }],
  };
}

/**
 * Deliver a webhook payload to the configured URL.
 * Follows Meta's delivery behavior:
 *   - POST with JSON body
 *   - X-Hub-Signature-256 header
 *   - Must receive 200 within 5 seconds (we use 5s timeout)
 *
 * @param {string} webhookUrl
 * @param {object} payload
 * @param {string} appSecret
 * @returns {Promise<{success: boolean, status: number|null, latencyMs: number}>}
 */
export async function deliverWebhook(webhookUrl, payload, appSecret) {
  const rawBody = JSON.stringify(payload);
  const signature = signPayload(rawBody, appSecret);
  const start = Date.now();

  const logEntry = {
    timestamp: start,
    method: 'POST',
    url: webhookUrl,
    status: null,
    latencyMs: null,
    payload,
    error: undefined,
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': signature,
      },
      body: rawBody,
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const latencyMs = Date.now() - start;

    logEntry.status = res.status;
    logEntry.latencyMs = latencyMs;
    pushLog(logEntry);

    return { success: res.ok, status: res.status, latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - start;
    logEntry.latencyMs = latencyMs;
    logEntry.error = err.message;
    pushLog(logEntry);

    return { success: false, status: null, latencyMs };
  }
}

/**
 * Deliver a message event then schedule delivery + read receipts.
 */
export async function deliverMessageWithReceipts(webhookUrl, appSecret, eventParams) {
  // 1. Deliver the message event
  const messagePayload = buildMessageEvent(eventParams);
  const result = await deliverWebhook(webhookUrl, messagePayload, appSecret);

  // 2. Schedule delivery receipt after ~500ms
  setTimeout(async () => {
    const deliveryPayload = buildDeliveryEvent({
      platform: eventParams.platform,
      pageOrIgId: eventParams.pageOrIgId,
      senderPsid: eventParams.senderPsid,
      recipientId: eventParams.recipientId,
      mids: [eventParams.mid],
      watermark: eventParams.timestamp,
    });
    await deliverWebhook(webhookUrl, deliveryPayload, appSecret);
  }, 500);

  // 3. Schedule read receipt after ~2000ms
  setTimeout(async () => {
    const readPayload = buildReadEvent({
      platform: eventParams.platform,
      pageOrIgId: eventParams.pageOrIgId,
      senderPsid: eventParams.senderPsid,
      recipientId: eventParams.recipientId,
      watermark: eventParams.timestamp,
    });
    await deliverWebhook(webhookUrl, readPayload, appSecret);
  }, 2000);

  return result;
}

/**
 * Fire a profile_update event to the webhook.
 * Not part of Meta's API — used by the simulator so Ink Bloop can update
 * profile pics in real time without polling.
 */
export async function deliverProfileUpdate(webhookUrl, appSecret, { psid, name, profilePic }) {
  const payload = {
    object: 'profile_update',
    entry: [{
      id: psid,
      time: Date.now(),
      messaging: [{
        sender: { id: psid },
        profile_update: {
          ...(name ? { name } : {}),
          ...(profilePic ? { profile_pic: profilePic } : {}),
        },
      }],
    }],
  };
  return deliverWebhook(webhookUrl, payload, appSecret);
}

function pushLog(entry) {
  deliveryLog.unshift(entry);
  if (deliveryLog.length > MAX_LOG) deliveryLog.length = MAX_LOG;
}

/** Get recent webhook delivery logs (for the simulator UI). */
export function getDeliveryLog(limit = 50) {
  return deliveryLog.slice(0, limit);
}
