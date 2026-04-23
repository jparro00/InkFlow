-- Allow authenticated users to write their own avatars into the `avatars`
-- bucket. Prior to this migration the bucket was read-only for users; only
-- the service role (via the sim-api edge function) could write. That was
-- fine when avatars only came from Meta profile sync, but we now want
-- users to upload custom client avatars from the frontend.
--
-- Path-scoping: policies match (storage.foldername(name))[1] against the
-- caller's auth.uid(), so user A can never overwrite user B's avatars
-- even though the read policy is authenticated-wide. Client code must
-- upload to `{user_id}/...` or writes will fail RLS.
--
-- Wrap auth.uid() in `SELECT` per the caching convention established in
-- migration 00011 — avoids re-evaluating per row on bulk ops.

create policy "Users write own avatars"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Users update own avatars"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Users delete own avatars"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
