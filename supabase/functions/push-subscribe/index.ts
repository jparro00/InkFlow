// Stores a Web Push subscription for the signed-in artist. Called from the
// frontend right after Notification.requestPermission() succeeds AND on
// every authenticated boot (idempotent — the (user_id, endpoint) unique
// index keeps rows deduplicated, and the upsert keeps last_seen_at fresh).
//
// Auth: requires a Supabase JWT in the Authorization header. We use the
// anon-key client + the bearer token to identify the user, then fall
// through to the service-role client only for the upsert (so the row is
// written even if RLS would have allowed it; this is symmetry with the
// other authenticated edge functions in the project).
//
// Deploy:
//   npx supabase functions deploy push-subscribe --project-ref <ref> --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method not allowed" });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse(401, { error: "missing authorization" });
  }

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return jsonResponse(401, { error: "unauthorized" });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: "invalid json" });
  }

  const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
  const keys = (body.keys ?? {}) as Record<string, unknown>;
  const p256dh = typeof keys.p256dh === "string" ? keys.p256dh : "";
  const auth = typeof keys.auth === "string" ? keys.auth : "";

  // Apple/FCM/Mozilla all return https://... endpoints; reject anything else
  // before we waste a DB round-trip on it.
  if (!endpoint.startsWith("https://")) {
    return jsonResponse(400, { error: "invalid endpoint" });
  }
  if (!p256dh || !auth) {
    return jsonResponse(400, { error: "missing keys" });
  }

  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { error } = await adminClient
    .from("push_subscriptions")
    .upsert(
      {
        user_id: user.id,
        endpoint,
        p256dh,
        auth,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "user_id,endpoint" },
    );

  if (error) {
    console.error("push_subscriptions upsert failed", error);
    return jsonResponse(500, { error: "upsert failed" });
  }

  return jsonResponse(200, { ok: true });
});
