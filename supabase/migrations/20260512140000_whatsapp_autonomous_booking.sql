-- 20260512140000_whatsapp_autonomous_booking.sql
--
-- Customer-confirmed autonomous booking — schema foundation.
-- Spec: docs/superpowers/specs/2026-05-12-whatsapp-ai-autonomous-booking-design.md
--
-- Additive only. Existing pending → applied/rejected staff-approval path is
-- untouched. Four new state values represent the autonomous lifecycle:
--   pending                      — staff approval queue (existing)
--   awaiting_customer_confirm    — AI sent Yes/No buttons, waiting on customer
--   confirmed                    — customer tapped Yes; about to apply
--   auto_applied                 — successfully applied without staff
--   rejected_by_customer         — customer tapped No or TTL expired
--   (existing) approved, rejected, applied, failed, superseded

-- 1. whatsapp_booking_actions: extend state CHECK + add confirm-tracking columns
alter table whatsapp_booking_actions
  drop constraint if exists whatsapp_booking_actions_state_check;

alter table whatsapp_booking_actions
  add constraint whatsapp_booking_actions_state_check
  check (state in (
    'pending', 'approved', 'rejected', 'applied', 'failed', 'superseded',
    'awaiting_customer_confirm', 'confirmed', 'auto_applied', 'rejected_by_customer'
  ));

alter table whatsapp_booking_actions
  add column customer_confirm_message_id text,
  add column customer_confirm_expires_at timestamptz;

create index idx_whatsapp_booking_actions_confirm_msg
  on whatsapp_booking_actions(customer_confirm_message_id)
  where customer_confirm_message_id is not null;

create index idx_whatsapp_booking_actions_awaiting_confirm
  on whatsapp_booking_actions(state, customer_confirm_expires_at)
  where state = 'awaiting_customer_confirm';

-- 2. whatsapp_conversations: lead-collection state + per-conversation opt-in
alter table whatsapp_conversations
  add column lead_status text
    check (lead_status in ('collecting', 'awaiting_summary_confirm', 'records_created')),
  add column lead_payload jsonb,
  add column autonomous_booking_enabled boolean not null default false;

-- 3. humans: provenance for the post-creation correction path
alter table humans add column source text;

-- 4. Update existing apply_whatsapp_booking_action() function to accept the
--    new 'confirmed' state from the autonomous path (in addition to the
--    legacy 'pending' state from staff approval). The autonomous flow
--    transitions awaiting_customer_confirm → confirmed → calls this fn.
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
  -- Autonomous path bypasses the staff check by setting state='confirmed'
  -- (only the apply-customer-confirm edge fn writes that state, and it
  -- runs under service-role). Staff path still goes through is_staff().
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

  insert into bookings (
    dog_id, booking_date, slot, service, size,
    addons, payment, confirmed, source, notes, status
  ) values (
    (v_action.payload->>'dog_id')::uuid,
    (v_action.payload->>'booking_date')::date,
    v_action.payload->>'slot',
    v_action.payload->>'service',
    coalesce(v_action.payload->>'size', 'small'),
    coalesce((v_action.payload->'addons')::jsonb, '[]'::jsonb),
    coalesce(v_action.payload->>'payment', 'Due at Pick-up'),
    coalesce((v_action.payload->>'confirmed')::boolean, true),
    case when v_action.state = 'confirmed' then 'whatsapp_ai_auto' else 'whatsapp_ai' end,
    v_action.payload->>'notes',
    'Booked'
  ) returning id into v_booking_id;

  update whatsapp_booking_actions
     set state = case when v_action.state = 'confirmed' then 'auto_applied' else 'applied' end,
         applied_booking_id = v_booking_id,
         applied_at = now(),
         decided_by = case when v_action.state = 'pending' then auth.uid() else null end,
         decided_at = now()
   where id = p_action_id;

  return v_booking_id;
end;
$$;

comment on column whatsapp_booking_actions.customer_confirm_message_id is
  'Meta wa_id of the [Yes]/[No] button message we sent. Used to route button_reply events back to this action row.';

comment on column whatsapp_booking_actions.customer_confirm_expires_at is
  'TTL on awaiting_customer_confirm. After this point, the action transitions to rejected_by_customer with reason=expired.';

comment on column whatsapp_conversations.lead_status is
  'New-customer onboarding state. NULL for known customers. Transitions: NULL → collecting → awaiting_summary_confirm → records_created.';

comment on column whatsapp_conversations.lead_payload is
  'Partial new-customer info gathered across turns. Frozen into humans/dogs rows on summary-confirm.';

comment on column whatsapp_conversations.autonomous_booking_enabled is
  'Per-conversation opt-in for autonomous booking. Mirrors auto_send_enabled — staff flips this once they trust the AI on this customer.';

comment on column humans.source is
  'How this record was created. ''whatsapp_ai'' for AI-onboarded customers; NULL or app-specific values for existing customers. Used by the post-creation correction path to gate which rows the AI may update.';
