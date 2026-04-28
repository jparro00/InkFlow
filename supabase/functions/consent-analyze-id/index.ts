// Runs AWS Textract AnalyzeID against a license image already uploaded
// to R2 via consent-upload-url. Returns the parsed identity fields so the
// public consent form can pre-populate name / DOB / address / etc., turning
// what would otherwise be manual transcription into a one-tap confirmation.
//
// Flow:
//   1. Anonymous client uploads license.jpg to R2
//   2. Client POSTs { artist_id, submission_id, license_key } here
//   3. We GET the object from R2 (via the existing R2_* secrets) and pass
//      the bytes to Textract AnalyzeID
//   4. Returns { fields: { first_name, last_name, dob, ... }, raw }
//
// Trust model: this is anonymous like consent-upload-url and consent-submit.
// The license_key is constrained to consent/{artist_id}/{submission_id}/license.*
// so a caller can only OCR images they (or someone using the same QR + flow)
// uploaded — there's no way to trick the function into OCRing arbitrary R2
// objects belonging to other artists.
//
// Secrets required (supabase secrets set ...):
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
//   AWS_TEXTRACT_REGION             — e.g. "us-east-1"
//   AWS_TEXTRACT_ACCESS_KEY_ID      — IAM user with textract:AnalyzeID only
//   AWS_TEXTRACT_SECRET_ACCESS_KEY
//
// Deploy:
//   npx supabase functions deploy consent-analyze-id --project-ref <ref> --no-verify-jwt

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

interface ParsedFields {
  first_name?: string;
  last_name?: string;
  middle_name?: string;
  dob?: string;
  number?: string;
  state?: string;
  expiry?: string;
  address?: string;
}

// Minimum confidence (0-100) for a Textract identity field to count as
// "extracted". Below this we treat the field as missing and the verification
// fails with reason='incomplete_fields'. 75 is loose enough that a clear,
// well-lit ID passes every time but rejects half-blurry strings.
const MIN_FIELD_CONFIDENCE = 75;
// Age gate. Tattoo studios in the US require 18+ for self-consent.
const MIN_AGE_YEARS = 18;

/**
 * Textract returns dates as MM/DD/YYYY in most cases. Convert to ISO YYYY-MM-DD
 * so it lands cleanly in the Postgres `date` column.
 */
function normalizeDate(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  // Already ISO?
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  // MM/DD/YYYY
  const m = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const month = m[1].padStart(2, "0");
    const day = m[2].padStart(2, "0");
    return `${m[3]}-${month}-${day}`;
  }
  return undefined;
}

/** Whole-years age between dob and today (UTC). */
function ageInYears(dobIso: string, asOf: Date = new Date()): number {
  const [y, m, d] = dobIso.split("-").map(Number);
  if (!y || !m || !d) return -1;
  let age = asOf.getUTCFullYear() - y;
  const mDelta = asOf.getUTCMonth() + 1 - m;
  if (mDelta < 0 || (mDelta === 0 && asOf.getUTCDate() < d)) age--;
  return age;
}

interface TextractField {
  Type?: { Text?: string };
  ValueDetection?: { Text?: string; Confidence?: number };
}

interface TextractIdentityDocument {
  IdentityDocumentFields?: TextractField[];
}

interface TextractAnalyzeIdResponse {
  IdentityDocuments?: TextractIdentityDocument[];
}

function parseTextractFields(resp: TextractAnalyzeIdResponse): ParsedFields {
  const out: ParsedFields = {};
  const docs = resp.IdentityDocuments ?? [];
  if (docs.length === 0) return out;
  const fields = docs[0].IdentityDocumentFields ?? [];
  for (const f of fields) {
    const type = f.Type?.Text;
    const value = f.ValueDetection?.Text?.trim();
    const confidence = f.ValueDetection?.Confidence ?? 0;
    if (!type || !value) continue;
    // Drop low-confidence reads on the fields we gate on. Other fields stay
    // in the raw blob but don't influence `valid`.
    const gated =
      type === "FIRST_NAME" ||
      type === "LAST_NAME" ||
      type === "DATE_OF_BIRTH";
    if (gated && confidence < MIN_FIELD_CONFIDENCE) continue;
    switch (type) {
      case "FIRST_NAME":
        out.first_name = value;
        break;
      case "LAST_NAME":
        out.last_name = value;
        break;
      case "MIDDLE_NAME":
        out.middle_name = value;
        break;
      case "DATE_OF_BIRTH":
        out.dob = normalizeDate(value);
        break;
      case "DOCUMENT_NUMBER":
        out.number = value;
        break;
      case "ADDRESS":
        out.address = value;
        break;
      case "STATE_IN_ADDRESS":
      case "ISSUING_STATE":
        // Prefer STATE_IN_ADDRESS but fall back to ISSUING_STATE.
        if (!out.state) out.state = value;
        break;
      case "EXPIRATION_DATE":
      case "DATE_OF_EXPIRY":
        out.expiry = normalizeDate(value);
        break;
      default:
        // Other fields (e.g. ENDORSEMENTS, RESTRICTIONS, CLASS) are kept in
        // the raw payload but not surfaced as structured columns.
        break;
    }
  }
  return out;
}

type VerificationReason =
  | "not_an_id"
  | "incomplete_fields"
  | "underage"
  | "unreadable";

/**
 * Decide whether the parsed fields pass the consent-form gate. The gate is:
 *   - Textract returned an identity document at all (else: not_an_id)
 *   - first + last name + dob are all extracted with high confidence (else:
 *     incomplete_fields)
 *   - dob makes the holder MIN_AGE_YEARS or older (else: underage)
 */
