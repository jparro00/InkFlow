// Anonymous endpoint that finalizes a consent-form submission. The client
// has already uploaded their license + signature to R2 via consent-upload-url
// and now POSTs the form payload here. We insert a row in consent_submissions
// with status='submitted', which lands in the artist's review queue.
//
// Auth model: anonymous, but bounded by:
//  - Per-IP rate limit (3 submissions / hour)
//  - Artist must exist in auth.users (FK enforces)
//  - submission_id must be a UUID (matches the upload key path)
//  - All inputs validated and length-capped
//
// We deliberately skip JWT (this is a public form; clients have no Supabase
// session). The function uses the service-role client to bypass RLS, which
// is why we re-implement validation here rather than relying on policies.
//
// Deploy:
//   npx supabase functions deploy consent-submit --project-ref <ref> --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX_PER_IP = 3;

const MAX_TEXT = 200;
const MAX_ADDRESS = 500;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function asTrimmedString(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  return s.slice(0, max);
}

function asDate(v: unknown): string | null {
  if (typeof v !== "string") return null;
  // ISO date or YYYY-MM-DD only — anything else gets rejected to keep the
  // column shape consistent.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const t = Date.parse(v);
  if (Number.isNaN(t)) return null;
  return v;
}

function clientIpFromRequest(req: Request): string {
  // Supabase puts the original IP in cf-connecting-ip / x-forwarded-for.
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

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: "invalid json" });
  }

  const artistId = typeof body.artist_id === "string" ? body.artist_id : "";
  const submissionId =
    typeof body.submission_id === "string" ? body.submission_id : "";

  if (!UUID_RE.test(artistId)) {
    return jsonResponse(400, { error: "invalid artist_id" });
  }
  if (!UUID_RE.test(submissionId)) {
    return jsonResponse(400, { error: "invalid submission_id" });
  }

  const license = (body.license ?? {}) as Record<string, unknown>;
  const formData = (body.form_data ?? {}) as Record<string, unknown>;
  if (formData === null || typeof formData !== "object" || Array.isArray(formData)) {
    return jsonResponse(400, { error: "invalid form_data" });
  }

  const licenseImageKey = asTrimmedString(license.image_key, 500);
  const licenseFirstName = asTrimmedString(license.first_name, MAX_TEXT);
  const licenseLastName = asTrimmedString(license.last_name, MAX_TEXT);
  const licenseDob = asDate(license.dob);
  const licenseNumber = asTrimmedString(license.number, MAX_TEXT);
  const licenseAddress = asTrimmedString(license.address, MAX_ADDRESS);
  const licenseState = asTrimmedString(license.state, 32);
  const licenseExpiry = asDate(license.expiry);
  const signatureImageKey = asTrimmedString(body.signature_image_key, 500);
  const pdfKey = asTrimmedString(body.pdf_key, 500);
  // SHA-256 of the uploaded PDF, hex-encoded. 64 hex chars; reject anything
  // else so we never store a garbage value that would silently disagree with
  // the artist's later integrity check.
  const pdfSha256Raw = typeof body.pdf_sha256 === "string"
    ? body.pdf_sha256.trim().toLowerCase()
    : "";
  const pdfSha256 = /^[0-9a-f]{64}$/.test(pdfSha256Raw) ? pdfSha256Raw : null;
  // Tattoo details are now CLIENT-entered during the wizard (so they can be
  // included in the signed PDF). Description allows the longer free-text cap;
  // location is short-form ("Right forearm").
  const tattooLocation = asTrimmedString(body.tattoo_location, MAX_TEXT);
  const tattooDescription = asTrimmedString(body.tattoo_description, 1000);
  // Raw Textract response, kept verbatim so future schema additions can be
  // backfilled from existing rows without re-OCRing. Only accept objects
  // (not arrays, not primitives) — anything weirder gets stored as null.
  const licenseRawData =
    body.license_raw_data && typeof body.license_raw_data === "object" &&
      !Array.isArray(body.license_raw_data)
      ? body.license_raw_data
      : null;

  // Sanity-check that any provided image keys actually live under this
  // submission's path. Otherwise a malicious submitter could reference an
  // arbitrary R2 object they (or someone) uploaded earlier.
  const expectedPrefix = `consent/${artistId}/${submissionId}/`;
  if (licenseImageKey && !licenseImageKey.startsWith(expectedPrefix)) {
    return jsonResponse(400, { error: "license image_key outside submission path" });
  }
  if (signatureImageKey && !signatureImageKey.startsWith(expectedPrefix)) {
    return jsonResponse(400, { error: "signature image_key outside submission path" });
  }
  if (pdfKey && !pdfKey.startsWith(expectedPrefix)) {
    return jsonResponse(400, { error: "pdf_key outside submission path" });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const clientIp = clientIpFromRequest(req);
  const userAgent = req.headers.get("user-agent")?.slice(0, 500) ?? null;

  // Rate-limit by IP. Skipped if we couldn't determine the IP (uncommon on
  // Supabase edge — better to allow than to break legitimate users).
  if (clientIp) {
    const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
    const { count, error: countErr } = await supabase
      .from("consent_submissions")
      .select("id", { count: "exact", head: true })
      .eq("client_ip", clientIp)
      .gte("submitted_at", since);

    if (countErr) {
      console.error("rate-limit count failed", countErr);
    } else if ((count ?? 0) >= RATE_LIMIT_MAX_PER_IP) {
      return jsonResponse(429, { error: "too many submissions" });
    }
  }

  // Insert the row. FK on user_id catches non-existent artists.
  const insert = {
    id: submissionId,
    user_id: artistId,
    status: "submitted" as const,
    license_image_key: licenseImageKey,
    license_first_name: licenseFirstName,
    license_last_name: licenseLastName,
    license_dob: licenseDob,
    license_number: licenseNumber,
    license_address: licenseAddress,
    license_state: licenseState,
    license_expiry: licenseExpiry,
    license_raw_data: licenseRawData,
    form_data: formData,
    signature_image_key: signatureImageKey,
    pdf_key: pdfKey,
    pdf_sha256: pdfSha256,
    tattoo_location: tattooLocation,
    tattoo_description: tattooDescription,
    client_ip: clientIp || null,
    client_user_agent: userAgent,
  };

  const { data, error } = await supabase
    .from("consent_submissions")
    .insert(insert)
    .select("id, status, submitted_at")
    .single();

  if (error) {
    // FK violation on user_id → artist doesn't exist
    if (error.code === "23503") {
      return jsonResponse(404, { error: "artist not found" });
    }
    // Duplicate submission_id (client retry that already succeeded)
    if (error.code === "23505") {
      return jsonResponse(409, { error: "submission already exists" });
    }
    console.error("consent insert failed", error);
    return jsonResponse(500, { error: "insert failed" });
  }

  // Fan-out Web Push to every device the artist has registered. We do this
  // AFTER the insert so a push failure can never lose a submission, and we
  // wait for the fan-out to settle so dead subscriptions get garbage-
  // collected before the function returns. Total work is bounded by the
  // artist's device count, which is realistically 1-3 — fast enough to
  // stay inside the request budget.
  await sendConsentSubmittedPushes(supabase, artistId).catch((err) => {
    // Never fail the submission because of push problems; the artist will
    // still see the row land in the in-app review queue via Realtime.
    console.error("push fan-out failed", err);
  });

  return jsonResponse(200, {
    id: data.id,
    status: data.status,
    submitted_at: data.submitted_at,
  });
});

