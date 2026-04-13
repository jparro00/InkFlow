-- Ink Bloop initial schema
-- Run this in the Supabase SQL Editor

-- Extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";

-- ============================================================
-- CLIENTS
-- ============================================================
create table clients (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at    timestamptz not null default now(),
  name          text not null,
  display_name  text,
  phone         text,
  instagram     text,
  facebook_id   text,
  email         text,
  dob           date,
  channel       text check (channel in ('Facebook', 'Instagram', 'Phone')),
  tags          text[] not null default '{}',
  notes         jsonb not null default '[]'
);

create index idx_clients_user_id on clients(user_id);
create index idx_clients_name_trgm on clients using gin (name gin_trgm_ops);

alter table clients enable row level security;

create policy "Users can view own clients"
  on clients for select using (auth.uid() = user_id);
create policy "Users can insert own clients"
  on clients for insert with check (auth.uid() = user_id);
create policy "Users can update own clients"
  on clients for update using (auth.uid() = user_id);
create policy "Users can delete own clients"
  on clients for delete using (auth.uid() = user_id);

-- ============================================================
-- BOOKINGS
-- ============================================================
create table bookings (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at        timestamptz not null default now(),
  client_id         uuid references clients(id) on delete set null,
  date              timestamptz not null,
  duration          real not null,
  type              text not null check (type in ('Regular', 'Touch Up', 'Consultation', 'Full Day')),
  estimate          integer,
  status            text not null default 'Tentative'
                    check (status in ('Confirmed', 'Tentative', 'Completed', 'Cancelled', 'No-show')),
  rescheduled       boolean not null default false,
  notes             text,
  quick_booking_raw text
);

create index idx_bookings_user_id on bookings(user_id);
create index idx_bookings_date on bookings(user_id, date);
create index idx_bookings_client on bookings(client_id);

alter table bookings enable row level security;

create policy "Users can view own bookings"
  on bookings for select using (auth.uid() = user_id);
create policy "Users can insert own bookings"
  on bookings for insert with check (auth.uid() = user_id);
create policy "Users can update own bookings"
  on bookings for update using (auth.uid() = user_id);
create policy "Users can delete own bookings"
  on bookings for delete using (auth.uid() = user_id);

-- ============================================================
-- BOOKING IMAGES (metadata — blobs in Supabase Storage)
-- ============================================================
create table booking_images (
  id            uuid primary key,
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  booking_id    uuid not null references bookings(id) on delete cascade,
  created_at    timestamptz not null default now(),
  filename      text not null,
  mime_type     text not null,
  size_bytes    integer not null,
  width         integer not null,
  height        integer not null,
  sync_status   text not null default 'local'
                check (sync_status in ('local', 'uploading', 'synced', 'error')),
  remote_path   text
);

create index idx_booking_images_booking on booking_images(booking_id);
create index idx_booking_images_user on booking_images(user_id);

alter table booking_images enable row level security;

create policy "Users can view own booking images"
  on booking_images for select using (auth.uid() = user_id);
create policy "Users can insert own booking images"
  on booking_images for insert with check (auth.uid() = user_id);
create policy "Users can update own booking images"
  on booking_images for update using (auth.uid() = user_id);
create policy "Users can delete own booking images"
  on booking_images for delete using (auth.uid() = user_id);

-- ============================================================
-- DOCUMENTS
-- ============================================================
create table documents (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at    timestamptz not null default now(),
  client_id     uuid not null references clients(id) on delete cascade,
  booking_id    uuid references bookings(id) on delete set null,
  type          text not null check (type in ('image', 'consent_form', 'other')),
  label         text,
  storage_path  text not null,
  is_sensitive  boolean not null default false,
  mime_type     text,
  size_bytes    integer,
  notes         text
);

create index idx_documents_client on documents(client_id);
create index idx_documents_user on documents(user_id);

alter table documents enable row level security;

create policy "Users can view own documents"
  on documents for select using (auth.uid() = user_id);
create policy "Users can insert own documents"
  on documents for insert with check (auth.uid() = user_id);
create policy "Users can update own documents"
  on documents for update using (auth.uid() = user_id);
create policy "Users can delete own documents"
  on documents for delete using (auth.uid() = user_id);

-- ============================================================
-- AGE VERIFICATION LOGS
-- ============================================================
create table age_verification_logs (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at        timestamptz not null default now(),
  client_id         uuid not null references clients(id) on delete cascade,
  verified_at       timestamptz not null,
  verified_by       text not null,
  document_deleted  boolean not null default false,
  notes             text
);

create index idx_age_verification_client on age_verification_logs(client_id);
create index idx_age_verification_user on age_verification_logs(user_id);

alter table age_verification_logs enable row level security;

create policy "Users can view own age verification logs"
  on age_verification_logs for select using (auth.uid() = user_id);
create policy "Users can insert own age verification logs"
  on age_verification_logs for insert with check (auth.uid() = user_id);
create policy "Users can update own age verification logs"
  on age_verification_logs for update using (auth.uid() = user_id);
create policy "Users can delete own age verification logs"
  on age_verification_logs for delete using (auth.uid() = user_id);

-- ============================================================
-- STORAGE BUCKET POLICIES
-- ============================================================
-- NOTE: Create the 'booking-images' and 'documents' buckets in the
-- Supabase dashboard first (both as PRIVATE buckets), then run these:

-- booking-images bucket
create policy "Users upload to own folder"
  on storage.objects for insert
  with check (
    bucket_id = 'booking-images' and
    (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users read own images"
  on storage.objects for select
  using (
    bucket_id = 'booking-images' and
    (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users delete own images"
  on storage.objects for delete
  using (
    bucket_id = 'booking-images' and
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- documents bucket
create policy "Users upload own documents"
  on storage.objects for insert
  with check (
    bucket_id = 'documents' and
    (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users read own documents"
  on storage.objects for select
  using (
    bucket_id = 'documents' and
    (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users delete own documents"
  on storage.objects for delete
  using (
    bucket_id = 'documents' and
    (storage.foldername(name))[1] = auth.uid()::text
  );
