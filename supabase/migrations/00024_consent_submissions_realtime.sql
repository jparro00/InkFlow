-- Enable Realtime on consent_submissions so the artist's Forms tab picks up
-- cross-device submissions live (the previous behavior was a 60s persisted
-- TTL fetch + a Forms-tab visit, which made a brand-new submission feel
-- "lost" until the cache aged out).
--
-- REPLICA IDENTITY FULL is needed for row-level filters (we'll subscribe
-- with user_id=eq.<artist>) — without it the WAL only carries the PK.

ALTER TABLE consent_submissions REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE consent_submissions;
