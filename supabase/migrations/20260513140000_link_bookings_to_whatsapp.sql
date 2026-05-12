-- 20260513140000_link_bookings_to_whatsapp.sql
--
-- Task 5 of the May 2026 review pass.
--
-- Adds two columns to bookings so a booking created via the WhatsApp
-- agent (staff-approved OR autonomous-confirmed) carries a direct
-- back-pointer to the conversation that produced it. The inbox
-- already knows the booking via whatsapp_booking_actions.applied_booking_id;
-- this is the inverse link, used by the booking detail modal to show
-- "Created from WhatsApp · [thread]".
--
-- whatsapp_message_id is the inbound message that triggered the
-- proposal. It's nullable because the staff-approval path doesn't
-- always have a single triggering message (the staff approve a
-- batched draft); the autonomous path always does.
--
-- Safety:
--   - Columns are nullable + additive; existing inserts unaffected.
--   - Backfill is idempotent (only writes when the column is null).
--   - apply_whatsapp_booking_action is updated to populate them on
--     new inserts from the WhatsApp path. The legacy /admin and
--     customer-portal inserts pass through unchanged.

alter table bookings
  add column if not exists whatsapp_conversation_id uuid
    references whatsapp_conversations(id) on delete set null;

alter table bookings
  add column if not exists whatsapp_message_id uuid
    references whatsapp_messages(id) on delete set null;

comment on column bookings.whatsapp_conversation_id is
  'When this booking was created via the WhatsApp AI receptionist, the conversation that produced it. NULL for direct staff bookings and customer-portal bookings.';

comment on column bookings.whatsapp_message_id is
  'When this booking was created via the WhatsApp AI receptionist, the inbound message that triggered the proposal. NULL for the staff-approval path when there was no single trigger message.';

create index if not exists idx_bookings_whatsapp_conversation
  on bookings(whatsapp_conversation_id)
  where whatsapp_conversation_id is not null;

-- Backfill: link existing bookings created from whatsapp_booking_actions
-- using the applied_booking_id ↔ bookings.id pairing. Idempotent.
update bookings b
   set whatsapp_conversation_id = a.conversation_id
  from whatsapp_booking_actions a
 where a.applied_booking_id = b.id
   and b.whatsapp_conversation_id is null;

-- Update apply_whatsapp_booking_action to write the new columns on
-- future inserts. Body is identical to the version in 20260512140000
-- (autonomous booking) except for the two new column writes.
create or replace function apply_whatsapp_booking_action(p_action_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action whatsapp_booking_actions%rowtype;
  v_booking_id uuid;
  v_dog_human_id uuid;
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

  select human_id
    into v_dog_human_id
    from dogs
   where id = (v_action.payload->>'dog_id')::uuid;

  if not found then
    raise exception 'dog not found for booking action';
  end if;

  select human_id
    into v_conversation_human_id
    from whatsapp_conversations
   where id = v_action.conversation_id;

  if v_conversation_human_id is not null
     and v_conversation_human_id <> v_dog_human_id then
    raise exception 'dog does not belong to the conversation customer';
  end if;

  -- Find the inbound message that triggered the draft this action came from.
  -- whatsapp_drafts.trigger_message_id is the canonical link. If the action
  -- has no draft (rare — legacy rows), we just leave the column null.
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
    coalesce(nullif(v_action.payload->>'size', ''), 'small'),
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
$$;

comment on function apply_whatsapp_booking_action(uuid) is
  'Applies a WhatsApp booking action. Pending state requires is_staff() (legacy staff-approval path, bookings.source = ''whatsapp_ai''). Confirmed state is service-role only and represents the customer-confirmed autonomous booking path (bookings.source = ''whatsapp_ai_auto''). Populates bookings.whatsapp_conversation_id and whatsapp_message_id so the booking detail UI can link back to the source thread.';
