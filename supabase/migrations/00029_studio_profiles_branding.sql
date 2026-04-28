-- Per-studio branding for the public consent route. The logo is stored
-- inline as sanitized SVG text rather than as a separate storage object so
-- the consent route can render it from the same row that already carries
-- studio_name — no extra round-trip and no public bucket needed.
--
-- accent_color and bg_color are hex strings (e.g. "#4ADE80"). The consent
-- page sets them as CSS custom properties on a wrapper element so all the
-- existing tokens (button, glow, focus borders) inherit the override.

ALTER TABLE studio_profiles
  ADD COLUMN IF NOT EXISTS logo_svg TEXT,
  ADD COLUMN IF NOT EXISTS accent_color TEXT,
  ADD COLUMN IF NOT EXISTS bg_color TEXT;
