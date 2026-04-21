# R2 migration plan

Plan for moving private image storage from Supabase Storage to Cloudflare R2. Written against the state of the codebase on branch `claude/evaluate-r2-storage-gBSpm`. Delete or move to `docs/archive/` once implemented.

## Goal

Move all private image/file storage off Supabase Storage to a Cloudflare R2 bucket served from a CF subdomain. Driver is egress cost — Supabase egress is about to tip over, and we haven't yet started storing full-size booking images, which will make the problem materially worse.

Non-goals:
- Redesigning the image pipeline (thumbnails, IndexedDB cache, sync queue all stay).
- Replacing Supabase Auth, DB, or Realtime.
- Changing the `documents` or `booking_images` schema beyond what a new backend requires.

## Architecture

```
┌─────────┐   presigned PUT   ┌────────────┐
│ Browser │ ────────────────▶ │     R2     │
│         │                   │   bucket   │
│         │ ◀──────────────── │            │
└────┬────┘   response.ok     └────▲───────┘
     │                             │ (origin fetch via binding)
     │   POST /upload-url          │
     ▼                             │
┌──────────────────────┐     ┌────────────────┐
│ Supabase edge fn     │     │  CF Worker on  │
│ r2-upload-url        │     │ images.inkbloop│
│ (mints presigned PUT)│     │     .com       │
└──────────────────────┘     └────▲───────────┘
                                  │ GET /{bucket}/{key}
                                  │ (JWT cookie or header)
                             ┌────┴────┐
                             │ Browser │
                             └─────────┘
```

**Two separate minting paths, not one.** Uploads use a Supabase edge function that mints a presigned PUT URL. Reads go through a Cloudflare Worker that validates a Supabase JWT, enforces key-ownership, and streams from R2 via a Worker binding. This gets us real CF edge caching (no presigned-URL query string fragmentation) and avoids cold-start latency on the read hot path.

**One bucket, `inkbloop-storage`, with key prefixes for each file type.** Prefixes: `booking-images/{user_id}/...`, `documents/{user_id}/...`, `avatars/...`. Matches the current Supabase bucket structure so we don't have to rethink paths.

**Subdomain**: `images.inkbloop.com` (CF-proxied), bound to the Worker. R2 origin is never exposed publicly.

## Data model changes

None. Every storage-backed column already stores a path/key, not a URL:

- `booking_images.remote_path`
- `documents.storage_path`
- `participant_profiles.profile_pic` (path for new rows, legacy base64 for old)

Paths as-written today (`{user_id}/{booking_id}/{image_id}.{ext}`, etc.) remain valid; we just prepend a bucket prefix at read time.

Optional (post-cutover): add a `storage_backend` column (`'supabase' | 'r2'`) to `booking_images` and `documents` so the frontend knows which URL resolver to use during rollout. Drop the column after backfill completes.

## Auth model

**JWT verification in the Worker.** Supabase uses ES256 JWTs; CF Workers verify ES256 via WebCrypto. The Worker fetches Supabase's JWKS once per cold start (cached in Worker memory + KV for ~1 h) and verifies the token on every request.

**Transport**: two paths, both supported.
1. `<img src="https://images.inkbloop.com/...">` — relies on a cookie set on `.inkbloop.com` by the frontend after login. This is the common case (message list avatars, booking thumbnails).
2. `Authorization: Bearer <jwt>` header for fetches that can set headers (anything we do from JS explicitly, e.g. `fetch(url).then(r => r.blob())` in `useBookingImages`).

The cookie path requires the Supabase JWT to be readable from the main domain and set with `Domain=.inkbloop.com; Secure; SameSite=Lax`. Frontend writes the cookie on login, refreshes it on token refresh, clears it on sign-out.

**Authorization rules per prefix** (enforced in the Worker):

| Prefix | Rule |
|--------|------|
| `booking-images/{u}/...` | JWT `sub` must equal `{u}` |
| `documents/{u}/...` | JWT `sub` must equal `{u}` |
| `avatars/...` | JWT must be valid (any authenticated user); matches current RLS |

Rules live in one ~30-line function with unit tests. Unknown prefix → 403.

## Uploads

Supabase edge function `r2-upload-url`:

