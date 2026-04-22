// Client helpers for the R2-backed image storage.
//
// Uploads: mint a presigned PUT URL via the r2-upload-url edge fn, then PUT
// the blob directly to R2. Reads: resolve an R2 key to a Worker URL on
// images-*.inkbloop.com, which validates the JWT and streams from R2.
//
// See docs/r2-migration-plan.md.

import { supabase } from "./supabase";

const WORKER_URL = import.meta.env.VITE_R2_IMAGES_URL as string | undefined;

export function isR2Enabled(): boolean {
  return Boolean(WORKER_URL);
}

// Returns the full Worker URL for a given R2 key (e.g. "booking-images/<uid>/...").
// Returns null if VITE_R2_IMAGES_URL isn't set.
export function r2Url(key: string): string | null {
  if (!WORKER_URL) return null;
  return `${WORKER_URL.replace(/\/+$/, "")}/${key.replace(/^\/+/, "")}`;
}

// Fetches an R2 object as a Blob, using the current Supabase session JWT as a
// bearer token. Returns null on 404 or when R2 isn't configured.
export async function fetchR2Blob(key: string): Promise<Blob | null> {
  const url = r2Url(key);
  if (!url) return null;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (resp.status === 404) return null;
  if (!resp.ok) {
    throw new Error(`R2 fetch ${resp.status}: ${await resp.text()}`);
  }
  return resp.blob();
}

// Presigned-PUT upload flow. Returns true on success, false on any failure
// (caller decides whether to treat failure as fatal).
export async function uploadToR2(
  key: string,
  blob: Blob,
  contentType: string,
): Promise<boolean> {
  if (!isR2Enabled()) return false;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  // 1. Mint presigned PUT URL.
  const mintResp = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/r2-upload-url`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        key,
        content_type: contentType,
        content_length: blob.size,
      }),
    },
  );

  if (!mintResp.ok) {
    console.error("[r2] mint failed", mintResp.status, await mintResp.text());
    return false;
  }

  const { url, headers } = (await mintResp.json()) as {
    url: string;
    headers: Record<string, string>;
  };

  // 2. PUT blob directly to R2 with the exact headers we signed for.
  const putResp = await fetch(url, {
    method: "PUT",
    headers,
    body: blob,
  });

  if (!putResp.ok) {
    console.error("[r2] PUT failed", putResp.status, await putResp.text());
    return false;
  }
  return true;
}
