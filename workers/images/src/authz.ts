// Returns the object key (path inside the R2 bucket) or throws.
// Enforces prefix-based rules identical to the Supabase Storage policies this
// replaces. Unknown prefix → 403.
import { AuthError } from "./auth.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function authorizeKey(key: string, userId: string): void {
  if (key.length === 0) throw new AuthError("empty key", 403);

  // Reject traversal and leading-slash tricks before any prefix match.
  if (key.startsWith("/")) throw new AuthError("leading slash", 403);
  if (key.endsWith("/")) throw new AuthError("trailing slash", 403);
  if (key.includes("..")) throw new AuthError("path traversal", 403);
  if (key.includes("//")) throw new AuthError("empty segment", 403);
  if (key.includes("%2e") || key.includes("%2f") || key.includes("%2E") || key.includes("%2F")) {
    throw new AuthError("encoded traversal", 403);
  }

  const segments = key.split("/");
  const [prefix, ...rest] = segments;

  switch (prefix) {
    case "booking-images":
    case "documents":
    case "consent": {
      // Must be {prefix}/{user_id}/{remainder}.
      // For "consent", the user_id is the artist's id — clients submit
      // anonymously through an edge function that uploads on the artist's
      // behalf, but reads here are gated to the artist alone.
      if (rest.length < 2) throw new AuthError(`${prefix} key too short`, 403);
      const keyUser = rest[0];
      if (!UUID_RE.test(keyUser)) throw new AuthError("malformed user id", 403);
      if (keyUser !== userId) throw new AuthError("cross-user access", 403);
      return;
    }
    case "avatars": {
      // Any authenticated user. No per-user scoping (matches current RLS).
      if (rest.length === 0) throw new AuthError("avatar key too short", 403);
      return;
    }
    default:
      throw new AuthError(`unknown prefix ${prefix}`, 403);
  }
}