- Input: `{ bucket_prefix, key, content_type, content_length }`.
- Validates the user via `supabase.auth.getUser(bearer)`.
- Enforces the same prefix rules as the Worker (`booking-images/{sub}/...`, etc.).
- Signs a presigned PUT URL (V4 S3 sig, 5-minute TTL) using AWS SDK for S3 pointed at R2.
- Returns `{ url, headers, expires_at }`.

Client flow (replaces direct `supabase.storage.upload`):
1. Compute key as today.
2. `POST /functions/v1/r2-upload-url` → `{ url, headers }`.
3. `PUT url` with the blob and returned headers.
4. On success, write metadata row to Supabase as today.

For small files (avatars, documents under ~5 MB) single PUT is fine. For full-size booking images we may hit multipart territory (>~5 MB on flaky connections). Add multipart support in a second pass — not day 1.

## Call sites to change

All in `src/`:

| File | What changes |
|------|-------------|
| `src/services/documentService.ts:44-88` (`uploadDocument`) | Replace `supabase.storage.from('documents').upload(...)` with the presigned-PUT flow |
| `src/services/documentService.ts:90-101` (`deleteDocument`) | Replace storage remove with a DELETE to the Worker (or edge fn) that deletes by key |
| `src/services/documentService.ts:103-117` (`getDocumentUrl`, `getSignedUrl`) | Return `https://images.inkbloop.com/documents/{path}` — no signing needed, Worker handles auth |
| `src/services/messageService.ts:349-416` (`resolveAvatarUrls`) | Replace `createSignedUrls` batch call with a simple map to `https://images.inkbloop.com/avatars/{path}`. Can drop the URL cache entirely — Worker response is edge-cached |
| `src/hooks/useBookingImages.ts:44-61, 146-154` | Replace `supabase.storage.from('booking-images').download(path)` with `fetch('https://images.inkbloop.com/booking-images/{path}', { credentials: 'include' })` |
| `src/lib/imageSync.ts:40-56` | Replace direct upload with the presigned-PUT flow |
| `supabase/functions/sim-api/index.ts` (avatar upload path) | See "Simulator" below |

Downstream: `resolveAvatarUrls` becomes trivial enough to inline or shrink substantially. The 20-h signed URL cache (`signedUrlCache` at messageService.ts:345-347) goes away.

## Simulator

`sim-api` uploads avatar bytes server-side into the `avatars` bucket using the service role (supabase/functions/sim-api/index.ts). Options:

1. **Cleanest**: give `sim-api` an R2 access key and have it PUT directly via the S3 API. Adds one dependency but keeps a single source of truth for avatar storage.
2. **Quickest**: leave `sim-api` writing to Supabase `avatars` bucket, keep a shim in the Worker that falls back to Supabase Storage if the key isn't found in R2. Ugly but unblocks the main-app migration.

