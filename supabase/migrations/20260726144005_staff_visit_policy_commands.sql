-- ============================================================
-- Audited staff visit transition commands
-- (previous_day_1500_v1 programme, phase 1)
--
-- Staff own approval, decline, proposals, deposit reconciliation, incidents,
-- waivers and overrides. Every command is staff-gated, idempotent and writes
-- immutable audit. Staff-caused changes never consume a customer reschedule
-- and never create an incident.
--
-- No command here expires a request or releases capacity on a timer: reaching
-- a deposit due time is an attention state only.
--
-- Spec: docs/superpowers/specs/2026-07-22-booking-cancellation-rescheduling-policy-design.md
-- Plan: docs/superpowers/plans/2026-07-22-booking-policy-foundation.md (Task 5)
-- ============================================================

create or replace function smarter_dog_private.require_staff()
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_staff() then
    raise exception 'Staff only' using errcode = '42501';
  end if;
end;
$$;
revoke all on function smarter_dog_private.require_staff() from public, anon, authenticated;

-- ── 1. Approval, decline and retrospective approval ─────────────────

create or replace function public.approve_booking_visit(
  p_visit_id uuid,
  p_expected_visit_revision integer,
  p_idempotency_key uuid,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v record;
  d record;
  v_hash text;
  v_prior jsonb;
  v_receipt jsonb;
  v_decision jsonb;
  v_resolution jsonb;
  v_eligibility timestamptz;
  v_policy text;
  v_settings record;
  v_confirm jsonb;
  cr record;
  v_event_id uuid;
begin
  perform smarter_dog_private.require_staff();
  if public.booking_policy_runtime() <> 'active' then
    return smarter_dog_private.blocked_receipt('policy_not_active', p_visit_id);
  end if;
  v_hash := md5(coalesce(p_visit_id::text,'') || '|'
                || coalesce(p_expected_visit_revision::text,''));
  v_prior := smarter_dog_private.replay_receipt('staff', p_idempotency_key, v_hash);
  if v_prior is not null then
    return v_prior;
  end if;

  select * into v from public.booking_visits where id = p_visit_id for update;
  if not found then
    return smarter_dog_private.blocked_receipt('not_found');
  end if;
  if p_expected_visit_revision is null
     or v.row_revision <> p_expected_visit_revision then
    return jsonb_build_object(
      'outcome','blocked','block_reason','stale_review',
      'visit_id',p_visit_id,'revision',v.row_revision,'outcome_key',null);
  end if;
  if v.lifecycle_state <> 'active' or v.confirmation_state <> 'unconfirmed' then
    return smarter_dog_private.blocked_receipt('state_not_eligible', p_visit_id);
  end if;

  -- Commercial eligibility is established now, at approval, and the deposit
  -- resolver reruns completely against that instant.
  v_eligibility := statement_timestamp();
  v_policy := public.policy_for_confirmation(v_eligibility);
  select * into v_settings from public.booking_policy_settings where singleton;

  v_resolution := public.resolve_deposit_requirement(
    v.human_id, v.booking_date, v_eligibility, v_policy);

  if coalesce((v_resolution->>'blocked')::boolean, false) then
    -- Never start an impossible deadline. The alert is append-only, but the
    -- visit/deposit aggregate and its row revision remain unchanged.
    insert into public.booking_policy_audit
      (visit_id, human_id, action, actor_id, actor_scope, reason, detail)
    values (p_visit_id, v.human_id, 'deposit_setup_incomplete', auth.uid(), 'staff',
            v_resolution->>'blockedReason', v_resolution);
    return smarter_dog_private.blocked_receipt(
      case when (v_resolution->>'blockedReason') = 'terms_publication_missing'
           then 'policy_setup_incomplete' else 'deposit_setup_incomplete' end,
      p_visit_id, null, 'deposit-setup:' || p_visit_id::text);
  end if;

  update public.booking_visits
     set approval_state = 'approved',
         commercial_eligibility_at = coalesce(commercial_eligibility_at, v_eligibility),
         eligibility_policy_code = coalesce(eligibility_policy_code, v_policy),
         terms_publication_id = coalesce(terms_publication_id,
                                         v_settings.current_terms_publication_id),
         row_revision = row_revision + 1,
         is_last_minute = v.is_last_minute or
           (v.customer_change_deadline_at is not null
            and v_eligibility > v.customer_change_deadline_at)
   where id = p_visit_id;

  select * into d from public.booking_visit_deposits where visit_id = p_visit_id for update;

  if not (v_resolution->>'required')::boolean then
    -- No longer required for any reason: release every unconsumed
    -- reservation exactly once, then confirm with the audited reason.
    for cr in
      select * from public.customer_credit_reservations
       where visit_id = p_visit_id and state = 'reserved' for update
    loop
      insert into public.booking_financial_ledger
        (human_id, visit_id, event_kind, amount_pence, reason, idempotency_key, recorded_by)
      values (v.human_id, p_visit_id, 'credit_released', cr.amount_pence,
              'Deposit no longer required at approval: ' || (v_resolution->>'reasonCode'),
              'approve-release:' || p_idempotency_key::text, auth.uid())
      returning id into v_event_id;
      update public.customer_credit_reservations
         set state = 'released', terminal_event_id = v_event_id where id = cr.id;
    end loop;

    update public.booking_deposit_transfer_reservations
       set state = 'released', released_at = v_eligibility
     where destination_visit_id = p_visit_id and state = 'held';

    insert into public.booking_visit_deposits
      (visit_id, origin, state, requirement_decided_at, exemption_reason)
    values (p_visit_id, 'visit_v1', 'not_required', v_eligibility,
            v_resolution->>'reasonCode')
    on conflict (visit_id) do update
      set state = 'not_required', exemption_reason = v_resolution->>'reasonCode',
          due_at = null;

    v_confirm := smarter_dog_private.confirm_booking_visit_core(
      p_visit_id, 'approved_no_deposit', v_eligibility, 'staff', p_reason);
    v_decision := jsonb_build_object('depositRequired', false,
                                     'reasonCode', v_resolution->>'reasonCode');
  else
    -- Required: the hold window starts now, at approval.
    insert into public.booking_visit_deposits
      (visit_id, origin, state, requirement_decided_at, requirement_reason,
       due_at, bank_instruction_id, terms_publication_id)
    values (p_visit_id, 'visit_v1', 'awaiting_terms', v_eligibility,
            v_resolution->>'reasonCode', (v_resolution->>'dueAt')::timestamptz,
            v_settings.current_bank_instruction_id,
            v_settings.current_terms_publication_id)
    on conflict (visit_id) do update
      set state = 'awaiting_terms',
          requirement_reason = v_resolution->>'reasonCode',
          due_at = (v_resolution->>'dueAt')::timestamptz;
    v_decision := jsonb_build_object('depositRequired', true,
                                     'reasonCode', v_resolution->>'reasonCode');
  end if;

  insert into public.booking_policy_audit
    (visit_id, human_id, action, actor_id, actor_scope, reason, detail)
  values (p_visit_id, v.human_id, 'visit_approved', auth.uid(), 'staff', p_reason,
          coalesce(v_decision, '{}'::jsonb) ||
          jsonb_build_object('eligibilityAt', v_eligibility, 'policyCode', v_policy));

  select * into d from public.booking_visit_deposits where visit_id = p_visit_id;
  v_receipt := smarter_dog_private.visit_receipt(
    p_visit_id,
    case when coalesce(d.state,'not_required') = 'awaiting_terms'
         then 'awaiting_terms' else 'confirmed' end,
    null, null, 'visit-approved:' || p_visit_id::text);
  perform smarter_dog_private.store_receipt('staff', p_idempotency_key, v_hash, v_receipt);
  return v_receipt;
end;
$$;
revoke all on function public.approve_booking_visit(uuid, integer, uuid, text) from public;
revoke all on function public.approve_booking_visit(uuid, integer, uuid, text) from anon;
revoke all on function public.approve_booking_visit(uuid, integer, uuid, text) from authenticated;
grant execute on function public.approve_booking_visit(uuid, integer, uuid, text) to authenticated;

create or replace function public.decline_booking_visit(
  p_visit_id uuid,
  p_expected_visit_revision integer,
  p_customer_reason text,
  p_idempotency_key uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v record;
  v_hash text;
  v_prior jsonb;
  v_receipt jsonb;
  cr record;
  v_event_id uuid;
begin
  perform smarter_dog_private.require_staff();
  if public.booking_policy_runtime() <> 'active' then
    return smarter_dog_private.blocked_receipt('policy_not_active', p_visit_id);
  end if;
  if nullif(trim(coalesce(p_customer_reason,'')),'') is null then
    raise exception 'declining needs a short customer-facing reason' using errcode = '22023';
  end if;
  v_hash := md5(coalesce(p_visit_id::text,'') || '|'
                || coalesce(p_expected_visit_revision::text,'') || '|'
                || p_customer_reason);
  v_prior := smarter_dog_private.replay_receipt('staff', p_idempotency_key, v_hash);
  if v_prior is not null then
    return v_prior;
  end if;

  select * into v from public.booking_visits where id = p_visit_id for update;
  if not found then
    return smarter_dog_private.blocked_receipt('not_found');
  end if;
  if p_expected_visit_revision is null
     or v.row_revision <> p_expected_visit_revision then
    return jsonb_build_object(
      'outcome','blocked','block_reason','stale_review',
      'visit_id',p_visit_id,'revision',v.row_revision,'outcome_key',null);
  end if;
  if v.confirmation_state <> 'unconfirmed' or v.lifecycle_state <> 'active' then
    return smarter_dog_private.blocked_receipt('state_not_eligible', p_visit_id);
  end if;

  update public.bookings
     set status = 'Cancelled', cancel_reason = p_customer_reason
   where visit_id = p_visit_id and visit_membership_state = 'included'
     and status = 'Booked';

  perform smarter_dog_private.close_open_change_requests(p_visit_id);

  update public.booking_visits
     set lifecycle_state = 'declined',
         row_revision = row_revision + 1
   where id = p_visit_id;

  -- Declining restores any reserved credit automatically.
  for cr in
    select * from public.customer_credit_reservations
     where visit_id = p_visit_id and state = 'reserved' for update
  loop
    insert into public.booking_financial_ledger
      (human_id, visit_id, event_kind, amount_pence, reason, idempotency_key, recorded_by)
    values (v.human_id, p_visit_id, 'credit_released', cr.amount_pence,
            'Request declined by staff', 'decline-release:' || p_idempotency_key::text,
            auth.uid())
    returning id into v_event_id;
    update public.customer_credit_reservations
       set state = 'released', terminal_event_id = v_event_id where id = cr.id;
  end loop;

  update public.booking_deposit_transfer_reservations
     set state = 'released', released_at = statement_timestamp()
   where destination_visit_id = p_visit_id and state = 'held';

  insert into public.booking_policy_audit
    (visit_id, human_id, action, actor_id, actor_scope, reason)
  values (p_visit_id, v.human_id, 'visit_declined', auth.uid(), 'staff', p_customer_reason);

  v_receipt := smarter_dog_private.visit_receipt(
    p_visit_id, 'withdrawn', null, null, 'visit-declined:' || p_visit_id::text);
  perform smarter_dog_private.store_receipt('staff', p_idempotency_key, v_hash, v_receipt);
  return v_receipt;
end;
$$;
revoke all on function public.decline_booking_visit(uuid, integer, text, uuid) from public;
revoke all on function public.decline_booking_visit(uuid, integer, text, uuid) from anon;
revoke all on function public.decline_booking_visit(uuid, integer, text, uuid) from authenticated;
grant execute on function public.decline_booking_visit(uuid, integer, text, uuid) to authenticated;

-- ── 2. Manual deposit reconciliation ────────────────────────────────
--
-- The customer's bank receipt time decides whether payment was on time; the
-- later staff-check time never does. Reaching the due time cancels nothing.

create or replace function public.record_visit_deposit_outcome(
  p_visit_id uuid,
  p_expected_visit_revision integer,
  p_outcome text,
  p_bank_received_at timestamptz,
  p_staff_reference text,
  p_idempotency_key uuid,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v record;
  d record;
  v_hash text;
  v_prior jsonb;
  v_receipt jsonb;
  v_event_id uuid;
  v_confirm jsonb;
  v_on_time boolean;
begin
  perform smarter_dog_private.require_staff();
  if public.booking_policy_runtime() <> 'active' then
    return smarter_dog_private.blocked_receipt('policy_not_active', p_visit_id);
  end if;
  if p_outcome not in ('received','not_received') then
    raise exception 'the deposit outcome must be received or not_received' using errcode = '22023';
  end if;
  v_hash := md5(coalesce(p_visit_id::text,'') || '|'
                || coalesce(p_expected_visit_revision::text,'') || '|'
                || p_outcome || '|'
                || coalesce(p_bank_received_at::text,''));
  v_prior := smarter_dog_private.replay_receipt('staff', p_idempotency_key, v_hash);
  if v_prior is not null then
    return v_prior;
  end if;

  select * into v from public.booking_visits where id = p_visit_id for update;
  if not found then
    return smarter_dog_private.blocked_receipt('not_found');
  end if;
  if p_expected_visit_revision is null
     or v.row_revision <> p_expected_visit_revision then
    return jsonb_build_object(
      'outcome','blocked','block_reason','stale_review',
      'visit_id',p_visit_id,'revision',v.row_revision,'outcome_key',null);
  end if;
  if v.lifecycle_state <> 'active' then
    return smarter_dog_private.blocked_receipt('state_not_eligible', p_visit_id);
  end if;
  select * into d from public.booking_visit_deposits where visit_id = p_visit_id for update;
  if not found or d.state not in ('awaiting_terms','awaiting_payment') then
    return smarter_dog_private.blocked_receipt('state_not_eligible', p_visit_id);
  end if;

  if p_outcome = 'not_received' then
    -- Releases the visit and sends a not-confirmed outcome; creates no incident.
    update public.booking_visit_deposits
       set state = 'not_received', recorded_at = statement_timestamp(),
           recorded_by = auth.uid(), staff_verification_reference = p_staff_reference
     where visit_id = p_visit_id;
    update public.bookings
       set status = 'Cancelled', cancel_reason = 'Deposit not received'
     where visit_id = p_visit_id and visit_membership_state = 'included'
       and status = 'Booked';
    perform smarter_dog_private.close_open_change_requests(p_visit_id);
    update public.booking_visits
       set lifecycle_state = 'declined',
           row_revision = row_revision + 1
     where id = p_visit_id;

    insert into public.booking_policy_audit
      (visit_id, human_id, action, actor_id, actor_scope, reason)
    values (p_visit_id, v.human_id, 'deposit_not_received', auth.uid(), 'staff', p_reason);

    v_receipt := smarter_dog_private.visit_receipt(
      p_visit_id, 'withdrawn', null, null, 'deposit-not-received:' || p_visit_id::text);
    perform smarter_dog_private.store_receipt('staff', p_idempotency_key, v_hash, v_receipt);
    return v_receipt;
  end if;

  if p_bank_received_at is null then
    raise exception 'a received deposit needs the customer bank receipt time'
      using errcode = '22023';
  end if;
  if p_bank_received_at > statement_timestamp() then
    raise exception 'a bank receipt time cannot be in the future' using errcode = 'P0001';
  end if;

  -- The receipt time, not the check time, decides punctuality. Staff may
  -- still accept a late payment; that decision is audited either way.
  v_on_time := d.due_at is null or p_bank_received_at <= d.due_at;

  insert into public.booking_financial_ledger
    (human_id, visit_id, event_kind, amount_pence, reason, idempotency_key, recorded_by)
  values (v.human_id, p_visit_id, 'deposit_received', 1000,
          coalesce(p_reason, 'Deposit verified by staff'),
          'deposit-received:' || p_idempotency_key::text, auth.uid())
  returning id into v_event_id;

  update public.booking_visit_deposits
     set state = 'received', satisfaction_source = 'bank',
         satisfaction_event_id = v_event_id, bank_received_at = p_bank_received_at,
         recorded_at = statement_timestamp(), recorded_by = auth.uid(),
         staff_verification_reference = p_staff_reference
   where visit_id = p_visit_id;

  update public.booking_visits
     set row_revision = row_revision + 1
   where id = p_visit_id
     and lifecycle_state = 'active';

  v_confirm := smarter_dog_private.confirm_booking_visit_core(
    p_visit_id, 'deposit_satisfied', statement_timestamp(), 'staff', p_reason);

  insert into public.booking_policy_audit
    (visit_id, human_id, action, actor_id, actor_scope, reason, detail)
  values (p_visit_id, v.human_id, 'deposit_received', auth.uid(), 'staff', p_reason,
          jsonb_build_object('bankReceivedAt', p_bank_received_at,
                             'onTime', v_on_time,
                             'confirmed', v_confirm->'confirmed'));

  v_receipt := smarter_dog_private.visit_receipt(
    p_visit_id,
    case when (v_confirm->>'confirmed')::boolean then 'confirmed' else 'late_deposit_review' end,
    null,
    jsonb_build_object('kind','none','amount_pence',null,'refund_due_at',null),
    'deposit-received:' || p_visit_id::text);
  perform smarter_dog_private.store_receipt('staff', p_idempotency_key, v_hash, v_receipt);
  return v_receipt;
end;
$$;
revoke all on function public.record_visit_deposit_outcome(uuid, integer, text, timestamptz, text, uuid, text) from public;
revoke all on function public.record_visit_deposit_outcome(uuid, integer, text, timestamptz, text, uuid, text) from anon;
revoke all on function public.record_visit_deposit_outcome(uuid, integer, text, timestamptz, text, uuid, text) from authenticated;
grant execute on function public.record_visit_deposit_outcome(uuid, integer, text, timestamptz, text, uuid, text) to authenticated;

-- Resolve an open deposit-money liability into the customer's chosen outcome.
create or replace function public.resolve_visit_deposit_money(
  p_visit_id uuid,
  p_expected_visit_revision integer,
  p_resolution text,
  p_idempotency_key uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v record;
  d record;
  rec record;
  v_event_id uuid;
  v_due timestamptz;
  v_coverage uuid;
  v_calendar_source text;
  v_hash text;
  v_prior jsonb;
  v_receipt jsonb;
  v_money jsonb;
begin
  perform smarter_dog_private.require_staff();
  if public.booking_policy_runtime() <> 'active' then
    return smarter_dog_private.blocked_receipt('policy_not_active', p_visit_id);
  end if;
  if p_resolution not in ('refund','credit') then
    raise exception 'a liability resolves to refund or credit' using errcode = '22023';
  end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then
    raise exception 'resolving a liability needs a reason' using errcode = '22023';
  end if;
  v_hash := md5(coalesce(p_visit_id::text,'') || '|'
                || coalesce(p_expected_visit_revision::text,'') || '|'
                || p_resolution);
  v_prior := smarter_dog_private.replay_receipt('staff', p_idempotency_key, v_hash);
  if v_prior is not null then
    return v_prior;
  end if;

  select * into v from public.booking_visits where id = p_visit_id for update;
  if not found then
    return smarter_dog_private.blocked_receipt('not_found', p_visit_id);
  end if;
  if p_expected_visit_revision is null
     or v.row_revision <> p_expected_visit_revision then
    return jsonb_build_object(
      'outcome','blocked','block_reason','stale_review',
      'visit_id',p_visit_id,'revision',v.row_revision,'outcome_key',null);
  end if;
  select * into d from public.booking_visit_deposits where visit_id = p_visit_id for update;
  select * into rec from public.booking_deposit_money_reconciliations
   where visit_id = p_visit_id and state = 'open' for update;
  if not found then
    return smarter_dog_private.blocked_receipt('not_found', p_visit_id);
  end if;

  if p_resolution = 'refund' then
    select verified.due_at, verified.coverage_id, verified.calendar_source
      into v_due, v_coverage, v_calendar_source
      from public.refund_due_at_verified(statement_timestamp()) verified;
    insert into public.booking_financial_ledger
      (human_id, visit_id, event_kind, amount_pence, reason, idempotency_key,
       due_at, refund_origin, refund_deadline_basis,
       refund_calendar_source, refund_calendar_coverage_id, recorded_by)
    values (v.human_id, p_visit_id, 'refund_due', 1000, p_reason,
            'liability-refund:' || p_idempotency_key::text, v_due, 'deposit',
            'deposit_working_days', v_calendar_source, v_coverage, auth.uid())
    returning id into v_event_id;
    v_money := jsonb_build_object('kind','refund_due','amount_pence',1000,
                                  'refund_due_at', v_due);
  else
    insert into public.booking_financial_ledger
      (human_id, visit_id, event_kind, amount_pence, reason, idempotency_key, recorded_by)
    values (v.human_id, p_visit_id, 'credit_issued', 1000, p_reason,
            'liability-credit:' || p_idempotency_key::text, auth.uid())
    returning id into v_event_id;
    v_money := jsonb_build_object('kind','credit_issued','amount_pence',1000,
                                  'refund_due_at', null);
  end if;

  update public.booking_deposit_money_reconciliations
     set state = 'resolved', resolution = p_resolution, resolution_event_id = v_event_id,
         resolved_at = statement_timestamp(), resolved_by = auth.uid()
   where id = rec.id;

  update public.booking_visit_deposits
     set disposition_event_id = v_event_id where visit_id = p_visit_id;

  update public.booking_visits
     set row_revision = row_revision + 1
   where id = p_visit_id;

  insert into public.booking_policy_audit
    (visit_id, human_id, action, actor_id, actor_scope, reason, detail)
  values (p_visit_id, v.human_id, 'deposit_liability_resolved', auth.uid(), 'staff', p_reason,
          jsonb_build_object('resolution', p_resolution));

  v_receipt := smarter_dog_private.visit_receipt(
    p_visit_id, 'cancelled', null, v_money, 'liability-resolved:' || p_visit_id::text);
  perform smarter_dog_private.store_receipt('staff', p_idempotency_key, v_hash, v_receipt);
  return v_receipt;
end;
$$;
revoke all on function public.resolve_visit_deposit_money(uuid, integer, text, uuid, text) from public;
revoke all on function public.resolve_visit_deposit_money(uuid, integer, text, uuid, text) from anon;
revoke all on function public.resolve_visit_deposit_money(uuid, integer, text, uuid, text) from authenticated;
grant execute on function public.resolve_visit_deposit_money(uuid, integer, text, uuid, text) to authenticated;

-- Settle a refund obligation with real payment evidence.
create or replace function public.settle_booking_refund_due(
  p_refund_due_id uuid,
  p_actual_paid_at timestamptz,
  p_bank_reference text,
  p_idempotency_key uuid,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ob record;
  v_hash text;
  v_prior jsonb;
  v_receipt jsonb;
begin
  perform smarter_dog_private.require_staff();
  if public.booking_policy_runtime() <> 'active' then
    return smarter_dog_private.blocked_receipt('policy_not_active');
  end if;
  if nullif(trim(coalesce(p_bank_reference,'')),'') is null then
    raise exception 'a refund payment needs its bank reference' using errcode = '22023';
  end if;
  if p_actual_paid_at is null or p_actual_paid_at > statement_timestamp() then
    raise exception 'a refund payment time must be real and not in the future'
      using errcode = 'P0001';
  end if;
  v_hash := md5(coalesce(p_refund_due_id::text,''));
  v_prior := smarter_dog_private.replay_receipt('staff', p_idempotency_key, v_hash);
  if v_prior is not null then
    return v_prior;
  end if;

  select * into ob from public.booking_financial_ledger
   where id = p_refund_due_id and event_kind = 'refund_due' for update;
  if not found then
    raise exception 'unknown refund obligation' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.booking_financial_ledger
              where settles_event_id = p_refund_due_id) then
    raise exception 'that obligation is already settled' using errcode = 'P0001';
  end if;

  insert into public.booking_financial_ledger
    (human_id, visit_id, event_kind, amount_pence, reason, idempotency_key,
     settles_event_id, actual_paid_at, bank_reference, recorded_by)
  values (ob.human_id, ob.visit_id, 'refund_paid', ob.amount_pence,
          coalesce(p_reason, 'Refund paid'), 'refund-paid:' || p_idempotency_key::text,
          p_refund_due_id, p_actual_paid_at, p_bank_reference, auth.uid());

  if ob.visit_id is not null then
    update public.booking_visits
       set row_revision = row_revision + 1
     where id = ob.visit_id;
  end if;

  v_receipt := jsonb_build_object('outcome','refund_paid','obligation_id', p_refund_due_id,
                                  'amount_pence', ob.amount_pence,
                                  'outcome_key', 'refund-paid:' || p_refund_due_id::text);
  perform smarter_dog_private.store_receipt('staff', p_idempotency_key, v_hash, v_receipt);
  return v_receipt;
end;
$$;
revoke all on function public.settle_booking_refund_due(uuid, timestamptz, text, uuid, text) from public;
revoke all on function public.settle_booking_refund_due(uuid, timestamptz, text, uuid, text) from anon;
revoke all on function public.settle_booking_refund_due(uuid, timestamptz, text, uuid, text) from authenticated;
grant execute on function public.settle_booking_refund_due(uuid, timestamptz, text, uuid, text) to authenticated;

-- ── 3. Incidents, waivers and deposit overrides ─────────────────────
--
-- Only staff mark a no-show; no scheduled process ever infers one, and a
-- request that was never approved cannot become an incident.

create or replace function public.record_booking_incident(
  p_visit_id uuid,
  p_expected_visit_revision integer,
  p_kind text,
  p_reason text,
  p_idempotency_key uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v record;
  v_hash text;
  v_prior jsonb;
  v_id uuid;
  v_contact record;
  v_start timestamptz;
  v_result jsonb;
begin
  perform smarter_dog_private.require_staff();
  if public.booking_policy_runtime() <> 'active' then
    return smarter_dog_private.blocked_receipt('policy_not_active', p_visit_id);
  end if;
  if p_kind not in ('late_cancellation','late_reschedule','no_show',
                    'late_arrival_unserviceable','late_partial_change') then
    raise exception 'unknown incident kind' using errcode = '22023';
  end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then
    raise exception 'an incident needs a reason' using errcode = '22023';
  end if;
  v_hash := md5(coalesce(p_visit_id::text,'') || '|'
                || coalesce(p_expected_visit_revision::text,'') || '|'
                || p_kind);
  v_prior := smarter_dog_private.replay_receipt('staff', p_idempotency_key, v_hash);
  if v_prior is not null then
    return v_prior;
  end if;

  select * into v from public.booking_visits where id = p_visit_id for update;
  if not found then
    raise exception 'unknown visit' using errcode = 'P0001';
  end if;
  if p_expected_visit_revision is null
     or v.row_revision <> p_expected_visit_revision then
    return jsonb_build_object(
      'outcome','blocked','block_reason','stale_review',
      'visit_id',p_visit_id,'revision',v.row_revision,'outcome_key',null);
  end if;
  -- A never-confirmed request can never become an incident.
  if v.confirmation_state <> 'confirmed' then
    raise exception 'a request that was never confirmed cannot become an incident'
      using errcode = 'P0001';
  end if;

  -- Same-day and last-minute visits are automatically waived when the
  -- customer made trusted contact before the appointment started.
  v_start := public.visit_start_at(p_visit_id);
  select * into v_contact from public.booking_customer_contact_events
   where visit_id = p_visit_id
     and (v_start is null or contacted_at < v_start)
   order by contacted_at limit 1;

  insert into public.booking_policy_incidents
    (visit_id, human_id, kind, appointment_date, recorded_by, reason,
     waived_at, waived_by, waiver_reason)
  values (p_visit_id, v.human_id, p_kind, v.booking_date, auth.uid(), p_reason,
          case when v.is_last_minute and v_contact.id is not null
               then statement_timestamp() else null end,
          case when v.is_last_minute and v_contact.id is not null
               then auth.uid() else null end,
          case when v.is_last_minute and v_contact.id is not null
               then 'Customer contacted the salon before a same-day appointment'
               else null end)
  returning id into v_id;

  insert into public.booking_policy_incident_audit
    (incident_id, action, reason, actor_id)
  values (v_id, 'recorded', p_reason, auth.uid());

  update public.booking_visits
     set row_revision = row_revision + 1
   where id = p_visit_id;

  v_result := jsonb_build_object(
    'incident_id', v_id, 'kind', p_kind,
    'waived', v.is_last_minute and v_contact.id is not null,
    'outcome_key', 'incident:' || v_id::text);
  perform smarter_dog_private.store_receipt('staff', p_idempotency_key, v_hash, v_result);
  return v_result;
end;
$$;
revoke all on function public.record_booking_incident(uuid, integer, text, text, uuid) from public;
revoke all on function public.record_booking_incident(uuid, integer, text, text, uuid) from anon;
revoke all on function public.record_booking_incident(uuid, integer, text, text, uuid) from authenticated;
grant execute on function public.record_booking_incident(uuid, integer, text, text, uuid) to authenticated;

create or replace function public.mark_booking_visit_no_show(
  p_visit_id uuid,
  p_expected_visit_revision integer,
  p_reason text,
  p_idempotency_key uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Marking a no-show sends no automatic customer message: staff deal with
  -- the customer manually.
  perform smarter_dog_private.require_staff();
  if public.booking_policy_runtime() <> 'active' then
    return smarter_dog_private.blocked_receipt('policy_not_active', p_visit_id);
  end if;
  return public.record_booking_incident(
    p_visit_id, p_expected_visit_revision, 'no_show', p_reason, p_idempotency_key);
end;
$$;
revoke all on function public.mark_booking_visit_no_show(uuid, integer, text, uuid) from public;
revoke all on function public.mark_booking_visit_no_show(uuid, integer, text, uuid) from anon;
revoke all on function public.mark_booking_visit_no_show(uuid, integer, text, uuid) from authenticated;
grant execute on function public.mark_booking_visit_no_show(uuid, integer, text, uuid) to authenticated;

create or replace function public.set_booking_incident_waiver(
  p_incident_id uuid,
  p_expected_incident_revision integer,
  p_waived boolean,
  p_reason text,
  p_idempotency_key uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inc record;
  v_hash text;
  v_prior jsonb;
  v_result jsonb;
begin
  perform smarter_dog_private.require_staff();
  if public.booking_policy_runtime() <> 'active' then
    return smarter_dog_private.blocked_receipt('policy_not_active');
  end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then
    raise exception 'a waiver decision needs a reason' using errcode = '22023';
  end if;
  v_hash := md5(coalesce(p_incident_id::text,'') || '|'
                || coalesce(p_expected_incident_revision::text,'') || '|'
                || p_waived::text);
  v_prior := smarter_dog_private.replay_receipt('staff', p_idempotency_key, v_hash);
  if v_prior is not null then
    return v_prior;
  end if;

  select * into inc from public.booking_policy_incidents
   where id = p_incident_id for update;
  if not found then
    raise exception 'unknown incident' using errcode = 'P0001';
  end if;
  if p_expected_incident_revision is null
     or inc.revision <> p_expected_incident_revision then
    return jsonb_build_object(
      'outcome','blocked','block_reason','stale_review',
      'incident_id',p_incident_id,'revision',inc.revision,'outcome_key',null);
  end if;

  update public.booking_policy_incidents
     set waived_at = case when p_waived then statement_timestamp() else null end,
         waived_by = case when p_waived then auth.uid() else null end,
         waiver_reason = case when p_waived then p_reason else null end,
         revision = revision + 1
   where id = p_incident_id;

  update public.booking_visits
     set row_revision = row_revision + 1
   where id = inc.visit_id;

  insert into public.booking_policy_incident_audit
    (incident_id, action, reason, actor_id)
  values (p_incident_id, case when p_waived then 'waived' else 'unwaived' end,
          p_reason, auth.uid());

  v_result := jsonb_build_object('incident_id', p_incident_id, 'waived', p_waived,
                                 'outcome_key', 'incident-waiver:' || p_incident_id::text);
  perform smarter_dog_private.store_receipt('staff', p_idempotency_key, v_hash, v_result);
  return v_result;
end;
$$;
revoke all on function public.set_booking_incident_waiver(uuid, integer, boolean, text, uuid) from public;
revoke all on function public.set_booking_incident_waiver(uuid, integer, boolean, text, uuid) from anon;
revoke all on function public.set_booking_incident_waiver(uuid, integer, boolean, text, uuid) from authenticated;
grant execute on function public.set_booking_incident_waiver(uuid, integer, boolean, text, uuid) to authenticated;

-- The account-level deposit override. Superseding a current override closes
-- it rather than rewriting it, so history stays intact.
create or replace function public.set_customer_deposit_override(
  p_human_id uuid,
  p_mode text,
  p_reason text,
  p_idempotency_key uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hash text;
  v_prior jsonb;
  v_id uuid;
  v_result jsonb;
begin
  perform smarter_dog_private.require_staff();
  if public.booking_policy_runtime() <> 'active' then
    return smarter_dog_private.blocked_receipt('policy_not_active');
  end if;
  if p_mode not in ('required','waived','clear') then
    raise exception 'the override mode must be required, waived or clear' using errcode = '22023';
  end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then
    raise exception 'an override needs a reason' using errcode = '22023';
  end if;
  v_hash := md5(coalesce(p_human_id::text,'') || '|' || p_mode);
  v_prior := smarter_dog_private.replay_receipt('staff', p_idempotency_key, v_hash);
  if v_prior is not null then
    return v_prior;
  end if;

  update public.customer_booking_rule_overrides
     set effective_to = statement_timestamp()
   where human_id = p_human_id and effective_to is null;

  if p_mode <> 'clear' then
    insert into public.customer_booking_rule_overrides
      (human_id, mode, reason, recorded_by, idempotency_key)
    values (p_human_id, p_mode, p_reason, auth.uid(),
            'override:' || p_idempotency_key::text)
    returning id into v_id;
  end if;

  insert into public.booking_policy_audit
    (human_id, action, actor_id, actor_scope, reason, detail)
  values (p_human_id, 'deposit_override_set', auth.uid(), 'staff', p_reason,
          jsonb_build_object('mode', p_mode, 'overrideId', v_id));

  v_result := jsonb_build_object('override_id', v_id, 'mode', p_mode,
                                 'outcome_key', 'override:' || p_idempotency_key::text);
  perform smarter_dog_private.store_receipt('staff', p_idempotency_key, v_hash, v_result);
  return v_result;
end;
$$;
revoke all on function public.set_customer_deposit_override(uuid, text, text, uuid) from public;
revoke all on function public.set_customer_deposit_override(uuid, text, text, uuid) from anon;
revoke all on function public.set_customer_deposit_override(uuid, text, text, uuid) from authenticated;
grant execute on function public.set_customer_deposit_override(uuid, text, text, uuid) to authenticated;

-- Waive the deposit requirement on THIS visit only; it never rewrites the
-- customer's account-level override.
create or replace function public.waive_visit_deposit_requirement(
  p_visit_id uuid,
  p_expected_visit_revision integer,
  p_reason text,
  p_idempotency_key uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v record;
  d record;
  v_hash text;
  v_prior jsonb;
  v_before jsonb;
  v_receipt jsonb;
  v_confirm jsonb;
  cr record;
  v_event_id uuid;
begin
  perform smarter_dog_private.require_staff();
  if public.booking_policy_runtime() <> 'active' then
    return smarter_dog_private.blocked_receipt('policy_not_active', p_visit_id);
  end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then
    raise exception 'a deposit waiver needs a reason' using errcode = '22023';
  end if;
  v_hash := md5(coalesce(p_visit_id::text,'') || '|'
                || coalesce(p_expected_visit_revision::text,''));
  v_prior := smarter_dog_private.replay_receipt('staff', p_idempotency_key, v_hash);
  if v_prior is not null then
    return v_prior;
  end if;

  select * into v from public.booking_visits where id = p_visit_id for update;
  if not found then
    return smarter_dog_private.blocked_receipt('not_found', p_visit_id);
  end if;
  if p_expected_visit_revision is null
     or v.row_revision <> p_expected_visit_revision then
    return jsonb_build_object(
      'outcome','blocked','block_reason','stale_review',
      'visit_id',p_visit_id,'revision',v.row_revision,'outcome_key',null);
  end if;
  if v.lifecycle_state <> 'active' then
    return smarter_dog_private.blocked_receipt('state_not_eligible', p_visit_id);
  end if;
  select * into d from public.booking_visit_deposits where visit_id = p_visit_id for update;
  if not found or d.state not in ('awaiting_terms','awaiting_payment') then
    return smarter_dog_private.blocked_receipt('state_not_eligible', p_visit_id);
  end if;
  v_before := to_jsonb(d);

  for cr in
    select * from public.customer_credit_reservations
     where visit_id = p_visit_id and state = 'reserved' for update
  loop
    insert into public.booking_financial_ledger
      (human_id, visit_id, event_kind, amount_pence, reason, idempotency_key, recorded_by)
    values (v.human_id, p_visit_id, 'credit_released', cr.amount_pence,
            'Staff waived the deposit for this visit',
            'waive-release:' || p_idempotency_key::text, auth.uid())
    returning id into v_event_id;
    update public.customer_credit_reservations
       set state = 'released', terminal_event_id = v_event_id where id = cr.id;
  end loop;

  update public.booking_visit_deposits
     set state = 'not_required', exemption_reason = 'staff_waived',
         requirement_reason = null, due_at = null
   where visit_id = p_visit_id;

  update public.booking_visits
     set row_revision = row_revision + 1
   where id = p_visit_id
     and lifecycle_state = 'active';

  v_confirm := smarter_dog_private.confirm_booking_visit_core(
    p_visit_id, 'exempt', statement_timestamp(), 'staff', p_reason);

  insert into public.booking_policy_audit
    (visit_id, human_id, action, actor_id, actor_scope, reason, detail)
  values (p_visit_id, v.human_id, 'deposit_waived', auth.uid(), 'staff', p_reason,
          jsonb_build_object('before', v_before,
                             'after', to_jsonb((select d2 from public.booking_visit_deposits d2
                                                 where d2.visit_id = p_visit_id))));

  v_receipt := smarter_dog_private.visit_receipt(
    p_visit_id,
    case when (v_confirm->>'confirmed')::boolean then 'confirmed' else 'waiting_staff' end,
    null, null, 'deposit-waived:' || p_visit_id::text);
  perform smarter_dog_private.store_receipt('staff', p_idempotency_key, v_hash, v_receipt);
  return v_receipt;
end;
$$;
revoke all on function public.waive_visit_deposit_requirement(uuid, integer, text, uuid) from public;
revoke all on function public.waive_visit_deposit_requirement(uuid, integer, text, uuid) from anon;
revoke all on function public.waive_visit_deposit_requirement(uuid, integer, text, uuid) from authenticated;
grant execute on function public.waive_visit_deposit_requirement(uuid, integer, text, uuid) to authenticated;

-- ── 4. Trusted customer contact evidence ────────────────────────────

create or replace function public.record_customer_booking_contact(
  p_visit_id uuid,
  p_expected_visit_revision integer,
  p_channel text,
  p_contacted_at timestamptz,
  p_idempotency_key uuid,
  p_provider_message_id text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v record;
  v_id uuid;
  v_hash text;
  v_prior jsonb;
  v_result jsonb;
begin
  perform smarter_dog_private.require_staff();
  if public.booking_policy_runtime() <> 'active' then
    return smarter_dog_private.blocked_receipt('policy_not_active', p_visit_id);
  end if;
  v_hash := md5(coalesce(p_visit_id::text,'') || '|'
                || coalesce(p_expected_visit_revision::text,'') || '|'
                || coalesce(p_channel,'') || '|'
                || coalesce(p_contacted_at::text,'') || '|'
                || coalesce(p_provider_message_id,''));
  v_prior := smarter_dog_private.replay_receipt('staff', p_idempotency_key, v_hash);
  if v_prior is not null then
    return v_prior;
  end if;
  select * into v from public.booking_visits where id = p_visit_id for update;
  if not found then
    return smarter_dog_private.blocked_receipt('not_found', p_visit_id);
  end if;
  if p_expected_visit_revision is null
     or v.row_revision <> p_expected_visit_revision then
    return jsonb_build_object(
      'outcome','blocked','block_reason','stale_review',
      'visit_id',p_visit_id,'revision',v.row_revision,'outcome_key',null);
  end if;
  insert into public.booking_customer_contact_events
    (visit_id, channel, contacted_at, provider_message_id, recorded_by, idempotency_key)
  values (p_visit_id, p_channel, p_contacted_at, p_provider_message_id, auth.uid(),
          'contact:' || p_idempotency_key::text)
  on conflict (idempotency_key) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.booking_customer_contact_events
     where idempotency_key = 'contact:' || p_idempotency_key::text;
  end if;
  update public.booking_visits
     set row_revision = row_revision + 1
   where id = p_visit_id;
  v_result := jsonb_build_object('contact_event_id', v_id,
                                 'outcome_key', 'contact:' || v_id::text);
  perform smarter_dog_private.store_receipt(
    'staff', p_idempotency_key, v_hash, v_result);
  return v_result;
end;
$$;
revoke all on function public.record_customer_booking_contact(uuid, integer, text, timestamptz, uuid, text) from public;
revoke all on function public.record_customer_booking_contact(uuid, integer, text, timestamptz, uuid, text) from anon;
revoke all on function public.record_customer_booking_contact(uuid, integer, text, timestamptz, uuid, text) from authenticated;
grant execute on function public.record_customer_booking_contact(uuid, integer, text, timestamptz, uuid, text) to authenticated;

-- ── 5. Late change request decisions ────────────────────────────────

create or replace function public.decide_booking_change_request(
  p_request_id uuid,
  p_expected_request_revision integer,
  p_decision text,
  p_reason text,
  p_idempotency_key uuid,
  p_record_incident boolean default true
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cr record;
  v record;
  v_hash text;
  v_prior jsonb;
  v_result jsonb;
  v_incident jsonb := null;
  v_contact record;
  v_start timestamptz;
  v_source_visit_id uuid;
begin
  perform smarter_dog_private.require_staff();
  if public.booking_policy_runtime() <> 'active' then
    return smarter_dog_private.blocked_receipt('policy_not_active');
  end if;
  if p_decision not in ('accept','decline') then
    raise exception 'the decision must be accept or decline' using errcode = '22023';
  end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then
    raise exception 'a change decision needs a reason' using errcode = '22023';
  end if;
  v_hash := md5(coalesce(p_request_id::text,'') || '|'
                || coalesce(p_expected_request_revision::text,'') || '|'
                || p_decision);
  v_prior := smarter_dog_private.replay_receipt('staff', p_idempotency_key, v_hash);
  if v_prior is not null then
    return v_prior;
  end if;

  select source_visit_id into v_source_visit_id
    from public.booking_change_requests
   where id = p_request_id;
  if not found then
    raise exception 'unknown or already decided request' using errcode = 'P0001';
  end if;
  -- Every command that touches a visit and one of its requests takes the
  -- aggregate lock first. This matches terminalisation and avoids a
  -- request→visit / visit→request deadlock.
  select * into v from public.booking_visits
   where id = v_source_visit_id for update;
  select * into cr from public.booking_change_requests
   where id = p_request_id for update;
  if p_expected_request_revision is null
     or cr.revision <> p_expected_request_revision then
    return jsonb_build_object(
      'outcome','blocked','block_reason','stale_review',
      'request_id',p_request_id,'revision',cr.revision,'outcome_key',null);
  end if;
  if cr.status not in ('pending_staff','waiting_customer') then
    raise exception 'unknown or already decided request' using errcode = 'P0001';
  end if;

  if p_decision = 'decline' then
    -- A declined late request creates no incident: the customer may still attend.
    update public.booking_change_requests
       set status = 'declined', decided_at = statement_timestamp(),
           decided_by = auth.uid(), decision_reason = p_reason,
           revision = revision + 1
     where id = p_request_id;
    update public.booking_change_destination_reservations
       set state = 'released', released_at = statement_timestamp()
     where request_id = p_request_id and state = 'held';
  else
    update public.booking_change_requests
       set status = 'accepted', decided_at = statement_timestamp(),
           decided_by = auth.uid(), decision_reason = p_reason,
           revision = revision + 1
     where id = p_request_id;

    -- An accepted, unwaived late change is one incident unless staff waive it
    -- or a trusted pre-start contact already earns the same-day waiver.
    if p_record_incident and cr.reason_code = 'source_deadline_late' then
      v_start := public.visit_start_at(cr.source_visit_id);
      select * into v_contact from public.booking_customer_contact_events
       where visit_id = cr.source_visit_id
         and (v_start is null or contacted_at < v_start)
       order by contacted_at limit 1;

      if not (v.is_last_minute and v_contact.id is not null)
         and not exists (select 1 from public.booking_policy_incidents
                          where visit_id = cr.source_visit_id) then
        v_incident := public.record_booking_incident(
          cr.source_visit_id,
          v.row_revision,
          case cr.kind when 'cancel' then 'late_cancellation'
                       when 'reschedule' then 'late_reschedule'
                       else 'late_partial_change' end,
          'Accepted late ' || cr.kind || ': ' || p_reason,
          gen_random_uuid());
      end if;
    end if;
  end if;

  update public.booking_visits
     set row_revision = row_revision + 1
   where id = cr.source_visit_id;

  insert into public.booking_policy_audit
    (visit_id, human_id, action, actor_id, actor_scope, reason, detail)
  values (cr.source_visit_id, cr.human_id, 'change_request_decided', auth.uid(), 'staff',
          p_reason, jsonb_build_object('requestId', p_request_id, 'decision', p_decision));

  v_result := jsonb_build_object(
    'request_id', p_request_id, 'decision', p_decision,
    'incident', v_incident,
    'outcome_key', 'change-decided:' || p_request_id::text);
  perform smarter_dog_private.store_receipt('staff', p_idempotency_key, v_hash, v_result);
  return v_result;
end;
$$;
revoke all on function public.decide_booking_change_request(uuid, integer, text, text, uuid, boolean) from public;
revoke all on function public.decide_booking_change_request(uuid, integer, text, text, uuid, boolean) from anon;
revoke all on function public.decide_booking_change_request(uuid, integer, text, text, uuid, boolean) from authenticated;
grant execute on function public.decide_booking_change_request(uuid, integer, text, text, uuid, boolean) to authenticated;

comment on function public.record_visit_deposit_outcome(uuid, integer, text, timestamptz, text, uuid, text) is
  'Staff record Received or Not received for a whole visit. The customer bank receipt time decides punctuality, never the later staff-check time. Reaching the due time cancels nothing and releases no capacity.';
comment on function public.mark_booking_visit_no_show(uuid, integer, text, uuid) is
  'Only staff mark a no-show; no scheduled process infers one and no automatic customer message is sent.';
