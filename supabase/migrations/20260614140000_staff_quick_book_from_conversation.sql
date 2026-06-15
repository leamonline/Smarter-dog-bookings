-- ============================================================
-- 20260614140000_staff_quick_book_from_conversation.sql
--
-- Staff "Book appointment" straight from an inbox conversation.
--
-- The whatsapp_booking_actions table is AI/service-role-insert only, so
-- staff can't author a booking from the browser. This RPC is the single
-- guarded path that lets them: it stages a booking action and applies it
-- through the EXISTING apply_whatsapp_booking_action() — so the real
-- booking insert, the bookings capacity trigger, the booking<->conversation
-- link, and the inline "Booking created" thread card all behave exactly
-- as they do for an AI-proposed booking. No new booking-write logic.
--
-- Hardened after an adversarial review (June 2026):
--   * Requires the conversation to be matched to a customer (human_id),
--     and verifies the chosen dog belongs to that customer — closes the
--     unmatched-conversation / cross-customer gap that the shared apply's
--     ownership check skips when human_id IS NULL.
--   * Takes the dog's RECORDED size as authoritative (the modal dropdown
--     is a hint only) so a caller can't under-state size to dodge the
--     physical-capacity seat maths — mirrors the customer booking RPC.
--   * Builds a WHITELISTED payload server-side (dog_id/booking_date/slot/
--     service/size + status='Booked', confirmed=true). Arbitrary caller
--     keys (status/payment/pickup_by_id/addons) never reach the booking.
--   * Re-tags bookings.source='staff_manual' after applying so audit /
--     analytics can tell staff-authored bookings apart from AI ones (the
--     shared apply hardcodes source to a whatsapp_ai* value; bookings.source
--     has no CHECK, and a source-only UPDATE hits the capacity trigger's
--     metadata-only early-return so capacity is not re-validated).
--
-- Security: SECURITY DEFINER + an explicit is_staff() gate (the inner
-- apply re-checks is_staff() too). auth.uid() flows through to decided_by.
-- Idempotent (create or replace). Apply manually.
-- ============================================================

create or replace function create_staff_booking_from_conversation(
  p_conversation_id uuid,
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action_id uuid;
  v_booking_id uuid;
  v_conversation_human_id uuid;
  v_dog_human_id uuid;
  v_dog_size text;
  v_payload jsonb;
begin
  if not is_staff() then
    raise exception 'permission denied'
      using hint = 'Only staff can book from a conversation';
  end if;

  if p_conversation_id is null then
    raise exception 'conversation id is required';
  end if;

  -- The conversation must exist AND be linked to a customer, so the
  -- booking is attributable and the dog-ownership check below is
  -- meaningful (the shared apply skips its own check when human_id is null).
  select human_id
    into v_conversation_human_id
    from whatsapp_conversations
   where id = p_conversation_id;
  if not found then
    raise exception 'conversation not found';
  end if;
  if v_conversation_human_id is null then
    raise exception 'conversation is not linked to a customer yet'
      using hint = 'Match the conversation to a customer before booking';
  end if;

  if nullif(p_payload->>'dog_id', '') is null
     or nullif(p_payload->>'booking_date', '') is null
     or nullif(p_payload->>'slot', '') is null
     or nullif(p_payload->>'service', '') is null then
    raise exception 'booking is missing dog, date, slot, or service';
  end if;

  -- The dog must belong to THIS conversation's customer. Its recorded
  -- size is authoritative for capacity (a caller can't under-state size).
  select human_id, size
    into v_dog_human_id, v_dog_size
    from dogs
   where id = (p_payload->>'dog_id')::uuid;
  if not found then
    raise exception 'dog not found';
  end if;
  if v_dog_human_id is distinct from v_conversation_human_id then
    raise exception 'dog does not belong to this customer';
  end if;

  -- Whitelist: only known-safe fields reach the booking. Size comes from
  -- the dog record (falling back to the caller / 'small' only if the dog
  -- has none on file).
  v_payload := jsonb_build_object(
    'dog_id', p_payload->>'dog_id',
    'booking_date', p_payload->>'booking_date',
    'slot', p_payload->>'slot',
    'service', p_payload->>'service',
    'size', coalesce(nullif(v_dog_size, ''), nullif(p_payload->>'size', ''), 'small'),
    'status', 'Booked',
    'confirmed', true
  );

  insert into whatsapp_booking_actions (conversation_id, action, payload, state)
  values (p_conversation_id, 'create', v_payload, 'pending')
  returning id into v_action_id;

  -- Reuse the proven apply path: validation + bookings insert (capacity
  -- trigger fires) + marks the action applied + links applied_booking_id.
  v_booking_id := apply_whatsapp_booking_action(v_action_id);

  -- Re-tag the source. The shared apply hardcodes it to whatsapp_ai*;
  -- this UPDATE only changes `source`, so the capacity trigger takes its
  -- metadata-only early-return (no re-validation).
  update bookings set source = 'staff_manual' where id = v_booking_id;

  return v_booking_id;
end;
$$;

comment on function create_staff_booking_from_conversation(uuid, jsonb) is
  'Staff-only RPC. Books an appointment for a matched WhatsApp conversation: verifies the dog belongs to the conversation customer, takes the dog''s recorded size as authoritative, applies via apply_whatsapp_booking_action (same capacity trigger + conversation link + thread card as an AI booking), then tags bookings.source=staff_manual. Returns the new booking id.';

-- New public functions auto-grant EXECUTE to anon; lock this to
-- authenticated staff explicitly (the function still enforces is_staff()).
revoke all on function create_staff_booking_from_conversation(uuid, jsonb) from public;
revoke all on function create_staff_booking_from_conversation(uuid, jsonb) from anon;
grant execute on function create_staff_booking_from_conversation(uuid, jsonb) to authenticated;

-- Rollback:
--   drop function if exists create_staff_booking_from_conversation(uuid, jsonb);
