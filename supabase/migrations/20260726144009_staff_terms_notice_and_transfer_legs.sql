-- ============================================================
-- Two corrections to the staff write commands
--
-- 1. Terms notice was FABRICATED. 20260726144008 hard-coded
--    terms_acknowledgement = 'staff_notice' on every staff-created visit,
--    which asserts that the customer was told about the Terms purely because
--    a staff member made the booking. Nobody actually declared that. The
--    command now requires an explicit notice declaration from the caller,
--    records how and when notice was given and by whom, and refuses to create
--    an active-policy visit without one. It is still evidence that STAFF
--    RECORDED GIVING NOTICE — never evidence that the customer accepted.
--
-- 2. A prepayment transfer wrote a single ledger row. Money moving between
--    two visits should read as two linked, equal, immutable legs — one out of
--    the source, one into the destination — so the ledger balances by
--    inspection rather than by trusting a related_visit_id on one row. The
--    promised refund date is also now bounded: it cannot be in the past, so a
--    late refund can never be made to look timely.
--
-- Plan: docs/superpowers/plans/2026-07-23-path-b-execution-plan.md (Task 1)
-- ============================================================

-- ── 1. Notice evidence, recorded not assumed ────────────────────────

alter table public.booking_visits
  add column if not exists terms_notice_method text
    check (terms_notice_method in ('in_person','phone','whatsapp','email','other')),
  add column if not exists terms_notice_at timestamptz,
  add column if not exists terms_notice_by uuid references auth.users(id);

comment on column public.booking_visits.terms_notice_method is
  'How staff gave the customer notice of this visit''s frozen Terms publication. Staff bookings are taken in person, by phone and over WhatsApp, so the method is declared by the caller and never assumed.';
comment on column public.booking_visits.terms_notice_at is
  'When staff recorded giving notice. This is NOT a customer acceptance timestamp — portal acceptance is recorded separately on the deposit row.';

-- A recorded notice is complete or absent, never half-written.
alter table public.booking_visits
  drop constraint if exists booking_visits_terms_notice_complete;
alter table public.booking_visits
  add constraint booking_visits_terms_notice_complete check (
    (terms_acknowledgement = 'staff_notice'
      and terms_notice_method is not null
      and terms_notice_at is not null
      and terms_notice_by is not null)
    or
    (terms_acknowledgement <> 'staff_notice'
      and terms_notice_method is null
      and terms_notice_at is null
      and terms_notice_by is null)
  );

