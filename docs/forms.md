# Consent forms

Client-submitted tattoo consent forms (license + waiver + signature + signed PDF) reviewed and finalized by the artist. Single-form-template v1; configurable per-artist templates are a future addition.

The flow:

1. Client scans the artist's QR (links to `/#/consent/<artist user_id>`)
2. **Disclosure step** — client reads the ESIGN consumer disclosure (right to paper copy, right to withdraw, scope) and explicitly affirms before any data is collected
3. Client snaps their license — image uploads to R2, AWS Textract pre-fills name / DOB / address / etc. The upload-url response also echoes back `client_ip` + `client_user_agent` (what the edge fn saw) so the client can embed them in the PDF later
4. Client confirms identity, enters tattoo location + description, ticks the waiver
5. **Review and sign step** — the consent PDF is generated client-side from current state and rendered in an iframe. The client sees the document, signs in the pad below, and watches their signature appear in the PDF in real time
6. Client taps "Adopt and Sign" — the SAME bytes they were viewing get hashed (SHA-256), uploaded to R2, and recorded on the row
7. Client gets a "Download a copy" link on the thanks screen
8. Artist sees a badge on the Forms tab; the row lives in their review queue
9. Artist approves (and attaches to a booking) or rejects (hard-deletes row + R2 license + signature + PDF)
10. Approved rows sit as `approved_pending` until the artist enters payment, which finalizes them

The PDF is the legal record. Structured fields (license_*, tattoo_*, form_data, signature_image_key) live on the row for queryability, but the PDF — embedded signature, all consent statements with their checked/unchecked state, audit metadata in the info dict, integrity hash on the row — is what the artist downloads, hands to the client, and archives for retention.

**Tamper detection:** `consent_submissions.pdf_sha256` stores the hex SHA-256 the client computed at sign time. The artist (or any forensic check) can re-hash the R2 blob and compare; mismatch means the file was modified after upload.

**What the client sees vs. what gets stored.** The PDF rendered in the iframe before signing and the PDF that gets uploaded are produced by the same code path (`buildConsentPdfBytes`). The only differences: `finalize:true` flips the visible footer from "Document not yet signed." to "Signed [date].", and adds the audit metadata (IP, UA, timezone, signed timestamp, submission_id) to the PDF info dict's Keywords field. Everything visible above the footer is byte-identical between preview and final.

## Legal compliance (US, adults only)

This is informational; the artist is responsible for confirming they meet their state's tattoo-consent rules. We are deliberately scoped to:
- **U.S. only** — no GDPR / EU-AdES / qualified e-signature requirements implemented.
- **Adults only** — `age_18_plus` is a required waiver checkbox; we don't collect parental consent or guardian fields.

### Federal framework

Two laws give electronic signatures the same legal weight as wet signatures for most consumer transactions:

- **ESIGN Act (2000)** — Electronic Signatures in Global and National Commerce Act. Federal.
- **UETA (Uniform Electronic Transactions Act)** — adopted by 49 states (NY uses ESRA, which is functionally equivalent).

For an electronic signature to be legally enforceable, both frameworks require:

1. **Intent to sign** — the signer takes a deliberate action to apply a signature.
2. **Consent to do business electronically** — affirmative agreement to sign electronically, with right to withdraw consent and right to receive a paper copy.
3. **Association of signature with the record** — the signature must be logically connected to the document being signed.
4. **Record retention** — the signed record must be retained, reproducible, and accessible to all parties.
5. **Authentication / attribution** — evidence linking the signature to the signer (audit trail: timestamp, IP, device).

ESIGN §7001(c) goes further on element 2 — the disclosure must be presented BEFORE consent is obtained, must cover scope, right to paper, right to withdraw, and must be obtained in a manner that demonstrates the consumer can access the electronic form. We satisfy this with the dedicated `disclosure` wizard step (see `src/components/forms/ConsentDisclosure.tsx`).

How our flow satisfies each element:

