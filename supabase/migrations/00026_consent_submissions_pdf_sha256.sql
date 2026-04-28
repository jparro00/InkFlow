-- SHA-256 of the signed consent PDF, computed in-browser at the moment the
-- client taps "Adopt and Sign" and stored on the row. Lets the artist verify
-- the PDF in R2 hasn't been tampered with — re-hash the blob, compare against
-- the row's column. The PDF the client saw, the bytes that got uploaded, and
-- the bytes the artist downloads must all hash identically.
--
-- Stored as a hex string (no leading "sha256:" prefix). Nullable so older
-- rows submitted before this column existed don't fail.

ALTER TABLE consent_submissions
  ADD COLUMN IF NOT EXISTS pdf_sha256 TEXT;
