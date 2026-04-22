import { describe, expect, it, beforeEach, vi } from "vitest";
import { AuthError, verifyJwt, __resetJwksCacheForTests } from "../src/auth.ts";

// Generate a fresh ES256 keypair per test run. We sign JWTs with the private
// key and publish the public key as JWKS so verifyJwt has something to check
// against. This exercises the real WebCrypto path.

interface TestKeypair {
  privateKey: CryptoKey;
  publicJwk: JsonWebKey & { kid?: string };
  kid: string;
}

async function generateKeypair(kid: string): Promise<TestKeypair> {
  const kp = (await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const publicJwk = (await crypto.subtle.exportKey(
    "jwk",
    kp.publicKey,
  )) as JsonWebKey & { kid?: string };
  publicJwk.kid = kid;
  return { privateKey: kp.privateKey, publicJwk, kid };
}

function base64UrlEncode(data: Uint8Array | string): string {
  const bytes =
    typeof data === "string" ? new TextEncoder().encode(data) : data;
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function signJwt(
  kp: TestKeypair,
  payload: Record<string, unknown>,
  alg: string = "ES256",
): Promise<string> {
  const header = { alg, typ: "JWT", kid: kp.kid };
  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    kp.privateKey,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64UrlEncode(new Uint8Array(sig))}`;
}

const JWKS_URL = "https://example.com/auth/v1/.well-known/jwks.json";

function mockJwks(keys: JsonWebKey[]): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      if (input === JWKS_URL) {
        return new Response(JSON.stringify({ keys }), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    }),
  );
}

describe("verifyJwt", () => {
  beforeEach(() => {
    __resetJwksCacheForTests();
    vi.unstubAllGlobals();
  });

  it("accepts a valid ES256 token", async () => {
    const kp = await generateKeypair("k1");
    mockJwks([kp.publicJwk]);
    const token = await signJwt(kp, {
      sub: "user-a",
      aud: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 60,
    });
    const payload = await verifyJwt(token, JWKS_URL, "authenticated");
    expect(payload.sub).toBe("user-a");
  });

  it("rejects an expired token", async () => {
    const kp = await generateKeypair("k1");
    mockJwks([kp.publicJwk]);
    const token = await signJwt(kp, {
      sub: "user-a",
      aud: "authenticated",
      exp: Math.floor(Date.now() / 1000) - 60,
    });
    await expect(verifyJwt(token, JWKS_URL, "authenticated")).rejects.toThrow(
      /expired/,
    );
  });

  it("rejects a token signed by a different key", async () => {
    const kpGood = await generateKeypair("k1");
    const kpBad = await generateKeypair("k1"); // same kid, different material
    mockJwks([kpGood.publicJwk]);
    const token = await signJwt(kpBad, {
      sub: "user-a",
      aud: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 60,
    });
    await expect(verifyJwt(token, JWKS_URL, "authenticated")).rejects.toThrow(
      /invalid signature/,
    );
  });

  it("rejects unknown kid", async () => {
    const kpPublished = await generateKeypair("published");
    const kpOther = await generateKeypair("unknown");
    mockJwks([kpPublished.publicJwk]);
    const token = await signJwt(kpOther, {
      sub: "user-a",
      aud: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 60,
    });
    await expect(verifyJwt(token, JWKS_URL, "authenticated")).rejects.toThrow(
      /unknown kid/,
    );
  });

  it("rejects aud mismatch", async () => {
    const kp = await generateKeypair("k1");
    mockJwks([kp.publicJwk]);
    const token = await signJwt(kp, {
      sub: "user-a",
      aud: "some-other-audience",
      exp: Math.floor(Date.now() / 1000) + 60,
    });
    await expect(verifyJwt(token, JWKS_URL, "authenticated")).rejects.toThrow(
      /aud mismatch/,
    );
  });

  it("rejects non-ES256 alg (alg-confusion hardening)", async () => {
    const kp = await generateKeypair("k1");
    mockJwks([kp.publicJwk]);
    // Craft a token with alg=HS256 in header but actually signed ES256.
    const header = { alg: "HS256", typ: "JWT", kid: "k1" };
    const headerB64 = base64UrlEncode(JSON.stringify(header));
    const payloadB64 = base64UrlEncode(
      JSON.stringify({
        sub: "user-a",
        aud: "authenticated",
        exp: Math.floor(Date.now() / 1000) + 60,
      }),
    );
    const signingInput = `${headerB64}.${payloadB64}`;
    const sig = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      kp.privateKey,
      new TextEncoder().encode(signingInput),
    );
    const token = `${signingInput}.${base64UrlEncode(new Uint8Array(sig))}`;
    await expect(verifyJwt(token, JWKS_URL, "authenticated")).rejects.toThrow(
      /unsupported alg/,
    );
  });

  it("rejects malformed token", async () => {
    await expect(
      verifyJwt("not.a.jwt.too.many.parts", JWKS_URL, "authenticated"),
    ).rejects.toThrow(/malformed/);
    await expect(verifyJwt("only.two", JWKS_URL, "authenticated")).rejects
      .toThrow(/malformed/);
  });

  it("rejects missing sub claim", async () => {
    const kp = await generateKeypair("k1");
    mockJwks([kp.publicJwk]);
    const token = await signJwt(kp, {
      aud: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 60,
    });
    await expect(verifyJwt(token, JWKS_URL, "authenticated")).rejects.toThrow(
      /missing sub/,
    );
  });

  it("returns AuthError with status 401 for auth failures", async () => {
    const kp = await generateKeypair("k1");
    mockJwks([kp.publicJwk]);
    const token = await signJwt(kp, {
      sub: "user-a",
      aud: "authenticated",
      exp: Math.floor(Date.now() / 1000) - 60,
    });
    await verifyJwt(token, JWKS_URL, "authenticated").catch((err) => {
      expect(err).toBeInstanceOf(AuthError);
      expect(err.status).toBe(401);
    });
  });
});
