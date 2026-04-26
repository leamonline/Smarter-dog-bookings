-- 033_apply_whatsapp_booking_action.sql
--
-- Staff-approved application of AI-proposed WhatsApp booking actions.
-- The AI writes to whatsapp_booking_actions only; this function is the
-- single guarded path that turns a pending proposal into a real booking.

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
begin
  if not is_staff() then
    raise exception 'not authorised'
      using hint = 'Only staff can apply WhatsApp booking actions';
  end if;

  select *
    into v_action
    from whatsapp_booking_actions
   where id = p_action_id
   for update;

  if not found then
    raise exception 'booking action not found';
  end if;

  if v_action.state <> 'pending' then
    raise exception 'booking action is %, not pending', v_action.state;
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

  if v_conversation_human_id is not null and v_conversation_human_id <> v_dog_human_id then
    raise exception 'dog does not belong to this WhatsApp conversation';
  end if;

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
    confirmed
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
    coalesce((v_action.payload->>'confirmed')::boolean, true)
  )
  returning id into v_booking_id;

  update whatsapp_booking_actions
     set state = 'applied',
         decided_by = auth.uid(),
         decided_at = now(),
         applied_at = now(),
         applied_booking_id = v_booking_id,
         error_message = null
  where id = p_action_id;

  return v_booking_id;
end;
$$;

comment on function apply_whatsapp_booking_action(uuid) is
  'Staff-only RPC. Applies a pending AI-proposed WhatsApp booking action by inserting a real booking and marking the action applied.';

revoke all on function apply_whatsapp_booking_action(uuid) from public;
grant execute on function apply_whatsapp_booking_action(uuid) to authenticated;

-- Rollback:
--   drop function if exists apply_whatsapp_booking_action(uuid);
