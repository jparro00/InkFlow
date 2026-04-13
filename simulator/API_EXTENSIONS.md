# Meta API Simulator — Future Extensions

This document covers Meta API features NOT yet implemented in the simulator but needed for production Ink Bloop. Each section includes the exact API spec so implementation is copy-paste accurate.

---

## 1. Structured Message Templates (Messenger)

**Spec:** https://developers.facebook.com/docs/messenger-platform/reference/send-api/#message

Templates let you send rich messages with buttons, images, and carousels. Critical for booking confirmations.

### Button Template

```json
POST /v25.0/{PAGE_ID}/messages

{
  "recipient": { "id": "PSID" },
  "messaging_type": "RESPONSE",
  "message": {
    "attachment": {
      "type": "template",
      "payload": {
        "template_type": "button",
        "text": "Your appointment is April 15 at 10am. Confirm?",
        "buttons": [
          { "type": "postback", "title": "Confirm", "payload": "CONFIRM_BOOKING_b123" },
          { "type": "postback", "title": "Reschedule", "payload": "RESCHEDULE_BOOKING_b123" },
          { "type": "web_url", "title": "View Details", "url": "https://inkbloop.app/booking/b123" }
        ]
      }
    }
  }
}
```

**Button types:**
- `postback` — sends a `messaging_postbacks` webhook event with the `payload` string
- `web_url` — opens a URL in the user's browser
- `phone_number` — initiates a phone call

### Generic Template (Carousel)

```json
{
  "message": {
    "attachment": {
      "type": "template",
      "payload": {
        "template_type": "generic",
        "elements": [
          {
            "title": "Japanese Half Sleeve — Session 2",
            "subtitle": "April 15, 2026 · 10:00 AM · 3 hours",
            "image_url": "https://example.com/design.jpg",
            "buttons": [
              { "type": "postback", "title": "Confirm", "payload": "CONFIRM_b456" }
            ]
          }
        ]
      }
    }
  }
}
```

### Simulator implementation notes:
- Add `template_type` detection in Send API handler
- Render button templates in the chat UI as styled cards
- When a user clicks a postback button in the simulator UI, fire a `messaging_postbacks` webhook event

---

## 2. Quick Replies (Both Platforms)

**Spec:** https://developers.facebook.com/docs/messenger-platform/send-messages/quick-replies

Quick replies appear as bubbles above the composer. They disappear after the user taps one.

```json
{
  "recipient": { "id": "PSID" },
  "messaging_type": "RESPONSE",
  "message": {
    "text": "What type of appointment?",
    "quick_replies": [
      { "content_type": "text", "title": "Regular Session", "payload": "TYPE_REGULAR" },
      { "content_type": "text", "title": "Touch Up", "payload": "TYPE_TOUCHUP" },
      { "content_type": "text", "title": "Consultation", "payload": "TYPE_CONSULT" },
      { "content_type": "text", "title": "Full Day", "payload": "TYPE_FULLDAY" }
    ]
  }
}
```

**Webhook when user taps a quick reply:**
```json
{
  "sender": { "id": "PSID" },
  "recipient": { "id": "PAGE_ID" },
  "timestamp": 1712956800000,
  "message": {
    "mid": "m_abc123",
    "text": "Regular Session",
    "quick_reply": {
      "payload": "TYPE_REGULAR"
    }
  }
}
```

### Simulator implementation notes:
- Render quick reply buttons below the last message in chat UI
- On click, send a message webhook with the `quick_reply.payload` field included

---

## 3. Postback Events (Both Platforms)

**Spec:** https://developers.facebook.com/docs/messenger-platform/reference/webhook-events/messaging_postbacks

Fired when user taps a postback button from a template.

```json
{
  "object": "page",
  "entry": [{
    "id": "PAGE_ID",
    "time": 1712956800000,
    "messaging": [{
      "sender": { "id": "PSID" },
      "recipient": { "id": "PAGE_ID" },
      "timestamp": 1712956800000,
      "postback": {
        "title": "Confirm",
        "payload": "CONFIRM_BOOKING_b123"
      }
    }]
  }]
}
```

---

## 4. MESSAGE_TAG (Messenger — Outside 24hr Window)

**Spec:** https://developers.facebook.com/docs/messenger-platform/send-messages/message-tags

Allows sending specific non-promotional messages outside the 24-hour window.

```json
{
  "recipient": { "id": "PSID" },
  "messaging_type": "MESSAGE_TAG",
  "tag": "CONFIRMED_EVENT_UPDATE",
  "message": { "text": "Reminder: Your tattoo appointment is tomorrow at 10 AM." }
}
```

**Allowed tags for Ink Bloop:**
- `CONFIRMED_EVENT_UPDATE` — appointment reminders and updates
- `POST_PURCHASE_UPDATE` — aftercare instructions, follow-ups
- `ACCOUNT_UPDATE` — booking changes, cancellations

