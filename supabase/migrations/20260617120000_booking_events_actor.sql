-- ============================================================
-- Actor attribution on booking_events
--
-- Names WHO made/amended each booking in the dashboard feed:
--   staff     → staff_profiles.display_name (first name shown on the UI)
--   customer  → humans full name
--   ai        → 'Smarter Dog AI' (WhatsApp auto-bookings, no JWT)
--   system    → an authenticated user we can't classify
--   null      → legacy rows / service-role paths we don't name
--
-- The triggers run SECURITY DEFINER, but auth.uid() still returns the
-- end user (it reads the per-request JWT, which survives SECURITY
-- DEFINER). So we can tell staff from customers on every JWT-backed
-- write path. Service-role paths (AI auto-confirm, reminder confirm)
-- have auth.uid() = null and are handled explicitly.
--
-- Also adds a new event_type 'reconfirmed', emitted when a customer
-- taps Confirm on a WhatsApp reminder (bookings.reminder_confirmed_at
-- goes null → set via mark_reminder_confirmed, which runs service-role
-- so the actor is the booking's OWNER, not auth.uid()).
--
-- Idempotent / standalone: add column if not exists, drop+recreate the
-- CHECK, create-or-replace every function. Safe to apply on its own and
-- to re-run. No actor backfill — historical rows keep their null actor
-- and render with the existing owner-led format.
-- ============================================================

-- ── 1. Denormalised actor columns (like customer_name / dog_name). ──
alter table booking_events
  add column if not exists actor_id   uuid,
  add column if not exists actor_role text,
  add column if not exists actor_name text;

comment on column booking_events.actor_role is
  'Who performed this event: staff | customer | ai | system | null. Denormalised at write time.';

-- ── 2. Extend the event_type CHECK to allow 'reconfirmed'. ──────────
--    Drop by the expected name AND by definition-match, since the prod
--    constraint name may have drifted from the migration history.
do $$
declare
  v_conname text;
begin
  alter table booking_events drop constraint if exists booking_events_event_type_check;

  for v_conname in
    select c.conname
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
     where t.relname = 'booking_events'
       and c.contype = 'c'
       and pg_get_constraintdef(c.oid) ilike '%event_type%'
  loop
    execute format('alter table booking_events drop constraint %I', v_conname);
  end loop;
end $$;

alter table booking_events
  add constraint booking_events_event_type_check
  check (event_type in ('created','rescheduled','cancelled','reconfirmed'));

-- ── 3. Actor resolver from auth.uid() (+ source for AI auto-bookings).
--    SECURITY DEFINER so it can read staff_profiles / humans from a
--    trigger regardless of the caller's role. ─────────────────────────
create or replace function resolve_event_actor(p_source text default null)
returns table(actor_id uuid, actor_role text, actor_name text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_name text;
begin
  actor_id := v_uid;

  if v_uid is not null then
    -- Staff?
    select nullif(trim(coalesce(sp.display_name, '')), '')
      into v_name
      from staff_profiles sp
     where sp.user_id = v_uid;
    if found then
      actor_role := 'staff';
      actor_name := v_name;   -- may be null if display_name is blank
      return next; return;
    end if;

    -- Customer?
    select nullif(trim(coalesce(h.name, '') || ' ' || coalesce(h.surname, '')), '')
      into v_name
      from humans h
     where h.customer_user_id = v_uid
     limit 1;
    if found then
      actor_role := 'customer';
      actor_name := v_name;
      return next; return;
    end if;

    -- Authenticated but unclassified.
    actor_role := 'system';
    actor_name := null;
    return next; return;
  end if;

  -- No JWT (service-role path). The WhatsApp AI auto-booking is the one
  -- we name; everything else stays unattributed.
  if p_source ilike 'whatsapp_ai%' then
    actor_role := 'ai';
    actor_name := 'Smarter Dog AI';
    return next; return;
  end if;

  actor_role := null;
  actor_name := null;
  return next;
end;
$$;

-- New public function: anon gets EXECUTE by default — lock it down. It's
-- only ever called from the SECURITY DEFINER triggers below.
revoke all on function resolve_event_actor(text) from public, anon, authenticated, service_role;

-- ── 4. Created trigger: capture the actor. ─────────────────────────
create or replace function emit_booking_created_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_party record;
  v_actor record;
begin
  -- Skip if the booking is being inserted already cancelled (rare —
  -- happens if a script bulk-inserts historical cancellations).
  if new.status = 'Cancelled' then
    return new;
  end if;

  select * into v_party from booking_event_party(new);
  select * into v_actor from resolve_event_actor(new.source);

  insert into booking_events (
    booking_id, event_type, customer_name, dog_name, dog_breed,
    service, booking_date, slot,
    actor_id, actor_role, actor_name,
    occurred_at
  ) values (
    new.id, 'created', v_party.customer_name, v_party.dog_name, v_party.dog_breed,
    new.service, new.booking_date, new.slot,
    v_actor.actor_id, v_actor.actor_role, v_actor.actor_name,
    coalesce(new.created_at, now())
  );
  return new;
end;
$$;

drop trigger if exists trg_emit_booking_created_event on bookings;
create trigger trg_emit_booking_created_event
  after insert on bookings
  for each row execute function emit_booking_created_event();

-- ── 5. Update trigger: actor on reschedule/cancel + 'reconfirmed'. ──
create or replace function emit_booking_update_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_party       record;
  v_actor       record;
  v_rescheduled boolean;
  v_cancelled   boolean;
  v_reconfirmed boolean;
begin
  v_rescheduled := (new.booking_date is distinct from old.booking_date)
                 or (new.slot is distinct from old.slot);
  v_cancelled := old.status is distinct from 'Cancelled'
              and new.status = 'Cancelled';
  v_reconfirmed := old.reminder_confirmed_at is null
               and new.reminder_confirmed_at is not null;

  if not v_rescheduled and not v_cancelled and not v_reconfirmed then
    return new;
  end if;

  select * into v_party from booking_event_party(new);
  select * into v_actor from resolve_event_actor(new.source);

  if v_rescheduled then
    insert into booking_events (
      booking_id, event_type, customer_name, dog_name, dog_breed,
      service, booking_date, slot,
      previous_booking_date, previous_slot,
      actor_id, actor_role, actor_name,
      occurred_at
    ) values (
      new.id, 'rescheduled', v_party.customer_name, v_party.dog_name, v_party.dog_breed,
      new.service, new.booking_date, new.slot,
      old.booking_date, old.slot,
      v_actor.actor_id, v_actor.actor_role, v_actor.actor_name,
      now()
    );
  end if;

  if v_cancelled then
    insert into booking_events (
      booking_id, event_type, customer_name, dog_name, dog_breed,
      service, booking_date, slot, cancel_reason,
      actor_id, actor_role, actor_name,
      occurred_at
    ) values (
      new.id, 'cancelled', v_party.customer_name, v_party.dog_name, v_party.dog_breed,
      new.service, new.booking_date, new.slot, new.cancel_reason,
      v_actor.actor_id, v_actor.actor_role, v_actor.actor_name,
      now()
    );
  end if;

  if v_reconfirmed then
    -- Reconfirm runs service-role (auth.uid() null), so the actor is the
    -- booking's OWNER. actor_id stays null (we don't resolve the owner's
    -- auth user and don't need it for the sentence).
    insert into booking_events (
      booking_id, event_type, customer_name, dog_name, dog_breed,
      service, booking_date, slot,
      actor_id, actor_role, actor_name,
      occurred_at
    ) values (
      new.id, 'reconfirmed', v_party.customer_name, v_party.dog_name, v_party.dog_breed,
      new.service, new.booking_date, new.slot,
      null, 'customer', v_party.customer_name,
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
