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
  "consent": "private, max-age=3600",
};

// Origins allowed to fetch from the Worker. Requests send an Authorization
// header so the browser triggers a preflight OPTIONS — we must echo the
// origin back (not `*`) and advertise `authorization` in Allow-Headers.
const ALLOWED_ORIGINS = new Set([
  "http://localhost:5173",
  "http://localhost:4173",
  "https://inkbloop-dev.vercel.app",
  "https://inkbloop.com",
  "https://www.inkbloop.com",
]);

function corsHeaders(origin: string | null): Record<string, string> {
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function errorResponse(
  status: number,
  message: string,
  origin: string | null,
): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
    },
  });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = req.headers.get("Origin");

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      return errorResponse(405, "method not allowed", origin);
    }

    const url = new URL(req.url);
    const key = url.pathname.replace(/^\/+/, "");
    if (!key) return errorResponse(404, "missing key", origin);

    const token = extractJwt(req, env.COOKIE_NAME);
    if (!token) return errorResponse(401, "missing credentials", origin);

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
        return errorResponse(err.status, err.message, origin);
      }
      return errorResponse(500, "auth verification failed", origin);
    }

    try {
      authorizeKey(key, userId);
    } catch (err) {
      if (err instanceof AuthError) {
        return errorResponse(err.status, err.message, origin);
      }
      throw err;
    }

    const object = await env.IMAGES_BUCKET.get(key);
    if (!object) return errorResponse(404, "not found", origin);

    const prefix = key.split("/")[0];
    const headers = new Headers(corsHeaders(origin));
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
