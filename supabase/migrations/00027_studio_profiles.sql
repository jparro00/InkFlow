-- Per-artist studio profile. v1 carries just the studio name; future fields
-- (logo, contact info, custom waiver templates) extend this table.
--
-- Why this exists separately from auth.users metadata:
--   - The public consent QR flow (anonymous client, no Supabase session) needs
--     to read the studio name to populate the consent PDF's header AND the
--     11 waiver statements that reference the studio by name. auth.users is
--     admin-only — RLS doesn't expose it to anon clients. A purpose-built
--     table with a public-read policy is the cleanest path.
--   - Keeps the schema explicit when we add per-studio template configuration
--     later — the artist's row is the natural anchor.
--
-- PUBLIC READ is intentional. studio_name is non-sensitive identifying info
-- (the equivalent of the name on a storefront sign). If genuinely sensitive
-- fields land here later (e.g., bank account for payouts), they go in a
-- separate column with column-level grants or move to a private sibling
-- table.

CREATE TABLE IF NOT EXISTS studio_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  studio_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE studio_profiles ENABLE ROW LEVEL SECURITY;

-- Anyone (including anon) can read. The public consent page hits this with
-- the anon key and gets the studio name keyed by the artist_id in the URL.
CREATE POLICY "Anyone can read studio profiles"
  ON studio_profiles FOR SELECT
  USING (true);

-- Artists own their row. Wrap auth.uid() in SELECT so it caches per query
-- (per migration 00011's perf convention).
CREATE POLICY "Artists can insert their own profile"
  ON studio_profiles FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Artists can update their own profile"
  ON studio_profiles FOR UPDATE
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Artists can delete their own profile"
  ON studio_profiles FOR DELETE
  USING ((SELECT auth.uid()) = user_id);

-- Keep updated_at in sync without relying on app code.
CREATE OR REPLACE FUNCTION studio_profiles_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER studio_profiles_updated_at
  BEFORE UPDATE ON studio_profiles
  FOR EACH ROW
  EXECUTE FUNCTION studio_profiles_set_updated_at();
