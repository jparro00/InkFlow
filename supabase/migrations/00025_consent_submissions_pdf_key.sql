-- Add pdf_key for the signed consent PDF, generated client-side at submit time
-- and uploaded to R2 alongside the license + signature blobs.
--
-- The PDF is the legal record of the signed waiver. We keep the structured
-- fields (form_data, license_*, tattoo_*, signature_image_key, etc.) for
-- queryability, but the PDF is what artists download, hand to clients, and
-- archive for retention requirements.
--
-- R2 layout extends the existing consent prefix:
--   consent/{artist user_id}/{submission_id}/consent.pdf
--
-- Note on tattoo_* columns: the original 00023 migration created
-- `tattoo_location` and `tattoo_description` for artist-finalize. As of this
-- migration they are now CLIENT-entered during the wizard (so they can be
-- baked into the signed PDF). The columns themselves don't change shape, only
-- ownership in the application code. See docs/forms.md.

ALTER TABLE consent_submissions
  ADD COLUMN IF NOT EXISTS pdf_key TEXT;
