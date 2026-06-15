-- ============================================================
-- Booking-integrity hardening (from the booking/security audit).
--
--  1. Enforce the calendar (open day / valid slot / not-past) on UPDATE too,
--     not just INSERT — so a non-staff reschedule (incl. the AI's, which runs
--     as service_role) can't move a booking onto a closed day.
--  2. apply_whatsapp_booking_action: take the dog's size from the dogs table,
--     not the model-supplied payload (a large dog could be booked as 'small').
--  3. apply_whatsapp_booking_action: fail CLOSED on ownership — require the
--     conversation to have a linked customer that owns the dog.
--  4. One active booking per (dog, date, slot) — a partial unique index.
--
-- Apply individually to prod; idempotent. Migrations aren't auto-applied.
-- ============================================================

-- ── 1. Calendar enforcement on UPDATE ───────────────────────
-- Staff keep their bypass (one-off openings / catch-ups). For non-staff,
-- validate on INSERT and on any UPDATE that moves the booking to a different
-- day or slot. A status-only update (e.g. Cancel, mark Completed) on a booking
-- already sitting on a now-closed/past day is deliberately left alone.
CREATE OR REPLACE FUNCTION public.enforce_booking_calendar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if is_staff() then
    return new;
  end if;
  if tg_op = 'INSERT'
     or new.booking_date is distinct from old.booking_date
     or new.slot is distinct from old.slot then
    perform validate_booking_calendar(new.booking_date, new.slot);
  end if;
  return new;
end;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_booking_calendar ON public.bookings;
CREATE TRIGGER trg_enforce_booking_calendar
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION enforce_booking_calendar();

-- ── 2 + 3. apply_whatsapp_booking_action: authoritative size + fail-closed ──
-- Only two changes vs the live definition: (a) size is read from dogs, not the
-- payload; (b) the ownership guard requires a matched conversation customer.
CREATE OR REPLACE FUNCTION public.apply_whatsapp_booking_action(p_action_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_action whatsapp_booking_actions%rowtype;
  v_booking_id uuid;
  v_dog_human_id uuid;
  v_dog_size text;
  v_conversation_human_id uuid;
  v_trigger_message_id uuid;
begin
  select *
    into v_action
    from whatsapp_booking_actions
   where id = p_action_id
   for update;

  if not found then
    raise exception 'booking action not found';
  end if;

  if v_action.state not in ('pending', 'confirmed') then
    raise exception 'booking action is %, not pending or confirmed', v_action.state;
  end if;

  if v_action.state = 'pending' and not is_staff() then
    raise exception 'not authorised'
      using hint = 'Only staff can apply pending WhatsApp booking actions';
  end if;

  if v_action.action <> 'create' then
    raise exception 'unsupported booking action: %', v_action.action;
  end if;

  if nullif(v_action.payload->>'dog_id', '') is null
     or nullif(v_action.payload->>'booking_date', '') is null
     or nullif(v_action.payload->>'slot', '') is null
     or nullif(v_action.payload->>'service', '') is null then
    raise exception 'booking action payload is missing dog_id, booking_date, slot, or service';
  end if;

  -- Dog's owner AND authoritative size, straight from the dogs table.
  select human_id, size
    into v_dog_human_id, v_dog_size
    from dogs
   where id = (v_action.payload->>'dog_id')::uuid;

  if not found then
    raise exception 'dog not found for booking action';
  end if;

  select human_id
    into v_conversation_human_id
    from whatsapp_conversations
   where id = v_action.conversation_id;

  -- Fail closed: the conversation must have a linked customer who owns the dog.
  if v_conversation_human_id is null then
    raise exception 'conversation has no linked customer';
  end if;
  if v_conversation_human_id <> v_dog_human_id then
    raise exception 'dog does not belong to the conversation customer';
  end if;

  select d.trigger_message_id
    into v_trigger_message_id
    from whatsapp_drafts d
   where d.id = v_action.draft_id;

  insert into bookings (
    booking_date,
    slot,
    dog_id,
    size,
    service,
    status,
    addons,
    pickup_by_id,
    payment,
    confirmed,
    source,
    notes,
    whatsapp_conversation_id,
    whatsapp_message_id
  )
  values (
    (v_action.payload->>'booking_date')::date,
    v_action.payload->>'slot',
    (v_action.payload->>'dog_id')::uuid,
    coalesce(v_dog_size, 'small'),
    v_action.payload->>'service',
    coalesce(nullif(v_action.payload->>'status', ''), 'Booked'),
    coalesce(
      array(select jsonb_array_elements_text(coalesce(v_action.payload->'addons', '[]'::jsonb))),
      '{}'::text[]
    ),
    nullif(v_action.payload->>'pickup_by_id', '')::uuid,
    coalesce(nullif(v_action.payload->>'payment', ''), 'Due at Pick-up'),
    coalesce((v_action.payload->>'confirmed')::boolean, true),
    case when v_action.state = 'confirmed' then 'whatsapp_ai_auto' else 'whatsapp_ai' end,
    nullif(v_action.payload->>'notes', ''),
    v_action.conversation_id,
    v_trigger_message_id
  )
  returning id into v_booking_id;

  update whatsapp_booking_actions
     set state = case when v_action.state = 'confirmed' then 'auto_applied' else 'applied' end,
         applied_booking_id = v_booking_id,
         applied_at = now(),
         decided_by = case when v_action.state = 'pending' then auth.uid() else null end,
         decided_at = now(),
         error_message = null
   where id = p_action_id;

  return v_booking_id;
end;
$function$;

-- ── 4. One active booking per (dog, date, slot) ─────────────
-- Prevents the same dog holding two simultaneous active bookings in one slot
-- across separate write paths. Active = not Cancelled and not Completed.
-- (0 such duplicates exist today.)
CREATE UNIQUE INDEX IF NOT EXISTS bookings_one_active_per_dog_slot
  ON public.bookings (dog_id, booking_date, slot)
  WHERE status NOT IN ('Cancelled', 'Completed');
