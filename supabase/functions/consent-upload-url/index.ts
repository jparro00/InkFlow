// Mints presigned PUT URLs for the public consent-form flow.
//
// Flow: a client (no Supabase session) scans an artist's QR, lands on the
// public consent page, snaps their license / signs, and uploads each blob
// directly to R2 using a short-lived URL minted here.
//
// This is the anonymous twin of `r2-upload-url` (which requires a JWT).
// We can't use that one because consent-form clients aren't authenticated
// users — they're prospects who haven't even been entered as clients yet.
//
// Authorization is replaced by:
//  - Artist must exist in auth.users (FK-enforced via the service-role client)
//  - The R2 key is constrained to consent/{artist_id}/{submission_id}/{kind}.{ext}
//  - Cross-user writes are impossible because the path is fully derived
//    from the request body fields the function validates
//  - Content-type / size limits identical to other private prefixes
//
// The submission_id is generated client-side and threaded through to the
// `consent-submit` call later. Orphaned uploads (no matching submission row)
// are left to a future cleanup job.
//
// Secrets required (supabase secrets set ...):
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
//
// Deploy:
//   npx supabase functions deploy consent-upload-url --project-ref <ref> --no-verify-jwt

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

const PRESIGN_TTL_SECONDS = 300;

const KIND_LIMITS: Record<
  string,
  { maxBytes: number; contentTypes: Record<string, string> }
> = {
  // License photo: ID images can be large after camera capture.
  license: {
    maxBytes: 15 * 1024 * 1024,
    contentTypes: {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/heic": "heic",
      "image/heif": "heif",
    },
  },
  // Signature: tiny canvas exports.
  signature: {
    maxBytes: 1 * 1024 * 1024,
    contentTypes: {
      "image/png": "png",
      "image/jpeg": "jpg",
    },
  },
  // Signed consent PDF: generated client-side via @react-pdf/renderer at
  // submit time. With Helvetica + small embedded signature image these come
  // in well under 1 MB, but allow headroom for future template additions.
  pdf: {
    maxBytes: 5 * 1024 * 1024,
    contentTypes: {
      "application/pdf": "pdf",
    },
  },
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// The client-side PDF generator needs the public IP + UA to embed in the
// consent PDF's audit metadata. We mirror what consent-submit captures so
// the visible-on-PDF audit trail matches the row's audit trail. The browser
// can't read its own public IP, so we surface it on this response — the
// first upload-url call (license) is the natural caching point client-side.
function clientIpFromRequest(req: Request): string {
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf;
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return "";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method not allowed" });
  }

  let body: {
    artist_id?: unknown;
    submission_id?: unknown;
    kind?: unknown;
    content_type?: unknown;
    content_length?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: "invalid json" });
  }

  const artistId = typeof body.artist_id === "string" ? body.artist_id : "";
  const submissionId =
    typeof body.submission_id === "string" ? body.submission_id : "";
  const kind = typeof body.kind === "string" ? body.kind : "";
  const contentType =
    typeof body.content_type === "string" ? body.content_type : "";
  const contentLength =
    typeof body.content_length === "number" ? body.content_length : -1;

  if (!UUID_RE.test(artistId)) {
    return jsonResponse(400, { error: "invalid artist_id" });
  }
  if (!UUID_RE.test(submissionId)) {
    return jsonResponse(400, { error: "invalid submission_id" });
  }
  const limit = KIND_LIMITS[kind];
  if (!limit) {
    return jsonResponse(400, { error: "invalid kind" });
  }
  const ext = limit.contentTypes[contentType];
  if (!ext) {
    return jsonResponse(400, {
      error: `content_type ${contentType} not allowed for ${kind}`,
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

  // Confirm the artist exists. We use the service role client (no user context)
  // because there's no JWT on this call. A non-existent artist would also be
  // caught by the FK check at submit-time, but failing fast here saves R2
  // bytes from being written under a garbage prefix.
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: artist, error: artistErr } = await supabase.auth.admin
    .getUserById(artistId);
  if (artistErr || !artist?.user) {
    return jsonResponse(404, { error: "artist not found" });
  }

  const r2AccountId = Deno.env.get("R2_ACCOUNT_ID");
  const r2AccessKeyId = Deno.env.get("R2_ACCESS_KEY_ID");
  const r2SecretKey = Deno.env.get("R2_SECRET_ACCESS_KEY");
  const r2Bucket = Deno.env.get("R2_BUCKET");
  if (!r2AccountId || !r2AccessKeyId || !r2SecretKey || !r2Bucket) {
    return jsonResponse(500, { error: "r2 secrets not configured" });
  }

  const key = `consent/${artistId}/${submissionId}/${kind}.${ext}`;

  const aws = new AwsClient({
    accessKeyId: r2AccessKeyId,
    secretAccessKey: r2SecretKey,
    service: "s3",
    region: "auto",
  });

  const endpoint =
    `https://${r2AccountId}.r2.cloudflarestorage.com/${r2Bucket}/${key}`;
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

  return jsonResponse(200, {
    url: signed.url,
    key,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(contentLength),
    },
    expires_at: new Date(
      Date.now() + PRESIGN_TTL_SECONDS * 1000,
    ).toISOString(),
    // Echoed back so the client can embed them in the signed PDF's audit
    // metadata. consent-submit captures the same fields server-side at insert
    // time — the row is the canonical record; this is just so the bytes the
    // user signs match the bytes that get archived.
    client_ip: clientIpFromRequest(req),
    client_user_agent: req.headers.get("user-agent")?.slice(0, 500) ?? "",
  });
});
