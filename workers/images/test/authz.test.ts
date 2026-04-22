import { describe, it } from "vitest";
import { authorizeKey } from "../src/authz.ts";
import { AuthError } from "../src/auth.ts";

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";

function expectForbidden(fn: () => void, hint?: string) {
  try {
    fn();
  } catch (err) {
    if (err instanceof AuthError && err.status === 403) return;
    throw new Error(
      `expected AuthError 403${hint ? ` (${hint})` : ""}, got ${err}`,
    );
  }
  throw new Error(`expected throw${hint ? ` (${hint})` : ""}`);
}

describe("authorizeKey", () => {
  describe("booking-images", () => {
    it("allows own-user access", () => {
      authorizeKey(`booking-images/${USER_A}/booking-1/img.jpg`, USER_A);
    });

    it("rejects cross-user access", () => {
      expectForbidden(() =>
        authorizeKey(`booking-images/${USER_A}/booking-1/img.jpg`, USER_B),
      );
    });

    it("rejects missing user segment", () => {
      expectForbidden(() => authorizeKey("booking-images/img.jpg", USER_A));
    });

    it("rejects malformed user id", () => {
      expectForbidden(() =>
        authorizeKey("booking-images/not-a-uuid/img.jpg", USER_A),
      );
    });
  });

  describe("documents", () => {
    it("allows own-user access", () => {
      authorizeKey(`documents/${USER_A}/client-1/consent.pdf`, USER_A);
    });

    it("rejects cross-user access", () => {
      expectForbidden(() =>
        authorizeKey(`documents/${USER_A}/client-1/consent.pdf`, USER_B),
      );
    });

    it("rejects top-level file (no user segment)", () => {
      expectForbidden(() => authorizeKey("documents/fake.pdf", USER_A));
    });
  });

  describe("avatars", () => {
    it("allows any authenticated user", () => {
      authorizeKey("avatars/psid-123.jpg", USER_A);
      authorizeKey("avatars/psid-456.jpg", USER_B);
    });

    it("rejects empty avatar path", () => {
      expectForbidden(() => authorizeKey("avatars/", USER_A));
    });
  });

  describe("hardening", () => {
    it("rejects unknown prefix", () => {
      expectForbidden(() =>
        authorizeKey(`secrets/${USER_A}/keys.txt`, USER_A),
      );
    });

    it("rejects leading slash", () => {
      expectForbidden(() =>
        authorizeKey(`/booking-images/${USER_A}/img.jpg`, USER_A),
      );
    });

    it("rejects path traversal", () => {
      expectForbidden(() =>
        authorizeKey(`booking-images/${USER_A}/../${USER_B}/img.jpg`, USER_A),
      );
    });

    it("rejects URL-encoded traversal", () => {
      expectForbidden(() =>
        authorizeKey(`booking-images/${USER_A}/%2e%2e/other/img.jpg`, USER_A),
      );
    });

    it("rejects empty segments (double slash)", () => {
      expectForbidden(() =>
        authorizeKey(`booking-images//${USER_A}/img.jpg`, USER_A),
      );
    });

    it("rejects empty key", () => {
      expectForbidden(() => authorizeKey("", USER_A));
    });
  });
});
