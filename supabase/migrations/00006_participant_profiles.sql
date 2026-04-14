-- Stores participant profile info (name, profile pic) keyed by psid.
-- Populated by the webhook when messages arrive and by profile-update events.
-- Supabase Realtime fires on UPDATE so Ink Bloop sees profile pic changes instantly.
create table participant_profiles (
  psid        text        not null,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  name        text,
  profile_pic text,
  platform    text        check (platform in ('instagram', 'messenger')),
  updated_at  timestamptz not null default now(),
  primary key (user_id, psid)
);

alter table participant_profiles enable row level security;

create policy "Users manage own participant profiles"
  on participant_profiles for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Enable Realtime for both tables
alter publication supabase_realtime add table participant_profiles;
alter publication supabase_realtime add table messages;
