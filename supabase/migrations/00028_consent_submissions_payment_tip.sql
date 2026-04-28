-- Tip is captured separately from the base price so the artist's bookkeeping
-- can break out gratuity. Nullable for older rows finalized before this column
-- existed.

ALTER TABLE consent_submissions
  ADD COLUMN IF NOT EXISTS payment_tip NUMERIC(10, 2);