-- Write-once, alongside the acknowledgement basis and the publication.
create or replace function public.guard_booking_visit_terms_acknowledgement()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.terms_acknowledgement <> 'not_recorded'
     and new.terms_acknowledgement is distinct from old.terms_acknowledgement then
    raise exception 'visit %: the Terms acknowledgement basis is immutable once recorded', old.id
      using errcode = 'P0001';
  end if;
  if old.terms_notice_method is not null
     and (new.terms_notice_method is distinct from old.terms_notice_method
          or new.terms_notice_at is distinct from old.terms_notice_at
          or new.terms_notice_by is distinct from old.terms_notice_by) then
    raise exception 'visit %: the recorded Terms notice is immutable', old.id
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- The caller must declare notice. Nothing is defaulted here: an absent or
-- malformed declaration raises, so no visit is created at all.
create or replace function smarter_dog_private.create_staff_visit_v1(
  p_human_id uuid,
  p_date date,
  p_at timestamptz,
  p_source text,
  p_notice_method text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lineage uuid;
  v_visit uuid;
  v_settings record;
  v_policy text;
begin
  select * into v_settings from public.booking_policy_settings where singleton;
  if v_settings.current_terms_publication_id is null then
    raise exception 'policy_setup_incomplete' using errcode = 'P0002';
  end if;
  -- No silent default. Staff bookings happen in person, by phone and over
  -- WhatsApp, so the method is the caller's to state.
  if p_notice_method is null
     or p_notice_method not in ('in_person','phone','whatsapp','email','other') then
    raise exception 'terms_notice_required' using errcode = 'P0002';
  end if;
  v_policy := public.policy_for_confirmation(p_at);

  insert into public.booking_lineages (human_id) values (p_human_id)
  returning id into v_lineage;

  insert into public.booking_visits (
    lineage_id, human_id, booking_date, lifecycle_state, approval_state,
    confirmation_state, policy_code, source, requested_at, confirmed_at,
    commercial_eligibility_at, eligibility_policy_code,
    customer_change_deadline_at, runtime_generation, terms_publication_id,
    terms_acknowledgement, terms_notice_method, terms_notice_at, terms_notice_by
  ) values (
    v_lineage, p_human_id, p_date, 'active', 'not_required',
    'confirmed', v_policy, coalesce(p_source, 'staff'), p_at, p_at,
    p_at, v_policy,
    public.change_deadline_for(v_policy, p_date, '08:30'),
    'visit_v1', v_settings.current_terms_publication_id,
    -- Staff recorded giving notice. NOT a portal acceptance.
    'staff_notice', p_notice_method, p_at, auth.uid()
  )
  returning id into v_visit;

  insert into public.booking_visit_deposits
    (visit_id, origin, state, requirement_decided_at, exemption_reason)
  values (v_visit, 'visit_v1', 'not_required', p_at, 'staff_created');

  return v_visit;
end;
$$;
revoke all on function smarter_dog_private.create_staff_visit_v1(uuid, date, timestamptz, text, text)
  from public, anon, authenticated, service_role;
drop function if exists smarter_dog_private.create_staff_visit_v1(uuid, date, timestamptz, text);

create or replace function smarter_dog_private.create_staff_visit_dispatch(
  p_bookings jsonb,
  p_booking_date date,
  p_human_id uuid,
  p_idempotency_key uuid,
  p_source text,
  p_at timestamptz,
  p_runtime_override text default null,
  p_terms_notice_method text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_runtime text;
  v_hash text;
  v_prior jsonb;
  v_visit uuid;
  v_slot_list text[];
  v_lock text;
  v_receipt jsonb;
begin
  perform smarter_dog_private.require_staff();
  v_runtime := coalesce(p_runtime_override, public.booking_policy_runtime_at(p_at));
  if v_runtime <> 'active' then
    return jsonb_build_object('outcome','policy_not_active','visit_id',null,'outcome_key',null);
  end if;
  if p_human_id is null then
    raise exception 'human_id is required' using errcode = '22023';
  end if;

  v_hash := md5(coalesce(p_bookings::text,'') || '|' || coalesce(p_booking_date::text,'')
                || '|' || coalesce(p_human_id::text,'') || '|'
                || coalesce(p_terms_notice_method,''));
  v_prior := smarter_dog_private.replay_receipt('staff', p_idempotency_key, v_hash);
  if v_prior is not null then
    return v_prior;
  end if;

  select array_agg(distinct (e->>'slot') order by (e->>'slot')) into v_slot_list
    from jsonb_array_elements(p_bookings) e where nullif(e->>'slot','') is not null;
  if v_slot_list is not null then
    foreach v_lock in array v_slot_list loop
      perform pg_advisory_xact_lock(hashtextextended(p_booking_date::text || '|' || v_lock, 0));
    end loop;
  end if;

  v_visit := smarter_dog_private.create_staff_visit_v1(
    p_human_id, p_booking_date, p_at, p_source, p_terms_notice_method);
  perform smarter_dog_private.insert_staff_visit_rows(v_visit, p_booking_date, p_bookings);

  insert into public.booking_policy_audit
    (visit_id, human_id, action, actor_id, actor_scope, detail)
  values (v_visit, p_human_id, 'staff_visit_created', auth.uid(), 'staff',
          jsonb_build_object('bookingDate', p_booking_date,
                             'termsNoticeMethod', p_terms_notice_method));

  v_receipt := smarter_dog_private.staff_visit_receipt(v_visit, 'created');
  perform smarter_dog_private.store_receipt('staff', p_idempotency_key, v_hash, v_receipt);
  return v_receipt;
exception
  when sqlstate 'P0002' then
    return jsonb_build_object(
      'outcome','blocked',
      'block_reason', case when sqlerrm = 'terms_notice_required'
                           then 'terms_notice_required' else 'policy_setup_incomplete' end,
      'visit_id',null,'outcome_key',null);
end;
$$;
revoke all on function smarter_dog_private.create_staff_visit_dispatch(
  jsonb, date, uuid, uuid, text, timestamptz, text, text)
  from public, anon, authenticated, service_role;
drop function if exists smarter_dog_private.create_staff_visit_dispatch(
  jsonb, date, uuid, uuid, text, timestamptz, text);

create or replace function public.create_staff_booking_visit(
  p_bookings jsonb,
  p_booking_date date,
  p_human_id uuid,
  p_idempotency_key uuid,
  p_terms_notice_method text,
  p_source text default 'staff'
) returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select smarter_dog_private.create_staff_visit_dispatch(
    p_bookings, p_booking_date, p_human_id, p_idempotency_key, p_source,
    statement_timestamp(), null, p_terms_notice_method);
$$;
drop function if exists public.create_staff_booking_visit(jsonb, date, uuid, uuid, text);
revoke all on function public.create_staff_booking_visit(jsonb, date, uuid, uuid, text, text) from public;
revoke all on function public.create_staff_booking_visit(jsonb, date, uuid, uuid, text, text) from anon;
revoke all on function public.create_staff_booking_visit(jsonb, date, uuid, uuid, text, text) from authenticated;
grant execute on function public.create_staff_booking_visit(jsonb, date, uuid, uuid, text, text) to authenticated;

comment on function public.create_staff_booking_visit(jsonb, date, uuid, uuid, text, text) is
  'Staff whole-visit creation under the active policy. The Terms notice method must be declared explicitly (in_person, phone, whatsapp, email, other) — it is never defaulted, and a missing declaration returns terms_notice_required WITHOUT creating a visit. The record is evidence that staff gave notice of the frozen Terms publication; it is NOT customer acceptance, which only the portal deposit flow can record.';

-- ── 2. Transfer as two linked equal legs, and a bounded refund date ──

create or replace function smarter_dog_private.cancel_staff_visit_dispatch(
  p_visit_id uuid,
  p_expected_revision integer,
  p_idempotency_key uuid,
  p_reason text,
  p_paid_deposit_outcome text,
  p_prepayment_handling text,
  p_record_incident boolean,
  p_incident_kind text,
  p_at timestamptz,
  p_runtime_override text default null,
  p_prepayment_target_visit_id uuid default null,
  p_prepayment_refund_due_at timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_runtime text;
  v record;
  d record;
  tgt record;
  v_hash text;
  v_prior jsonb;
  v_receipt jsonb;
  v_prepaid numeric;
  v_prepaid_pence int;
  v_event_id uuid;
  v_out_leg uuid;
  v_in_leg uuid;
  v_recon_id uuid;
  v_due timestamptz;
  v_coverage uuid;
  v_calendar_source text;
  v_incident jsonb := null;
  v_deposit_money jsonb := jsonb_build_object('kind','none');
  v_prepay_money jsonb := jsonb_build_object('kind','none');
begin
  perform smarter_dog_private.require_staff();
  v_runtime := coalesce(p_runtime_override, public.booking_policy_runtime_at(p_at));
  if v_runtime <> 'active' then
    return jsonb_build_object('outcome','policy_not_active','visit_id',p_visit_id,'outcome_key',null);
  end if;

  v_hash := md5(coalesce(p_visit_id::text,'') || '|' || coalesce(p_reason,'') || '|'
                || coalesce(p_paid_deposit_outcome,'') || '|' || coalesce(p_prepayment_handling,'')
                || '|' || coalesce(p_prepayment_target_visit_id::text,'')
                || '|' || coalesce(p_prepayment_refund_due_at::text,''));
  v_prior := smarter_dog_private.replay_receipt('staff', p_idempotency_key, v_hash);
  if v_prior is not null then
    return v_prior;
  end if;

  select * into v from public.booking_visits where id = p_visit_id for update;
  if not found then
    return jsonb_build_object('outcome','blocked','block_reason','not_found',
                              'visit_id',p_visit_id,'outcome_key',null);
  end if;
  if p_expected_revision is null or v.row_revision <> p_expected_revision then
    return jsonb_build_object('outcome','blocked','block_reason','stale_review',
                              'visit_id',p_visit_id,'revision',v.row_revision,'outcome_key',null);
  end if;
  if v.lifecycle_state <> 'active' then
    return jsonb_build_object('outcome','blocked','block_reason','state_not_eligible',
                              'visit_id',p_visit_id,'outcome_key',null);
  end if;
  if coalesce(p_paid_deposit_outcome, 'refund') not in ('refund','credit') then
    return jsonb_build_object(
      'outcome','blocked','block_reason','invalid_paid_deposit_outcome',
      'visit_id',p_visit_id,'revision',v.row_revision,'outcome_key',null);
  end if;

  select coalesce(sum(coalesce(b.paid_amount,0)),0) into v_prepaid
    from public.bookings b
   where b.visit_id = p_visit_id and b.visit_membership_state = 'included'
     and coalesce(b.payment,'') in ('Paid in Full','Deposit Paid')
     and b.paid_amount is not null and b.paid_amount > 0;
  v_prepaid_pence := (v_prepaid * 100)::int;

  if v_prepaid > 0 then
    if p_prepayment_handling is null
       or p_prepayment_handling not in ('reconciliation_required','refund_due','transfer') then
      return jsonb_build_object('outcome','blocked','block_reason','prepayment_handling_required',
                                'visit_id',p_visit_id,'outcome_key',null);
    end if;
    if p_prepayment_handling = 'refund_due' then
      if p_prepayment_refund_due_at is null then
        return jsonb_build_object('outcome','blocked','block_reason','prepayment_refund_date_required',
                                  'visit_id',p_visit_id,'outcome_key',null);
      end if;
      -- A promise already in the past would make a late refund look timely
      -- the moment it was recorded. The ledger is immutable, so this is the
      -- only chance to reject it.
      if p_prepayment_refund_due_at <= p_at then
        return jsonb_build_object('outcome','blocked','block_reason','prepayment_refund_date_in_past',
                                  'visit_id',p_visit_id,'outcome_key',null);
      end if;
    end if;
    if p_prepayment_handling = 'transfer' then
      select * into tgt from public.booking_visits
       where id = p_prepayment_target_visit_id for update;
      if not found or tgt.human_id <> v.human_id
         or tgt.id = p_visit_id
         or tgt.lifecycle_state <> 'active' then
        return jsonb_build_object('outcome','blocked','block_reason','prepayment_transfer_target_invalid',
                                  'visit_id',p_visit_id,'outcome_key',null);
      end if;
    end if;
  end if;

  update public.bookings
     set status = 'Cancelled',
         cancel_reason = coalesce(nullif(trim(coalesce(p_reason,'')),''), 'Cancelled by staff')
   where visit_id = p_visit_id and visit_membership_state = 'included'
     and status not in ('Cancelled','Completed');

  perform smarter_dog_private.close_open_change_requests(p_visit_id);

  update public.booking_visits
     set lifecycle_state = 'cancelled', cancelled_at = p_at
   where id = p_visit_id;

  if v_prepaid > 0 then
    insert into public.booking_service_prepayment_reconciliations
      (visit_id, human_id, amount_pence, evidence, state, opened_reason)
    values (p_visit_id, v.human_id, v_prepaid_pence,
            jsonb_build_object('source','staff_cancellation','amount', v_prepaid),
            'open', 'Staff cancelled a visit carrying non-deposit prepayment')
    returning id into v_recon_id;

    if p_prepayment_handling = 'refund_due' then
      insert into public.booking_financial_ledger
        (human_id, visit_id, event_kind, amount_pence, reason, idempotency_key,
         due_at, refund_origin, refund_deadline_basis, recorded_by)
      values (v.human_id, p_visit_id, 'refund_due', v_prepaid_pence,
              'Service prepayment refund promised by staff',
              'staffcancel-prepay-refund:' || p_idempotency_key::text,
              p_prepayment_refund_due_at, 'service_prepayment', 'staff_explicit', auth.uid())
      returning id into v_event_id;
      update public.booking_service_prepayment_reconciliations
         set state = 'refund_due', obligation_event_id = v_event_id,
             resolved_at = p_at, resolved_by = auth.uid(),
             resolution_reason = 'Refund promised at cancellation'
       where id = v_recon_id;
      v_prepay_money := jsonb_build_object(
        'kind','refund_due','amount_pence',v_prepaid_pence,
        'refund_due_at',p_prepayment_refund_due_at,'settled',false);

    elsif p_prepayment_handling = 'transfer' then
      -- TWO linked legs of equal value: out of the source, into the
      -- destination. The ledger balances by inspection rather than by
      -- trusting a related_visit_id on a single row, and nothing mutates the
      -- original payment record.
      insert into public.booking_financial_ledger
        (human_id, visit_id, related_visit_id, event_kind, amount_pence, reason,
         idempotency_key, recorded_by)
      values (v.human_id, p_visit_id, p_prepayment_target_visit_id,
              'service_prepayment_transferred', v_prepaid_pence,
              'Service prepayment transferred out of the cancelled visit',
              'staffcancel-prepay-out:' || p_idempotency_key::text, auth.uid())
      returning id into v_out_leg;
      insert into public.booking_financial_ledger
        (human_id, visit_id, related_visit_id, event_kind, amount_pence, reason,
         idempotency_key, recorded_by)
      values (v.human_id, p_prepayment_target_visit_id, p_visit_id,
              'service_prepayment_transferred', v_prepaid_pence,
              'Service prepayment transferred into this visit',
              'staffcancel-prepay-in:' || p_idempotency_key::text, auth.uid())
      returning id into v_in_leg;
      update public.booking_service_prepayment_reconciliations
         set state = 'transferred', target_visit_id = p_prepayment_target_visit_id,
             obligation_event_id = v_out_leg,
             resolved_at = p_at, resolved_by = auth.uid(),
             resolution_reason = 'Transferred to another visit at cancellation'
       where id = v_recon_id;
      v_prepay_money := jsonb_build_object(
        'kind','transferred','amount_pence',v_prepaid_pence,
        'target_visit_id',p_prepayment_target_visit_id,
        'out_leg_event_id',v_out_leg,'in_leg_event_id',v_in_leg);

    else
      v_prepay_money := jsonb_build_object(
        'kind','reconciliation_open','amount_pence',v_prepaid_pence,
        'reconciliation_id',v_recon_id);
    end if;
  end if;

  select * into d from public.booking_visit_deposits where visit_id = p_visit_id for update;
  if d.state = 'received' then
    if coalesce(p_paid_deposit_outcome,'refund') = 'refund' then
      select rv.due_at, rv.coverage_id, rv.calendar_source
        into v_due, v_coverage, v_calendar_source
        from public.refund_due_at_verified(p_at) rv;
      insert into public.booking_financial_ledger
        (human_id, visit_id, event_kind, amount_pence, reason, idempotency_key,
         due_at, refund_origin, refund_deadline_basis,
         refund_calendar_source, refund_calendar_coverage_id, recorded_by)
      values (v.human_id, p_visit_id, 'refund_due', 1000,
              'Staff cancellation refund', 'staffcancel-refund:' || p_idempotency_key::text,
              v_due, 'deposit', 'deposit_working_days', v_calendar_source, v_coverage, auth.uid())
      returning id into v_event_id;
      v_deposit_money := jsonb_build_object(
        'kind','refund_due','amount_pence',1000,'refund_due_at',v_due,'settled',false);
    else
      insert into public.booking_financial_ledger
        (human_id, visit_id, event_kind, amount_pence, reason, idempotency_key, recorded_by)
      values (v.human_id, p_visit_id, 'credit_issued', 1000,
              'Staff cancellation credit', 'staffcancel-credit:' || p_idempotency_key::text, auth.uid())
      returning id into v_event_id;
      v_deposit_money := jsonb_build_object('kind','credit_issued','amount_pence',1000);
    end if;
  end if;

  if coalesce(p_record_incident, false) then
    v_incident := public.record_booking_incident(
      p_visit_id,
      (select current_visit.row_revision
         from public.booking_visits current_visit
        where current_visit.id = p_visit_id),
      coalesce(p_incident_kind,'late_cancellation'),
      coalesce(nullif(trim(coalesce(p_reason,'')),''), 'Staff-recorded incident'),
      gen_random_uuid());
  end if;

  insert into public.booking_policy_audit
    (visit_id, human_id, action, actor_id, actor_scope, reason, detail)
  values (p_visit_id, v.human_id, 'staff_visit_cancelled', auth.uid(), 'staff', p_reason,
          jsonb_build_object('depositOutcome', p_paid_deposit_outcome,
                             'prepaymentHandling', p_prepayment_handling,
                             'prepaymentPence', v_prepaid_pence,
                             'incident', v_incident));

  v_receipt := smarter_dog_private.staff_visit_receipt(
    p_visit_id, 'cancelled', null,
    jsonb_build_object(
      'cancellation', jsonb_build_object('completed', true, 'cancelledAt', p_at),
      'financial', jsonb_build_object(
        'deposit', v_deposit_money,
        'servicePrepayment', v_prepay_money),
      'incident', v_incident));
  perform smarter_dog_private.store_receipt('staff', p_idempotency_key, v_hash, v_receipt);
  return v_receipt;
end;
$$;
revoke all on function smarter_dog_private.cancel_staff_visit_dispatch(
  uuid, integer, uuid, text, text, text, boolean, text, timestamptz, text, uuid, timestamptz)
  from public, anon, authenticated, service_role;
