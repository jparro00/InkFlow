import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// ── R2 shadow-write ─────────────────────────────────────────────────────────
// Avatars uploaded through sim-api are written to Supabase Storage first,
// then shadow-copied to Cloudflare R2 under `avatars/{path}` in the BACKGROUND
// via EdgeRuntime.waitUntil. The handler does not await this — a slow or
// unreachable R2 must never block the avatar save response.
//
// We optimistically flag `profile_pic_backend = 'r2'` in the profile_update
// webhook payload whenever R2 is configured. If the background PUT hasn't
// landed yet (or fails), the frontend Worker fetch returns 404 and
// resolveAvatarUrls falls back to a Supabase signed URL. This means:
//   - Avatar save is always fast (bounded by Supabase Storage upload only)
//   - R2 reads are eventually consistent
//   - Fallback is transparent to the user
function r2Configured(): boolean {
  return !!(
    Deno.env.get("R2_ACCOUNT_ID") &&
    Deno.env.get("R2_ACCESS_KEY_ID") &&
    Deno.env.get("R2_SECRET_ACCESS_KEY") &&
    Deno.env.get("R2_BUCKET")
  );
}

async function shadowWriteR2Avatar(
  path: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<void> {
  const accountId = Deno.env.get("R2_ACCOUNT_ID")!;
  const accessKeyId = Deno.env.get("R2_ACCESS_KEY_ID")!;
  const secretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY")!;
  const bucket = Deno.env.get("R2_BUCKET")!;
  try {
    const aws = new AwsClient({
      accessKeyId,
      secretAccessKey,
      service: "s3",
      region: "auto",
    });
    const endpoint =
      `https://${accountId}.r2.cloudflarestorage.com/${bucket}/avatars/${path}`;
    const resp = await aws.fetch(endpoint, {
      method: "PUT",
      body: bytes,
      headers: { "Content-Type": contentType },
    });
    if (!resp.ok) {
      console.error(
        "[sim-api] R2 shadow-write non-ok:",
        resp.status,
        await resp.text(),
      );
    }
  } catch (e) {
    console.error("[sim-api] R2 shadow-write threw:", e);
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── HMAC signing (matches Meta's webhook spec) ──────────────────────────────

async function signPayload(rawBody: string, appSecret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
  return "sha256=" + hex;
}

async function deliverWebhook(webhookUrl: string, payload: unknown, appSecret: string) {
  const rawBody = JSON.stringify(payload);
  const signature = await signPayload(rawBody, appSecret);
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Hub-Signature-256": signature },
      body: rawBody,
    });
    return { success: res.ok, status: res.status };
  } catch (err) {
    return { success: false, status: null, error: (err as Error).message };
  }
}

// ── Avatar URL resolution ───────────────────────────────────────────────────
// profile_pic in sim_profiles is now a short storage PATH within the private
// `avatars` bucket (e.g. "igsid-abc12345-1713369600000.jpg"). The simulator
// UI authenticates via publishable/anon key and has no storage RLS access, so
// this function runs server-side (service role) and hands back a signed URL
// the UI can bind directly to <img src>. 1 h TTL is plenty since the sim UI
// refetches profiles on Realtime updates anyway.
//
// Legacy rows still hold base64 data URLs (pre-refactor). Those pass through
// unchanged so the UI renders them directly without a Storage round-trip.

// deno-lint-ignore no-explicit-any
async function resolveAvatarUrl(supabase: any, path: string | null): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith("data:")) return path;
  const { data, error } = await supabase.storage
    .from("avatars")
    .createSignedUrl(path, 3600);
  if (error || !data) return null;
  return data.signedUrl;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  // Strip the Edge Function prefix to get the sim path
  const fullPath = url.pathname;
  const simIdx = fullPath.indexOf("/sim/");
  if (simIdx === -1) return json({ error: "Not found" }, 404);
  const simPath = fullPath.slice(simIdx + 5); // after /sim/

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Load config
  const { data: cfg } = await supabase.from("sim_config").select("*").eq("id", 1).single();
  if (!cfg) return json({ error: "Simulator not configured" }, 500);

  // ── GET conversations ─────────────────────────────────────────────────────
  if (req.method === "GET" && simPath === "conversations") {
    const { data: convos } = await supabase
      .from("sim_conversations")
      .select("id, platform, participant_psid, updated_time, read_watermark")
      .order("updated_time", { ascending: false });

    const results = [];
    for (const c of convos ?? []) {
      const { data: profile } = await supabase.from("sim_profiles").select("*").eq("psid", c.participant_psid).maybeSingle();

      const { data: msgs } = await supabase
        .from("sim_messages")
        .select("*")
        .eq("conversation_id", c.id)
        .order("timestamp", { ascending: true });

      // profile_pic is a storage path; resolve to a signed URL the UI can
      // render directly. Legacy data URLs pass through unchanged.
      const profilePic = profile
        ? await resolveAvatarUrl(supabase, profile.profile_pic)
        : null;

      results.push({
        id: c.id,
        platform: c.platform,
        participant: profile ? {
          psid: profile.psid, name: profile.name,
          instagram: profile.instagram, profilePic,
        } : null,
        updatedTime: c.updated_time,
        readWatermark: c.read_watermark,
        messages: (msgs ?? []).map(m => ({
          mid: m.mid, senderId: m.sender_id, text: m.text,
          attachments: m.attachments, timestamp: m.timestamp, isEcho: m.is_echo,
        })),
      });
    }

    return json(results);
  }

  // ── GET profiles ──────────────────────────────────────────────────────────
  if (req.method === "GET" && simPath === "profiles") {
    const { data: profiles } = await supabase.from("sim_profiles").select("*").order("created_at");
    // Resolve avatar paths → signed URLs in parallel so the UI gets
    // render-ready values. Legacy data URLs pass through unchanged.
    const resolved = await Promise.all(
      (profiles ?? []).map(async (p) => ({
        psid: p.psid,
        firstName: p.first_name,
        lastName: p.last_name,
        name: p.name,
        platform: p.platform,
        profilePic: await resolveAvatarUrl(supabase, p.profile_pic),
        instagram: p.instagram,
      }))
    );
    return json(resolved);
  }

  // ── GET/POST config ───────────────────────────────────────────────────────
  if (simPath === "config") {
    if (req.method === "GET") {
      return json({
        webhookUrl: cfg.webhook_url, verifyToken: cfg.verify_token,
        appSecret: cfg.app_secret, accessToken: cfg.access_token,
        pageId: cfg.page_id, igUserId: cfg.ig_user_id,
      });
    }
    if (req.method === "POST") {
      const body = await req.json();
      const updates: Record<string, unknown> = {};
      if (body.webhookUrl !== undefined) updates.webhook_url = body.webhookUrl;
      if (body.verifyToken !== undefined) updates.verify_token = body.verifyToken;
      if (body.appSecret !== undefined) updates.app_secret = body.appSecret;
      if (body.accessToken !== undefined) updates.access_token = body.accessToken;
      if (body.pageId !== undefined) updates.page_id = body.pageId;
      if (body.igUserId !== undefined) updates.ig_user_id = body.igUserId;
      if (Object.keys(updates).length > 0) {
        await supabase.from("sim_config").update(updates).eq("id", 1);
      }
      // Re-read and return
      const { data: updated } = await supabase.from("sim_config").select("*").eq("id", 1).single();
      return json({
        webhookUrl: updated!.webhook_url, verifyToken: updated!.verify_token,
        appSecret: updated!.app_secret, accessToken: updated!.access_token,
        pageId: updated!.page_id, igUserId: updated!.ig_user_id,
      });
    }
  }

  // ── POST send — client sends a message ────────────────────────────────────
  if (req.method === "POST" && simPath === "send") {
    const { psid, text, attachments } = await req.json();
    if (!psid || (!text && !attachments)) {
      return json({ error: "psid and (text or attachments) required" }, 400);
    }

    const { data: profile } = await supabase.from("sim_profiles").select("*").eq("psid", psid).maybeSingle();
    if (!profile) return json({ error: "Unknown PSID" }, 400);

    // Find or create conversation
    let { data: conv } = await supabase.from("sim_conversations").select("id, platform").eq("participant_psid", psid).maybeSingle();
    if (!conv) {
      const convId = "t_" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
      await supabase.from("sim_conversations").insert({
        id: convId, platform: profile.platform, participant_psid: psid, updated_time: Date.now(),
      });
      conv = { id: convId, platform: profile.platform };
    }

    const mid = "m_" + crypto.randomUUID().replace(/-/g, "").slice(0, 22);
    const now = Date.now();
    const businessId = profile.platform === "instagram" ? cfg.ig_user_id : cfg.page_id;

    await supabase.from("sim_messages").insert({
      mid, conversation_id: conv.id, sender_id: psid, recipient_id: businessId,
      text: text || null, attachments: attachments || null, timestamp: now, is_echo: false,
    });
    await supabase.from("sim_conversations").update({ updated_time: now }).eq("id", conv.id);

    // Fire webhook to Ink Bloop's webhook Edge Function
    const objectType = profile.platform === "instagram" ? "instagram" : "page";
    const pageOrIgId = profile.platform === "instagram" ? cfg.ig_user_id : cfg.page_id;

    const messagePayload = {
      object: objectType,
      entry: [{
        id: pageOrIgId, time: now,
        messaging: [{
          sender: { id: psid }, recipient: { id: pageOrIgId }, timestamp: now,
          message: {
            mid,
            ...(text ? { text } : {}),
            ...(attachments?.length ? { attachments } : {}),
          },
        }],
      }],
    };

    const webhookResult = await deliverWebhook(cfg.webhook_url, messagePayload, cfg.app_secret);

    // Fire delivery + read receipts immediately (no setTimeout in Edge Functions)
    const deliveryPayload = {
      object: objectType,
      entry: [{
        id: pageOrIgId, time: Date.now(),
        messaging: [{
          sender: { id: psid }, recipient: { id: pageOrIgId }, timestamp: Date.now(),
          delivery: { mids: [mid], watermark: now },
        }],
      }],
    };
    await deliverWebhook(cfg.webhook_url, deliveryPayload, cfg.app_secret);

    const readPayload = {
      object: objectType,
      entry: [{
        id: pageOrIgId, time: Date.now(),
        messaging: [{
          sender: { id: psid }, recipient: { id: pageOrIgId }, timestamp: Date.now(),
          read: { watermark: now },
        }],
      }],
    };
    await deliverWebhook(cfg.webhook_url, readPayload, cfg.app_secret);

    return json({ success: true, messageId: mid, webhookResult });
  }

  // ── POST contacts — create new contact ────────────────────────────────────
  // Avatars are NOT accepted here. Callers that want to set an avatar issue
  // a follow-up POST /contacts/:psid/avatar with the binary image body.
  // Two-step flow avoids mixing JSON + binary in one request.
  if (req.method === "POST" && simPath === "contacts") {
    const { name, instagram, platform } = await req.json();
    if (!name?.trim() || !platform) return json({ error: "name and platform required" }, 400);

    const parts = name.trim().split(" ");
    const psid = (platform === "instagram" ? "igsid-" : "psid-") + crypto.randomUUID().replace(/-/g, "").slice(0, 8);

    await supabase.from("sim_profiles").insert({
      psid, first_name: parts[0], last_name: parts.slice(1).join(" ") || "",
      name: name.trim(), platform, profile_pic: null,
      instagram: instagram || null,
    });

    const convId = "t_" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    await supabase.from("sim_conversations").insert({
      id: convId, platform, participant_psid: psid, updated_time: Date.now(),
    });

    const { data: profile } = await supabase.from("sim_profiles").select("*").eq("psid", psid).maybeSingle();
    return json(profile ? {
      psid: profile.psid, firstName: profile.first_name, lastName: profile.last_name,
      name: profile.name, platform: profile.platform, profilePic: null,
      instagram: profile.instagram,
    } : { psid });
  }

  // ── POST contacts/:psid/avatar ────────────────────────────────────────────
  // Accepts a raw binary image body (Content-Type: image/{jpeg,png,webp}).
  // Client is expected to resize before upload (see public/simulator/
  // resizeImage.js); the 256 KB cap here is a hard safety limit, not the
  // target size (target ~15-25 KB). Flow:
  //   1. Validate body size + content-type.
  //   2. Upload to the private `avatars` bucket at `{psid}-{ts}.{ext}`.
  //   3. Write the bucket PATH (not the URL) into sim_profiles.profile_pic.
  //   4. Fire profile_update webhook with the PATH — the Ink Bloop webhook
  //      handler copies it verbatim into participant_profiles.profile_pic.
  //   5. Resolve the path back to a signed URL for the response so the
  //      simulator UI can render the new avatar immediately.
  const avatarMatch = simPath.match(/^contacts\/([^/]+)\/avatar$/);
  if (req.method === "POST" && avatarMatch) {
    const psid = avatarMatch[1];
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      return json({ error: "Content-Type must be image/*" }, 400);
    }
    const bytes = new Uint8Array(await req.arrayBuffer());
    if (bytes.length === 0) return json({ error: "Empty body" }, 400);
    if (bytes.length > 262144) {
      return json({ error: "Avatar exceeds 256 KB (did you skip client-side resize?)" }, 413);
    }

    const ext = contentType.startsWith("image/png") ? "png"
              : contentType.startsWith("image/webp") ? "webp"
              : "jpg";
    const path = `${psid}-${Date.now()}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from("avatars")
      .upload(path, bytes, {
        contentType,
        cacheControl: "2592000", // 30 days; filename is timestamped so it's immutable
        upsert: false,
      });
    if (upErr) {
      return json({ error: "Upload failed", detail: upErr.message }, 500);
    }

    // Shadow-write to R2 in the background — never await. The profile_update
    // webhook below optimistically flags 'r2' whenever R2 is configured; if
    // the background PUT hasn't landed or fails, the Worker returns 404 and
    // the frontend falls back to a Supabase signed URL.
    const profilePicBackend: "supabase" | "r2" = r2Configured()
      ? "r2"
      : "supabase";
    if (profilePicBackend === "r2") {
      const task = shadowWriteR2Avatar(path, bytes, contentType);
      // deno-lint-ignore no-explicit-any
      const runtime = (globalThis as any).EdgeRuntime;
      if (runtime?.waitUntil) {
        runtime.waitUntil(task);
      } else {
        // Local dev / non-Supabase runtime — just let it run, don't await.
        task.catch(() => {});
      }
    }

    const { data: profile, error } = await supabase
      .from("sim_profiles")
      .update({ profile_pic: path })
      .eq("psid", psid)
      .select("*")
      .maybeSingle();

    if (error || !profile) {
      // Best-effort orphan cleanup so we don't leave a file pointing at
      // a row that failed to update.
      await supabase.storage.from("avatars").remove([path]).catch(() => {});
      return json({ error: "Unknown PSID" }, 404);
    }

    // Fire profile_update webhook with the PATH. The Ink Bloop webhook
    // handler is a pass-through (stores whatever string it receives into
    // participant_profiles.profile_pic), so the main app will pick up the
    // new path on its next Realtime broadcast.
    const profilePayload = {
      object: "profile_update",
      entry: [{
        id: psid, time: Date.now(),
        messaging: [{
          sender: { id: psid },
          profile_update: {
            name: profile.name,
            profile_pic: path,
            profile_pic_backend: profilePicBackend,
          },
        }],
      }],
    };
    deliverWebhook(cfg.webhook_url, profilePayload, cfg.app_secret).catch(() => {});

    // Resolve the path to a signed URL for the response body so the
    // simulator UI can render the new avatar immediately without a refetch.
    const signedUrl = await resolveAvatarUrl(supabase, path);

    return json({
      psid: profile.psid, firstName: profile.first_name, lastName: profile.last_name,
      name: profile.name, platform: profile.platform, profilePic: signedUrl,
      instagram: profile.instagram,
    });
  }

  return json({ error: "Not found" }, 404);
});
