-- ============================================================
-- Denormalise the booking creator onto bookings
--
-- "Booked by {name} ({role}) on {date}" wants a single-row read, not a join
-- to booking_events. Add created_by_id / created_by_role / created_by_name and
-- keep them consistent with booking_events by reusing the SAME
-- resolve_event_actor() the event path uses — no forked actor logic.
--
-- Populated by a BEFORE INSERT trigger: the existing emit_booking_created_event
-- fires AFTER INSERT and can't persist changes to NEW, so the stamp has to
-- happen in a BEFORE trigger. It only sets three columns and never raises, so
-- it coexists with the calendar / capacity / pregnancy BEFORE-INSERT gates
-- (order-independent — they don't read created_by_*).
--
-- Additive + idempotent: re-running is a no-op.
-- ============================================================

alter table public.bookings
  add column if not exists created_by_id   uuid,
  add column if not exists created_by_role text,
  add column if not exists created_by_name text;

comment on column public.bookings.created_by_id is
  'Who created this booking (auth.uid at insert), denormalised via resolve_event_actor. NULL for service-role / legacy rows.';
comment on column public.bookings.created_by_role is
  'Creator role: staff | customer | ai | system | NULL. Mirrors booking_events.actor_role.';
comment on column public.bookings.created_by_name is
  'Creator display name (staff display_name / customer full name / "Smarter Dog AI"). NULL when unattributed.';

-- Stamp the creator on insert using the same resolver booking_events uses, so
-- bookings.created_by_* can never drift from the created event's actor.
create or replace function set_booking_creator()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor record;
begin
  select * into v_actor from resolve_event_actor(new.source);
  new.created_by_id   := v_actor.actor_id;
  new.created_by_role := v_actor.actor_role;
  new.created_by_name := v_actor.actor_name;
  return new;
end;
$$;

drop trigger if exists trg_set_booking_creator on public.bookings;
create trigger trg_set_booking_creator
  before insert on public.bookings
  for each row execute function set_booking_creator();

-- Backfill from the earliest 'created' event per booking. Only stamps rows not
-- already attributed, so re-running is a no-op. Orphan events (booking deleted
-- → booking_id null) don't match the join.
--
-- This UPDATE touches only created_by_*, none of which affect capacity, the
-- calendar, or the event feed — but bookings has BEFORE/AFTER UPDATE triggers
-- (validate_booking_capacity, enforce_booking_calendar, emit/notify/log) that
-- would re-validate or re-emit on any row change, and legacy rows (staff
-- overbooks, since-closed days) would wrongly fail. Disable user triggers for
-- the backfill only — it's transactional, so a failure rolls the disable back
-- too, and capacity stays enforced for every real write.
alter table public.bookings disable trigger user;

update public.bookings b
set created_by_id   = e.actor_id,
    created_by_role = e.actor_role,
    created_by_name = e.actor_name
from (
  select distinct on (booking_id)
         booking_id, actor_id, actor_role, actor_name
  from public.booking_events
  where event_type = 'created' and booking_id is not null
  order by booking_id, occurred_at asc
) e
where e.booking_id = b.id
  and b.created_by_id is null
  and b.created_by_role is null
  and b.created_by_name is null;

alter table public.bookings enable trigger user;

-- ENABLE TRIGGER USER resets every user trigger to the default 'origin' mode,
-- which would silently downgrade trg_log_booking_capacity_event from its
-- ALWAYS setting (it must fire even under session_replication_role=replica).
-- Restore it explicitly so this migration leaves trigger modes unchanged.
alter table public.bookings enable always trigger trg_log_booking_capacity_event;
