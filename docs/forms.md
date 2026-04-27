# Consent forms

Client-submitted tattoo consent forms (license + waiver + signature) reviewed and finalized by the artist. Single-form-template v1; configurable per-artist templates are a future addition.

The flow:

1. Client scans the artist's QR (links to `/#/consent/<artist user_id>`)
2. Client snaps their license — image uploads to R2, AWS Textract pre-fills name / DOB / address / etc.
3. Client confirms details, fills the waiver, signs, submits
4. Artist sees a badge on the Forms tab; the row lives in their review queue
5. Artist approves (and attaches to a booking — today / search older / create new) or rejects (hard-deletes row + R2 images)
6. Approved rows sit as `approved_pending` until the artist enters payment + tattoo location + description, which finalizes them

## Key files

- `src/pages/Forms.tsx` — list page grouped by status
- `src/pages/FormDetail.tsx` — review/approve/reject + finalize entry point
- `src/pages/ConsentSubmit.tsx` — public, unauthenticated multi-step client form (the QR target)
- `src/components/forms/SignaturePad.tsx` — canvas-based signature with finger-draw + "adopt typed name" modes
- `src/components/forms/BookingPickerDrawer.tsx` — today / search / create-new picker shown on approve
- `src/components/forms/FinalizeFormDrawer.tsx` — payment + location + description form for the `approved_pending → finalized` transition
- `src/stores/consentSubmissionStore.ts` — Zustand store with optimistic approve / reject / finalize
- `src/services/consentSubmissionService.ts` — Supabase client wrapper; `deleteConsentSubmission` calls the `consent-reject` edge fn so R2 images are purged alongside the row
- `supabase/migrations/00023_consent_submissions.sql` — table + RLS
- `supabase/functions/consent-upload-url/` — anon presigned R2 PUT URLs
- `supabase/functions/consent-submit/` — anon row insert with IP rate limit
- `supabase/functions/consent-analyze-id/` — Textract OCR on uploaded license
- `supabase/functions/consent-reject/` — auth'd row + R2 image purge

## Data flow

```
Client (anon)              Edge fn                       R2                Supabase
───────────────────────────────────────────────────────────────────────────────────
scan QR  →  /#/consent/:artistId
upload license  ─────►  consent-upload-url ─►  presigned PUT URL
                                                  ▲
                          PUT license bytes ──────┘
                                                                          R2: stored at
                                                                          consent/{artist}/
                                                                            {sub}/license.jpg
analyze  ───────────►  consent-analyze-id ─►  GETs license from R2,
                                              forwards bytes to AWS
                                              Textract.AnalyzeID,
                                              returns parsed fields

[client fills + signs locally]
                                            (signature uploads same way)

submit  ────────────►  consent-submit ─────────────────────────────►   INSERT row,
                       (rate-limited per IP)                            status=submitted

──────────────── (artist side, authenticated) ──────────────────────────────────────
review  ─────────────────────────────────────────────────────────►   SELECT (RLS-scoped)
approve  ────────────────────────────────────────────────────────►   UPDATE status,
                                                                      booking_id, approved_at
finalize ────────────────────────────────────────────────────────►   UPDATE payment_*,
                                                                      tattoo_*, finalized_at
reject   ────────────►  consent-reject  ─►  DELETE R2 objects     ►   DELETE row
```

## Supabase tables

- `consent_submissions` — single source of truth for submitted forms.
  - `user_id` — artist who owns the form (FK auth.users, ON DELETE CASCADE).
  - `status` — text CHECK enum: `submitted | approved_pending | finalized`. Reject = hard delete; no `rejected` value persists.
  - `booking_id` — set when artist approves; FK to `bookings(id) ON DELETE SET NULL`.
  - `license_*` columns — flat OCR'd fields plus `license_raw_data jsonb` for the full Textract response (so future field additions can backfill without re-OCR'ing).
  - `form_data jsonb` — checkboxes + free-text waiver answers. Loose schema by design — once configurable templates land, the field set will diverge per template.
  - `signature_image_key` — R2 key under `consent/{user_id}/{submission_id}/signature.png`.
  - `client_ip`, `client_user_agent` — captured by the `consent-submit` edge fn for audit / rate-limit counting.

RLS: artist can SELECT/UPDATE/DELETE their own rows (`(SELECT auth.uid()) = user_id`). No INSERT policy — public submissions go through the `consent-submit` edge fn using the service role.

## Edge functions