**Instagram has NO equivalent.** Outside the 24hr window on Instagram, you simply cannot message.

### Simulator implementation notes:
- Add `tag` field validation in Send API handler
- When `enforce24hrWindow` is true, only allow MESSAGE_TAG sends if the last client message is >24hrs old
- Reject sends without a valid tag outside the window

---

## 5. Message Reactions (Both Platforms)

**Spec (Messenger):** https://developers.facebook.com/docs/messenger-platform/reference/webhook-events/message-reactions

```json
{
  "sender": { "id": "PSID" },
  "recipient": { "id": "PAGE_ID" },
  "timestamp": 1712956800000,
  "reaction": {
    "reaction": "love",
    "emoji": "\u2764\uFE0F",
    "action": "react",
    "mid": "m_message_being_reacted_to"
  }
}
```

**Valid reactions:** `smile`, `angry`, `sad`, `wow`, `love`, `like`, `dislike`
**Actions:** `react` (add) or `unreact` (remove)

---

## 6. Story Replies & Mentions (Instagram Only)

**Spec:** https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/

When a user replies to your Instagram story, the webhook includes:

```json
{
  "sender": { "id": "IGSID" },
  "recipient": { "id": "IG_USER_ID" },
  "timestamp": 1712956800000,
  "message": {
    "mid": "m_abc123",
    "text": "Love this piece!",
    "reply_to": {
      "story": {
        "url": "https://...",
        "id": "story_id_123"
      }
    }
  }
}
```

When mentioned in a story:
```json
{
  "sender": { "id": "IGSID" },
  "recipient": { "id": "IG_USER_ID" },
  "timestamp": 1712956800000,
  "message": {
    "mid": "m_abc123",
    "attachments": [{
      "type": "story_mention",
      "payload": { "url": "https://..." }
    }]
  }
}
```

---

## 7. Message Echo Events (Both Platforms)

**Spec:** https://developers.facebook.com/docs/messenger-platform/reference/webhook-events/message-echoes

Fired when the business sends a message (via API or manually in the inbox). Useful for syncing across multiple tools.

```json
{
  "sender": { "id": "PAGE_ID" },
  "recipient": { "id": "PSID" },
  "timestamp": 1712956800000,
  "message": {
    "mid": "m_abc123",
    "is_echo": true,
    "app_id": 123456789,
    "text": "Your appointment is confirmed!"
  }
}
```

### Simulator implementation notes:
- After storing a business message via Send API, optionally fire a `message_echoes` webhook event back to Ink Bloop

---

## 8. Pagination (Conversations API)

**Spec:** https://developers.facebook.com/docs/graph-api/results

Meta uses cursor-based pagination on all list endpoints:

```json
{
  "data": [...],
  "paging": {
    "cursors": {
      "before": "QVFIUjRtc...",
      "after": "QVFIUkhH..."
    },
    "next": "https://graph.facebook.com/v25.0/{id}/conversations?after=QVFIUkhH...",
    "previous": "https://graph.facebook.com/v25.0/{id}/conversations?before=QVFIUjRtc..."
  }
}
```

Query params: `?limit=25&after=CURSOR`

### Simulator implementation notes:
- Currently returns all conversations without pagination
- Add `limit` and `after`/`before` query param support
- Generate opaque base64 cursor strings from conversation indices

---

## 9. Error Response Format

**Spec:** https://developers.facebook.com/docs/graph-api/guides/error-handling

All Meta API errors follow this exact format:

```json
{
  "error": {
    "message": "(#100) param recipient must be non-empty",
    "type": "OAuthException",
    "code": 100,
    "error_subcode": 2018001,
    "fbtrace_id": "AbC123dEf456"
  }
}
```

**Common error codes for messaging:**
| Code | Subcode | Meaning |
|------|---------|---------|
| 10 | 2018065 | Message failed to send (temporary) |
| 100 | 2018001 | Recipient not found |
| 100 | 2018109 | Attachment upload failed |
| 190 | — | Invalid access token |
| 200 | 2018028 | Cannot message: 24hr window closed, no MESSAGE_TAG |
| 613 | — | Rate limit reached |
| 803 | — | Resource not found |

---

## 10. Rate Limiting

**Messenger:** 200 calls per hour per page for Send API
**Instagram:** 200 automated DMs per hour per account

**Rate limit headers (on every response):**
```
x-app-usage: {"call_count":28,"total_cputime":10,"total_time":15}
x-business-use-case-usage: {"111222333":{"type":"SEND_API","call_count":50,"total_cputime":20,"total_time":25,"estimated_time_to_regain_access":0}}
```

**When rate limited:** HTTP 429 with error code 613.

### Simulator implementation notes:
- Add a request counter per hour
- Return 429 with proper error format when exceeded
- Include `x-app-usage` headers on all responses
- Make the limit configurable in the config panel
