-- ============================================================
-- Partial-day closures (staff-facing)
--
-- Staff close part of a day -- a late start or early finish for a
-- doctor's appointment, say -- in half-hour steps. Each closure is
-- {id, from, to, reason}; `from` is inclusive, `to` is exclusive.
--
-- ENFORCEMENT DOES NOT LIVE HERE. Saving a closure also writes
-- {"<slot>": {"0": "blocked", "1": "blocked"}} into day_settings.overrides
-- for every covered slot, and that is what every gate already honours:
-- validate_booking_calendar (seat_blocked), validate_booking_capacity's
-- blocked-seat subtraction, get_blocked_seats, get_small_medium_availability
-- and the public availability calendar. This column carries the reason and
-- the grouping so the staff calendar can draw one card instead of a column
-- of blocked cells. Nothing customer-facing reads it: day_settings is
-- staff-only under RLS and every customer RPC projects explicit columns.
--
-- Additive and idempotent. No new functions, so no grant/revoke block.
-- Apply to prod BY HAND before merging the front end that writes it.
-- Rollback: alter table public.day_settings drop column closures;
-- ============================================================

alter table public.day_settings
  add column if not exists closures jsonb not null default '[]'::jsonb;

alter table public.day_settings
  drop constraint if exists day_settings_closures_is_array;

alter table public.day_settings
  add constraint day_settings_closures_is_array
  check (jsonb_typeof(closures) = 'array');

comment on column public.day_settings.closures is
  'Staff-facing partial-day closures: [{id, from, to, reason}], `from` inclusive and `to` exclusive. Display and authoring only -- enforcement is the both-seats-blocked entries a closure writes into overrides. Never projected to a customer-facing role.';

-- Post-conditions: fail the apply loudly rather than half-land.
do $post$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'day_settings'
       and column_name = 'closures' and is_nullable = 'NO'
  ) then
    raise exception 'day_settings.closures missing or nullable';
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'day_settings_closures_is_array'
       and conrelid = 'public.day_settings'::regclass
  ) then
    raise exception 'day_settings_closures_is_array constraint missing';
  end if;
end;
$post$;
