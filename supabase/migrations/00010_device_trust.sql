-- Device trust + email verification codes for risk-based login
create table device_trusts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  device_id   text not null,
  device_name text,
  created_at  timestamptz not null default now(),
  last_used   timestamptz not null default now()
);

create index idx_device_trusts_user on device_trusts(user_id);
alter table device_trusts enable row level security;
create policy "Users manage own devices" on device_trusts
  for all using (auth.uid() = user_id);

create table verification_codes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  code        text not null,
  expires_at  timestamptz not null,
  used        boolean not null default false,
  created_at  timestamptz not null default now()
);

alter table verification_codes enable row level security;
create policy "Users manage own codes" on verification_codes
  for all using (auth.uid() = user_id);
