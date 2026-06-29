-- ============================================================
-- "Completed" appointment side-effects
--
-- Completed is the final lifecycle status (Booked → Checked in → In bath →
-- Ready → Completed). On the transition INTO Completed we:
--   1. stamp bookings.completed_at (when staff marked it done),
--   2. set dogs.last_groomed_date to the dog's most recent completed booking,
--   3. emit a 'completed' booking_events row (shows on the owner timeline).
--
-- Un-complete (moving a booking back out of Completed): completed_at is
-- cleared and last_groomed_date is RECOMPUTED from the dog's remaining
-- completed bookings (a MAX — naturally forward-only and self-correcting).
-- The emitted 'completed' event is NOT retracted.
--
-- Additive + idempotent.
-- ============================================================

alter table public.bookings
  add column if not exists completed_at timestamptz;
comment on column public.bookings.completed_at is
  'When this booking was marked Completed (set on the transition into Completed, cleared if moved back out). NULL while not completed.';

alter table public.dogs
  add column if not exists last_groomed_date date;
comment on column public.dogs.last_groomed_date is
  'The most recent date this dog had a booking reach Completed. Recomputed as MAX(booking_date) over the dog''s completed bookings, so it never regresses wrongly. NULL until the first completed groom.';

-- Extend the booking_events event_type CHECK to allow 'completed'. Drop by
-- definition match (not just name) so prod constraint-name drift can't block it.
do $$
declare r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    where t.relname = 'booking_events'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%event_type%'
  loop
    execute format('alter table public.booking_events drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.booking_events
  add constraint booking_events_event_type_check
  check (event_type in ('created','rescheduled','cancelled','reconfirmed','completed'));

-- BEFORE UPDATE: stamp/clear completed_at on the transition into/out of
-- Completed. Only touches NEW, never raises.
create or replace function set_booking_completed_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'Completed' then
    new.completed_at := now();
  else
    new.completed_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_booking_completed_at on public.bookings;
create trigger trg_set_booking_completed_at
  before update on public.bookings
  for each row
  when (old.status is distinct from new.status
        and (new.status = 'Completed' or old.status = 'Completed'))
  execute function set_booking_completed_at();

-- AFTER UPDATE: recompute the dog's last-groomed date (forward-only via MAX,
-- correct on both enter and un-complete) and, only when entering Completed,
-- emit a 'completed' event for the owner timeline. Reuses booking_event_party
-- + resolve_event_actor so the event matches the rest of the feed.
create or replace function on_booking_completed_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_party record;
  v_actor record;
begin
  update public.dogs d
  set last_groomed_date = (
    select max(b.booking_date)
    from public.bookings b
    where b.dog_id = new.dog_id and b.status = 'Completed'
  )
  where d.id = new.dog_id;

  if new.status = 'Completed' then
    select * into v_party from booking_event_party(new);
    select * into v_actor from resolve_event_actor(new.source);
    insert into booking_events (
      booking_id, event_type, customer_name, dog_name, dog_breed,
      service, booking_date, slot,
      actor_id, actor_role, actor_name, occurred_at
    ) values (
      new.id, 'completed', v_party.customer_name, v_party.dog_name, v_party.dog_breed,
      new.service, new.booking_date, new.slot,
      v_actor.actor_id, v_actor.actor_role, v_actor.actor_name, now()
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_on_booking_completed_change on public.bookings;
create trigger trg_on_booking_completed_change
  after update on public.bookings
  for each row
  when (old.status is distinct from new.status
        and (new.status = 'Completed' or old.status = 'Completed'))
  execute function on_booking_completed_change();

-- Backfill dogs.last_groomed_date from existing completed bookings (reliable).
-- Only updates dogs whose value would change, so re-running is a no-op. Dogs
-- with no completed bookings keep NULL. UPDATE on dogs doesn't touch bookings'
-- capacity/calendar triggers.
update public.dogs d
set last_groomed_date = sub.max_date
from (
  select dog_id, max(booking_date) as max_date
  from public.bookings
  where status = 'Completed'
  group by dog_id
) sub
where sub.dog_id = d.id
  and d.last_groomed_date is distinct from sub.max_date;

-- Backfill bookings.completed_at for existing Completed rows. We don't store
-- the historical completion time, so updated_at is a best-effort approximation
-- (documented). The UPDATE touches only completed_at, but bookings'
-- validate/calendar triggers would re-validate legacy rows and wrongly fail —
-- so disable user triggers for the backfill, then re-enable and restore
-- trg_log_booking_capacity_event's ALWAYS mode (ENABLE TRIGGER USER resets it).
alter table public.bookings disable trigger user;

update public.bookings
set completed_at = updated_at
where status = 'Completed' and completed_at is null;

alter table public.bookings enable trigger user;
alter table public.bookings enable always trigger trg_log_booking_capacity_event;
