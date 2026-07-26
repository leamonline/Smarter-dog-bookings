-- ============================================================
-- Staff cancellation: complete the prepayment dispositions, and record how
-- the Terms were given rather than implying customer acceptance
--
-- TWO CORRECTIONS to 20260726144007.
--
-- 1. Prepaid money could still be stranded. The first version accepted
--    'refund_due' and 'transfer' as valid choices but recorded NOTHING for
--    either — only 'reconciliation_required' opened a task. A staff member
--    choosing "refund it" would cancel the visit and leave no obligation
--    anywhere. Every branch now writes its disposition in the same
--    transaction as the cancellation, or refuses.
--
-- 2. A staff-created visit froze the current Terms publication but said
--    nothing about how the customer came to be under them. "The salon has
--    published Terms" and "this customer accepted them in the portal" are
--    different facts and must not be conflated: a staff-created booking is
--    covered by published Terms with notice given verbally or in person, not
--    by a portal acceptance that never happened.
--
-- Plan: docs/superpowers/plans/2026-07-23-path-b-execution-plan.md (Task 1)
-- ============================================================

-- ── 1. How the Terms reached this customer, for this visit ──────────

alter table public.booking_visits
  add column if not exists terms_acknowledgement text not null default 'not_recorded'
    check (terms_acknowledgement in
      ('not_recorded','staff_notice','customer_accepted'));

comment on column public.booking_visits.terms_acknowledgement is
  'How the customer came under this visit''s frozen Terms publication. staff_notice = the salon published Terms and staff informed the customer when booking on their behalf; customer_accepted = the customer personally accepted them in the portal (deposit flows record the instant on the deposit row). Never infer acceptance from publication: a staff-created booking is covered by published Terms, not accepted through the portal.';

-- The frozen publication is already immutable. The acknowledgement basis is
-- write-once too: it may only be strengthened from not_recorded, never
-- rewritten to claim an acceptance that did not happen.
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
  return new;
end;
$$;

drop trigger if exists trg_guard_booking_visit_terms_ack on public.booking_visits;
create trigger trg_guard_booking_visit_terms_ack
  before update on public.booking_visits
  for each row execute function public.guard_booking_visit_terms_acknowledgement();

