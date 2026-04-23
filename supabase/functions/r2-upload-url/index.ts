// Mints presigned PUT URLs for Cloudflare R2 uploads.
//
// Flow: client calls POST /functions/v1/r2-upload-url with the intended object
// key + metadata. We validate the user's session, enforce prefix-based
// authorization rules (mirror of workers/images/src/authz.ts), and return a
// short-lived presigned PUT URL that the client can use to upload directly
// to R2.
//
// Secrets required (supabase secrets set ...):
//   R2_ACCOUNT_ID           — Cloudflare account ID (from R2 → API → S3 endpoint)
//   R2_ACCESS_KEY_ID        — R2 API token, bucket-scoped
//   R2_SECRET_ACCESS_KEY    — R2 API token secret
//   R2_BUCKET               — e.g. "inkbloop-storage-dev"
//
// Deploy:
//   npx supabase functions deploy r2-upload-url --project-ref <ref> --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Per-prefix upload limits (bytes) and content-type allowlists.
const UPLOAD_LIMITS: Record<
  string,
  { maxBytes: number; contentTypes: RegExp }
> = {
  "booking-images": {
    maxBytes: 20 * 1024 * 1024, // 20 MB
    contentTypes: /^image\/(jpeg|png|webp|heic|heif)$/,
  },
  documents: {
    maxBytes: 10 * 1024 * 1024, // 10 MB
    contentTypes: /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/,
  },
  avatars: {
    maxBytes: 1 * 1024 * 1024, // 1 MB
    contentTypes: /^image\/(jpeg|png|webp)$/,
  },
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PRESIGN_TTL_SECONDS = 300; // 5 minutes

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function validateKey(key: string, userId: string): string | null {
  if (!key) return "empty key";
  if (key.startsWith("/")) return "leading slash";
  if (key.endsWith("/")) return "trailing slash";
  if (key.includes("..")) return "path traversal";
  if (key.includes("//")) return "empty segment";
  if (/%2[ef]/i.test(key)) return "encoded traversal";

  const segments = key.split("/");
  const [prefix, ...rest] = segments;

  switch (prefix) {
    case "booking-images":
    case "documents": {
      if (rest.length < 2) return `${prefix} key too short`;
      if (!UUID_RE.test(rest[0])) return "malformed user id";
      if (rest[0] !== userId) return "cross-user write";
      return null;
    }
    case "avatars":
      if (rest.length === 0) return "avatar key too short";
      return null;
    default:
      return `unknown prefix ${prefix}`;
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

  let body: {
    key?: unknown;
    content_type?: unknown;
    content_length?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: "invalid json" });
  }

  const key = typeof body.key === "string" ? body.key : "";
  const contentType =
    typeof body.content_type === "string" ? body.content_type : "";
  const contentLength =
    typeof body.content_length === "number" ? body.content_length : -1;

  const keyErr = validateKey(key, user.id);
  if (keyErr) return jsonResponse(403, { error: keyErr });

  const prefix = key.split("/")[0];
  const limit = UPLOAD_LIMITS[prefix];
  if (!limit) return jsonResponse(403, { error: "unknown prefix" });

  if (!limit.contentTypes.test(contentType)) {
    return jsonResponse(400, {
      error: `content_type ${contentType} not allowed for ${prefix}`,
    });
  }
  if (
    !Number.isFinite(contentLength) ||
    contentLength <= 0 ||
    contentLength > limit.maxBytes
  ) {
    return jsonResponse(400, {
      error: `content_length must be 1..${limit.maxBytes}`,
    });
  }

  const accountId = Deno.env.get("R2_ACCOUNT_ID");
  const accessKeyId = Deno.env.get("R2_ACCESS_KEY_ID");
  const secretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY");
  const bucket = Deno.env.get("R2_BUCKET");
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    return jsonResponse(500, { error: "r2 secrets not configured" });
  }

  const aws = new AwsClient({
    accessKeyId,
    secretAccessKey,
    service: "s3",
    region: "auto",
  });

  // Sign Content-Type + Content-Length so the client must PUT with those
  // exact values. Bucket name is part of the path (R2's S3 endpoint is
  // virtual-hosted via subdomain but path-style also works).
  const endpoint = `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${key}`;
  const url = new URL(endpoint);
  url.searchParams.set("X-Amz-Expires", String(PRESIGN_TTL_SECONDS));

  const presignReq = new Request(url.toString(), {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(contentLength),
    },
  });

  const signed = await aws.sign(presignReq, {
    aws: { signQuery: true, allHeaders: true },
  });

  const expiresAt = new Date(
    Date.now() + PRESIGN_TTL_SECONDS * 1000,
  ).toISOString();

  return jsonResponse(200, {
    url: signed.url,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(contentLength),
    },
    expires_at: expiresAt,
  });
});
