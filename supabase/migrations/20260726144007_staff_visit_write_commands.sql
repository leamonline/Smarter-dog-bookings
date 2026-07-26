-- ============================================================
-- Staff visit write commands (Path B — staff-controlled first release)
--
-- The v1 staff write path: create, update, cancel and reschedule a whole
-- visit as one atomic, idempotent, audited command. These are the primary
-- write path once the policy is active; before then they return
-- policy_not_active and staff keep using create_staff_booking_group.
--
-- Staff-caused changes deliberately differ from customer ones: they consume
-- no customer reschedule allowance and create no incident unless staff record
-- one with a reason. Staff bypass the calendar/capacity/pregnancy gates via
-- is_staff(), exactly as their direct inserts do today.
--
-- Runtime/time is the same internal seam as the customer commands: a public
-- wrapper supplies statement_timestamp() and a null override to a revoked
-- private dispatcher, so pgTAP can exercise the active branch inside a
-- rolled-back fixture while the real policy row stays null.
--
-- Plan: docs/superpowers/plans/2026-07-23-path-b-execution-plan.md (Task 1)
-- ============================================================

-- ── 1. A v1 visit + lineage, staff-created and confirmed ────────────
--
-- Unlike find_or_create_legacy_visit (which makes a legacy_compat shell),
-- this creates a visit_v1 aggregate, snapshotting the current Terms
-- publication. Staff bookings carry no deposit — clinical judgement — but are
-- still governed by the published Terms, so a missing publication blocks the
-- create rather than silently creating an ungoverned visit.

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
    customer_change_deadline_at, runtime_generation, terms_publication_id
  ) values (
    v_lineage, p_human_id, p_date, 'active', 'not_required',
    'confirmed', v_policy, coalesce(p_source, 'staff'), p_at, p_at,
    p_at, v_policy,
    public.change_deadline_for(v_policy, p_date, '08:30'),
    'visit_v1', v_settings.current_terms_publication_id
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

-- ── 2. Staff booking payload validation (shared) ────────────────────
--
-- Mirrors create_staff_booking_group's per-row validation: staff may book any
-- dog, size is staff-authoritative with a stored fallback, 1-10 rows.

create or replace function smarter_dog_private.insert_staff_visit_rows(
  p_visit_id uuid,
  p_booking_date date,
  p_bookings jsonb
) returns uuid[]
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_elem jsonb;
  v_idx int := 0;
  v_id uuid;
  v_dog_id uuid;
  v_slot text;
  v_service text;
  v_in_size text;
  v_dog_size text;
  v_size text;
  v_ids uuid[] := '{}'::uuid[];
begin
  if jsonb_typeof(p_bookings) <> 'array'
     or jsonb_array_length(p_bookings) < 1
     or jsonb_array_length(p_bookings) > 10 then
    raise exception 'a visit must have between 1 and 10 rows' using errcode = '22023';
  end if;

  for v_elem in select * from jsonb_array_elements(p_bookings) loop
    v_idx := v_idx + 1;
    v_id      := coalesce(nullif(v_elem->>'id','')::uuid, gen_random_uuid());
    v_dog_id  := nullif(v_elem->>'dog_id','')::uuid;
    v_slot    := nullif(v_elem->>'slot','');
    v_service := nullif(trim(coalesce(v_elem->>'service','')),'');
    v_in_size := nullif(trim(lower(coalesce(v_elem->>'size',''))),'');

    if v_dog_id is null then raise exception 'Row %: dog_id is required', v_idx using errcode='22023'; end if;
    if v_slot is null then raise exception 'Row %: slot is required', v_idx using errcode='22023'; end if;
    if v_service is null then raise exception 'Row %: service is required', v_idx using errcode='22023'; end if;

    select d.size into v_dog_size from public.dogs d where d.id = v_dog_id;
    if not found then
      raise exception 'Row %: no dog with that id', v_idx using errcode='42704';
    end if;
    v_size := coalesce(v_in_size, nullif(trim(lower(coalesce(v_dog_size,''))),''));
    if v_size not in ('small','medium','large') then
      raise exception 'Row %: invalid size', v_idx using errcode='22023';
    end if;

    insert into public.bookings
      (id, booking_date, slot, dog_id, size, service, status, confirmed, source, visit_id)
    values
      (v_id, p_booking_date, v_slot, v_dog_id, v_size, v_service, 'Booked', true, 'staff', p_visit_id);
    v_ids := v_ids || v_id;
  end loop;

  return v_ids;
end;
$$;
revoke all on function smarter_dog_private.insert_staff_visit_rows(uuid, date, jsonb)
  from public, anon, authenticated, service_role;

-- ── 3. Staff receipt ────────────────────────────────────────────────

create or replace function smarter_dog_private.staff_visit_receipt(
  p_visit_id uuid,
  p_outcome text,
  p_replacement_visit_id uuid default null,
  p_detail jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v record;
  v_ids jsonb;
begin
  select * into v from public.booking_visits where id = p_visit_id;
  select coalesce(jsonb_agg(b.id order by b.slot, b.id), '[]'::jsonb) into v_ids
    from public.bookings b
   where b.visit_id = p_visit_id and b.visit_membership_state = 'included';
  return jsonb_build_object(
    'outcome', p_outcome,
    'visit_id', v.id,
    'replacement_visit_id', p_replacement_visit_id,
    'revision', v.row_revision,
    'lifecycle_state', v.lifecycle_state,
    'confirmation_state', v.confirmation_state,
    'booking_ids', v_ids,
    'detail', coalesce(p_detail, '{}'::jsonb),
    'outcome_key', p_outcome || ':' || p_visit_id::text);
end;
$$;
revoke all on function smarter_dog_private.staff_visit_receipt(uuid, text, uuid, jsonb)
  from public, anon, authenticated, service_role;

-- ── 4. Dispatchers ──────────────────────────────────────────────────

create or replace function smarter_dog_private.create_staff_visit_dispatch(
  p_bookings jsonb,
  p_booking_date date,
  p_human_id uuid,
  p_idempotency_key uuid,
  p_source text,
  p_at timestamptz,
  p_runtime_override text default null
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
                || '|' || coalesce(p_human_id::text,''));
  v_prior := smarter_dog_private.replay_receipt('staff', p_idempotency_key, v_hash);
  if v_prior is not null then
    return v_prior;
  end if;

  -- Deterministic per-slot locks, same key the capacity trigger uses.
  select array_agg(distinct (e->>'slot') order by (e->>'slot')) into v_slot_list
    from jsonb_array_elements(p_bookings) e where nullif(e->>'slot','') is not null;
  if v_slot_list is not null then
    foreach v_lock in array v_slot_list loop
      perform pg_advisory_xact_lock(hashtextextended(p_booking_date::text || '|' || v_lock, 0));
    end loop;
  end if;

  v_visit := smarter_dog_private.create_staff_visit_v1(
    p_human_id, p_booking_date, p_at, p_source);
  perform smarter_dog_private.insert_staff_visit_rows(v_visit, p_booking_date, p_bookings);

  insert into public.booking_policy_audit
    (visit_id, human_id, action, actor_id, actor_scope, detail)
  values (v_visit, p_human_id, 'staff_visit_created', auth.uid(), 'staff',
          jsonb_build_object('bookingDate', p_booking_date));

  v_receipt := smarter_dog_private.staff_visit_receipt(v_visit, 'created');
  perform smarter_dog_private.store_receipt('staff', p_idempotency_key, v_hash, v_receipt);
  return v_receipt;
exception when sqlstate 'P0002' then
  -- policy_setup_incomplete from create_staff_visit_v1.
  return jsonb_build_object('outcome','blocked','block_reason','policy_setup_incomplete',
                            'visit_id',null,'outcome_key',null);
end;
$$;
revoke all on function smarter_dog_private.create_staff_visit_dispatch(
  jsonb, date, uuid, uuid, text, timestamptz, text) from public, anon, authenticated, service_role;

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
  p_runtime_override text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_runtime text;
  v record;
  d record;
  v_hash text;
  v_prior jsonb;
  v_receipt jsonb;
  v_prepaid numeric;
  v_event_id uuid;
  v_due timestamptz;
  v_coverage uuid;
  v_calendar_source text;
  v_incident jsonb := null;
  v_money jsonb := jsonb_build_object('kind','none');
begin
  perform smarter_dog_private.require_staff();
  v_runtime := coalesce(p_runtime_override, public.booking_policy_runtime_at(p_at));
  if v_runtime <> 'active' then
    return jsonb_build_object('outcome','policy_not_active','visit_id',p_visit_id,'outcome_key',null);
  end if;

  v_hash := md5(coalesce(p_visit_id::text,'') || '|' || coalesce(p_reason,'') || '|'
                || coalesce(p_paid_deposit_outcome,'') || '|' || coalesce(p_prepayment_handling,''));
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
  if v.lifecycle_state not in ('active') then
    return jsonb_build_object('outcome','blocked','block_reason','state_not_eligible',
                              'visit_id',p_visit_id,'outcome_key',null);
  end if;
  if coalesce(p_paid_deposit_outcome, 'refund') not in ('refund','credit') then
    return jsonb_build_object(
      'outcome','blocked','block_reason','invalid_paid_deposit_outcome',
      'visit_id',p_visit_id,'revision',v.row_revision,'outcome_key',null);
  end if;

  -- Non-deposit prepayment must be handled explicitly, never silently stranded.
  select coalesce(sum(coalesce(b.paid_amount,0)),0) into v_prepaid
    from public.bookings b
   where b.visit_id = p_visit_id and b.visit_membership_state = 'included'
     and coalesce(b.payment,'') in ('Paid in Full','Deposit Paid')
     and b.paid_amount is not null and b.paid_amount > 0;
  if v_prepaid > 0 then
    if p_prepayment_handling is null
       or p_prepayment_handling not in ('reconciliation_required','refund_due','transfer') then
      raise exception 'prepayment_handling_required' using errcode = 'P0002';
    end if;
    if p_prepayment_handling = 'reconciliation_required' then
      insert into public.booking_service_prepayment_reconciliations
        (visit_id, human_id, amount_pence, evidence, state, opened_reason)
      values (p_visit_id, v.human_id, (v_prepaid * 100)::int,
              jsonb_build_object('source','staff_cancellation'), 'open',
              'Staff cancelled a visit with non-deposit prepayment');
    end if;
    -- refund_due / transfer for prepayment are recorded by the dedicated
    -- reconciliation commands after cancellation; here we only guarantee the
    -- money is never dropped.
  end if;

  -- Cancel every included row, then the visit.
  update public.bookings
     set status = 'Cancelled',
         cancel_reason = coalesce(nullif(trim(coalesce(p_reason,'')),''), 'Cancelled by staff')
   where visit_id = p_visit_id and visit_membership_state = 'included'
     and status not in ('Cancelled','Completed');

  perform smarter_dog_private.close_open_change_requests(p_visit_id);

  update public.booking_visits
     set lifecycle_state = 'cancelled', cancelled_at = p_at
   where id = p_visit_id;

  -- Deposit outcome, when a deposit was actually received.
  select * into d from public.booking_visit_deposits where visit_id = p_visit_id for update;
  if d.state = 'received' then
    if coalesce(p_paid_deposit_outcome,'refund') = 'refund' then
      -- refund_due_at_verified raises rather than returning an unbacked date.
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
      v_money := jsonb_build_object('kind','refund_due','amount_pence',1000,'refund_due_at',v_due);
    else
      insert into public.booking_financial_ledger
        (human_id, visit_id, event_kind, amount_pence, reason, idempotency_key, recorded_by)
      values (v.human_id, p_visit_id, 'credit_issued', 1000,
              'Staff cancellation credit', 'staffcancel-credit:' || p_idempotency_key::text, auth.uid())
      returning id into v_event_id;
      v_money := jsonb_build_object('kind','credit_issued','amount_pence',1000);
    end if;
  end if;

  -- An incident only when staff deliberately record one.
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
                             'incident', v_incident));

  v_receipt := smarter_dog_private.staff_visit_receipt(
    p_visit_id, 'cancelled', null,
    jsonb_build_object('money', v_money, 'incident', v_incident));
  perform smarter_dog_private.store_receipt('staff', p_idempotency_key, v_hash, v_receipt);
  return v_receipt;
