-- ============================================================
-- Staff confirmation of a booking, with customer-wins overwrite
--
-- WHY
-- Until now the only way a booking became "confirmed" was the customer
-- answering their WhatsApp reminder (button tap or typed reply →
-- mark_reminder_confirmed). Staff who reach an owner by phone had no way
-- to record the confirmation, so the Daily Brief kept nagging "Needs
-- confirmation" for a booking the salon knew was solid.
--
-- WHAT
--   1. bookings.reminder_confirmed_source ('customer' | 'staff', null when
--      unconfirmed) records WHO confirmed. Backfilled to 'customer' for every
--      already-confirmed row — the WhatsApp path was the only writer before
--      this migration.
--   2. mark_reminder_confirmed() (the customer path) now also stamps rows a
--      staff member confirmed earlier: a real customer confirmation OVERWRITES
--      a staff one (fresher evidence, straight from the owner). Customer →
--      customer stays idempotent exactly as before.
--   3. emit_booking_update_event() attributes the 'reconfirmed' booking event
--      to the staff member (via resolve_event_actor) when the confirmation
--      came from staff, and keeps the owner attribution for customer
--      confirmations. It also fires when a customer confirmation replaces a
--      staff one (source flips with the timestamp already set).
--   4. reset_reminder_on_reschedule() clears the new source column alongside
--      reminder_confirmed_at when a booking moves date.
--
-- The staff write path is a plain staff UPDATE on bookings (existing RLS);
-- no new RPC. Idempotent: safe to re-run.
-- ============================================================

-- ── 1. Column + backfill ────────────────────────────────────────────
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS reminder_confirmed_source text;

ALTER TABLE bookings
  DROP CONSTRAINT IF EXISTS bookings_reminder_confirmed_source_check;

ALTER TABLE bookings
  ADD CONSTRAINT bookings_reminder_confirmed_source_check
  CHECK (reminder_confirmed_source IN ('customer', 'staff'));

COMMENT ON COLUMN bookings.reminder_confirmed_source IS
  'Who confirmed this booking: ''customer'' (WhatsApp reminder reply) or ''staff'' (recorded on the Daily Brief). Null when unconfirmed. A customer confirmation overwrites a staff one; never the reverse.';

UPDATE bookings
   SET reminder_confirmed_source = 'customer'
 WHERE reminder_confirmed_at IS NOT NULL
   AND reminder_confirmed_source IS NULL;

-- ── 2. Customer path: overwrite staff confirmations ─────────────────
-- Identical to 20260531120000 except the guard admits staff-confirmed rows
-- and the SET stamps the source.
CREATE OR REPLACE FUNCTION mark_reminder_confirmed(p_human_id uuid)
RETURNS SETOF uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE bookings b
     SET reminder_confirmed_at = now(),
         reminder_confirmed_source = 'customer'
    FROM dogs d
   WHERE b.dog_id = d.id
     AND d.human_id = p_human_id
     AND (b.reminder_confirmed_at IS NULL
          OR b.reminder_confirmed_source = 'staff')
     AND b.status NOT IN ('Cancelled', 'Completed')
     AND EXISTS (
       SELECT 1
         FROM notification_log n
        WHERE n.booking_id    = b.id
          AND n.trigger_type  = 'reminder'
          AND n.channel       = 'whatsapp'
          AND n.status        = 'sent'
          AND n.sent_at       >= now() - INTERVAL '36 hours'
     )
  RETURNING b.id;
END;
$$;

REVOKE ALL ON FUNCTION mark_reminder_confirmed(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION mark_reminder_confirmed(uuid) TO service_role;

-- ── 3. Event attribution: staff vs customer 'reconfirmed' ───────────
-- Identical to 20260617120000 except the v_reconfirmed predicate also fires
-- when the source changes on an already-stamped row (customer overwriting
-- staff), and the reconfirmed insert resolves the actor when the
-- confirmation came from staff.
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
  v_reconfirmed := new.reminder_confirmed_at is not null
               and (old.reminder_confirmed_at is null
                    or old.reminder_confirmed_source
                       is distinct from new.reminder_confirmed_source);

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
    if new.reminder_confirmed_source = 'staff' then
      -- Staff confirmed over the phone / in person: a plain staff UPDATE, so
      -- auth.uid() is the staff member and resolve_event_actor names them.
      insert into booking_events (
        booking_id, event_type, customer_name, dog_name, dog_breed,
        service, booking_date, slot,
        actor_id, actor_role, actor_name,
        occurred_at
      ) values (
        new.id, 'reconfirmed', v_party.customer_name, v_party.dog_name, v_party.dog_breed,
        new.service, new.booking_date, new.slot,
        v_actor.actor_id, v_actor.actor_role, v_actor.actor_name,
        now()
      );
    else
      -- Customer confirm runs service-role (auth.uid() null), so the actor is
      -- the booking's OWNER. actor_id stays null (we don't resolve the
      -- owner's auth user and don't need it for the sentence).
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
  end if;

  return new;
end;
$$;

revoke execute on function emit_booking_update_event() from public, anon, authenticated;

-- ── 4. Reschedule reset also clears the source ──────────────────────
-- Identical to 20260706120000 plus the one extra cleared column.
create or replace function public.reset_reminder_on_reschedule()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.booking_date is distinct from old.booking_date then
    -- Free the idempotency index so the next cron/manual send fires afresh,
    -- and drop any stale failure for the old date at the same time.
    delete from public.notification_log
     where booking_id = old.id
       and trigger_type in ('reminder', 'reminder_sms_fallback');

    -- The confirmation was for the old date — clear both halves so the
    -- booking isn't shown as confirmed for a date nobody confirmed.
    new.reminder_confirmed_at := null;
    new.reminder_confirmed_source := null;
  end if;
  return new;
end;
$$;

revoke execute on function public.reset_reminder_on_reschedule() from public, anon, authenticated;
