-- ============================================================
-- Atomic customer visit commands (previous_day_1500_v1 programme, phase 1)
--
-- Every customer write becomes one idempotent, visit-level command returning
-- a typed receipt. Runtime and decision time are an internal seam: each
-- public wrapper supplies statement_timestamp() and a null runtime override
-- to a revoked private dispatcher, so no browser or Edge caller can inject
-- time or pretend the policy is active.
--
-- While the runtime is inactive the v1 wrappers return `policy_not_active`
-- and mutate nothing; the existing legacy customer RPCs stay authoritative.
--
-- Spec: docs/superpowers/specs/2026-07-22-booking-cancellation-rescheduling-policy-design.md
-- Plan: docs/superpowers/plans/2026-07-22-booking-policy-foundation.md (Task 4)
-- ============================================================

-- ── 1. Short-lived, single-use review tokens ────────────────────────
--
-- A preview binds exactly what the customer saw: the customer, the source row
-- revision, the canonical destination hash and the settings/runtime version
-- in force. Submit must present that token, so a staff edit between dialog
-- open and submit can never cancel or move details the customer never saw.

create table smarter_dog_private.booking_change_reviews (
  id uuid primary key default gen_random_uuid(),
  customer_user_id uuid not null,
  human_id uuid not null,
  source_visit_id uuid not null,
  intent text not null check (intent in ('cancel','reschedule')),
  source_revision bigint not null,
  source_fingerprint text not null,
  destination_hash text,
  requested_booking_date date,
  auto_confirm boolean not null,
  staff_review_reason text,
  destination_policy_code text,
  destination_deadline_at timestamptz,
  settings_version timestamptz not null,
  runtime_state text not null,
  -- clock_timestamp, not now(): several previews can happen inside one
  -- transaction and the newest token must be distinguishable.
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  check (expires_at > created_at),
  check (intent <> 'reschedule' or (destination_hash is not null and requested_booking_date is not null))
);

create index booking_change_reviews_customer_idx
  on smarter_dog_private.booking_change_reviews(customer_user_id, source_visit_id);

revoke all on smarter_dog_private.booking_change_reviews from public;
revoke all on smarter_dog_private.booking_change_reviews from anon, authenticated, service_role;

-- Canonical, order-independent fingerprint of a visit's included rows. Used
-- for review binding and for recent-cancellation continuity matching.
create or replace function smarter_dog_private.visit_fingerprint(p_visit_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(md5(string_agg(
    b.dog_id::text || '|' || b.service || '|' ||
    coalesce(array_to_string(
      (select array_agg(a order by a) from unnest(b.addons) a), ','), ''),
    ';' order by b.dog_id::text || '|' || b.service)), '')
  from public.bookings b
  where b.visit_id = p_visit_id and b.visit_membership_state = 'included';
$$;
revoke all on function smarter_dog_private.visit_fingerprint(uuid) from public, anon, authenticated;

-- The canonical dog/service pair signature of a requested payload.
create or replace function smarter_dog_private.payload_fingerprint(p_bookings jsonb)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(md5(string_agg(sig, ';' order by sig)), '')
  from (
    select (e->>'dog_id') || '|' || (e->>'service') || '|' ||
           coalesce((select string_agg(a, ',' order by a)
                       from jsonb_array_elements_text(
                         case when jsonb_typeof(e->'addons') = 'array'
                              then e->'addons' else '[]'::jsonb end) a), '') as sig
    from jsonb_array_elements(p_bookings) e
  ) s;
$$;
revoke all on function smarter_dog_private.payload_fingerprint(jsonb) from public, anon, authenticated;

create or replace function smarter_dog_private.destination_hash(
  p_booking_date date,
  p_slot_assignments jsonb
) returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select md5(p_booking_date::text || '#' || coalesce((
    select string_agg((e->>'dog_id') || '@' || (e->>'slot'), ';'
                      order by (e->>'dog_id') || '@' || (e->>'slot'))
      from jsonb_array_elements(p_slot_assignments) e), ''));
$$;
revoke all on function smarter_dog_private.destination_hash(date, jsonb) from public, anon, authenticated;

-- ── 2. Receipt builders ─────────────────────────────────────────────

create or replace function smarter_dog_private.blocked_receipt(
  p_reason text,
  p_visit_id uuid default null,
  p_deadline timestamptz default null,
  p_staff_alert_key text default null
) returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'outcome', 'blocked',
    'block_reason', p_reason,
    'visit_id', p_visit_id,
    'replacement_visit_id', null,
    'lineage_id', null,
    'booking_ids', '[]'::jsonb,
    'lifecycle_state', null,
    'approval_state', null,
    'confirmation_state', null,
    'policy_code', null,
    'deadline_at', p_deadline,
    'is_last_minute', null,
    'booking_timing', null,
    'customer_deposit_reason', null,
    'deposit_state', null,
    'deposit_amount_pence', null,
    'deposit_due_at', null,
    'deposit_payment_instructions', null,
    'money_outcome', null,
    'outcome_key', null,
    'staff_alert_key', p_staff_alert_key);
$$;
revoke all on function smarter_dog_private.blocked_receipt(text, uuid, timestamptz, text) from public, anon, authenticated;

