// ── State ─────────────────────────────────────────────────────────────────────

let profiles = [];
let conversations = [];
let selectedPsid = null;
let ws = null;
let typingTimeout = null;

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  const [profilesRes, convsRes, configRes] = await Promise.all([
    fetch('/sim/profiles').then(r => r.json()),
    fetch('/sim/conversations').then(r => r.json()),
    fetch('/sim/config').then(r => r.json()),
  ]);

  profiles = profilesRes;
  conversations = convsRes;
  populateConfig(configRes);
  renderContacts();
  connectWebSocket();
}

// ── WebSocket ─────────────────────────────────────────────────────────────────

function connectWebSocket() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${location.host}`);

  ws.onmessage = (e) => {
    const event = JSON.parse(e.data);

    if (event.type === 'business_message') {
      // Ink Bloop replied via Send API → show in chat
      const conv = conversations.find(c => c.participant?.psid === event.recipientPsid);
      if (conv) {
        conv.messages.push({
          mid: event.message.mid,
          senderId: '__business__',
          text: event.message.text,
          attachments: event.message.attachments,
          timestamp: event.message.timestamp,
          isEcho: true,
        });
        conv.updatedTime = event.message.timestamp;
        if (selectedPsid === event.recipientPsid) {
          renderMessages();
        }
        renderContacts();
      }
    }

    if (event.type === 'client_message') {
      // Another simulator tab sent a message — sync
      const conv = conversations.find(c => c.participant?.psid === event.senderPsid);
      if (conv) {
        // Check for existing message by mid OR a pending message with matching text
        const existing = conv.messages.find(m => m.mid === event.message.mid);
        const pending = !existing && conv.messages.find(m => m.mid.startsWith('pending_') && (m.text === event.message.text || (!m.text && event.message.attachments)));
        if (pending) {
          // Replace pending with real message
          pending.mid = event.message.mid;
          pending.timestamp = event.message.timestamp;
        } else if (!existing) {
          conv.messages.push({
            mid: event.message.mid,
            senderId: event.senderPsid,
            text: event.message.text,
            attachments: event.message.attachments,
            timestamp: event.message.timestamp,
            isEcho: false,
          });
        }
        conv.updatedTime = event.message.timestamp;
        if (selectedPsid === event.senderPsid) renderMessages();
        renderContacts();
      }
    }

    if (event.type === 'sender_action') {
      if (event.recipientPsid === selectedPsid) {
        if (event.action === 'typing_on') showTyping();
        if (event.action === 'typing_off') hideTyping();
        if (event.action === 'mark_seen') {} // Could show read receipt
      }
    }

    if (event.type === 'webhook_log') {
      addWebhookLogEntry(event.entry);
    }
  };

  ws.onclose = () => {
    // Reconnect after 2s
    setTimeout(connectWebSocket, 2000);
  };
}

// ── Contacts ──────────────────────────────────────────────────────────────────

function renderContacts() {
  const el = document.getElementById('contacts');
  const igProfiles = profiles.filter(p => p.platform === 'instagram');
  const fbProfiles = profiles.filter(p => p.platform === 'messenger');

  el.innerHTML = `
    ${renderContactGroup('Instagram', 'ig', igProfiles)}
    ${renderContactGroup('Messenger', 'fb', fbProfiles)}
  `;
}

function renderContactGroup(label, platformClass, groupProfiles) {
  if (groupProfiles.length === 0) return '';

  const contacts = groupProfiles.map(p => {
    const conv = conversations.find(c => c.participant?.psid === p.psid);
    const lastMsg = conv?.messages[conv.messages.length - 1];
    const initials = p.name.split(' ').map(n => n[0]).join('').slice(0, 2);
    const active = selectedPsid === p.psid ? 'active' : '';

    return `
      <div class="contact ${active}" onclick="selectContact('${p.psid}')">
        <div class="contact-avatar">${initials}</div>
        <div class="contact-info">
          <div class="contact-name">${p.name}</div>
          <div class="contact-handle">${p.instagram || 'Messenger'}</div>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="contacts-group">
      <div class="contacts-group-label">
        <span class="platform-dot ${platformClass}"></span>
        ${label}
      </div>
      ${contacts}
    </div>
  `;
}

function selectContact(psid) {
  selectedPsid = psid;
  renderContacts();
  renderChatHeader();
  renderMessages();

  document.getElementById('composer').style.display = 'flex';
  document.getElementById('chat-empty').style.display = 'none';
  document.getElementById('msg-input').focus();
}

// ── Chat Header ───────────────────────────────────────────────────────────────

function renderChatHeader() {
  const profile = profiles.find(p => p.psid === selectedPsid);
  if (!profile) return;

  const headerEl = document.getElementById('chat-header');
  headerEl.style.display = 'flex';

  const initials = profile.name.split(' ').map(n => n[0]).join('').slice(0, 2);
  document.getElementById('chat-avatar').textContent = initials;
  document.getElementById('chat-name').textContent = profile.name;

  const platformEl = document.getElementById('chat-platform');
  platformEl.textContent = profile.platform === 'instagram'
    ? `Instagram · ${profile.instagram}`
    : 'Facebook Messenger';
}

// ── Messages ──────────────────────────────────────────────────────────────────

function renderMessages() {
  const el = document.getElementById('chat-messages');
  const conv = conversations.find(c => c.participant?.psid === selectedPsid);

  if (!conv || conv.messages.length === 0) {
    el.innerHTML = '<div class="chat-empty">No messages yet — send one!</div>';
    return;
  }

  el.innerHTML = conv.messages.map(m => {
    const isClient = !m.isEcho;
    const side = isClient ? 'client' : 'business';
    const time = formatTime(m.timestamp);

    let content = '';
    if (m.text) content += `<div>${escapeHtml(m.text)}</div>`;
    if (m.attachments) {
      for (const att of m.attachments) {
        if (att.type === 'image' && att.payload?.url) {
          content += `<div class="msg-attachment"><img src="${escapeHtml(att.payload.url)}" /></div>`;
        }
      }
    }

    return `
      <div class="msg ${side}">
        ${content}
        <div class="msg-time">${time}</div>
      </div>
    `;
  }).join('');

  // Scroll to bottom
  el.scrollTop = el.scrollHeight;
}

// ── Send Message ──────────────────────────────────────────────────────────────

async function sendMessage() {
  const input = document.getElementById('msg-input');
  const text = input.value.trim();
  if (!text || !selectedPsid) return;

  input.value = '';

  // Optimistically add to local state
  const conv = conversations.find(c => c.participant?.psid === selectedPsid);
  if (conv) {
    conv.messages.push({
      mid: 'pending_' + Date.now(),
      senderId: selectedPsid,
      text,
      timestamp: Date.now(),
      isEcho: false,
    });
    conv.updatedTime = Date.now();
    renderMessages();
    renderContacts();
  }

  // Send to simulator server → triggers webhook to Ink Bloop
  try {
    const res = await fetch('/sim/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ psid: selectedPsid, text }),
    });
    const data = await res.json();

    // Update the pending message with the real mid
    if (conv && data.messageId) {
      const pending = conv.messages.find(m => m.mid.startsWith('pending_') && m.text === text);
      if (pending) pending.mid = data.messageId;
    }
  } catch (err) {
    console.error('Send failed:', err);
  }
}

// ── Attachments ───────────────────────────────────────────────────────────────

async function handleAttach(input) {
  const file = input.files[0];
  if (!file || !selectedPsid) return;
  input.value = '';

  // Read as data URL for display
  const dataUrl = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });

  const attachments = [{ type: 'image', payload: { url: dataUrl } }];

  // Optimistically add
  const conv = conversations.find(c => c.participant?.psid === selectedPsid);
  if (conv) {
    conv.messages.push({
      mid: 'pending_' + Date.now(),
      senderId: selectedPsid,
      text: null,
      attachments,
      timestamp: Date.now(),
      isEcho: false,
    });
    conv.updatedTime = Date.now();
    renderMessages();
  }

  // Send to server
  try {
    const res = await fetch('/sim/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ psid: selectedPsid, attachments }),
    });
    const data = await res.json();
    // Update pending mid so WebSocket dedup works
    if (conv && data.messageId) {
      const pending = conv.messages.find(m => m.mid.startsWith('pending_') && !m.text && m.attachments);
      if (pending) pending.mid = data.messageId;
    }
  } catch (err) {
    console.error('Attach send failed:', err);
  }
}

// ── Typing Indicator ──────────────────────────────────────────────────────────

function showTyping() {
  const el = document.getElementById('typing-indicator');
  el.classList.add('visible');
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(hideTyping, 5000);

  const messages = document.getElementById('chat-messages');
  messages.scrollTop = messages.scrollHeight;
}

function hideTyping() {
  document.getElementById('typing-indicator').classList.remove('visible');
  clearTimeout(typingTimeout);
}

// ── Webhook Log ───────────────────────────────────────────────────────────────

function toggleWebhookPanel() {
  document.getElementById('webhook-panel').classList.toggle('collapsed');
}

function addWebhookLogEntry(entry) {
  if (!entry) return;
  const log = document.getElementById('webhook-log');
  const statusClass = entry.status && entry.status >= 200 && entry.status < 300 ? 'ok' : 'fail';
  const statusText = entry.status || 'ERR';
  const latency = entry.latencyMs != null ? `${entry.latencyMs}ms` : '—';

  // Build preview from payload
  let preview = '';
  const messaging = entry.payload?.entry?.[0]?.messaging?.[0];
  if (messaging?.message?.text) {
    preview = `"${messaging.message.text.slice(0, 60)}"`;
  } else if (messaging?.delivery) {
    preview = `delivery: ${messaging.delivery.mids?.[0] || '?'}`;
  } else if (messaging?.read) {
    preview = `read receipt`;
  }

  const html = `
    <div class="webhook-entry">
      <span class="method">POST</span>
      <span class="status ${statusClass}">${statusText}</span>
      <span class="latency">${latency}</span>
      <span class="preview">${escapeHtml(preview)}</span>
    </div>
  `;

  log.insertAdjacentHTML('afterbegin', html);

  // Keep log manageable
  while (log.children.length > 100) {
    log.removeChild(log.lastChild);
  }
}

// ── Config Modal ──────────────────────────────────────────────────────────────

function toggleConfig() {
  document.getElementById('config-modal').classList.toggle('hidden');
}

function populateConfig(cfg) {
  document.getElementById('cfg-webhook-url').value = cfg.webhookUrl || '';
  document.getElementById('cfg-verify-token').value = cfg.verifyToken || '';
  document.getElementById('cfg-app-secret').value = cfg.appSecret || '';
  document.getElementById('cfg-access-token').value = cfg.accessToken || '';
  document.getElementById('cfg-page-id').value = cfg.pageId || '';
  document.getElementById('cfg-ig-user-id').value = cfg.igUserId || '';
}

async function saveConfig() {
  const cfg = {
    webhookUrl: document.getElementById('cfg-webhook-url').value,
    verifyToken: document.getElementById('cfg-verify-token').value,
    appSecret: document.getElementById('cfg-app-secret').value,
    accessToken: document.getElementById('cfg-access-token').value,
    pageId: document.getElementById('cfg-page-id').value,
    igUserId: document.getElementById('cfg-ig-user-id').value,
  };

  await fetch('/sim/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cfg),
  });

  toggleConfig();
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();

  if (isToday) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
    d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Boot ──────────────────────────────────────────────────────────────────────

init();