Recommendation: option 1, but only in the third phase (after booking-images and documents are on R2 and we're confident in the pattern).

## Migration phases

Each phase is independently deployable and reversible.

### Phase 1 — infra (no user-visible change)
- Create R2 bucket `inkbloop-storage` in dev and prod CF accounts.
- Attach `images.inkbloop.com` (and a dev subdomain) via R2 custom domain + Worker route.
- Build the Worker:
  - JWT verification via JWKS.
  - Prefix-based authorization.
  - Cookie + header support.
  - Integration tests (own-user 200, cross-user 403, no-JWT 401, expired-JWT 401, unknown-prefix 403).
- Build the `r2-upload-url` Supabase edge function.
- Deploy both to dev. No frontend changes yet.

### Phase 2 — booking-images cutover
Biggest egress driver; start here. Approach: shadow-write, lazy-read.

- Modify `imageSync.ts` to PUT to both Supabase Storage and R2 (shadow write). Mark new rows with `storage_backend = 'r2'`.
- Modify `useBookingImages.ts` to read from R2 if the row is `storage_backend = 'r2'`, else Supabase Storage.
- Run for ~2 days. Monitor error rate in Sentry / logs.
- Backfill: one-shot script (`scripts/backfill-r2.ts`) that reads every old row, copies blob from Supabase Storage to R2, updates `storage_backend = 'r2'`. Idempotent; re-runnable.
- Flip shadow-write to R2-only. Keep Supabase Storage blobs for ~30 days in case of rollback, then delete.

### Phase 3 — documents cutover
Same pattern. Smaller dataset, so backfill is faster. Includes the `getPublicUrl` → Worker URL swap.

### Phase 4 — avatars cutover + simulator
- Migrate `sim-api` to write to R2 (option 1 above).
- Backfill existing avatars.
- Swap `resolveAvatarUrls` to emit Worker URLs.

### Phase 5 — cleanup
- Drop `storage_backend` column.
- Delete Supabase buckets (after verifying no reads for 30 days).
- Delete Supabase Storage RLS policies (migrations 00001 lines 173–215, 00015) via a new migration that explicitly drops them (migrations are append-only per supabase/CLAUDE.md).
- Archive this plan doc.

## Security review checklist

Before Phase 2 ships to prod:

- [ ] JWT signature verification tested with a token signed by a *different* JWKS (must 401).
- [ ] JWT expiry checked (`exp` claim) — expired token must 401 even if signature valid.
- [ ] Cross-user access tested with two real user accounts in dev (must 403).
- [ ] Key parser rejects `..`, leading `/`, URL-encoded path segments, and empty segments.
- [ ] `documents/` prefix rejects keys with fewer than 3 segments (prevents `documents/fake.pdf` leaking past user-id check).
- [ ] R2 bucket public access is OFF; only the Worker binding can read.
- [ ] R2 access keys scoped to a single bucket, not account-wide.
- [ ] Upload-URL edge fn rejects `content_length` above a hard cap (e.g. 20 MB booking image, 10 MB document, 1 MB avatar).
- [ ] Upload-URL edge fn restricts `content_type` to an allowlist.
- [ ] Worker logs denied requests with user_id + key + reason, no PII beyond that, no full JWTs.
- [ ] Cookie is `HttpOnly; Secure; SameSite=Lax` and its TTL matches or is shorter than the JWT.

## Risks and open questions

**RLS backstop loss.** Today a bug in our storage-key construction is caught by Postgres RLS. Post-migration, the Worker is the only check. Mitigations: prefix-based rules are dead simple, all three paths exercised by cross-user integration tests in CI, Worker deploys go through preview environments before prod. Still, the blast radius of a Worker bug is wider than an RLS policy. Not a blocker but worth naming.

**Cookie vs header choice.** Going cookie-first means the frontend has to manage an extra cookie (write, refresh, clear). It also means we rely on CORS/cookie behaviour being consistent across Safari / iOS standalone PWA / desktop browsers. Header-only is simpler but forces every `<img>` to route through a blob fetch, which breaks lazy loading and doubles the memory footprint. **Open question**: do we start cookie-first or spend a week validating cookie behaviour across platforms before committing?

**Backfill concurrency.** Naive backfill is one-at-a-time. If we have thousands of booking images, the script needs parallelism (e.g. p-limit at 10). Not hard; worth budgeting a day for the script alone.

**Signed-URL cache semantics change.** Today `resolveAvatarUrls` caches 24-h signed URLs to avoid re-signing. With the Worker, every `<img>` request hits CF edge cache directly. Performance should be equivalent or better, but the observable behaviour (how long a stale avatar appears after an update) is now controlled by `Cache-Control` headers the Worker sets, not by the client-side Map. Worth setting an explicit `max-age` per prefix: avatars `300` (5 min), booking/document images `3600` (1 h), all `private`.

**Simulator split risk during Phase 2/3.** If `sim-api` keeps writing to Supabase `avatars` while the main app reads from R2, we'd need a fallback. We avoid this by keeping avatars on Supabase until Phase 4.

**R2 region.** R2 buckets are created in a single jurisdiction (automatic but you pick hint). For a tattoo shop app that will likely stay regional, `wnam` / `enam` / `eu` default works. Confirm with the user which region matches their customers.

**Cost model.** R2 is $0.015/GB/month storage, $0 egress, but $4.50/million class A ops (PUT/POST) and $0.36/million class B ops (GET/HEAD). For a 1-artist account with ~50 new images/day × 2 PUTs (upload + thumbnail), class A cost is trivial. Reads through CF edge cache don't count as R2 B ops after the first origin fetch. Expected monthly: well under $1 per active artist.

## Related docs

- [supabase.md](./supabase.md) — current backend layout
- [bookings.md](./bookings.md) — booking images pipeline
- [clients.md](./clients.md) — documents (client consent forms)
- [messaging.md](./messaging.md) — avatars
- [deployment.md](./deployment.md) — deploy order and env conventions
- [simulator.md](./simulator.md) — sim-api avatar upload path
