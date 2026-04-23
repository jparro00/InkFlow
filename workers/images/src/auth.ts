import { base64UrlDecode, base64UrlDecodeToString } from "./base64.ts";

export interface JwtPayload {
  sub: string;
  exp: number;
  iat?: number;
  aud?: string | string[];
  role?: string;
  [key: string]: unknown;
}

interface Jwk {
  kid: string;
  kty: string;
  crv?: string;
  x?: string;
  y?: string;
  alg?: string;
  use?: string;
}

interface Jwks {
  keys: Jwk[];
}

interface JwksCacheEntry {
  jwks: Jwks;
  fetchedAt: number;
}

const JWKS_TTL_MS = 60 * 60 * 1000; // 1 h
const jwksCache = new Map<string, JwksCacheEntry>();

async function getJwks(jwksUrl: string): Promise<Jwks> {
  const cached = jwksCache.get(jwksUrl);
  if (cached && Date.now() - cached.fetchedAt < JWKS_TTL_MS) {
    return cached.jwks;
  }
  const resp = await fetch(jwksUrl, {
    cf: { cacheTtl: 3600, cacheEverything: true },
  });
  if (!resp.ok) {
    throw new AuthError(`JWKS fetch failed: ${resp.status}`, 500);
  }
  const jwks = (await resp.json()) as Jwks;
  jwksCache.set(jwksUrl, { jwks, fetchedAt: Date.now() });
  return jwks;
}

export class AuthError extends Error {
  constructor(message: string, public status: 401 | 403 | 500 = 401) {
    super(message);
  }
}

export async function verifyJwt(
  token: string,
  jwksUrl: string,
  expectedAud?: string,
): Promise<JwtPayload> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new AuthError("malformed JWT");

  const [headerB64, payloadB64, sigB64] = parts;

  let header: { alg: string; kid?: string; typ?: string };
  let payload: JwtPayload;
  try {
    header = JSON.parse(base64UrlDecodeToString(headerB64));
    payload = JSON.parse(base64UrlDecodeToString(payloadB64)) as JwtPayload;
  } catch {
    throw new AuthError("malformed JWT");
  }

  // Supabase issues ES256. Reject anything else to avoid alg-confusion attacks.
  if (header.alg !== "ES256") {
    throw new AuthError(`unsupported alg ${header.alg}`);
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp < now) {
    throw new AuthError("token expired");
  }
  if (typeof payload.sub !== "string" || payload.sub.length === 0) {
    throw new AuthError("missing sub claim");
  }
  if (expectedAud) {
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!aud.includes(expectedAud)) throw new AuthError("aud mismatch");
  }

  const jwks = await getJwks(jwksUrl);
  const jwk = header.kid
    ? jwks.keys.find((k) => k.kid === header.kid)
    : jwks.keys[0];
  if (!jwk) throw new AuthError("unknown kid");

  const publicKey = await crypto.subtle.importKey(
    "jwk",
    jwk as JsonWebKey,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );

  const signedData = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = base64UrlDecode(sigB64);

  const valid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    publicKey,
    signature,
    signedData,
  );
  if (!valid) throw new AuthError("invalid signature");

  return payload;
}

export function __resetJwksCacheForTests() {
  jwksCache.clear();
}