| Element | Implementation |
|---|---|
| Intent to sign | Explicit signature pad (draw or adopt-typed) + a button labeled "Adopt and Sign" that triggers the finalization. The client must produce a signature on the pad; an empty pad blocks the button. The button label uses an action verb tied to the document, not generic "Submit." |
| Consent to do business electronically | Dedicated `disclosure` wizard step before any data collection. Covers electronic-records consent, right to paper copy, right to withdraw, scope ("this form only"). Required affirmative checkbox ("I have read this disclosure and consent…") gates Continue. Hardware/software statement is omitted — the consumer is completing the disclosure on the same device that displays the PDF, which under §7001(c)(1)(C)(ii) reasonably demonstrates capability. |
| Association | The signature image is embedded directly in the signed PDF as part of the signature box rectangle. The PDF the user previews and the PDF that gets uploaded are produced by the SAME code path (`buildConsentPdfBytes`) — no "regenerate after submit" gap. The row also stores `signature_image_key` and `pdf_key` pointing at the same submission prefix in R2. |
| Record retention | The signed PDF is stored at `consent/{artist}/{submission}/consent.pdf` in R2 indefinitely. The artist downloads from the review drawer; the client downloads from the thanks screen. **Integrity:** `pdf_sha256` on the row lets anyone re-hash the R2 blob to detect tampering. **Future work:** email the PDF to the client (see "Future work" section) — currently the client has only the thanks-screen download window. |
| Authentication | (a) Government photo ID captured live + Textract OCR'd; (b) Server-side `client_ip` (from `cf-connecting-ip`) + `client_user_agent` captured by `consent-submit` and stored on the row; (c) Same audit fields embedded in the PDF info dict's Keywords field as a JSON blob (`signed_at`, `timezone`, `client_ip`, `user_agent`, `signer_name`, `submission_id`); (d) Visible footer carries only the signed date for readability. The PDF therefore travels with its audit trail. |

### Tattoo-specific (state level)

State tattoo statutes vary, but the common floor is:
- Age verification (18+) — required waiver item.
- Risk acknowledgment, aftercare, no-influence attestation — covered by the standard waiver items.
- Records retention — typically 1–7 years depending on state. **The artist should confirm their state's retention period; the PDF is the record.**

The waiver list is hard-coded for v1. When configurable per-artist templates land, the field set will diverge — `form_data` is intentionally `jsonb` to absorb that without a schema change.

## Key files

- `src/pages/Forms.tsx` — list page grouped by status
- `src/pages/FormDetail.tsx` — review/approve/reject + finalize entry point
- `src/pages/ConsentSubmit.tsx` — public, unauthenticated multi-step client form (the QR target). Five content steps: disclosure → snap_id → fill_form → review_and_sign → done. Live PDF preview rebuilt on every state change in review_and_sign; final bytes are hashed and uploaded as-seen.
- `src/components/forms/ConsentDisclosure.tsx` — ESIGN §7001(c) consumer disclosure step.
- `src/components/forms/ConsentPDF.tsx` — pdf-lib document builder + SHA-256 hasher. `buildConsentPdfBytes(data, opts)` is the single PDF code path used for both live preview and final signing; `sha256Hex(bytes)` produces the integrity hash. Hard-coded white background + black text. No external fonts (StandardFonts.Helvetica + HelveticaBold only).
- `src/components/forms/ConsentForm.tsx` — artist's review-side renderer. Shows the license image (toggleable) + an inline PDF preview that opens fullscreen on tap.
- `src/components/forms/ConsentFormSections.tsx` — shared form sections (license image, license fields, tattoo details, waiver checks). Each supports `fill` mode for the public wizard. Signature lives in `review_and_sign`, not in this set.
- `src/components/forms/CameraCapture.tsx` — in-page camera (getUserMedia) for the license photo.
- `src/components/forms/SignaturePad.tsx` — canvas-based signature with finger-draw + "adopt typed name" modes; outputs PNG (black ink on white background).
- `src/components/forms/BookingPickerDrawer.tsx` — today / search / create-new picker shown on approve
- `src/components/forms/FinalizeFormDrawer.tsx` — payment-only sheet (used to also collect tattoo location/description; those moved to the client wizard with the PDF redesign)
- `src/stores/consentSubmissionStore.ts` — Zustand store with optimistic approve / reject / finalize
- `src/services/consentSubmissionService.ts` — Supabase client wrapper; `deleteConsentSubmission` calls the `consent-reject` edge fn so R2 blobs are purged alongside the row
- `supabase/migrations/00023_consent_submissions.sql` — table + RLS
- `supabase/migrations/00025_consent_submissions_pdf_key.sql` — adds `pdf_key` column for the signed PDF
- `supabase/migrations/00026_consent_submissions_pdf_sha256.sql` — adds `pdf_sha256` for integrity verification
- `supabase/functions/consent-upload-url/` — anon presigned R2 PUT URLs (now also for `kind=pdf`); echoes `client_ip` + `client_user_agent` back so the wizard can embed them in the PDF audit metadata
- `supabase/functions/consent-submit/` — anon row insert with IP rate limit; persists `pdf_key`, `pdf_sha256`, `tattoo_location`, `tattoo_description`
- `supabase/functions/consent-analyze-id/` — Textract OCR on uploaded license
- `supabase/functions/consent-reject/` — auth'd row + R2 license/signature/PDF purge