// ──────────────────────────────────────────────────────────────────────
// Web Push fan-out
// ──────────────────────────────────────────────────────────────────────

async function sendConsentSubmittedPushes(
  supabase: ReturnType<typeof createClient>,
  artistId: string,
): Promise<void> {
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const subject = Deno.env.get("VAPID_SUBJECT");
  if (!publicKey || !privateKey || !subject) {
    // Push not configured — log once and bail. The submission row was
    // already written; Realtime keeps the in-app queue in sync regardless.
    console.warn("VAPID keys missing — skipping push fan-out");
    return;
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);

  // Fetch every active subscription for the artist + the new "awaiting
  // review" count in a single round-trip each. The count drives the
  // home-screen badge value; we send the same payload to every device.
  const [subsResult, countResult] = await Promise.all([
    supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", artistId),
    supabase
      .from("consent_submissions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", artistId)
      .eq("status", "submitted"),
  ]);

  const subs = (subsResult.data ?? []) as Array<{
    id: string;
    endpoint: string;
    p256dh: string;
    auth: string;
  }>;
  if (subs.length === 0) return;

  const pendingCount = countResult.count ?? 0;
  const payload = JSON.stringify({
    title: "New consent form",
    body: "Tap to review.",
    count: pendingCount,
    url: "/#/forms",
  });

  // Run sends in parallel — each is independent. allSettled so one bad
  // subscription doesn't short-circuit the rest.
  const results = await Promise.allSettled(
    subs.map((sub) =>
      webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        payload,
        // Apple is strict: TTL must be ≥0 and reasonable. 1h is plenty —
        // a "new consent form" notification is uninteresting after that.
        { TTL: 60 * 60 },
      ),
    ),
  );

  // Garbage-collect dead subscriptions. 410 = subscription unsubscribed,
  // 404 = endpoint no longer recognized; both mean the device is gone.
  const deadIds: string[] = [];
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      const err = r.reason as { statusCode?: number };
      if (err?.statusCode === 410 || err?.statusCode === 404) {
        deadIds.push(subs[i].id);
      } else {
        console.error("web push send failed", err);
      }
    }
  });
  if (deadIds.length > 0) {
    await supabase.from("push_subscriptions").delete().in("id", deadIds);
  }
}
