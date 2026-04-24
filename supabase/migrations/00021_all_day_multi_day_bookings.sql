-- All-day and multi-day bookings support.
-- Personal-type events can now span multiple days, be marked "all day",
-- and flagged as informational (non-blocking) so the schedule agent ignores them
-- when computing availability.

-- 1. end_date — nullable during backfill, then enforced NOT NULL
alter table bookings add column if not exists end_date timestamptz;

update bookings
set end_date = date + (duration * interval '1 hour')
where end_date is null;

alter table bookings alter column end_date set not null;

alter table bookings drop constraint if exists bookings_end_date_after_start_check;
alter table bookings add constraint bookings_end_date_after_start_check
  check (end_date >= date);

-- 2. is_all_day — flag for events that occupy whole calendar days (no timed slot)
alter table bookings add column if not exists is_all_day boolean not null default false;

-- 3. blocks_availability — whether the schedule agent treats this as busy
--    Default true for existing rows (preserves current behavior).
--    Form/agent defaults for NEW events: true for timed Personal, false for all-day Personal.
alter table bookings add column if not exists blocks_availability boolean not null default true;

-- 4. Range-overlap index for availability queries
create index if not exists idx_bookings_range on bookings (user_id, date, end_date);
