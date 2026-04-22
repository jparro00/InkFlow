import { AuthError, verifyJwt } from "./auth.ts";
import { authorizeKey } from "./authz.ts";
import { extractJwt } from "./cookie.ts";

export interface Env {
  IMAGES_BUCKET: R2Bucket;
  SUPABASE_JWKS_URL: string;
  EXPECTED_JWT_AUD: string;
  COOKIE_NAME: string;
}

// Cache-Control per prefix. Shorter for avatars since they change more.
const CACHE_CONTROL: Record<string, string> = {
  "avatars": "private, max-age=300",
  "booking-images": "private, max-age=3600",
  "documents": "private, max-age=3600",
};

function errorResponse(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method !== "GET" && req.method !== "HEAD") {
      return errorResponse(405, "method not allowed");
    }

    const url = new URL(req.url);
    // Strip leading slash. Keep everything after as the R2 key.
    const key = url.pathname.replace(/^\/+/, "");
    if (!key) return errorResponse(404, "missing key");

    const token = extractJwt(req, env.COOKIE_NAME);
    if (!token) return errorResponse(401, "missing credentials");

    let userId: string;
    try {
      const payload = await verifyJwt(
        token,
        env.SUPABASE_JWKS_URL,
        env.EXPECTED_JWT_AUD,
      );
      userId = payload.sub;
    } catch (err) {
      if (err instanceof AuthError) {
        return errorResponse(err.status, err.message);
      }
      return errorResponse(500, "auth verification failed");
    }

    try {
      authorizeKey(key, userId);
    } catch (err) {
      if (err instanceof AuthError) {
        return errorResponse(err.status, err.message);
      }
      throw err;
    }

    const object = await env.IMAGES_BUCKET.get(key);
    if (!object) return errorResponse(404, "not found");

    const prefix = key.split("/")[0];
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("ETag", object.httpEtag);
    headers.set(
      "Cache-Control",
      CACHE_CONTROL[prefix] ?? "private, max-age=60",
    );

    return new Response(req.method === "HEAD" ? null : object.body, {
      headers,
    });
  },
};
