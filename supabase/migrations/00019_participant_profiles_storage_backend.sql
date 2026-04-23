-- Phase 4 of the R2 migration — adds `profile_pic_backend` to
-- participant_profiles so the frontend knows whether to resolve an avatar
-- path via Supabase Storage signed URLs or via the CF Worker at
-- images-*.inkbloop.com.
--
-- Rows set before Phase 4 stay on 'supabase'. New avatar uploads through
-- sim-api that succeed the R2 shadow-write are flagged 'r2' via the
-- profile_update webhook payload. This column is dropped in Phase 5 once
-- all avatars are on R2.
--
-- See docs/r2-migration-plan.md.

alter table participant_profiles
  add column if not exists profile_pic_backend text not null default 'supabase'
    check (profile_pic_backend in ('supabase', 'r2'));