function evaluateValidity(
  resp: TextractAnalyzeIdResponse,
  fields: ParsedFields,
): { valid: true } | { valid: false; reason: VerificationReason; age?: number } {
  const docs = resp.IdentityDocuments ?? [];
  if (docs.length === 0 || (docs[0].IdentityDocumentFields ?? []).length === 0) {
    return { valid: false, reason: "not_an_id" };
  }
  // No first AND no last name → almost certainly not a license. (Some IDs
  // may be missing one but not both.)
  if (!fields.first_name && !fields.last_name) {
    return { valid: false, reason: "not_an_id" };
  }
  if (!fields.first_name || !fields.last_name || !fields.dob) {
    return { valid: false, reason: "incomplete_fields" };
  }
  const age = ageInYears(fields.dob);
  if (age < 0) {
    return { valid: false, reason: "incomplete_fields" };
  }
  if (age < MIN_AGE_YEARS) {
    return { valid: false, reason: "underage", age };
  }
  return { valid: true };
}

async function fetchR2Object(
  aws: AwsClient,
  accountId: string,
  bucket: string,
  key: string,
): Promise<{ bytes: Uint8Array; contentType: string }> {
  const url = `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${key}`;
  const res = await aws.fetch(url, { method: "GET" });
  if (!res.ok) {
    throw new Error(`R2 GET failed: ${res.status}`);
  }
  const buf = await res.arrayBuffer();
  return {
    bytes: new Uint8Array(buf),
    contentType: res.headers.get("Content-Type") ?? "application/octet-stream",
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  // Chunked btoa to avoid call-stack overflow on large arrays.
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(s);
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
    license_key?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: "invalid json" });
  }

  const artistId = typeof body.artist_id === "string" ? body.artist_id : "";
  const submissionId =
    typeof body.submission_id === "string" ? body.submission_id : "";
  const licenseKey =
    typeof body.license_key === "string" ? body.license_key : "";

  if (!UUID_RE.test(artistId)) {
    return jsonResponse(400, { error: "invalid artist_id" });
  }
  if (!UUID_RE.test(submissionId)) {
    return jsonResponse(400, { error: "invalid submission_id" });
  }
  // Constrain the key shape so the function can only OCR license images
  // belonging to this submission.
  const expectedPrefix = `consent/${artistId}/${submissionId}/license.`;
  if (!licenseKey.startsWith(expectedPrefix)) {
    return jsonResponse(400, { error: "license_key outside submission path" });
  }
  if (licenseKey.includes("..") || licenseKey.includes("//")) {
    return jsonResponse(400, { error: "invalid license_key" });
  }

  const r2AccountId = Deno.env.get("R2_ACCOUNT_ID");
  const r2AccessKeyId = Deno.env.get("R2_ACCESS_KEY_ID");
  const r2SecretKey = Deno.env.get("R2_SECRET_ACCESS_KEY");
  const r2Bucket = Deno.env.get("R2_BUCKET");
  if (!r2AccountId || !r2AccessKeyId || !r2SecretKey || !r2Bucket) {
    return jsonResponse(500, { error: "r2 secrets not configured" });
  }

  const textractRegion = Deno.env.get("AWS_TEXTRACT_REGION") ?? "us-east-1";
  const textractAccessKeyId = Deno.env.get("AWS_TEXTRACT_ACCESS_KEY_ID");
  const textractSecretKey = Deno.env.get("AWS_TEXTRACT_SECRET_ACCESS_KEY");
  if (!textractAccessKeyId || !textractSecretKey) {
    return jsonResponse(500, { error: "textract secrets not configured" });
  }

  // Fetch the license image bytes from R2.
  const r2 = new AwsClient({
    accessKeyId: r2AccessKeyId,
    secretAccessKey: r2SecretKey,
    service: "s3",
    region: "auto",
  });

  let imageBytes: Uint8Array;
  try {
    const obj = await fetchR2Object(r2, r2AccountId, r2Bucket, licenseKey);
    imageBytes = obj.bytes;
  } catch (err) {
    console.error("R2 fetch failed", err);
    return jsonResponse(500, { error: "failed to read license image" });
  }

  // Call Textract AnalyzeID. The API uses AWS JSON 1.1 protocol — POST to
  // the regional endpoint with a special header that names the operation.
  const textract = new AwsClient({
    accessKeyId: textractAccessKeyId,
    secretAccessKey: textractSecretKey,
    service: "textract",
    region: textractRegion,
  });

  const textractEndpoint = `https://textract.${textractRegion}.amazonaws.com/`;
  const textractBody = JSON.stringify({
    DocumentPages: [{ Bytes: bytesToBase64(imageBytes) }],
  });

  let textractRes: Response;
  try {
    textractRes = await textract.fetch(textractEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-amz-json-1.1",
        "X-Amz-Target": "Textract.AnalyzeID",
      },
      body: textractBody,
    });
  } catch (err) {
    console.error("Textract fetch failed", err);
    return jsonResponse(502, { error: "textract request failed" });
  }

  if (!textractRes.ok) {
    const text = await textractRes.text().catch(() => "");
    console.error("Textract error", textractRes.status, text);
    return jsonResponse(textractRes.status, {
      error: "textract analysis failed",
      detail: text,
    });
  }

  const raw = await textractRes.json() as TextractAnalyzeIdResponse;
  const fields = parseTextractFields(raw);
  const verdict = evaluateValidity(raw, fields);

  // Always return what we extracted so the client can show the user what we
  // saw on a failure ("we read DOB 2010-04-12 — does that look right?"). The
  // gate is the `valid` flag, not the presence of fields.
  if (verdict.valid) {
    return jsonResponse(200, { valid: true, fields, raw });
  }
  return jsonResponse(200, {
    valid: false,
    reason: verdict.reason,
    age: "age" in verdict ? verdict.age : undefined,
    fields,
    raw,
  });
});
