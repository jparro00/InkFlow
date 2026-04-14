import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Webhook doesn't use CORS — Meta POSTs directly, no browser involved
const headers = { "Content-Type": "application/json" };

// ── Broadcast helper ─────────────────────────────────────────────────────────
// Notify the client of new data via Supabase Realtime Broadcast (pure pub/sub,
// no replication slots). Uses the REST API so no WebSocket is needed.
async function broadcast(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
  event: string,
  payload: Record<string, unknown>,
) {
  try {
    await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        messages: [{ topic: `user-${userId}`, event, payload }],
      }),
    });
  } catch {
    // Best effort — message is already in DB regardless
  }
}

async function verifySignature(body: string, signature: string | null, secret: string): Promise<boolean> {
  if (!signature) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
  return signature === `sha256=${hex}`;
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  // ── GET: Webhook Verification Handshake ──────────────────────────────────
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    const verifyToken = Deno.env.get("WEBHOOK_VERIFY_TOKEN");

    if (mode === "subscribe" && token === verifyToken) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  // ── POST: Incoming Webhook Events ────────────────────────────────────────
  if (req.method === "POST") {
    const rawBody = await req.text();

    // Verify HMAC signature
    const appSecret = Deno.env.get("APP_SECRET");
    if (appSecret) {
      const signature = req.headers.get("x-hub-signature-256");
      const valid = await verifySignature(rawBody, signature, appSecret);
      if (!valid) {
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 401,
          headers,
        });
      }
    }

    const ownerUserId = Deno.env.get("OWNER_USER_ID");
    if (!ownerUserId) {
      return new Response(JSON.stringify({ error: "OWNER_USER_ID not configured" }), {
        status: 500,
        headers,
      });
    }

    // Use service role key to bypass RLS
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers });
    }

    // ── Profile Update Event ──────────────────────────────────────────────
    // Fired by the simulator when a contact's avatar is changed.
    // In production this would be a server-side push from your own tooling.
    if (payload.object === "profile_update") {
      for (const entry of payload.entry || []) {
        for (const event of entry.messaging || []) {
          const psid = event.sender?.id;
          const profilePic = event.profile_update?.profile_pic ?? null;
          const name = event.profile_update?.name ?? null;
          if (psid) {
            await supabase.from("participant_profiles").upsert({
              psid,
              user_id: ownerUserId,
              ...(name ? { name } : {}),
              ...(profilePic !== null ? { profile_pic: profilePic } : {}),
              updated_at: new Date().toISOString(),
            });

            await broadcast(
              Deno.env.get("SUPABASE_URL")!,
              Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
              ownerUserId,
              "profile-updated",
              { psid },
            );
          }
        }
      }
      return new Response("EVENT_RECEIVED", { status: 200 });
    }

    const platform = payload.object === "instagram" ? "instagram" : "messenger";

    for (const entry of payload.entry || []) {
      for (const event of entry.messaging || []) {
        // ── Message Event ──────────────────────────────────────────────
        if (event.message) {
          const isEcho = !!event.message.is_echo;
          const senderId = event.sender?.id;
          const recipientId = event.recipient?.id;
          const mid = event.message.mid;
          const text = event.message.text || null;
          const createdAt = new Date(event.timestamp).toISOString();

          // Build attachments array
          let attachments = null;
          if (event.message.attachments?.length) {
            attachments = event.message.attachments;
          }

          // Determine conversation_id: look up existing or derive from participant PSID
          // The client PSID is the sender for incoming, recipient for echoes
          const clientPsid = isEcho ? recipientId : senderId;

          // Look up existing conversation_id for this client
          const { data: existing } = await supabase
            .from("messages")
            .select("conversation_id")
            .eq("user_id", ownerUserId)
            .or(`sender_id.eq.${clientPsid},recipient_id.eq.${clientPsid}`)
            .limit(1);

          const conversationId = existing?.[0]?.conversation_id || `t_${clientPsid}`;

          // Fetch sender profile from simulator profiles (in production: Graph API)
          let senderName: string | null = event.message.is_echo ? "Ink Bloop" : null;
          let senderPic: string | null = null;
          if (clientPsid && !isEcho) {
            const { data: simProfile } = await supabase
              .from("sim_profiles")
              .select("name, profile_pic")
              .eq("psid", clientPsid)
              .maybeSingle();
            if (simProfile) {
              senderName = simProfile.name || null;
              senderPic = simProfile.profile_pic || null;
            }
          }

          // Upsert participant profile with name + pic from simulator
          // Only for incoming messages — echoes would overwrite with "Ink Bloop"
          if (clientPsid && !isEcho) {
            await supabase.from("participant_profiles").upsert({
              psid: clientPsid,
              user_id: ownerUserId,
              platform,
              ...(senderName ? { name: senderName } : {}),
              ...(senderPic ? { profile_pic: senderPic } : {}),
              updated_at: new Date().toISOString(),
            }, { onConflict: "user_id,psid" });
          }

          // Upsert message
          await supabase.from("messages").upsert({
            mid,
            conversation_id: conversationId,
            sender_id: senderId,
            sender_name: senderName,
            recipient_id: recipientId,
            platform,
            text,
            attachments,
            created_at: createdAt,
            is_echo: isEcho,
            user_id: ownerUserId,
          });

          // Prune: keep only last 20 messages per conversation
          const { data: toDelete } = await supabase
            .from("messages")
            .select("mid")
            .eq("conversation_id", conversationId)
            .eq("user_id", ownerUserId)
            .order("created_at", { ascending: false })
            .range(20, 999);

          if (toDelete?.length) {
            const midsToDelete = toDelete.map((m: { mid: string }) => m.mid);
            await supabase
              .from("messages")
              .delete()
              .in("mid", midsToDelete);
          }

          // Notify client of the new message via Broadcast
          await broadcast(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
            ownerUserId,
            "new-message",
            { conversation_id: conversationId, mid },
          );
        }

        // Delivery and read receipts — we don't store these for now
        // They can be added later if needed
      }
    }

    // Meta requires a 200 response quickly
    return new Response("EVENT_RECEIVED", { status: 200 });
  }

  return new Response("Method not allowed", { status: 405 });
});