-- Staff-created visits record notice, never acceptance.
create or replace function smarter_dog_private.create_staff_visit_v1(
  p_human_id uuid,
  p_date date,
  p_at timestamptz,
  p_source text
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
  v_policy := public.policy_for_confirmation(p_at);

  insert into public.booking_lineages (human_id) values (p_human_id)
  returning id into v_lineage;

  insert into public.booking_visits (
    lineage_id, human_id, booking_date, lifecycle_state, approval_state,
    confirmation_state, policy_code, source, requested_at, confirmed_at,
    commercial_eligibility_at, eligibility_policy_code,
    customer_change_deadline_at, runtime_generation, terms_publication_id,
    terms_acknowledgement
  ) values (
    v_lineage, p_human_id, p_date, 'active', 'not_required',
    'confirmed', v_policy, coalesce(p_source, 'staff'), p_at, p_at,
    p_at, v_policy,
    public.change_deadline_for(v_policy, p_date, '08:30'),
    'visit_v1', v_settings.current_terms_publication_id,
    -- Staff booked this on the customer's behalf: the Terms are published and
    -- notice was given, but the customer did not accept them in the portal.
    'staff_notice'
  )
  returning id into v_visit;

  insert into public.booking_visit_deposits
    (visit_id, origin, state, requirement_decided_at, exemption_reason)
  values (v_visit, 'visit_v1', 'not_required', p_at, 'staff_created');

  return v_visit;
end;
$$;
revoke all on function smarter_dog_private.create_staff_visit_v1(uuid, date, timestamptz, text)
  from public, anon, authenticated, service_role;

-- ── 2. Every prepayment disposition is written, or the cancel refuses ──

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
  v_prepay_event uuid;
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

  -- ── Validate the prepayment disposition BEFORE mutating anything ──
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
    if p_prepayment_handling = 'refund_due' and p_prepayment_refund_due_at is null then
      -- No signed automatic policy exists for service prepayment, so the
      -- server must NOT invent the deposit's five-working-day promise.
      return jsonb_build_object('outcome','blocked','block_reason','prepayment_refund_date_required',
                                'visit_id',p_visit_id,'outcome_key',null);
    end if;
    if p_prepayment_handling = 'transfer' then
      select * into tgt from public.booking_visits
       where id = p_prepayment_target_visit_id for update;
      -- An invalid destination must leave the original visit and its money
      -- completely untouched rather than half-applying a transfer.
      if not found or tgt.human_id <> v.human_id
         or tgt.id = p_visit_id
         or tgt.lifecycle_state <> 'active' then
        return jsonb_build_object('outcome','blocked','block_reason','prepayment_transfer_target_invalid',
                                  'visit_id',p_visit_id,'outcome_key',null);
      end if;
    end if;
  end if;

  -- ── Cancel the visit ──
  update public.bookings
     set status = 'Cancelled',
         cancel_reason = coalesce(nullif(trim(coalesce(p_reason,'')),''), 'Cancelled by staff')
   where visit_id = p_visit_id and visit_membership_state = 'included'
     and status not in ('Cancelled','Completed');

  perform smarter_dog_private.close_open_change_requests(p_visit_id);

  update public.booking_visits
     set lifecycle_state = 'cancelled', cancelled_at = p_at
   where id = p_visit_id;

  -- ── Record the prepayment disposition in the SAME transaction ──
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
      returning id into v_prepay_event;
      update public.booking_service_prepayment_reconciliations
         set state = 'refund_due', obligation_event_id = v_prepay_event,
             resolved_at = p_at, resolved_by = auth.uid(),
             resolution_reason = 'Refund promised at cancellation'
       where id = v_recon_id;
      -- A DUE obligation, never a completed payment: staff settle it later
      -- with real bank evidence through settle_booking_refund_due.
      v_prepay_money := jsonb_build_object(
        'kind','refund_due','amount_pence',v_prepaid_pence,
        'refund_due_at',p_prepayment_refund_due_at,'settled',false);

    elsif p_prepayment_handling = 'transfer' then
      insert into public.booking_financial_ledger
        (human_id, visit_id, related_visit_id, event_kind, amount_pence, reason,
         idempotency_key, recorded_by)
      values (v.human_id, p_visit_id, p_prepayment_target_visit_id,
              'service_prepayment_transferred', v_prepaid_pence,
              'Service prepayment carried to another visit',
              'staffcancel-prepay-transfer:' || p_idempotency_key::text, auth.uid())
      returning id into v_prepay_event;
      update public.booking_service_prepayment_reconciliations
         set state = 'transferred', target_visit_id = p_prepayment_target_visit_id,
             resolved_at = p_at, resolved_by = auth.uid(),
             resolution_reason = 'Transferred to another visit at cancellation'
       where id = v_recon_id;
      v_prepay_money := jsonb_build_object(
        'kind','transferred','amount_pence',v_prepaid_pence,
        'target_visit_id',p_prepayment_target_visit_id);

    else
      -- reconciliation_required: the money stays visibly unresolved for staff.
      v_prepay_money := jsonb_build_object(
        'kind','reconciliation_open','amount_pence',v_prepaid_pence,
        'reconciliation_id',v_recon_id);
    end if;
  end if;

  -- ── Deposit outcome, when £10 was actually received ──
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

  -- The receipt reports the cancellation and the money separately, so a
  -- recorded obligation is never read as a completed payment.
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

-- Supersede the earlier 10-argument dispatcher so no ambiguous overload exists.
drop function if exists smarter_dog_private.cancel_staff_visit_dispatch(
  uuid, integer, uuid, text, text, text, boolean, text, timestamptz, text);

create or replace function public.cancel_staff_booking_visit(
  p_visit_id uuid,
  p_expected_revision integer,
  p_idempotency_key uuid,
  p_reason text default null,
  p_paid_deposit_outcome text default 'refund',
  p_prepayment_handling text default null,
  p_record_incident boolean default false,
  p_incident_kind text default null,
  p_prepayment_target_visit_id uuid default null,
  p_prepayment_refund_due_at timestamptz default null
) returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select smarter_dog_private.cancel_staff_visit_dispatch(
    p_visit_id, p_expected_revision, p_idempotency_key, p_reason,
    p_paid_deposit_outcome, p_prepayment_handling, p_record_incident, p_incident_kind,
    statement_timestamp(), null, p_prepayment_target_visit_id, p_prepayment_refund_due_at);
$$;
drop function if exists public.cancel_staff_booking_visit(
  uuid, integer, uuid, text, text, text, boolean, text);
revoke all on function public.cancel_staff_booking_visit(uuid, integer, uuid, text, text, text, boolean, text, uuid, timestamptz) from public;
revoke all on function public.cancel_staff_booking_visit(uuid, integer, uuid, text, text, text, boolean, text, uuid, timestamptz) from anon;
revoke all on function public.cancel_staff_booking_visit(uuid, integer, uuid, text, text, text, boolean, text, uuid, timestamptz) from authenticated;
grant execute on function public.cancel_staff_booking_visit(uuid, integer, uuid, text, text, text, boolean, text, uuid, timestamptz) to authenticated;

comment on function public.cancel_staff_booking_visit(uuid, integer, uuid, text, text, text, boolean, text, uuid, timestamptz) is
  'Staff whole-visit cancellation. Non-deposit prepayment must be explicitly disposed of — reconciliation, a staff-dated refund obligation, or a transfer to a valid same-customer active visit — and the disposition is written in the same transaction as the cancellation. An invalid transfer target or a missing refund date blocks the cancellation entirely rather than half-applying it. The receipt reports the cancellation result separately from the financial result: a refund is recorded as DUE, never as paid.';