-- The success receipt for one visit. Payment instructions appear only while
-- the visit is genuinely payable and always render the deposit's own
-- snapshotted bank instruction version, never today's settings.
create or replace function smarter_dog_private.visit_receipt(
  p_visit_id uuid,
  p_outcome text,
  p_replacement_visit_id uuid default null,
  p_money_outcome jsonb default null,
  p_outcome_key text default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v record;
  d record;
  v_bank jsonb := null;
  v_timing text;
  v_ids jsonb;
begin
  select * into v from public.booking_visits where id = p_visit_id;
  select * into d from public.booking_visit_deposits where visit_id = p_visit_id;

  select coalesce(jsonb_agg(b.id order by b.slot, b.id), '[]'::jsonb) into v_ids
    from public.bookings b
   where b.visit_id = p_visit_id and b.visit_membership_state = 'included';

  v_timing := case
    when v.is_last_minute then 'last_minute'
    when d.state is not null and d.exemption_reason = 'insufficient_window' then 'insufficient_window'
    else 'ordinary' end;

  -- Payment instructions appear only while the visit is genuinely payable,
  -- and always render the deposit's own snapshotted bank instruction version
  -- so a later Settings change cannot redirect payment.
  if d.state = 'awaiting_payment' and d.bank_instruction_id is not null then
    select jsonb_build_object(
             'account_name', bi.account_name,
             'sort_code', bi.sort_code,
             'account_number', bi.account_number,
             'customer_reference', coalesce(d.customer_payment_reference, ''))
      into v_bank
      from public.booking_deposit_bank_instruction_versions bi
     where bi.id = d.bank_instruction_id;
  end if;

  return jsonb_build_object(
    'outcome', p_outcome,
    'block_reason', null,
    'visit_id', v.id,
    'replacement_visit_id', p_replacement_visit_id,
    'lineage_id', v.lineage_id,
    'booking_ids', v_ids,
    'lifecycle_state', v.lifecycle_state,
    'approval_state', v.approval_state,
    'confirmation_state', v.confirmation_state,
    'policy_code', v.policy_code,
    'deadline_at', v.customer_change_deadline_at,
    'is_last_minute', v.is_last_minute,
    'booking_timing', v_timing,
    'customer_deposit_reason', coalesce(
      case
        when d.state is null or d.state = 'not_required' then
          case
            when v.is_last_minute then 'same_day_or_last_minute'
            when d.exemption_reason = 'insufficient_window' then 'insufficient_window'
            when d.exemption_reason = 'staff_waived' then 'staff_waiver'
            else 'not_required'
          end
        when d.requirement_reason = 'staff_applied_requirement' then 'staff_applied_requirement'
        else 'recent_booking_history'
      end, 'not_required'),
    'deposit_state', coalesce(d.state, 'not_required'),
    'deposit_amount_pence', coalesce(d.amount_pence, 1000),
    'deposit_due_at', d.due_at,
    'deposit_payment_instructions', v_bank,
    'money_outcome', coalesce(p_money_outcome,
      jsonb_build_object('kind','none','amount_pence',null,'refund_due_at',null)),
    'outcome_key', p_outcome_key);
end;
$$;
revoke all on function smarter_dog_private.visit_receipt(uuid, text, uuid, jsonb, text) from public, anon, authenticated;

-- ── 3. Idempotency helper ───────────────────────────────────────────

create or replace function smarter_dog_private.replay_receipt(
  p_scope text,
  p_key uuid,
  p_request_hash text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
begin
  if p_key is null then
    raise exception 'an idempotency key is required' using errcode = '22023';
  end if;
  select * into r from smarter_dog_private.booking_command_receipts
   where actor_scope = p_scope and idempotency_key = p_key;
  if not found then
    return null;
  end if;
  if r.request_hash <> p_request_hash then
    raise exception 'idempotency key reused with different input' using errcode = 'P0001';
  end if;
  return r.response;
end;
$$;
revoke all on function smarter_dog_private.replay_receipt(text, uuid, text) from public, anon, authenticated;

create or replace function smarter_dog_private.store_receipt(
  p_scope text,
  p_key uuid,
  p_request_hash text,
  p_response jsonb
) returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into smarter_dog_private.booking_command_receipts
    (actor_scope, idempotency_key, request_hash, response)
  values (p_scope, p_key, p_request_hash, p_response)
  on conflict (actor_scope, idempotency_key) do nothing
  returning response;
$$;
revoke all on function smarter_dog_private.store_receipt(text, uuid, text, jsonb) from public, anon, authenticated;

-- ── 4. The single confirmation core ─────────────────────────────────
--
-- EVERY transition from unconfirmed to confirmed goes through here. Before
-- the appointment starts it permits only the caller's already-authorised
-- commercial branch; at or after start it refuses every customer/service
-- path and only staff `retrospective_attended` with real attendance and
-- per-dog service evidence may confirm.

create or replace function smarter_dog_private.confirm_booking_visit_core(
  p_visit_id uuid,
  p_branch text,
  p_at timestamptz,
  p_actor_scope text,
  p_reason text default null,
  p_attendance_evidence_id uuid default null,
  p_service_evidence_ids uuid[] default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v record;
  d record;
  v_start timestamptz;
  v_policy text;
  v_min_slot text;
  v_dogs int;
  v_evidence int;
begin
  if p_branch not in ('exempt','deposit_satisfied','approved_no_deposit',
                      'retrospective_attended') then
    raise exception 'unknown confirmation branch' using errcode = '22023';
  end if;

  select * into v from public.booking_visits where id = p_visit_id for update;
  if not found then
    raise exception 'unknown visit' using errcode = 'P0001';
  end if;
  if v.confirmation_state = 'confirmed' then
    return jsonb_build_object('confirmed', true, 'replayed', true);
  end if;
  if v.lifecycle_state <> 'active' then
    raise exception 'only an active visit can confirm' using errcode = 'P0001';
  end if;

  select * into d from public.booking_visit_deposits where visit_id = p_visit_id for update;
  v_start := public.visit_start_at(p_visit_id);

  -- At or after start nothing automatic may confirm.
  if v_start is not null and statement_timestamp() >= v_start then
    if p_branch <> 'retrospective_attended' or p_actor_scope <> 'staff' then
      return jsonb_build_object('confirmed', false, 'reason', 'staff_review_required');
    end if;
    if nullif(trim(coalesce(p_reason,'')),'') is null
       or p_attendance_evidence_id is null then
      raise exception 'retrospective approval needs a reason and attendance evidence'
        using errcode = '22023';
    end if;
    select count(*) into v_dogs from public.bookings
     where visit_id = p_visit_id and visit_membership_state = 'included';
    v_evidence := coalesce(cardinality(p_service_evidence_ids), 0);
    if v_evidence < v_dogs then
      raise exception 'retrospective approval needs service evidence for every dog'
        using errcode = '22023';
    end if;
  else
    -- Before start the deposit must genuinely be satisfied or exempt.
    if p_branch = 'deposit_satisfied'
       and (d.state is null or d.state <> 'received') then
      raise exception 'the deposit is not satisfied' using errcode = 'P0001';
    end if;
    if p_branch in ('exempt','approved_no_deposit')
       and d.state is not null
       and d.state in ('awaiting_terms','awaiting_payment') then
      raise exception 'an outstanding deposit cannot confirm as exempt' using errcode = 'P0001';
    end if;
  end if;

  -- A v1 visit must carry its immutable Terms publication.
  if v.runtime_generation = 'visit_v1' and v.terms_publication_id is null then
    raise exception 'a v1 visit cannot confirm without its Terms publication'
      using errcode = 'P0001';
  end if;

  v_policy := public.policy_for_confirmation(p_at);
  select min(slot) into v_min_slot from public.bookings
   where visit_id = p_visit_id and visit_membership_state = 'included';

  update public.booking_visits
     set confirmation_state = 'confirmed',
         confirmed_at = p_at,
         policy_code = v_policy,
         approval_state = case when approval_state in ('waiting_staff','alternative_pending')
                               then 'approved' else approval_state end,
         customer_change_deadline_at =
           public.change_deadline_for(v_policy, booking_date, coalesce(v_min_slot, '08:30'))
   where id = p_visit_id;

  insert into public.booking_policy_audit
    (visit_id, human_id, action, actor_id, actor_scope, reason, detail)
  values (p_visit_id, v.human_id, 'visit_confirmed', auth.uid(), p_actor_scope, p_reason,
          jsonb_build_object('branch', p_branch, 'policyCode', v_policy,
                             'attendanceEvidenceId', p_attendance_evidence_id,
                             'serviceEvidenceIds', to_jsonb(p_service_evidence_ids)));

  return jsonb_build_object('confirmed', true, 'replayed', false, 'policyCode', v_policy);
end;
$$;
revoke all on function smarter_dog_private.confirm_booking_visit_core(
  uuid, text, timestamptz, text, text, uuid, uuid[]) from public, anon, authenticated, service_role;

-- ── 5. Shared source-terminalisation core ───────────────────────────
--
-- Any command that terminalises a source visit closes incompatible open
-- change requests and releases their held destination reservations. Only the
-- exact accepted reschedule request may consume its reservation instead.

create or replace function smarter_dog_private.close_open_change_requests(
  p_visit_id uuid,
  p_except_request_id uuid default null
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.booking_change_destination_reservations r
     set state = 'released', released_at = now()
   where r.state = 'held'
     and r.source_visit_id = p_visit_id
     and (p_except_request_id is null or r.request_id <> p_except_request_id);

  update public.booking_change_requests cr
     set status = 'closed', decided_at = now(),
         revision = cr.revision + 1,
         decision_reason = coalesce(cr.decision_reason, 'source visit reached a terminal state')
   where cr.source_visit_id = p_visit_id
     and cr.status in ('pending_staff','waiting_customer')
     and (p_except_request_id is null or cr.id <> p_except_request_id);
end;
$$;
revoke all on function smarter_dog_private.close_open_change_requests(uuid, uuid) from public, anon, authenticated;

-- ── 6. Ownership helper ─────────────────────────────────────────────

create or replace function smarter_dog_private.owned_human_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select h.id from public.humans h
   where h.customer_user_id = (select auth.uid())
   limit 1;
$$;
revoke all on function smarter_dog_private.owned_human_id() from public, anon, authenticated;

-- ── 7. Private dispatchers ──────────────────────────────────────────
--
-- The trusted seam. Public wrappers always pass statement_timestamp() and a
-- null override; only the migration/database owner can execute these
-- signatures, and pgTAP passes 'active' inside a rolled-back fixture to
-- exercise v1 branches while the real policy row stays null.

create or replace function smarter_dog_private.cancel_customer_visit_dispatch(
  p_visit_id uuid,
  p_review_id uuid,
  p_idempotency_key uuid,
  p_reason text,
  p_paid_deposit_outcome text,
  p_at timestamptz,
  p_runtime_override text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_runtime text;
  v_human uuid;
  v record;
  rev record;
  act jsonb;
  v_hash text;
  v_prior jsonb;
  v_receipt jsonb;
  v_money jsonb;
  v_event_id uuid;
  v_due timestamptz;
  v_coverage uuid;
  v_calendar_source text;
  d record;
  s record;
  v_prepaid numeric;
begin
  v_human := smarter_dog_private.owned_human_id();
  if v_human is null then
    return smarter_dog_private.blocked_receipt('no_customer_record');
  end if;
  v_runtime := coalesce(p_runtime_override, public.booking_policy_runtime_at(p_at));
  if v_runtime <> 'active' then
    return smarter_dog_private.blocked_receipt('policy_not_active', p_visit_id);
  end if;
  if p_paid_deposit_outcome not in ('refund','credit') then
    raise exception 'the paid deposit outcome must be refund or credit' using errcode = '22023';
  end if;

  v_hash := md5(coalesce(p_visit_id::text,'') || '|' || coalesce(p_review_id::text,'') || '|'
                || coalesce(p_reason,'') || '|' || p_paid_deposit_outcome);
  v_prior := smarter_dog_private.replay_receipt('customer:' || v_human::text,
                                                p_idempotency_key, v_hash);
  if v_prior is not null then
    return v_prior;
  end if;

  select * into v from public.booking_visits
   where id = p_visit_id and human_id = v_human for update;
  if not found then
    return smarter_dog_private.blocked_receipt('not_found');
  end if;

  -- The review token must still bind exactly what the customer saw.
  select * into rev from smarter_dog_private.booking_change_reviews
   where id = p_review_id
     and customer_user_id = (select auth.uid())
     and source_visit_id = p_visit_id
     and intent = 'cancel'
   for update;
  if not found then
    return smarter_dog_private.blocked_receipt('review_required', p_visit_id,
                                               v.customer_change_deadline_at);
  end if;
  -- Hold a shared lock until commit so the audited settings writer cannot
  -- change the version after validation but before the cancellation lands.
  select * into s
    from public.booking_policy_settings
   where singleton
   for share;
  if not found
     or rev.consumed_at is not null
     or rev.expires_at <= p_at
     or rev.source_revision <> v.row_revision
     or rev.source_fingerprint <> smarter_dog_private.visit_fingerprint(p_visit_id)
     or rev.runtime_state is distinct from v_runtime
     or rev.settings_version is distinct from s.updated_at
     or rev.auto_confirm is distinct from s.auto_confirm then
    return smarter_dog_private.blocked_receipt('review_required', p_visit_id,
                                               v.customer_change_deadline_at);
  end if;

  act := public.visit_actionability(p_visit_id, 'cancel', p_at);
  if not (act->>'allowed')::boolean then
    return smarter_dog_private.blocked_receipt(
      case (act->>'reasonCode')
        when 'deadline_passed' then 'source_deadline_late'
        else act->>'reasonCode' end,
      p_visit_id, (act->>'deadlineAt')::timestamptz);
  end if;

  -- Non-deposit service prepayment is out of scope for self-service: never
  -- cancel while refunding or crediting only the £10.
  select coalesce(sum(coalesce(b.paid_amount, 0)), 0) into v_prepaid
    from public.bookings b
   where b.visit_id = p_visit_id and b.visit_membership_state = 'included'
     and coalesce(b.payment,'') in ('Paid in Full','Deposit Paid')
     and b.paid_amount is not null and b.paid_amount > 0;
  if v_prepaid > 0 then
    return smarter_dog_private.blocked_receipt('financial_review_required', p_visit_id,
                                               v.customer_change_deadline_at);
  end if;

  update smarter_dog_private.booking_change_reviews
     set consumed_at = p_at where id = p_review_id;

  -- Cancel every included row, then the visit itself.
  update public.bookings
     set status = 'Cancelled',
         cancel_reason = coalesce(nullif(trim(coalesce(p_reason,'')),''), 'Prefer not to say')
   where visit_id = p_visit_id and visit_membership_state = 'included'
     and status not in ('Cancelled','Completed');

  perform smarter_dog_private.close_open_change_requests(p_visit_id);

  update public.booking_visits
     set lifecycle_state = 'cancelled', cancelled_at = p_at
   where id = p_visit_id;

  -- Deposit outcome: refund within five working days, or credit only by the
  -- customer's explicit choice.
  select * into d from public.booking_visit_deposits where visit_id = p_visit_id for update;
  v_money := jsonb_build_object('kind','none','amount_pence',null,'refund_due_at',null);

  if d.state = 'received' then
    if p_paid_deposit_outcome = 'refund' then
      select verified.due_at, verified.coverage_id, verified.calendar_source
        into v_due, v_coverage, v_calendar_source
        from public.refund_due_at_verified(p_at) verified;
      insert into public.booking_financial_ledger
        (human_id, visit_id, event_kind, amount_pence, reason, idempotency_key,
         due_at, refund_origin, refund_deadline_basis,
         refund_calendar_source, refund_calendar_coverage_id, recorded_by)
      values (v_human, p_visit_id, 'refund_due', 1000,
              'On-time customer cancellation', 'cancel-refund:' || p_idempotency_key::text,
              v_due, 'deposit', 'deposit_working_days',
              v_calendar_source, v_coverage, auth.uid())
      returning id into v_event_id;
      v_money := jsonb_build_object('kind','refund_due','amount_pence',1000,
                                    'refund_due_at', v_due);
    else
      insert into public.booking_financial_ledger
        (human_id, visit_id, event_kind, amount_pence, reason, idempotency_key, recorded_by)
      values (v_human, p_visit_id, 'credit_issued', 1000,
              'Customer chose account credit on cancellation',
              'cancel-credit:' || p_idempotency_key::text, auth.uid())
      returning id into v_event_id;
      v_money := jsonb_build_object('kind','credit_issued','amount_pence',1000,
                                    'refund_due_at', null);
    end if;
    -- The deposit record stays `received`: the money genuinely arrived. The
    -- refund/credit obligation is the ledger event, and the bill summary
    -- stops counting the £10 as part-payment because of it.
    -- disposition_event_id belongs to the received_liability state only.
  end if;

  insert into public.booking_policy_audit
    (visit_id, human_id, action, actor_id, actor_scope, reason, detail)
  values (p_visit_id, v_human, 'visit_cancelled', auth.uid(), 'customer',
          coalesce(nullif(trim(coalesce(p_reason,'')),''), 'Prefer not to say'),
          jsonb_build_object('depositOutcome', p_paid_deposit_outcome));

  v_receipt := smarter_dog_private.visit_receipt(
    p_visit_id, 'cancelled', null, v_money,
    'visit-cancelled:' || p_visit_id::text);
  perform smarter_dog_private.store_receipt('customer:' || v_human::text,
                                            p_idempotency_key, v_hash, v_receipt);
  return v_receipt;
end;
$$;
revoke all on function smarter_dog_private.cancel_customer_visit_dispatch(
  uuid, uuid, uuid, text, text, timestamptz, text) from public, anon, authenticated, service_role;

create or replace function smarter_dog_private.withdraw_customer_visit_dispatch(
  p_visit_id uuid,
  p_idempotency_key uuid,
  p_reason text,
  p_at timestamptz,
  p_runtime_override text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_runtime text;
  v_human uuid;
  v record;
  d record;
  v_hash text;
  v_prior jsonb;
  v_receipt jsonb;
  v_start timestamptz;
  v_begun boolean;
  v_needs_reconciliation boolean := false;
  v_money jsonb;
  cr record;
  v_event_id uuid;
begin
  v_runtime := coalesce(p_runtime_override, public.booking_policy_runtime_at(p_at));
  v_human := smarter_dog_private.owned_human_id();
  if v_human is null then
    return smarter_dog_private.blocked_receipt('no_customer_record');
  end if;
  if v_runtime <> 'active' then
    return smarter_dog_private.blocked_receipt('policy_not_active', p_visit_id);
  end if;

  v_hash := md5(coalesce(p_visit_id::text,'') || '|' || coalesce(p_reason,''));
  v_prior := smarter_dog_private.replay_receipt('customer:' || v_human::text,
                                                p_idempotency_key, v_hash);
  if v_prior is not null then
    return v_prior;
  end if;

  select * into v from public.booking_visits
   where id = p_visit_id and human_id = v_human for update;
  if not found then
    return smarter_dog_private.blocked_receipt('not_found');
  end if;
  if v.confirmation_state <> 'unconfirmed' or v.lifecycle_state <> 'active' then
    return smarter_dog_private.blocked_receipt('state_not_eligible', p_visit_id);
  end if;

  -- Withdrawal is available at any time, deadline or not, but it can never
  -- erase evidence that the visit already began.
  v_start := public.visit_start_at(p_visit_id);
  select bool_or(status not in ('Booked','Cancelled')) into v_begun
    from public.bookings
   where visit_id = p_visit_id and visit_membership_state = 'included';

  update public.bookings
     set status = 'Cancelled',
         cancel_reason = 'Customer withdrew unconfirmed request'
   where visit_id = p_visit_id and visit_membership_state = 'included'
     and status = 'Booked';

  perform smarter_dog_private.close_open_change_requests(p_visit_id);

  update public.booking_visits
     set lifecycle_state = 'withdrawn'
   where id = p_visit_id;

  -- Money: a purely reserved, never-applied credit allocation is fully known
  -- and released atomically with no reconciliation. Exposed bank instructions
  -- or real money always open a mandatory staff reconciliation.
  select * into d from public.booking_visit_deposits where visit_id = p_visit_id for update;
  v_money := jsonb_build_object('kind','none','amount_pence',null,'refund_due_at',null);

  for cr in
    select * from public.customer_credit_reservations
     where visit_id = p_visit_id and state = 'reserved' for update
  loop
    insert into public.booking_financial_ledger
      (human_id, visit_id, event_kind, amount_pence, reason, idempotency_key, recorded_by)
    values (v_human, p_visit_id, 'credit_released', cr.amount_pence,
            'Customer withdrew the unconfirmed request',
            'withdraw-release:' || p_idempotency_key::text, auth.uid())
    returning id into v_event_id;
    update public.customer_credit_reservations
       set state = 'released', terminal_event_id = v_event_id where id = cr.id;
    v_money := jsonb_build_object('kind','credit_released',
                                  'amount_pence', cr.amount_pence, 'refund_due_at', null);
  end loop;

  update public.booking_deposit_transfer_reservations
     set state = 'released', released_at = p_at
   where destination_visit_id = p_visit_id and state = 'held';

  if coalesce(v_begun, false)
     or d.state in ('awaiting_payment','received','received_liability') then
    v_needs_reconciliation := true;
  end if;

  if v_needs_reconciliation
     and not exists (select 1 from public.booking_deposit_money_reconciliations
                      where visit_id = p_visit_id and state = 'open') then
    insert into public.booking_deposit_money_reconciliations
      (visit_id, human_id, amount_pence, state, opened_reason)
    values (p_visit_id, v_human, 1000, 'open',
            'Unconfirmed request withdrawn after payment instructions were exposed');
  end if;

  insert into public.booking_policy_audit
    (visit_id, human_id, action, actor_id, actor_scope, reason, detail)
  values (p_visit_id, v_human, 'visit_withdrawn', auth.uid(), 'customer', p_reason,
          jsonb_build_object('reconciliationOpened', v_needs_reconciliation,
                             'serviceHadBegun', coalesce(v_begun, false)));

  v_receipt := smarter_dog_private.visit_receipt(
    p_visit_id, 'withdrawn', null, v_money,
    'visit-withdrawn:' || p_visit_id::text);
  perform smarter_dog_private.store_receipt('customer:' || v_human::text,
                                            p_idempotency_key, v_hash, v_receipt);
  return v_receipt;
end;
$$;
revoke all on function smarter_dog_private.withdraw_customer_visit_dispatch(
  uuid, uuid, text, timestamptz, text) from public, anon, authenticated, service_role;

-- The revoked late-change core. It records ONE idempotent pending request,
-- leaves the source untouched and creates no incident. It is deliberately
-- not callable by any application role: portal Task 5 wraps it in the single
-- transaction that also writes inbox/contact evidence and pauses automation.
create or replace function smarter_dog_private.record_late_booking_change_core(
  p_visit_id uuid,
  p_kind text,
  p_channel text,
  p_requested_at timestamptz,
  p_provider_message_id text,
  p_customer_message text,
  p_requested_booking_date date,
  p_slot_assignments jsonb,
  p_idempotency_key uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v record;
  existing record;
  v_id uuid;
  v_hash text;
begin
  if p_kind not in ('cancel','reschedule','partial_change') then
    raise exception 'unknown late change kind' using errcode = '22023';
  end if;

  select * into v from public.booking_visits where id = p_visit_id for update;
  if not found then
    raise exception 'unknown visit' using errcode = 'P0001';
  end if;

  -- Only one unresolved request of any kind per source visit: a concurrent
  -- cancel-versus-reschedule returns the existing request for staff rather
  -- than creating conflicting decisions.
  select * into existing from public.booking_change_requests
   where source_visit_id = p_visit_id
     and status in ('pending_staff','waiting_customer')
   limit 1;
  if found then
    return jsonb_build_object('requestId', existing.id, 'status', existing.status,
                              'replayed', true);
  end if;

  v_hash := case when p_kind = 'reschedule'
                 then smarter_dog_private.destination_hash(p_requested_booking_date, p_slot_assignments)
                 else null end;

  insert into public.booking_change_requests
    (source_visit_id, human_id, kind, channel, reason_code, status, requested_at,
     provider_message_id, customer_message, requested_booking_date,
     requested_slot_assignments, requested_destination_hash, source_revision)
  values (p_visit_id, v.human_id, p_kind, p_channel, 'source_deadline_late', 'pending_staff',
          p_requested_at, p_provider_message_id, p_customer_message,
          case when p_kind = 'reschedule' then p_requested_booking_date else null end,
          case when p_kind = 'reschedule' then p_slot_assignments else null end,
          v_hash,
          case when p_kind = 'reschedule' then v.row_revision else null end)
  returning id into v_id;

  -- The pending request is part of the visit projection and changes
  -- actionability even though it is stored in a child table.
  update public.booking_visits
     set row_revision = row_revision + 1
   where id = p_visit_id;

  insert into public.booking_policy_audit
    (visit_id, human_id, action, actor_id, actor_scope, reason, detail)
  values (p_visit_id, v.human_id, 'late_change_requested', auth.uid(), 'service', null,
          jsonb_build_object('kind', p_kind, 'channel', p_channel,
                             'requestedAt', p_requested_at));

  return jsonb_build_object('requestId', v_id, 'status', 'pending_staff', 'replayed', false);
end;
$$;
revoke all on function smarter_dog_private.record_late_booking_change_core(
  uuid, text, text, timestamptz, text, text, date, jsonb, uuid)
  from public, anon, authenticated, service_role;

-- ── 8. Public wrappers ──────────────────────────────────────────────
--
-- Each supplies statement_timestamp() and a null runtime override. A browser
-- can never choose the decision instant or claim the policy is active.

create or replace function public.preview_customer_cancel_visit(p_visit_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_human uuid;
  v record;
  v_review_id uuid;
  v_rows jsonb;
  act jsonb;
  d record;
begin
  v_human := smarter_dog_private.owned_human_id();
  if v_human is null then
    raise exception 'Booking not found' using errcode = 'P0001';
  end if;
  select * into v from public.booking_visits where id = p_visit_id and human_id = v_human;
  if not found then
    raise exception 'Booking not found' using errcode = 'P0001';
  end if;
  if public.booking_policy_runtime() <> 'active' then
    return smarter_dog_private.blocked_receipt('policy_not_active', p_visit_id);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'bookingId', b.id, 'dogName', d2.name, 'service', b.service,
    'slot', b.slot, 'addons', to_jsonb(b.addons)) order by b.slot, b.id), '[]'::jsonb)
    into v_rows
    from public.bookings b
    join public.dogs d2 on d2.id = b.dog_id
   where b.visit_id = p_visit_id and b.visit_membership_state = 'included';

  act := public.visit_actionability(p_visit_id, 'cancel', statement_timestamp());
  select * into d from public.booking_visit_deposits where visit_id = p_visit_id;

  insert into smarter_dog_private.booking_change_reviews
    (customer_user_id, human_id, source_visit_id, intent, source_revision,
     source_fingerprint, auto_confirm, settings_version, runtime_state, expires_at)
  select (select auth.uid()), v_human, p_visit_id, 'cancel', v.row_revision,
         smarter_dog_private.visit_fingerprint(p_visit_id),
         s.auto_confirm, s.updated_at, 'active',
         statement_timestamp() + interval '30 minutes'
    from public.booking_policy_settings s where s.singleton
  returning id into v_review_id;

  return jsonb_build_object(
    'reviewId', v_review_id,
    'visitId', p_visit_id,
    'bookingDate', v.booking_date,
    'dogs', v_rows,
    'deadlineAt', v.customer_change_deadline_at,
    'capabilities', act,
    'depositOutcomeChoices', case when d.state = 'received'
      then jsonb_build_array('refund','credit') else '[]'::jsonb end);
end;
$$;
revoke all on function public.preview_customer_cancel_visit(uuid) from public;
revoke all on function public.preview_customer_cancel_visit(uuid) from anon;
revoke all on function public.preview_customer_cancel_visit(uuid) from authenticated;
grant execute on function public.preview_customer_cancel_visit(uuid) to authenticated;

create or replace function public.cancel_customer_booking_visit(
  p_visit_id uuid,
  p_review_id uuid,
  p_idempotency_key uuid,
  p_reason text default null,
  p_paid_deposit_outcome text default 'refund'
) returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select smarter_dog_private.cancel_customer_visit_dispatch(
    p_visit_id, p_review_id, p_idempotency_key, p_reason, p_paid_deposit_outcome,
    statement_timestamp(), null);
$$;
revoke all on function public.cancel_customer_booking_visit(uuid, uuid, uuid, text, text) from public;
revoke all on function public.cancel_customer_booking_visit(uuid, uuid, uuid, text, text) from anon;
revoke all on function public.cancel_customer_booking_visit(uuid, uuid, uuid, text, text) from authenticated;
grant execute on function public.cancel_customer_booking_visit(uuid, uuid, uuid, text, text) to authenticated;

create or replace function public.withdraw_customer_booking_visit(
  p_visit_id uuid,
  p_idempotency_key uuid,
  p_reason text default null
) returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select smarter_dog_private.withdraw_customer_visit_dispatch(
    p_visit_id, p_idempotency_key, p_reason, statement_timestamp(), null);
$$;
revoke all on function public.withdraw_customer_booking_visit(uuid, uuid, text) from public;
revoke all on function public.withdraw_customer_booking_visit(uuid, uuid, text) from anon;
revoke all on function public.withdraw_customer_booking_visit(uuid, uuid, text) from authenticated;
grant execute on function public.withdraw_customer_booking_visit(uuid, uuid, text) to authenticated;

-- Withdrawing a pending change request never touches the confirmed source.
create or replace function public.withdraw_customer_booking_change_request(
  p_request_id uuid,
  p_idempotency_key uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_human uuid;
  cr record;
  v_visit record;
  v_source_visit_id uuid;
  v_hash text;
  v_prior jsonb;
  v_receipt jsonb;
begin
  v_human := smarter_dog_private.owned_human_id();
  if v_human is null then
    return smarter_dog_private.blocked_receipt('no_customer_record');
  end if;
  if public.booking_policy_runtime() <> 'active' then
    return smarter_dog_private.blocked_receipt('policy_not_active');
  end if;
  v_hash := md5(coalesce(p_request_id::text,''));
  v_prior := smarter_dog_private.replay_receipt('customer:' || v_human::text,
                                                p_idempotency_key, v_hash);
  if v_prior is not null then
    return v_prior;
  end if;

  -- Resolve only an owned request without locking it, then follow the same
  -- aggregate-first lock order as the staff decision command. Revalidate
  -- ownership and state after both locks so the pre-read grants no authority.
  select source_visit_id into v_source_visit_id
    from public.booking_change_requests
   where id = p_request_id and human_id = v_human;
  if not found then
    return smarter_dog_private.blocked_receipt('not_found');
  end if;
  select * into v_visit from public.booking_visits
   where id = v_source_visit_id and human_id = v_human
   for update;
  if not found then
    return smarter_dog_private.blocked_receipt('not_found');
  end if;
  select * into cr from public.booking_change_requests
   where id = p_request_id
   for update;
  if not found
     or cr.source_visit_id is distinct from v_visit.id
     or cr.human_id is distinct from v_human
     or cr.status not in ('pending_staff','waiting_customer') then
    return smarter_dog_private.blocked_receipt('not_found');
  end if;

  update public.booking_change_destination_reservations
     set state = 'released', released_at = now()
   where request_id = p_request_id and state = 'held';

  update public.booking_change_requests
     set status = 'withdrawn', decided_at = now(), revision = revision + 1,
         decision_reason = 'Customer withdrew the request'
   where id = p_request_id;

  update public.booking_visits
     set row_revision = row_revision + 1
   where id = cr.source_visit_id;

  insert into public.booking_policy_audit
    (visit_id, human_id, action, actor_id, actor_scope, detail)
  values (cr.source_visit_id, v_human, 'change_request_withdrawn', auth.uid(), 'customer',
          jsonb_build_object('requestId', p_request_id));

  v_receipt := smarter_dog_private.visit_receipt(
    cr.source_visit_id, 'change_request_withdrawn', null, null,
    'change-withdrawn:' || p_request_id::text)
    || jsonb_build_object('request_id', p_request_id, 'request_status', 'withdrawn');
  perform smarter_dog_private.store_receipt('customer:' || v_human::text,
                                            p_idempotency_key, v_hash, v_receipt);
  return v_receipt;
end;
$$;
revoke all on function public.withdraw_customer_booking_change_request(uuid, uuid) from public;
revoke all on function public.withdraw_customer_booking_change_request(uuid, uuid) from anon;
revoke all on function public.withdraw_customer_booking_change_request(uuid, uuid) from authenticated;
grant execute on function public.withdraw_customer_booking_change_request(uuid, uuid) to authenticated;

-- ── 9. Customer credit refund request / cancel ──────────────────────

create or replace function public.request_customer_credit_refund(
  p_amount_pence integer,
  p_idempotency_key uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_human uuid;
  v_balance jsonb;
  v_available int;
  v_due timestamptz;
  v_coverage uuid;
  v_calendar_source text;
  v_event_id uuid;
  v_hash text;
  v_prior jsonb;
  v_receipt jsonb;
begin
  v_human := smarter_dog_private.owned_human_id();
  if v_human is null then
    raise exception 'No customer record' using errcode = 'P0001';
  end if;
  if public.booking_policy_runtime() <> 'active' then
    return smarter_dog_private.blocked_receipt('policy_not_active');
  end if;
  if p_amount_pence is null or p_amount_pence <= 0 then
    raise exception 'a refund amount must be positive' using errcode = '22023';
  end if;

  v_hash := md5(p_amount_pence::text);
  v_prior := smarter_dog_private.replay_receipt('customer:' || v_human::text,
                                                p_idempotency_key, v_hash);
  if v_prior is not null then
    return v_prior;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('sd_credit|' || v_human::text, 0));
  v_balance := public.customer_credit_balance(v_human);
  v_available := (v_balance->>'availablePence')::int;
  if p_amount_pence > v_available then
    raise exception 'refund exceeds the available credit balance' using errcode = 'P0001';
  end if;

  select verified.due_at, verified.coverage_id, verified.calendar_source
    into v_due, v_coverage, v_calendar_source
    from public.refund_due_at_verified(statement_timestamp()) verified;

  insert into public.booking_financial_ledger
    (human_id, event_kind, amount_pence, reason, idempotency_key,
     due_at, refund_origin, refund_deadline_basis,
     refund_calendar_source, refund_calendar_coverage_id, recorded_by)
  values (v_human, 'refund_due', p_amount_pence, 'Customer requested a credit refund',
          'credit-refund:' || p_idempotency_key::text, v_due, 'account_credit',
          'deposit_working_days', v_calendar_source, v_coverage, auth.uid())
  returning id into v_event_id;

  v_receipt := jsonb_build_object(
    'outcome', 'refund_requested',
    'obligation_id', v_event_id,
    'amount_pence', p_amount_pence,
    'refund_due_at', v_due,
    'outcome_key', 'credit-refund:' || v_event_id::text);
  perform smarter_dog_private.store_receipt('customer:' || v_human::text,
                                            p_idempotency_key, v_hash, v_receipt);
  return v_receipt;
end;
$$;
revoke all on function public.request_customer_credit_refund(integer, uuid) from public;
revoke all on function public.request_customer_credit_refund(integer, uuid) from anon;
revoke all on function public.request_customer_credit_refund(integer, uuid) from authenticated;
grant execute on function public.request_customer_credit_refund(integer, uuid) to authenticated;

create or replace function public.cancel_customer_credit_refund(
  p_refund_due_id uuid,
  p_idempotency_key uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_human uuid;
  ob record;
  v_hash text;
  v_prior jsonb;
  v_receipt jsonb;
begin
  v_human := smarter_dog_private.owned_human_id();
  if v_human is null then
    raise exception 'No customer record' using errcode = 'P0001';
  end if;
  if public.booking_policy_runtime() <> 'active' then
    return smarter_dog_private.blocked_receipt('policy_not_active');
  end if;
  v_hash := md5(coalesce(p_refund_due_id::text,''));
  v_prior := smarter_dog_private.replay_receipt('customer:' || v_human::text,
                                                p_idempotency_key, v_hash);
  if v_prior is not null then
    return v_prior;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('sd_credit|' || v_human::text, 0));
  select * into ob from public.booking_financial_ledger
   where id = p_refund_due_id and human_id = v_human
     and event_kind = 'refund_due' and refund_origin = 'account_credit';
  if not found then
    raise exception 'Refund request not found' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.booking_financial_ledger
              where settles_event_id = p_refund_due_id) then
    raise exception 'that refund request has already been settled' using errcode = 'P0001';
  end if;

  insert into public.booking_financial_ledger
    (human_id, event_kind, amount_pence, reason, idempotency_key,
     settles_event_id, recorded_by)
  values (v_human, 'refund_cancelled', ob.amount_pence,
          'Customer cancelled the credit refund request',
          'credit-refund-cancel:' || p_idempotency_key::text, p_refund_due_id, auth.uid());

  v_receipt := jsonb_build_object(
    'outcome', 'refund_request_cancelled',
    'obligation_id', p_refund_due_id,
    'amount_pence', ob.amount_pence,
    'refund_due_at', null,
    'outcome_key', 'credit-refund-cancel:' || p_refund_due_id::text);
  perform smarter_dog_private.store_receipt('customer:' || v_human::text,
                                            p_idempotency_key, v_hash, v_receipt);
  return v_receipt;
end;
$$;
revoke all on function public.cancel_customer_credit_refund(uuid, uuid) from public;
revoke all on function public.cancel_customer_credit_refund(uuid, uuid) from anon;
revoke all on function public.cancel_customer_credit_refund(uuid, uuid) from authenticated;
grant execute on function public.cancel_customer_credit_refund(uuid, uuid) to authenticated;

comment on function smarter_dog_private.confirm_booking_visit_core(
  uuid, text, timestamptz, text, text, uuid, uuid[]) is
  'The only path from unconfirmed to confirmed. Before appointment start it permits only the caller''s already-authorised commercial branch; at or after start every customer/service path is refused and only staff retrospective_attended with attendance plus per-dog service evidence may confirm.';
