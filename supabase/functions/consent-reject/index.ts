// Hard-deletes a consent submission AND its R2 images.
//
// Plain DELETE through PostgREST works for the row, but R2 lives outside
// the database — orphan license/signature blobs would accumulate without
// this function. The artist's session JWT is required so we can scope the
// operation to their own submissions and avoid letting an attacker who
// guesses an id wipe someone else's data.
//
// Body: { id: <consent_submissions.id> }
//
// Deploy:
//   npx supabase functions deploy consent-reject --project-ref <ref> --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function deleteR2Object(
  aws: AwsClient,
  accountId: string,
  bucket: string,
  key: string,
): Promise<void> {
  const url = `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${key}`;
  const res = await aws.fetch(url, { method: "DELETE" });
  // R2 returns 204 on success; 404 (already gone) is fine. Anything else logs.
  if (!res.ok && res.status !== 404) {
    console.error("R2 DELETE failed", { key, status: res.status });
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method not allowed" });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse(401, { error: "missing authorization" });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return jsonResponse(401, { error: "unauthorized" });
  }

  let body: { id?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: "invalid json" });
  }
  const id = typeof body.id === "string" ? body.id : "";
  if (!UUID_RE.test(id)) return jsonResponse(400, { error: "invalid id" });

  // Fetch the row through the user-scoped client so RLS gates ownership for us.
  const { data: row, error: fetchErr } = await supabase
    .from("consent_submissions")
    .select("id, license_image_key, signature_image_key")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) {
    console.error("fetch failed", fetchErr);
    return jsonResponse(500, { error: "fetch failed" });
  }
  if (!row) {
    return jsonResponse(404, { error: "not found" });
  }

  const r2AccountId = Deno.env.get("R2_ACCOUNT_ID");
  const r2AccessKeyId = Deno.env.get("R2_ACCESS_KEY_ID");
  const r2SecretKey = Deno.env.get("R2_SECRET_ACCESS_KEY");
  const r2Bucket = Deno.env.get("R2_BUCKET");

  if (r2AccountId && r2AccessKeyId && r2SecretKey && r2Bucket) {
    const aws = new AwsClient({
      accessKeyId: r2AccessKeyId,
      secretAccessKey: r2SecretKey,
      service: "s3",
      region: "auto",
    });
    const keys = [row.license_image_key, row.signature_image_key].filter(
      (k): k is string => typeof k === "string" && k.length > 0,
    );
    await Promise.all(
      keys.map((k) => deleteR2Object(aws, r2AccountId, r2Bucket, k)),
    );
  } else {
    console.warn("R2 secrets not configured — DB row deleted, blobs orphaned");
  }

  // Now delete the row. RLS again ensures only the owner can do this.
  const { error: delErr } = await supabase
    .from("consent_submissions")
    .delete()
    .eq("id", id);

  if (delErr) {
    console.error("row delete failed", delErr);
    return jsonResponse(500, { error: "delete failed" });
  }

  return jsonResponse(200, { ok: true });
});