## Data flow

```
Client (anon)              Edge fn                       R2                Supabase
───────────────────────────────────────────────────────────────────────────────────
scan QR  →  /#/consent/:artistId
[disclosure step — explicit ESIGN consent before any data is collected]

upload license  ─────►  consent-upload-url ─►  presigned PUT URL
                       (returns client_ip   ▲
                        + UA)               │
                          PUT license bytes ─┘
                                                                          R2: stored at
                                                                          consent/{artist}/
                                                                            {sub}/license.jpg
analyze  ───────────►  consent-analyze-id ─►  GETs license from R2,
                                              forwards bytes to AWS
                                              Textract.AnalyzeID,
                                              returns parsed fields

[fill_form: client confirms identity + tattoo + waiver]

[review_and_sign: pdf-lib builds the consent PDF live in-browser from
 current state. Signature pad below; every stroke triggers a PDF rebuild
 so the user watches their signature appear in the document.]

upload signature  ──►  consent-upload-url ─►  presigned PUT URL
                                                  ▲
                          PUT signature bytes ────┘

[client-side: build FINAL PDF bytes via buildConsentPdfBytes(..., {finalize:true});
 SHA-256 hash via crypto.subtle; the SAME bytes the user was viewing get hashed.]

upload pdf  ────────►  consent-upload-url ─►  presigned PUT URL
                                                  ▲
                              PUT pdf bytes ──────┘
                                                                          R2: stored at
                                                                          consent/{artist}/
                                                                            {sub}/consent.pdf

submit  ────────────►  consent-submit ─────────────────────────────►   INSERT row,
                       (rate-limited per IP)                            status=submitted,
                                                                        pdf_sha256 +
                                                                        client_ip + UA stamped

──────────────── (artist side, authenticated) ──────────────────────────────────────
review  ─────────────────────────────────────────────────────────►   SELECT (RLS-scoped)
                       (drawer fetches PDF + license via images worker)
approve  ────────────────────────────────────────────────────────►   UPDATE status,
                                                                      booking_id, approved_at
finalize ────────────────────────────────────────────────────────►   UPDATE payment_*,
                                                                      finalized_at
reject   ────────────►  consent-reject  ─►  DELETE R2 license+sig+pdf  ►   DELETE row
```

## Supabase tables

- `consent_submissions` — single source of truth for submitted forms.
  - `user_id` — artist who owns the form (FK auth.users, ON DELETE CASCADE).
  - `status` — text CHECK enum: `submitted | approved_pending | finalized`. Reject = hard delete; no `rejected` value persists.
  - `booking_id` — set when artist approves; FK to `bookings(id) ON DELETE SET NULL`.
  - `license_*` columns — flat OCR'd fields plus `license_raw_data jsonb` for the full Textract response (so future field additions can backfill without re-OCR'ing).
  - `form_data jsonb` — checkboxes + free-text waiver answers. Loose schema by design — once configurable templates land, the field set will diverge per template.
  - `signature_image_key` — R2 key under `consent/{user_id}/{submission_id}/signature.png`.
  - `pdf_key` — R2 key for the signed PDF under `consent/{user_id}/{submission_id}/consent.pdf`. Nullable; older rows submitted before the PDF redesign won't have one.
  - `tattoo_location`, `tattoo_description` — **client-entered during the wizard** (was artist-entered until the PDF redesign). Stored on the row for queryability; the binding record is the PDF.
  - `payment_type`, `payment_amount` — artist-entered post-tattoo for bookkeeping. Filled in via `FinalizeFormDrawer`.
  - `client_ip`, `client_user_agent` — captured by the `consent-submit` edge fn for ESIGN audit trail / rate-limit counting.

