-- Phase 3 of the R2 migration — adds a `storage_backend` column to
-- documents so the frontend knows whether to open blobs via Supabase
-- Storage signed URLs or via the CF Worker at images-*.inkbloop.com.
--
-- Rows uploaded before Phase 3 stay on 'supabase'. New uploads that succeed
-- the R2 shadow-write are flipped to 'r2' by the client. This column is
-- dropped in Phase 5 once all blobs are on R2.
--
-- See docs/r2-migration-plan.md.

alter table documents
  add column if not exists storage_backend text not null default 'supabase'
    check (storage_backend in ('supabase', 'r2'));