All deployed with `--no-verify-jwt`. The 4 consent-* functions all live under `supabase/functions/`. The 3 anonymous ones use the service-role client; the 1 authenticated one uses the user's JWT.

- `consent-upload-url` (anon) — `POST { artist_id, submission_id, kind, content_type, content_length }` → presigned R2 PUT URL for `consent/{artist_id}/{submission_id}/{kind}.{ext}`. Validates artist exists, enforces per-kind size + content-type limits.
- `consent-submit` (anon) — `POST { artist_id, submission_id, license, form_data, signature_image_key, license_raw_data }` → inserts row. IP rate-limited (3/hr counted against existing rows). Image keys are validated to live under the submission's R2 prefix.
- `consent-analyze-id` (anon) — `POST { artist_id, submission_id, license_key }` → calls AWS Textract `AnalyzeID` and returns `{ fields, raw }`. License key is constrained to the submission's path so a caller can only OCR images they uploaded.
- `consent-reject` (auth, artist) — `POST { id }` → deletes R2 license + signature blobs, then deletes the row. Replaces a plain DELETE so blobs don't orphan.

Required secrets (already set on dev for the existing R2 ones):
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`
- `AWS_TEXTRACT_REGION` (defaults to `us-east-1`), `AWS_TEXTRACT_ACCESS_KEY_ID`, `AWS_TEXTRACT_SECRET_ACCESS_KEY` — IAM user only needs `textract:AnalyzeID`.

## State

- `useConsentSubmissionStore` — submissions + isLoading + actions:
  - `fetchSubmissions(force?)` — TTL-cached fetch, called from `DataLoader` on idle
  - `getSubmission(id)`, `getSubmissionsByStatus(status)` — selectors
  - `approveSubmission(id, bookingId)` — optimistic `submitted → approved_pending`, rolls back on failure
  - `rejectSubmission(id)` — optimistic remove, calls `consent-reject` edge fn, rolls back on failure
  - `finalizeSubmission(id, fields)` — optimistic `approved_pending → finalized`, rolls back on failure
- Persisted with `name: 'inkbloop-consent-submissions'` so the queue survives app close.
- No realtime subscription yet — push notifications + live updates are deferred (an in-app badge on the Forms tab driven by `submissions.filter(s => s.status === 'submitted').length` covers the immediate need).

## QR + public route

`/#/consent/:artistId` lives outside `ProtectedRoute` and `DataLoader`. The artist's user_id is the slug for v1 — there's no separate slug field. Settings → "Consent forms" displays the QR (rendered client-side via `qrcode`) and the shareable URL with copy-to-clipboard.

## R2 layout

```
consent/{artist_user_id}/{submission_id}/license.{jpg|png|webp|heic|heif}
consent/{artist_user_id}/{submission_id}/signature.png
```

The `consent` prefix is wired into both the upload-url function and `workers/images/src/authz.ts` so the artist can read images via the existing CF Worker — same path-based per-user authz as `booking-images` and `documents`.

## Related docs

- [bookings.md](./bookings.md) — `consent_submissions.booking_id` references this
- [supabase.md](./supabase.md) — RLS / edge function conventions
- [deployment.md](./deployment.md) — secrets list, deploy order

## Gotchas

- **Public client flow runs without a Supabase session** — `consent-upload-url`, `consent-submit`, and `consent-analyze-id` are anonymous. They all use the service-role client and rely on path-based / FK-based / rate-limit checks instead of RLS. Adding new endpoints that touch `consent_submissions` from public code paths must follow the same pattern.
- **Orphaned R2 blobs on abandoned forms** — license + signature upload happens *before* `consent-submit`. If the user closes the tab between upload and submit, the R2 bytes stay forever. No cleanup job yet — accept it for v1.
- **Hash routing on the QR URL** — the URL is `inkbloop.com/#/consent/<id>`, not `inkbloop.com/consent/<id>`. The `#` is required (we use HashRouter). Don't strip it when generating QR codes.
- **`pendingConsentSubmissionId` handoff** — when the artist picks "Create new booking" from `BookingPickerDrawer`, that ID gets parked in `uiStore`. `BookingForm.handleSave` checks for it after a successful add and calls `approveSubmission` to attach the new booking + status-bump. Clearing it in the success path is essential — if you ever change the BookingForm flow, make sure that field still gets cleared.
- **Reject = destructive** — `rejectSubmission` is a hard delete in both DB and R2. There is no soft-delete or audit log of rejections. If the user wants that, it's net-new state.