RLS: artist can SELECT/UPDATE/DELETE their own rows (`(SELECT auth.uid()) = user_id`). No INSERT policy — public submissions go through the `consent-submit` edge fn using the service role.

## Edge functions

All deployed with `--no-verify-jwt`. The 4 consent-* functions all live under `supabase/functions/`. The 3 anonymous ones use the service-role client; the 1 authenticated one uses the user's JWT.

- `consent-upload-url` (anon) — `POST { artist_id, submission_id, kind, content_type, content_length }` → presigned R2 PUT URL for `consent/{artist_id}/{submission_id}/{kind}.{ext}`. Validates artist exists, enforces per-kind size + content-type limits. `kind` is one of `license | signature | pdf`.
- `consent-submit` (anon) — `POST { artist_id, submission_id, license, form_data, signature_image_key, pdf_key, tattoo_location, tattoo_description, license_raw_data }` → inserts row. IP rate-limited (3/hr counted against existing rows). All R2 keys are validated to live under the submission's prefix.
- `consent-analyze-id` (anon) — `POST { artist_id, submission_id, license_key }` → calls AWS Textract `AnalyzeID` and returns `{ fields, raw }`. License key is constrained to the submission's path so a caller can only OCR images they uploaded.
- `consent-reject` (auth, artist) — `POST { id }` → deletes R2 license + signature + PDF blobs, then deletes the row. Replaces a plain DELETE so blobs don't orphan.

Required secrets (already set on dev for the existing R2 ones):
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`
- `AWS_TEXTRACT_REGION` (defaults to `us-east-1`), `AWS_TEXTRACT_ACCESS_KEY_ID`, `AWS_TEXTRACT_SECRET_ACCESS_KEY` — IAM user only needs `textract:AnalyzeID`.

## State

- `useConsentSubmissionStore` — submissions + isLoading + actions:
  - `fetchSubmissions(force?)` — TTL-cached fetch, called from `DataLoader` on idle
  - `getSubmission(id)`, `getSubmissionsByStatus(status)` — selectors
  - `approveSubmission(id, bookingId)` — optimistic `submitted → approved_pending`, rolls back on failure
  - `rejectSubmission(id)` — optimistic remove, calls `consent-reject` edge fn, rolls back on failure
  - `finalizeSubmission(id, fields)` — optimistic `approved_pending → finalized`, rolls back on failure. `fields` is `{ payment_type, payment_amount }` only — tattoo details are client-entered.
- Persisted with `name: 'inkbloop-consent-submissions'` so the queue survives app close.
- Realtime: `startRealtime` subscribes to `postgres_changes` on `consent_submissions` filtered by the artist's `user_id`. Insert/update/delete events flow into the store.

## Settings

Settings → Consent forms exposes:
- **Studio / artist name** — localStorage `inkbloop-studio-name`. Shown at the top of every generated PDF. Empty falls back to a generic "Tattoo studio" header. Will move to a profile/template table when configurable templates land.
- **QR code + shareable URL** — for the public client flow.

## QR + public route

`/#/consent/:artistId` lives outside `ProtectedRoute` and `DataLoader`. The artist's user_id is the slug for v1 — there's no separate slug field. Settings → "Consent forms" displays the QR (rendered client-side via `qrcode`) and the shareable URL with copy-to-clipboard.

## R2 layout

```
consent/{artist_user_id}/{submission_id}/license.{jpg|png|webp|heic|heif}
consent/{artist_user_id}/{submission_id}/signature.png
consent/{artist_user_id}/{submission_id}/consent.pdf
```

The `consent` prefix is wired into both the upload-url function and `workers/images/src/authz.ts` so the artist can read images via the existing CF Worker — same path-based per-user authz as `booking-images` and `documents`. The image worker is content-type-agnostic; PDF reads ride the same path as image reads.

## Future work

These are known gaps with deliberate v1 deferrals — flagging here so they aren't lost.

