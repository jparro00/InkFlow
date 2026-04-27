-- Consent submissions: client-submitted forms (license + signature + waiver) reviewed by the artist.
--
-- Lifecycle:
--   submitted        → in artist's review queue (created by consent-submit edge fn, anon)
--   approved_pending → booking attached; payment / tattoo location / description still TBD
--   finalized        → all paperwork complete
--
-- Rejection is destructive: artist hard-deletes the row, edge function purges the R2 license + signature
-- images. There is no 'rejected' state persisted.
--
-- Storage: license & signature blobs live in R2 under prefix
--   consent/{artist user_id}/{submission_id}/{license|signature}.{ext}
-- accessed through the existing images worker (auth → JWT bound to artist user_id).

CREATE TABLE IF NOT EXISTS consent_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'approved_pending', 'finalized')),

  -- License / ID. Extracted fields populated by Textract (phase 3). Until then they're filled
  -- manually by the client form (phase 2). license_raw_data preserves the full OCR response so
  -- we can backfill new fields without re-running Textract.
  license_image_key TEXT,
  license_first_name TEXT,
  license_last_name TEXT,
  license_dob DATE,
  license_number TEXT,
  license_address TEXT,
  license_state TEXT,
  license_expiry DATE,
  license_raw_data JSONB,

  -- Waiver form contents. Schema is intentionally loose (jsonb) — the v1 form is hardcoded but
  -- we'll add artist-uploadable templates later, and the field set will diverge per template.
  form_data JSONB NOT NULL DEFAULT '{}',
  signature_image_key TEXT,

  -- Booking attachment. Required to leave 'submitted' (set when artist approves + picks a booking).
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,

  -- Finalization fields (artist fills in to move approved_pending → finalized).
  payment_type TEXT,
  payment_amount NUMERIC(10, 2),
  tattoo_location TEXT,
  tattoo_description TEXT,

  -- Timestamps
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ,
  finalized_at TIMESTAMPTZ,

  -- Audit / abuse-prevention (populated by the consent-submit edge fn from request headers).
  client_ip TEXT,
  client_user_agent TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consent_submissions_user_status
  ON consent_submissions (user_id, status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_consent_submissions_booking
  ON consent_submissions (booking_id) WHERE booking_id IS NOT NULL;

ALTER TABLE consent_submissions ENABLE ROW LEVEL SECURITY;

-- Artists read/update/delete their own submissions.
-- Public/anon INSERTs are NOT permitted by RLS — they flow through the consent-submit edge function
-- (phase 2) which uses the service-role key after artist-existence + rate-limit checks.
CREATE POLICY "Users can select own consent submissions"
  ON consent_submissions FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can update own consent submissions"
  ON consent_submissions FOR UPDATE
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can delete own consent submissions"
  ON consent_submissions FOR DELETE
  USING ((SELECT auth.uid()) = user_id);
