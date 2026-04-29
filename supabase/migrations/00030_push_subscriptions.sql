-- Per-device Web Push subscriptions for the artist's PWA. The consent-submit
-- edge function reads from this table to fan-out a push to every signed-in
-- device when a new consent form arrives.
--
-- One row per (artist, endpoint). The endpoint encodes both the push provider
-- (FCM, APNs/web.push.apple.com, autopush.services.mozilla.com) and the
-- specific device, so we treat it as the natural unique key per artist.
--
-- last_seen_at is bumped every time the frontend re-POSTs the existing
-- subscription on boot — lets us garbage-collect rows that haven't checked
-- in for months (uninstalled PWAs that didn't get a 410 from the push
-- provider for whatever reason).

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx
  ON push_subscriptions (user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Artists own their device rows. Wrap auth.uid() in SELECT so it caches
-- per query (per migration 00011's perf convention).
CREATE POLICY "Artists can read their own push subscriptions"
  ON push_subscriptions FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Artists can insert their own push subscriptions"
  ON push_subscriptions FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Artists can update their own push subscriptions"
  ON push_subscriptions FOR UPDATE
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Artists can delete their own push subscriptions"
  ON push_subscriptions FOR DELETE
  USING ((SELECT auth.uid()) = user_id);

-- The consent-submit edge function uses the service-role key to bypass RLS
-- when fanning out pushes — that's intentional. RLS is the safety net for
-- direct PostgREST access from the frontend.