- **Email the signed PDF to the client.** Today the client has exactly one window to download (the thanks screen). Once they navigate away, R2 is auth-gated to the artist and the only way to get a copy is to ask the studio. UETA §12(d) is technically satisfied via the studio-on-request path, but emailing the PDF closes the gap properly. Add an optional email field to `fill_form`, send via Resend (`RESEND_API_KEY` already in secrets) on insert, with the PDF as an attachment.
- **Privacy policy page.** CalOPPA requires any commercial site collecting PII from CA residents to post a privacy policy. Add a `/privacy` route on the app (artist + public) covering what we collect, how it's stored, retention, and contact. Not required by the consent flow itself but required by the app overall.
- **Configurable consent templates per artist.** The single hardcoded waiver list lives in `consentFormSchema.ts`. When templates land, `form_data` (jsonb) absorbs the per-template field set; pdf-lib's coordinate-based layout will need a layout descriptor (also stored per template) so the PDF reflects the custom waivers.
- **Artist-side integrity check button.** The `pdf_sha256` column is set today but there's no UI for the artist to verify a PDF in R2 matches it. A "Verify integrity" button in the drawer that re-fetches the blob, hashes it, and shows ✓/✗ would make the tamper detection visible.
- **PDF retention period commitment in the disclosure.** Right now the disclosure says "the studio may retain your signed form for several years per state law" implicitly. Once a concrete retention policy is decided per studio, surface that period in the disclosure copy.

## Related docs

- [bookings.md](./bookings.md) — `consent_submissions.booking_id` references this
- [supabase.md](./supabase.md) — RLS / edge function conventions
- [deployment.md](./deployment.md) — secrets list, deploy order

## Gotchas

- **Public client flow runs without a Supabase session** — `consent-upload-url`, `consent-submit`, and `consent-analyze-id` are anonymous. They all use the service-role client and rely on path-based / FK-based / rate-limit checks instead of RLS. Adding new endpoints that touch `consent_submissions` from public code paths must follow the same pattern.
- **PDF is generated client-side** — server-side IP isn't visible at render time, so the audit footer on the PDF carries client-known fields only (timestamp, timezone, user agent). The DB row carries `client_ip` from the edge fn for the full audit trail.
- **PDF download is the only way for clients to keep a copy** — R2 reads are auth-gated to the artist (the images worker validates the JWT against the path's user_id). The public consent page keeps the local Blob URL alive after submit so the thanks screen can offer a download; once the user navigates away that URL is revoked and the copy is gone (they'd have to ask the artist for a paper copy).
- **Orphaned R2 blobs on abandoned forms** — license + signature + PDF uploads happen *before* `consent-submit`. If the user closes the tab between uploads and submit, the R2 bytes stay forever. No cleanup job yet — accept it for v1.
- **Hash routing on the QR URL** — the URL is `inkbloop.com/#/consent/<id>`, not `inkbloop.com/consent/<id>`. The `#` is required (we use HashRouter). Don't strip it when generating QR codes.
- **`pendingConsentSubmissionId` handoff** — when the artist picks "Create new booking" from `BookingPickerDrawer`, that ID gets parked in `uiStore`. `BookingForm.handleSave` checks for it after a successful add and calls `approveSubmission` to attach the new booking + status-bump.
- **Reject = destructive** — `rejectSubmission` is a hard delete in both DB and R2 (license + signature + PDF). There is no soft-delete or audit log of rejections. If the user wants that, it's net-new state.
- **Bundle size on the public page** — pdf-lib adds ~180 KB gzip to the `ConsentSubmit` chunk. It's not loaded on the artist's main app — only the public consent page sees it. Don't hoist it into a shared chunk by importing it from artist-side code.
- **Live PDF preview rebuild rate** — every state change in `review_and_sign` (waiver tick, signature stroke) rebuilds the PDF and swaps the iframe blob URL. ~50–100 ms on typical hardware. The signature is repolled at 500 ms while drawing because `SignaturePad.onChange` only fires on the empty/non-empty boundary, not on every stroke. If we ever extend the pad to fire on stroke completion, drop the polling.
- **Audit metadata is in Keywords, not a custom info dict entry** — pdf-lib's `getInfoDict` is a private method. We use `setKeywords([JSON.stringify(audit)])` instead, which writes the same data to a standard info dict slot that every PDF viewer surfaces in document properties. Trade-off: a future "Keywords" use (e.g., search tags) would clobber the audit blob. If that conflict ever materializes, the fix is to use the public `PDFContext.assign`/`PDFDict.set` chain through `doc.context` rather than the private accessor.