exception when sqlstate 'P0002' then
  return jsonb_build_object('outcome','blocked','block_reason','prepayment_handling_required',
                            'visit_id',p_visit_id,'outcome_key',null);
end;
$$;
revoke all on function smarter_dog_private.cancel_staff_visit_dispatch(
  uuid, integer, uuid, text, text, text, boolean, text, timestamptz, text)
  from public, anon, authenticated, service_role;

create or replace function smarter_dog_private.reschedule_staff_visit_dispatch(
  p_visit_id uuid,
  p_expected_revision integer,
  p_booking_date date,
  p_slot_assignments jsonb,
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
  v record;
  d record;
  v_hash text;
  v_prior jsonb;
  v_new_visit uuid;
  v_lineage uuid;
  v_new_rev int;
  v_policy text;
  v_settings record;
  v_elem jsonb;
  v_src_row record;
  v_min_slot text;
  v_receipt jsonb;
  v_source_row_count integer;
  v_source_dog_count integer;
  v_assignment_count integer;
  v_assignment_dog_count integer;
  v_matched_dog_count integer;
  v_deposit_transfer_event uuid;
  v_new_ids uuid[] := '{}'::uuid[];
  v_new_id uuid;
begin
  perform smarter_dog_private.require_staff();
  v_runtime := coalesce(p_runtime_override, public.booking_policy_runtime_at(p_at));
  if v_runtime <> 'active' then
    return jsonb_build_object('outcome','policy_not_active','visit_id',p_visit_id,'outcome_key',null);
  end if;

  v_hash := md5(coalesce(p_visit_id::text,'') || '|' || coalesce(p_booking_date::text,'')
                || '|' || coalesce(p_slot_assignments::text,''));
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
  if v.lifecycle_state <> 'active' or v.confirmation_state <> 'confirmed' then
    return jsonb_build_object('outcome','blocked','block_reason','state_not_eligible',
                              'visit_id',p_visit_id,'outcome_key',null);
  end if;

  -- Validate the complete assignment set before superseding the source.
  -- Every included source dog must appear exactly once, and no other dog or
  -- payload key is accepted. This makes malformed requests typed, atomic
  -- refusals rather than relying on a later booking insert to throw.
  if p_booking_date is null
     or p_slot_assignments is null
     or jsonb_typeof(p_slot_assignments) <> 'array' then
    return jsonb_build_object('outcome','blocked','block_reason','invalid_slot_assignments',
                              'visit_id',p_visit_id,'revision',v.row_revision,'outcome_key',null);
  end if;
  if jsonb_array_length(p_slot_assignments) = 0 then
    return jsonb_build_object('outcome','blocked','block_reason','invalid_slot_assignments',
                              'visit_id',p_visit_id,'revision',v.row_revision,'outcome_key',null);
  end if;

  for v_elem in select * from jsonb_array_elements(p_slot_assignments) loop
    if jsonb_typeof(v_elem) <> 'object' then
      return jsonb_build_object('outcome','blocked','block_reason','invalid_slot_assignments',
                                'visit_id',p_visit_id,'revision',v.row_revision,'outcome_key',null);
    end if;
    if (v_elem - 'dog_id' - 'slot') <> '{}'::jsonb
       or coalesce(v_elem->>'dog_id','') !~*
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or jsonb_typeof(v_elem->'slot') <> 'string'
       or nullif(trim(v_elem->>'slot'),'') is null
       or not ((v_elem->>'slot') = any(public.active_slots_for(p_booking_date))) then
      return jsonb_build_object('outcome','blocked','block_reason','invalid_slot_assignments',
                                'visit_id',p_visit_id,'revision',v.row_revision,'outcome_key',null);
    end if;
  end loop;

  select count(*)::integer, count(distinct b.dog_id)::integer
    into v_source_row_count, v_source_dog_count
    from public.bookings b
   where b.visit_id = p_visit_id
     and b.visit_membership_state = 'included';
  v_assignment_count := jsonb_array_length(p_slot_assignments);
  select count(distinct (assignment->>'dog_id')::uuid)::integer
    into v_assignment_dog_count
    from jsonb_array_elements(p_slot_assignments) assignment;
  select count(distinct b.dog_id)::integer
    into v_matched_dog_count
    from jsonb_array_elements(p_slot_assignments) assignment
    join public.bookings b
      on b.visit_id = p_visit_id
     and b.visit_membership_state = 'included'
     and b.dog_id = (assignment->>'dog_id')::uuid;

  if v_source_row_count = 0
     or v_source_row_count <> v_source_dog_count
     or v_assignment_count <> v_source_dog_count
     or v_assignment_dog_count <> v_source_dog_count
     or v_matched_dog_count <> v_source_dog_count then
    return jsonb_build_object('outcome','blocked','block_reason','invalid_slot_assignments',
                              'visit_id',p_visit_id,'revision',v.row_revision,'outcome_key',null);
  end if;

  -- A staff move may carry no deposit requirement, or an already-received
  -- £10 backed by complete immutable evidence. All other money states need an
  -- explicit reconciliation workflow and must block before any visit changes.
  select * into d
    from public.booking_visit_deposits
   where visit_id = p_visit_id
   for update;
  if not found then
    return jsonb_build_object(
      'outcome','blocked','block_reason','deposit_transfer_evidence_incomplete',
      'visit_id',p_visit_id,'revision',v.row_revision,'outcome_key',null);
  end if;
  if d.state not in ('not_required','received') then
    return jsonb_build_object(
      'outcome','blocked','block_reason','deposit_state_not_transferable',
      'visit_id',p_visit_id,'revision',v.row_revision,'outcome_key',null);
  end if;
  if d.state = 'received' then
    if d.amount_pence <> 1000
       or not (coalesce(d.satisfaction_source,'') in ('bank','credit','transfer'))
       or d.satisfaction_event_id is null
       or nullif(trim(coalesce(d.requirement_reason,'')),'') is null
       or d.bank_instruction_id is null
       or d.due_at is null
       or d.terms_publication_id is null
       or d.terms_accepted_at is null
       or d.terms_publication_id is distinct from v.terms_publication_id
       or not exists (
         select 1
           from public.booking_financial_ledger source_event
          where source_event.id = d.satisfaction_event_id
            and source_event.human_id = v.human_id
            and source_event.visit_id = p_visit_id
            and source_event.amount_pence = 1000
            and source_event.event_kind = case d.satisfaction_source
              when 'bank' then 'deposit_received'
              when 'credit' then 'credit_applied'
              when 'transfer' then 'deposit_transferred'
            end
       ) then
      return jsonb_build_object(
        'outcome','blocked','block_reason','deposit_transfer_evidence_incomplete',
        'visit_id',p_visit_id,'revision',v.row_revision,'outcome_key',null);
    end if;
    if exists (
      select 1
        from public.booking_deposit_transfer_reservations reservation
       where reservation.source_satisfaction_event_id = d.satisfaction_event_id
    ) then
      return jsonb_build_object(
        'outcome','blocked','block_reason','deposit_transfer_already_used',
        'visit_id',p_visit_id,'revision',v.row_revision,'outcome_key',null);
    end if;
  end if;

  select max(revision) into v_new_rev from public.booking_visits where lineage_id = v.lineage_id;
  v_new_rev := v_new_rev + 1;
  v_policy := public.policy_for_confirmation(p_at);
  select * into v_settings from public.booking_policy_settings where singleton;

  -- Supersede the source first so the one-active-per-lineage index is free.
  update public.booking_visits set lifecycle_state = 'superseded' where id = p_visit_id;

  -- The replacement: same lineage, next revision, new date. Staff moves
  -- consume NO customer reschedule allowance (the lineage count is untouched).
  insert into public.booking_visits (
    lineage_id, human_id, booking_date, lifecycle_state, approval_state,
    confirmation_state, policy_code, source, requested_at, confirmed_at,
    commercial_eligibility_at, eligibility_policy_code,
    customer_change_deadline_at, runtime_generation, terms_publication_id,
    revision, supersedes_visit_id
  ) values (
    v.lineage_id, v.human_id, p_booking_date, 'active', 'not_required',
    'confirmed', v_policy, 'staff', p_at, p_at, p_at, v_policy,
    public.change_deadline_for(v_policy, p_booking_date, '08:30'),
    'visit_v1', coalesce(v.terms_publication_id, v_settings.current_terms_publication_id),
    v_new_rev, p_visit_id
  )
  returning id into v_new_visit;

  -- Copy each source row to its new slot, preserving service, size, add-ons
  -- and ALL payment evidence unchanged. No second payment event is invented.
  for v_elem in select * from jsonb_array_elements(p_slot_assignments) loop
    select * into v_src_row from public.bookings b
     where b.visit_id = p_visit_id and b.dog_id = (v_elem->>'dog_id')::uuid
       and b.visit_membership_state = 'included'
     limit 1;
    if not found then
      raise exception 'reschedule assignment names a dog not on the source visit'
        using errcode = '22023';
    end if;
    insert into public.bookings
      (booking_date, slot, dog_id, size, service, status, confirmed, addons,
       payment, payment_method, paid_at, paid_amount, source, visit_id)
    values
      (p_booking_date, v_elem->>'slot', v_src_row.dog_id, v_src_row.size,
       v_src_row.service, 'Booked', true, v_src_row.addons,
       v_src_row.payment, v_src_row.payment_method, v_src_row.paid_at,
       v_src_row.paid_amount, 'staff', v_new_visit)
    returning id into v_new_id;
    v_new_ids := v_new_ids || v_new_id;
  end loop;

  -- Cancel the source rows now that the replacement holds the work.
  update public.bookings
     set status = 'Cancelled', cancel_reason = 'Rescheduled by staff'
   where visit_id = p_visit_id and visit_membership_state = 'included'
     and status = 'Booked';

  -- Move deposit semantics, never the source row or its evidence. A
  -- not-required decision is recreated for the replacement. Received money
  -- gets a destination-bound transfer event and a one-use reservation before
  -- the destination deposit points to that new evidence.
  if d.state = 'not_required' then
    insert into public.booking_visit_deposits
      (visit_id, origin, state, amount_pence, requirement_decided_at,
       exemption_reason)
    values (v_new_visit, 'visit_v1', 'not_required', d.amount_pence, p_at,
            coalesce(d.exemption_reason, 'staff_rescheduled'));
  else
    insert into public.booking_financial_ledger
      (human_id, visit_id, related_visit_id, event_kind, amount_pence, reason,
       idempotency_key, recorded_by)
    values (v.human_id, v_new_visit, p_visit_id, 'deposit_transferred',
            d.amount_pence, 'Deposit transferred to a staff-rescheduled visit',
            'staff-reschedule-deposit:' || p_idempotency_key::text, auth.uid())
    returning id into v_deposit_transfer_event;

    insert into public.booking_deposit_transfer_reservations
      (human_id, source_visit_id, destination_visit_id,
       source_satisfaction_event_id, amount_pence, state,
       fallback_source_disposition, applied_at)
    values (v.human_id, p_visit_id, v_new_visit, d.satisfaction_event_id,
            d.amount_pence, 'applied', 'retain', p_at);

    insert into public.booking_visit_deposits
      (visit_id, origin, state, amount_pence, requirement_reason,
       requirement_decided_at, bank_instruction_id, due_at,
       satisfaction_source, satisfaction_event_id, recorded_at, recorded_by,
       terms_publication_id, terms_accepted_at)
    values (v_new_visit, 'visit_v1', 'received', d.amount_pence,
            d.requirement_reason, d.requirement_decided_at,
            d.bank_instruction_id, d.due_at,
            'transfer', v_deposit_transfer_event, p_at, auth.uid(),
            d.terms_publication_id, d.terms_accepted_at);
  end if;

  perform smarter_dog_private.close_open_change_requests(p_visit_id);

  insert into public.booking_policy_audit
    (visit_id, human_id, action, actor_id, actor_scope, reason, detail)
  values (p_visit_id, v.human_id, 'staff_visit_rescheduled', auth.uid(), 'staff', p_reason,
          jsonb_build_object('replacementVisitId', v_new_visit, 'bookingDate', p_booking_date));

  v_receipt := smarter_dog_private.staff_visit_receipt(
    p_visit_id, 'rescheduled', v_new_visit,
    jsonb_build_object('supersededVisitId', p_visit_id));
  perform smarter_dog_private.store_receipt('staff', p_idempotency_key, v_hash, v_receipt);
  return v_receipt;
end;
$$;
revoke all on function smarter_dog_private.reschedule_staff_visit_dispatch(
  uuid, integer, date, jsonb, uuid, text, timestamptz, text)
  from public, anon, authenticated, service_role;

-- update_staff_booking_visit: a commercial-detail change (service/add-ons on
-- existing rows) with a mandatory reason, revision-checked. Date/slot moves go
-- through reschedule; this is for in-place service corrections.
create or replace function smarter_dog_private.update_staff_visit_dispatch(
  p_visit_id uuid,
  p_expected_revision integer,
  p_changes jsonb,
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
  v record;
  v_hash text;
  v_prior jsonb;
  v_elem jsonb;
  v_receipt jsonb;
  v_change_count integer;
  v_match_count integer;
  v_distinct_match_count integer;
begin
  perform smarter_dog_private.require_staff();
  v_runtime := coalesce(p_runtime_override, public.booking_policy_runtime_at(p_at));
  if v_runtime <> 'active' then
    return jsonb_build_object('outcome','policy_not_active','visit_id',p_visit_id,'outcome_key',null);
  end if;

  v_hash := md5(coalesce(p_visit_id::text,'') || '|' || coalesce(p_changes::text,''));
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

  if nullif(trim(coalesce(p_reason,'')),'') is null then
    raise exception 'a staff visit change needs a reason' using errcode = '22023';
  end if;
  if p_changes is null
     or jsonb_typeof(p_changes) <> 'array' then
    return jsonb_build_object(
      'outcome','blocked','block_reason','invalid_changes',
      'visit_id',p_visit_id,'revision',v.row_revision,'outcome_key',null);
  end if;
  if jsonb_array_length(p_changes) = 0 then
    return jsonb_build_object(
      'outcome','blocked','block_reason','invalid_changes',
      'visit_id',p_visit_id,'revision',v.row_revision,'outcome_key',null);
  end if;

  -- Validate the complete edit set before touching any booking row. A bad
  -- member must not leave earlier members partially applied.
  for v_elem in select * from jsonb_array_elements(p_changes) loop
    if jsonb_typeof(v_elem) <> 'object' then
      return jsonb_build_object(
        'outcome','blocked','block_reason','invalid_changes',
        'visit_id',p_visit_id,'revision',v.row_revision,'outcome_key',null);
    end if;
    if coalesce(v_elem->>'bookingId','') !~*
         '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or (v_elem - 'bookingId' - 'service' - 'addons') <> '{}'::jsonb
       or not (v_elem ? 'service' or v_elem ? 'addons')
       or (
         v_elem ? 'service'
         and (
           jsonb_typeof(v_elem->'service') <> 'string'
           or nullif(trim(v_elem->>'service'),'') is null
         )
       )
       or (
         v_elem ? 'addons'
         and jsonb_typeof(v_elem->'addons') <> 'array'
       ) then
      return jsonb_build_object(
        'outcome','blocked','block_reason','invalid_changes',
        'visit_id',p_visit_id,'revision',v.row_revision,'outcome_key',null);
    end if;
    if v_elem ? 'addons'
       and exists (
         select 1
         from jsonb_array_elements(v_elem->'addons') add_on
         where jsonb_typeof(add_on) <> 'string'
       ) then
      return jsonb_build_object(
        'outcome','blocked','block_reason','invalid_changes',
        'visit_id',p_visit_id,'revision',v.row_revision,'outcome_key',null);
    end if;
  end loop;

  v_change_count := jsonb_array_length(p_changes);
  select count(*)::integer, count(distinct b.id)::integer
    into v_match_count, v_distinct_match_count
    from jsonb_array_elements(p_changes) elem
    join public.bookings b
      on b.id = (elem->>'bookingId')::uuid
     and b.visit_id = p_visit_id
     and b.visit_membership_state = 'included';
  if v_match_count <> v_change_count
     or v_distinct_match_count <> v_change_count then
    return jsonb_build_object(
      'outcome','blocked','block_reason','invalid_changes',
      'visit_id',p_visit_id,'revision',v.row_revision,'outcome_key',null);
  end if;

  if not exists (
    select 1
      from jsonb_array_elements(p_changes) elem
      join public.bookings b
        on b.id = (elem->>'bookingId')::uuid
       and b.visit_id = p_visit_id
       and b.visit_membership_state = 'included'
     where (
       elem ? 'service'
       and b.service is distinct from (elem->>'service')
     )
     or (
       elem ? 'addons'
       and b.addons is distinct from
           array(select jsonb_array_elements_text(elem->'addons'))
     )
  ) then
    return jsonb_build_object(
      'outcome','blocked','block_reason','no_changes',
      'visit_id',p_visit_id,'revision',v.row_revision,'outcome_key',null);
  end if;

  -- Each change names a booking row and its new service and/or add-ons.
  for v_elem in select * from jsonb_array_elements(p_changes) loop
    update public.bookings b
       set service = case when v_elem ? 'service'
                          then v_elem->>'service' else b.service end,
           addons = case when v_elem ? 'addons'
                         then array(select jsonb_array_elements_text(v_elem->'addons'))
                         else b.addons end
     where b.id = (v_elem->>'bookingId')::uuid
       and b.visit_id = p_visit_id
       and b.visit_membership_state = 'included';
  end loop;

  -- Bump the mutable row revision so a stale concurrent editor is rejected.
  -- The `revision` column is the immutable lineage ordinal and never changes
  -- for an in-place edit.
  update public.booking_visits
     set row_revision = row_revision + 1,
         updated_at = now()
   where id = p_visit_id;

  insert into public.booking_policy_audit
    (visit_id, human_id, action, actor_id, actor_scope, reason, detail)
  values (p_visit_id, v.human_id, 'staff_visit_updated', auth.uid(), 'staff', p_reason, p_changes);

  v_receipt := smarter_dog_private.staff_visit_receipt(p_visit_id, 'updated');
  perform smarter_dog_private.store_receipt('staff', p_idempotency_key, v_hash, v_receipt);
  return v_receipt;
end;
$$;
revoke all on function smarter_dog_private.update_staff_visit_dispatch(
  uuid, integer, jsonb, uuid, text, timestamptz, text)
  from public, anon, authenticated, service_role;

-- ── 5. Public wrappers — always statement_timestamp() and null override ──

create or replace function public.create_staff_booking_visit(
  p_bookings jsonb,
  p_booking_date date,
  p_human_id uuid,
  p_idempotency_key uuid,
  p_source text default 'staff'
) returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select smarter_dog_private.create_staff_visit_dispatch(
    p_bookings, p_booking_date, p_human_id, p_idempotency_key, p_source,
    statement_timestamp(), null);
$$;
revoke all on function public.create_staff_booking_visit(jsonb, date, uuid, uuid, text) from public;
revoke all on function public.create_staff_booking_visit(jsonb, date, uuid, uuid, text) from anon;
revoke all on function public.create_staff_booking_visit(jsonb, date, uuid, uuid, text) from authenticated;
grant execute on function public.create_staff_booking_visit(jsonb, date, uuid, uuid, text) to authenticated;

create or replace function public.cancel_staff_booking_visit(
  p_visit_id uuid,
  p_expected_revision integer,
  p_idempotency_key uuid,
  p_reason text default null,
  p_paid_deposit_outcome text default 'refund',
  p_prepayment_handling text default null,
  p_record_incident boolean default false,
  p_incident_kind text default null
) returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select smarter_dog_private.cancel_staff_visit_dispatch(
    p_visit_id, p_expected_revision, p_idempotency_key, p_reason,
    p_paid_deposit_outcome, p_prepayment_handling, p_record_incident, p_incident_kind,
    statement_timestamp(), null);
$$;
revoke all on function public.cancel_staff_booking_visit(uuid, integer, uuid, text, text, text, boolean, text) from public;
revoke all on function public.cancel_staff_booking_visit(uuid, integer, uuid, text, text, text, boolean, text) from anon;
revoke all on function public.cancel_staff_booking_visit(uuid, integer, uuid, text, text, text, boolean, text) from authenticated;
grant execute on function public.cancel_staff_booking_visit(uuid, integer, uuid, text, text, text, boolean, text) to authenticated;

create or replace function public.reschedule_staff_booking_visit(
  p_visit_id uuid,
  p_expected_revision integer,
  p_booking_date date,
  p_slot_assignments jsonb,
  p_idempotency_key uuid,
  p_reason text default null
) returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select smarter_dog_private.reschedule_staff_visit_dispatch(
    p_visit_id, p_expected_revision, p_booking_date, p_slot_assignments,
    p_idempotency_key, p_reason, statement_timestamp(), null);
$$;
revoke all on function public.reschedule_staff_booking_visit(uuid, integer, date, jsonb, uuid, text) from public;
revoke all on function public.reschedule_staff_booking_visit(uuid, integer, date, jsonb, uuid, text) from anon;
revoke all on function public.reschedule_staff_booking_visit(uuid, integer, date, jsonb, uuid, text) from authenticated;
grant execute on function public.reschedule_staff_booking_visit(uuid, integer, date, jsonb, uuid, text) to authenticated;

create or replace function public.update_staff_booking_visit(
  p_visit_id uuid,
  p_expected_revision integer,
  p_changes jsonb,
  p_idempotency_key uuid,
  p_reason text
) returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select smarter_dog_private.update_staff_visit_dispatch(
    p_visit_id, p_expected_revision, p_changes, p_idempotency_key, p_reason,
    statement_timestamp(), null);
$$;
revoke all on function public.update_staff_booking_visit(uuid, integer, jsonb, uuid, text) from public;
revoke all on function public.update_staff_booking_visit(uuid, integer, jsonb, uuid, text) from anon;
revoke all on function public.update_staff_booking_visit(uuid, integer, jsonb, uuid, text) from authenticated;
grant execute on function public.update_staff_booking_visit(uuid, integer, jsonb, uuid, text) to authenticated;

comment on function public.create_staff_booking_visit(jsonb, date, uuid, uuid, text) is
  'v1 staff write path: creates one confirmed visit_v1 aggregate with its child rows. Staff-created, no deposit, governed by the current Terms publication. Returns policy_not_active while the policy is inactive; staff use create_staff_booking_group until then.';
comment on function public.reschedule_staff_booking_visit(uuid, integer, date, jsonb, uuid, text) is
  'v1 staff reschedule: supersedes the source and creates a replacement in the same lineage, copying every payment field unchanged. Consumes NO customer reschedule allowance and creates no incident.';
