-- ============================================================
-- Booking events log
--
-- A small append-only feed that records every booking life-cycle
-- event: created, rescheduled, cancelled. The dashboard's new
-- BookingHistoryCard reads this to show a human-readable timeline:
--
--   "Catherine Green booked a Full Groom for Alfie (Yorkshire
--    Terrier) Mon 1 Jun at 9:00am"
--
-- We denormalise customer + dog details into the event row at
-- write time so the feed survives later edits (a customer renaming
-- their dog shouldn't rewrite history).
--
-- Triggers:
--   bookings AFTER INSERT  → emit 'created'
--   bookings AFTER UPDATE  → emit 'rescheduled' if date/slot changed
--                            emit 'cancelled' if status went to Cancelled
--
-- Backfill at the bottom: one 'created' row per existing booking,
-- one 'cancelled' row for every currently-cancelled booking. We
-- can't reconstruct reschedules retroactively (bookings is mutable
-- without a history table) — those start from now going forward.
-- ============================================================

create table if not exists booking_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references bookings(id) on delete set null,
  event_type text not null check (event_type in ('created','rescheduled','cancelled')),
  -- Denormalised customer / dog so the feed survives edits.
  customer_name text,
  dog_name text,
  dog_breed text,
  service text,
  booking_date date,
  slot text,
  -- For 'rescheduled' events only.
  previous_booking_date date,
  previous_slot text,
  -- For 'cancelled' events only.
  cancel_reason text,
  occurred_at timestamptz not null default now()
);

comment on table booking_events is
  'Append-only feed of booking life-cycle events (created / rescheduled / cancelled), denormalised so historical entries survive later edits to bookings / humans / dogs.';

create index if not exists idx_booking_events_occurred_at
  on booking_events(occurred_at desc);
create index if not exists idx_booking_events_booking_id
  on booking_events(booking_id);

alter table booking_events enable row level security;

create policy "staff_select_booking_events"
  on booking_events
  for select
  to authenticated
  using (is_staff());

-- The triggers run as the row owner (service_role / postgres),
-- so they bypass RLS. No insert policy needed.

-- ── Shared helper: build the (customer_name, dog_name, dog_breed)
--    triple for a booking. Uses the bookings.* _snapshot columns
--    as a first port of call (set by trg_bookings_set_snapshots at
--    insert), falling back to the live join. ────────────────────
create or replace function booking_event_party(p_booking bookings)
returns table(customer_name text, dog_name text, dog_breed text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_dog dogs%rowtype;
  v_human humans%rowtype;
begin
  select * into v_dog from dogs where id = p_booking.dog_id;
  if v_dog.id is not null then
    select * into v_human from humans where id = v_dog.human_id;
  end if;

  customer_name := coalesce(
    p_booking.owner_name_snapshot,
    nullif(trim(coalesce(v_human.name, '') || ' ' || coalesce(v_human.surname, '')), '')
  );
  dog_name := coalesce(p_booking.dog_name_snapshot, v_dog.name);
  dog_breed := coalesce(p_booking.breed_snapshot, v_dog.breed);
  return next;
end;
$$;

-- ── Created trigger ───────────────────────────────────────────
create or replace function emit_booking_created_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_party record;
begin
  -- Skip if the booking is being inserted already cancelled (rare —
  -- happens if a script bulk-inserts historical cancellations).
  if new.status = 'Cancelled' then
    return new;
  end if;

  select * into v_party from booking_event_party(new);

  insert into booking_events (
    booking_id, event_type, customer_name, dog_name, dog_breed,
    service, booking_date, slot, occurred_at
  ) values (
    new.id, 'created', v_party.customer_name, v_party.dog_name, v_party.dog_breed,
    new.service, new.booking_date, new.slot, coalesce(new.created_at, now())
  );
  return new;
end;
$$;

drop trigger if exists trg_emit_booking_created_event on bookings;
create trigger trg_emit_booking_created_event
  after insert on bookings
  for each row execute function emit_booking_created_event();

-- ── Update trigger (reschedule + cancel) ──────────────────────
create or replace function emit_booking_update_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_party record;
  v_rescheduled boolean;
  v_cancelled boolean;
begin
  v_rescheduled := (new.booking_date is distinct from old.booking_date)
                 or (new.slot is distinct from old.slot);
  v_cancelled := old.status is distinct from 'Cancelled'
              and new.status = 'Cancelled';

  if not v_rescheduled and not v_cancelled then
    return new;
  end if;

  select * into v_party from booking_event_party(new);

  if v_rescheduled then
    insert into booking_events (
      booking_id, event_type, customer_name, dog_name, dog_breed,
      service, booking_date, slot,
      previous_booking_date, previous_slot,
      occurred_at
    ) values (
      new.id, 'rescheduled', v_party.customer_name, v_party.dog_name, v_party.dog_breed,
      new.service, new.booking_date, new.slot,
      old.booking_date, old.slot,
      now()
    );
  end if;

  if v_cancelled then
    insert into booking_events (
      booking_id, event_type, customer_name, dog_name, dog_breed,
      service, booking_date, slot, cancel_reason,
      occurred_at
    ) values (
      new.id, 'cancelled', v_party.customer_name, v_party.dog_name, v_party.dog_breed,
      new.service, new.booking_date, new.slot, new.cancel_reason,
      now()
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_emit_booking_update_event on bookings;
create trigger trg_emit_booking_update_event
  after update on bookings
  for each row execute function emit_booking_update_event();

-- ── Backfill ──────────────────────────────────────────────────
--
-- We can't reconstruct reschedules retroactively, so:
--   - For every existing booking, emit ONE 'created' event at the
--     booking's created_at.
--   - For every currently-cancelled booking, also emit a 'cancelled'
--     event at the booking's updated_at.
--
-- Skip rows that already have a matching event (idempotent re-run).

insert into booking_events (
  booking_id, event_type, customer_name, dog_name, dog_breed,
  service, booking_date, slot, occurred_at
)
select
  b.id,
  'created',
  coalesce(b.owner_name_snapshot, nullif(trim(coalesce(h.name,'') || ' ' || coalesce(h.surname,'')), '')),
  coalesce(b.dog_name_snapshot, d.name),
  coalesce(b.breed_snapshot, d.breed),
  b.service, b.booking_date, b.slot, coalesce(b.created_at, now())
from bookings b
left join dogs d on d.id = b.dog_id
left join humans h on h.id = d.human_id
where not exists (
  select 1 from booking_events e
   where e.booking_id = b.id and e.event_type = 'created'
);

insert into booking_events (
  booking_id, event_type, customer_name, dog_name, dog_breed,
  service, booking_date, slot, cancel_reason, occurred_at
)
select
  b.id,
  'cancelled',
  coalesce(b.owner_name_snapshot, nullif(trim(coalesce(h.name,'') || ' ' || coalesce(h.surname,'')), '')),
  coalesce(b.dog_name_snapshot, d.name),
  coalesce(b.breed_snapshot, d.breed),
  b.service, b.booking_date, b.slot, b.cancel_reason,
  coalesce(b.updated_at, now())
from bookings b
left join dogs d on d.id = b.dog_id
left join humans h on h.id = d.human_id
where b.status = 'Cancelled'
  and not exists (
    select 1 from booking_events e
     where e.booking_id = b.id and e.event_type = 'cancelled'
  );
