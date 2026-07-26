-- Staff visit write commands: whole-visit atomicity, revision staleness,
-- the prepayment branch, no incident unless deliberate, payment evidence
-- preserved across a move, and the inactive-runtime gate.
-- Fixtures and the guarded policy activation are rolled back.

begin;
create extension if not exists pgtap with schema extensions;
select plan(111);
\ir fixtures/ensure_local_vault_secrets.psql

insert into auth.users (id) values
  ('17000000-0000-4000-8000-000000000001'),   -- owner staff
  ('17000000-0000-4000-8000-000000000003');   -- customer (not staff)

insert into public.staff_profiles (user_id, role, display_name) values
  ('17000000-0000-4000-8000-000000000001', 'owner', 'Write Owner');

insert into public.humans (id, name, surname, customer_user_id) values
  ('17000000-0000-4000-8000-000000000010', 'StaffWrite170', 'One',
   '17000000-0000-4000-8000-000000000003');

insert into public.dogs (id, name, breed, size, human_id) values
  ('17000000-0000-4000-8000-000000000011', 'Lima', 'Poodle', 'small',
   '17000000-0000-4000-8000-000000000010'),
  ('17000000-0000-4000-8000-000000000012', 'Mike', 'Beagle', 'small',
   '17000000-0000-4000-8000-000000000010'),
  ('17000000-0000-4000-8000-000000000013', 'November', 'Spaniel', 'small',
   '17000000-0000-4000-8000-000000000010');

select set_config('request.jwt.claims',
  '{"sub":"17000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

create or replace function pg_temp.open_day(p_offset int)
returns date language plpgsql as $$
declare d date := current_date + p_offset;
begin
  while extract(isodow from d) > 3 loop d := d + 1; end loop;
  return d;
end;
$$;

-- Terms must be published before any v1 staff booking can be created.
select public.update_booking_rules(
  ('{"depositBank":{"accountName":"Smarter Dog","sortCode":"12-34-56","accountNumber":"12345678"},'
   || '"depositTermsVersion":"2026-07 v1","depositTermsContentHash":"'
   || repeat('c',64) || '"}')::jsonb);

-- Two dogs, one visit.
create or replace function pg_temp.two_dog_payload(p_slot text)
returns jsonb language sql as $$
  select jsonb_build_array(
    jsonb_build_object('dog_id','17000000-0000-4000-8000-000000000011',
                       'slot',p_slot,'service','Full Groom'),
    jsonb_build_object('dog_id','17000000-0000-4000-8000-000000000012',
                       'slot',p_slot,'service','Bath & Brush'));
$$;

-- ── 1-3: role gate and the inactive-runtime gate ───────────────────

select set_config('request.jwt.claims',
  '{"sub":"17000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok(
  format($f$ select public.create_staff_booking_visit(
    pg_temp.two_dog_payload('08:30'), %L::date,
    '17000000-0000-4000-8000-000000000010', gen_random_uuid(), 'phone') $f$,
    pg_temp.open_day(30)),
  '42501', null, 'a customer cannot use the staff create command');
select set_config('request.jwt.claims',
  '{"sub":"17000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is(public.booking_policy_runtime(), 'inactive', 'the runtime is inactive');

select is(
  (public.create_staff_booking_visit(
     pg_temp.two_dog_payload('08:30'), pg_temp.open_day(30),
     '17000000-0000-4000-8000-000000000010', gen_random_uuid(), 'phone') ->> 'outcome'),
  'policy_not_active',
  'the v1 staff create is inert while the policy is inactive');

select is(
  (select count(*)::int from public.booking_visits
    where human_id = '17000000-0000-4000-8000-000000000010'
      and runtime_generation = 'visit_v1'),
  0, 'the inactive command creates no visit or capacity rows');

select set_config('smarter_dog.booking_policy_latch', 'previous_day_1500_v1', true);
update public.booking_policy_versions
   set effective_at = statement_timestamp() - interval '1 second'
 where code = 'previous_day_1500_v1';
select is(public.booking_policy_runtime(), 'active',
  'the guarded rolled-back fixture activates the policy');

-- ── 4-9: create makes ONE visit for all dogs ───────────────────────

create or replace function pg_temp.mk(p_offset int, p_slot text)
returns jsonb language sql as $$
  select smarter_dog_private.create_staff_visit_dispatch(
    pg_temp.two_dog_payload(p_slot), pg_temp.open_day(p_offset),
    '17000000-0000-4000-8000-000000000010', gen_random_uuid(), 'staff',
    statement_timestamp(), 'active', 'phone');
$$;

select is((pg_temp.mk(30,'08:30')) ->> 'outcome', 'created',
  'a two-dog staff booking creates a visit');

select is(
  (select count(*)::int from public.booking_visits
    where human_id = '17000000-0000-4000-8000-000000000010'
      and runtime_generation = 'visit_v1'),
  1, 'exactly one visit, not one per dog');

select is(
  (select count(*)::int from public.bookings b
    join public.booking_visits v on v.id = b.visit_id
   where v.runtime_generation = 'visit_v1'),
  2, 'both dogs are attached to that one visit');

select is(
  (select confirmation_state from public.booking_visits
    where runtime_generation = 'visit_v1' limit 1),
  'confirmed', 'a staff booking is confirmed immediately');

select ok(
  (select terms_publication_id is not null from public.booking_visits
    where runtime_generation = 'visit_v1' limit 1),
  'the visit snapshots the Terms publication in force');

select is(
  (select state from public.booking_visit_deposits d
     join public.booking_visits v on v.id = d.visit_id
    where v.runtime_generation = 'visit_v1'),
  'not_required', 'a staff booking carries no deposit');

-- ── 10-11: create is blocked without a Terms publication ───────────

-- The audited Settings RPC correctly refuses to clear Terms while the policy
-- is active (covered in 145). Simulate damaged/out-of-band setup directly so
-- the command's own defence remains executable and regression-tested.
update public.booking_policy_settings
   set current_terms_publication_id = null
 where singleton;
select is((pg_temp.mk(37,'08:30')) ->> 'block_reason', 'policy_setup_incomplete',
  'creation is blocked while no Terms publication exists');
select is(
  (select count(*)::int from public.bookings b
    join public.booking_visits v on v.id = b.visit_id
   where v.booking_date = pg_temp.open_day(37)),
  0, 'a blocked create leaves no partial rows behind');
select public.update_booking_rules(
  ('{"depositTermsVersion":"2026-07 v1","depositTermsContentHash":"' || repeat('c',64) || '"}')::jsonb);

-- ── 12-16: cancellation is whole-visit and revision-checked ────────

create or replace function pg_temp.first_visit() returns uuid language sql as $$
  select id from public.booking_visits
   where runtime_generation = 'visit_v1' and lifecycle_state = 'active'
   order by booking_date limit 1;
$$;

select is(
  smarter_dog_private.cancel_staff_visit_dispatch(
    pg_temp.first_visit(), 999, gen_random_uuid(), 'wrong revision',
    'refund', null, false, null, statement_timestamp(), 'active') ->> 'block_reason',
  'stale_review', 'a stale visit revision is refused');

select is(
  (select lifecycle_state from public.booking_visits where id = pg_temp.first_visit()),
  'active', 'a stale-review refusal changes nothing');

select is(
  smarter_dog_private.cancel_staff_visit_dispatch(
    pg_temp.first_visit(),
    (select row_revision from public.booking_visits where id = pg_temp.first_visit()),
    gen_random_uuid(), 'invalid money choice', 'voucher', null, false, null,
    statement_timestamp(), 'active') ->> 'block_reason',
  'invalid_paid_deposit_outcome',
  'an unknown paid-deposit outcome is refused');

select is(
  (select lifecycle_state from public.booking_visits where id = pg_temp.first_visit()),
  'active', 'an invalid paid-deposit outcome changes nothing');

select is(
  smarter_dog_private.cancel_staff_visit_dispatch(
    pg_temp.first_visit(),
    (select row_revision from public.booking_visits where id = pg_temp.first_visit()),
    gen_random_uuid(), 'salon closed', 'refund', null, false, null,
    statement_timestamp(), 'active') ->> 'outcome',
  'cancelled', 'a staff cancellation with the current revision succeeds');

select is(
  (select count(*)::int from public.bookings b
    join public.booking_visits v on v.id = b.visit_id
   where v.runtime_generation = 'visit_v1' and v.lifecycle_state = 'cancelled'
     and b.status <> 'Cancelled'),
  0, 'every dog on the visit is cancelled together');

select is(
  (select count(*)::int from public.booking_policy_incidents),
  0, 'a staff cancellation creates no incident by default');

-- ── 17-19: prepayment must be handled explicitly ───────────────────

select pg_temp.mk(44,'08:30');
update public.bookings set payment = 'Paid in Full', paid_amount = 45
 where visit_id = pg_temp.first_visit() and slot = '08:30'
   and dog_id = '17000000-0000-4000-8000-000000000011';

select is(
  smarter_dog_private.cancel_staff_visit_dispatch(
    pg_temp.first_visit(),
    (select row_revision from public.booking_visits where id = pg_temp.first_visit()),
    gen_random_uuid(), 'customer moved away', 'refund', null, false, null,
    statement_timestamp(), 'active') ->> 'block_reason',
  'prepayment_handling_required',
  'cancelling a prepaid visit without a handling choice is refused');

select is(
  (select lifecycle_state from public.booking_visits where id = pg_temp.first_visit()),
  'active', 'the refused prepayment cancellation changed nothing');

select is(
  smarter_dog_private.cancel_staff_visit_dispatch(
    pg_temp.first_visit(),
    (select row_revision from public.booking_visits where id = pg_temp.first_visit()),
    gen_random_uuid(), 'customer moved away', 'refund',
    'reconciliation_required', false, null,
    statement_timestamp(), 'active') ->> 'outcome',
  'cancelled', 'an explicit reconciliation choice allows the cancellation');

select is(
  (select count(*)::int from public.booking_service_prepayment_reconciliations
    where state = 'open'),
  1, 'the prepayment opens exactly one reconciliation, never stranded');

-- ── 21-26: reschedule preserves payment and consumes no allowance ──

select pg_temp.mk(51,'08:30');
update public.bookings
   set payment = 'Paid in Full', payment_method = 'card', paid_amount = 45,
       paid_at = now()
 where visit_id = pg_temp.first_visit()
   and dog_id = '17000000-0000-4000-8000-000000000011';

select is(
  smarter_dog_private.reschedule_staff_visit_dispatch(
    pg_temp.first_visit(),
    (select row_revision from public.booking_visits where id = pg_temp.first_visit()),
    pg_temp.open_day(58),
    jsonb_build_array(
      jsonb_build_object('dog_id','17000000-0000-4000-8000-000000000011','slot','09:00'),
      jsonb_build_object('dog_id','17000000-0000-4000-8000-000000000012','slot','09:00')),
    '17000000-0000-4000-8000-000000000058',
    'staff moved the day', statement_timestamp(), 'active') ->> 'outcome',
  'rescheduled', 'a staff reschedule commits');

select is(
  (smarter_dog_private.reschedule_staff_visit_dispatch(
    (select id from public.booking_visits where booking_date = pg_temp.open_day(51)),
    null, pg_temp.open_day(58),
    jsonb_build_array(
      jsonb_build_object('dog_id','17000000-0000-4000-8000-000000000011','slot','09:00'),
      jsonb_build_object('dog_id','17000000-0000-4000-8000-000000000012','slot','09:00')),
    '17000000-0000-4000-8000-000000000058',
    'staff moved the day', statement_timestamp(), 'active') ->> 'visit_id',
  (select id::text from public.booking_visits
    where booking_date = pg_temp.open_day(51)),
  'the reschedule receipt identifies the superseded source as visit_id');

select is(
  (smarter_dog_private.reschedule_staff_visit_dispatch(
    (select id from public.booking_visits where booking_date = pg_temp.open_day(51)),
    null, pg_temp.open_day(58),
    jsonb_build_array(
      jsonb_build_object('dog_id','17000000-0000-4000-8000-000000000011','slot','09:00'),
      jsonb_build_object('dog_id','17000000-0000-4000-8000-000000000012','slot','09:00')),
    '17000000-0000-4000-8000-000000000058',
    'staff moved the day', statement_timestamp(), 'active') ->> 'replacement_visit_id',
  (select id::text from public.booking_visits
    where booking_date = pg_temp.open_day(58)),
  'the reschedule receipt identifies the active replacement separately');

select is(
  (select count(*)::int from public.booking_visits v
    where v.lineage_id = (select lineage_id from public.booking_visits
                           where booking_date = pg_temp.open_day(58) limit 1)
      and v.lifecycle_state = 'active'),
  1, 'exactly one active visit remains in the lineage — never two');

select is(
  (select lifecycle_state from public.booking_visits
    where booking_date = pg_temp.open_day(51)),
  'superseded', 'the source visit is superseded, not left active');

select is(
  (select self_service_reschedule_count from public.booking_lineages
    where id = (select lineage_id from public.booking_visits
                 where booking_date = pg_temp.open_day(58) limit 1)),
  0::smallint,
  'a staff move consumes no customer reschedule allowance');

select is(
  (select paid_amount from public.bookings
    where booking_date = pg_temp.open_day(58)
      and dog_id = '17000000-0000-4000-8000-000000000011'),
  45::numeric, 'payment evidence is copied to the replacement unchanged');

select is(
  (select payment_method from public.bookings
    where booking_date = pg_temp.open_day(58)
      and dog_id = '17000000-0000-4000-8000-000000000011'),
  'card', 'the payment method survives the move');

select is(
  (select count(*)::int from public.booking_policy_incidents),
  0, 'a staff reschedule creates no incident');

select is(
  (select d.state from public.booking_visit_deposits d
    join public.booking_visits v on v.id = d.visit_id
   where v.booking_date = pg_temp.open_day(58)),
  'not_required',
  'a not-required deposit decision is recreated safely on the replacement');

-- The deliberate branch must cross the nested PUBLIC policy gate; an
-- inactive global runtime would silently return policy_not_active here even
-- though the private dispatcher was given its test-time active override.
select pg_temp.mk(130,'08:30');
select is(
  smarter_dog_private.cancel_staff_visit_dispatch(
    (select id from public.booking_visits
      where booking_date = pg_temp.open_day(130) and lifecycle_state = 'active'),
    (select row_revision from public.booking_visits
      where booking_date = pg_temp.open_day(130) and lifecycle_state = 'active'),
    gen_random_uuid(), 'customer cancelled late', 'refund', null, true,
    'late_cancellation', statement_timestamp(), 'active')
    -> 'detail' -> 'incident' ->> 'kind',
  'late_cancellation',
  'a deliberate staff incident crosses the nested public runtime gate');
select is(
  (select count(*)::int from public.booking_policy_incidents i
    join public.booking_visits v on v.id = i.visit_id
   where v.booking_date = pg_temp.open_day(130)),
  1, 'the deliberate branch records exactly one incident');

-- ── 28: idempotent replay ──────────────────────────────────────────

select is(
  (with k as (select gen_random_uuid() u)
   select (smarter_dog_private.create_staff_visit_dispatch(
             pg_temp.two_dog_payload('10:00'), pg_temp.open_day(65),
             '17000000-0000-4000-8000-000000000010', k.u, 'staff',
             statement_timestamp(), 'active', 'phone') ->> 'visit_id')
        = (smarter_dog_private.create_staff_visit_dispatch(
             pg_temp.two_dog_payload('10:00'), pg_temp.open_day(65),
             '17000000-0000-4000-8000-000000000010', k.u, 'staff',
             statement_timestamp(), 'active', 'phone') ->> 'visit_id')
   from k),
  true, 'a retried key replays the same visit rather than creating a second');

-- ── 29-33: Terms notice vs customer acceptance ─────────────────────

select pg_temp.mk(72,'08:30');

select is(
  (select terms_acknowledgement from public.booking_visits
    where booking_date = pg_temp.open_day(72)),
  'staff_notice',
  'a staff-created visit records NOTICE, never a portal acceptance');

-- The notice is DECLARED, never assumed. Omitting it creates nothing.
select is(
  (smarter_dog_private.create_staff_visit_dispatch(
     pg_temp.two_dog_payload('08:30'), pg_temp.open_day(100),
     '17000000-0000-4000-8000-000000000010', gen_random_uuid(), 'staff',
     statement_timestamp(), 'active', null)) ->> 'block_reason',
  'terms_notice_required',
  'no notice declaration is refused with a typed error');

select is(
  (select count(*)::int from public.booking_visits
    where booking_date = pg_temp.open_day(100)),
  0, 'no visit is created when notice was not declared');

select is(
  (smarter_dog_private.create_staff_visit_dispatch(
     pg_temp.two_dog_payload('08:30'), pg_temp.open_day(100),
     '17000000-0000-4000-8000-000000000010', gen_random_uuid(), 'staff',
     statement_timestamp(), 'active', 'carrier_pigeon')) ->> 'block_reason',
  'terms_notice_required',
  'an unrecognised notice method is refused, never coerced');

select is(
  (select terms_notice_method from public.booking_visits
    where booking_date = pg_temp.open_day(72)),
  'phone', 'the declared notice method is preserved, not hard-coded to in person');

select ok(
  (select terms_notice_at is not null and terms_notice_by is not null
     from public.booking_visits where booking_date = pg_temp.open_day(72)),
  'the notice records when it was given and by whom');

select throws_ok(
  format(
    $f$
      with new_lineage as (
        insert into public.booking_lineages (id, human_id)
        values (
          '17000000-0000-4000-8000-000000000099',
          '17000000-0000-4000-8000-000000000010'
        )
        returning id
      )
      insert into public.booking_visits (
        id, lineage_id, human_id, booking_date, legacy_compat_key,
        terms_acknowledgement, terms_notice_method
      )
      select
        '17000000-0000-4000-8000-000000000098', id,
        '17000000-0000-4000-8000-000000000010', %L::date,
        'partial-terms-evidence', 'customer_accepted', 'phone'
      from new_lineage
    $f$,
    pg_temp.open_day(105)
  ),
  '23514', null,
  'non-staff acknowledgement cannot carry partial staff-notice evidence');

select throws_ok(
  format($f$ update public.booking_visits set terms_notice_method = 'email'
              where booking_date = %L $f$, pg_temp.open_day(72)),
  'P0001', null, 'the recorded notice is write-once');

select ok(
  (select terms_publication_id is not null from public.booking_visits
    where booking_date = pg_temp.open_day(72)),
  'the governing Terms publication is frozen onto the visit');

select is(
  (select d.terms_accepted_at from public.booking_visit_deposits d
     join public.booking_visits v on v.id = d.visit_id
    where v.booking_date = pg_temp.open_day(72)),
  null::timestamptz,
  'no acceptance timestamp is fabricated for a staff-created booking');

-- Publishing newer Terms must not retroactively change the governing version.
select public.update_booking_rules(
  ('{"depositTermsVersion":"2026-08 v2","depositTermsContentHash":"' || repeat('d',64) || '"}')::jsonb);

select isnt(
  (select terms_publication_id from public.booking_visits
    where booking_date = pg_temp.open_day(72)),
  (select current_terms_publication_id from public.booking_policy_settings where singleton),
  'a later publication does not become the governing Terms of an existing visit');

select throws_ok(
  format($f$ update public.booking_visits set terms_acknowledgement = 'customer_accepted'
              where booking_date = %L $f$, pg_temp.open_day(72)),
  'P0001', null,
  'the acknowledgement basis cannot be rewritten to claim acceptance');

-- ── 34-45: prepaid cancellation dispositions ───────────────────────

create or replace function pg_temp.prepaid_visit(p_offset int) returns uuid
language plpgsql as $$
declare v uuid;
begin
  perform pg_temp.mk(p_offset, '08:30');
  select id into v from public.booking_visits
   where booking_date = pg_temp.open_day(p_offset) and lifecycle_state = 'active';
  update public.bookings set payment = 'Paid in Full', paid_amount = 45
   where visit_id = v and dog_id = '17000000-0000-4000-8000-000000000011';
  return v;
end;
$$;

create or replace function pg_temp.cancel_prepaid(
  p_visit uuid, p_handling text, p_target uuid, p_due timestamptz)
returns jsonb language sql as $$
  select smarter_dog_private.cancel_staff_visit_dispatch(
    p_visit, (select row_revision from public.booking_visits where id = p_visit),
    gen_random_uuid(), 'customer moved away', 'refund', p_handling, false, null,
    statement_timestamp(), 'active', p_target, p_due);
$$;

-- refund_due without a staff-supplied date is refused: the server must not
-- invent the deposit's five-working-day promise for service prepayment.
select is(
  (pg_temp.cancel_prepaid(pg_temp.prepaid_visit(79), 'refund_due', null, null))
    ->> 'block_reason',
  'prepayment_refund_date_required',
  'a prepayment refund without a promised date is refused');

select is(
  (select lifecycle_state from public.booking_visits
    where booking_date = pg_temp.open_day(79)),
  'active', 'the refused refund left the visit and its money untouched');

-- refund_due WITH a date records a DUE obligation, not a payment.
select is(
  (pg_temp.cancel_prepaid(
     (select id from public.booking_visits
       where booking_date = pg_temp.open_day(79) and lifecycle_state = 'active'),
     'refund_due', null, now() + interval '7 days'))
    -> 'detail' -> 'financial' -> 'servicePrepayment' ->> 'kind',
  'refund_due', 'a dated prepayment refund records an obligation');

select is(
  (select count(*)::int from public.booking_financial_ledger
    where event_kind = 'refund_due' and refund_origin = 'service_prepayment'
      and refund_deadline_basis = 'staff_explicit'),
  1, 'exactly one service-prepayment obligation, with the staff-explicit basis');

select is(
  (select count(*)::int from public.booking_financial_ledger
    where event_kind = 'refund_paid'),
  0, 'a refund is DUE, never recorded as already paid');

select is(
  (select state from public.booking_service_prepayment_reconciliations r
     join public.booking_visits v on v.id = r.visit_id
    where v.booking_date = pg_temp.open_day(79)),
  'refund_due', 'the reconciliation records the external payment outcome');

-- transfer to an invalid target changes nothing.
select is(
  (pg_temp.cancel_prepaid(pg_temp.prepaid_visit(86), 'transfer',
     '17000000-0000-4000-8000-0000000000ff', null)) ->> 'block_reason',
  'prepayment_transfer_target_invalid',
  'an unknown transfer target is refused');

select is(
  (select lifecycle_state from public.booking_visits
    where booking_date = pg_temp.open_day(86)),
  'active', 'an invalid transfer leaves the original visit and money unchanged');

-- transfer to a valid same-customer active visit.
select pg_temp.mk(93,'08:30');
select is(
  (pg_temp.cancel_prepaid(
     (select id from public.booking_visits
       where booking_date = pg_temp.open_day(86) and lifecycle_state = 'active'),
     'transfer',
     (select id from public.booking_visits
       where booking_date = pg_temp.open_day(93) and lifecycle_state = 'active'),
     null))
    -> 'detail' -> 'financial' -> 'servicePrepayment' ->> 'kind',
  'transferred', 'a valid transfer records the carry-forward');

-- Nothing prepaid may sit on a cancelled visit without a visible state.
select is(
  (select count(*)::int
     from public.booking_visits v
     join public.bookings b on b.visit_id = v.id
    where v.lifecycle_state = 'cancelled'
      and v.runtime_generation = 'visit_v1'
      and coalesce(b.paid_amount,0) > 0
      and not exists (select 1 from public.booking_service_prepayment_reconciliations r
                       where r.visit_id = v.id)),
  0, 'no prepaid amount is left on a cancelled visit without a reconciliation');

-- Idempotent: a repeated staff submission does not double-record money.
select is(
  (with k as (select gen_random_uuid() u),
        vis as (select id from public.booking_visits
                 where booking_date = pg_temp.open_day(72) and lifecycle_state = 'active')
   select (smarter_dog_private.cancel_staff_visit_dispatch(
             vis.id, (select row_revision from public.booking_visits where id = vis.id),
             k.u, 'dup', 'refund', null, false, null,
             statement_timestamp(), 'active', null, null) ->> 'outcome_key')
        = (smarter_dog_private.cancel_staff_visit_dispatch(
             vis.id, null, k.u, 'dup', 'refund', null, false, null,
             statement_timestamp(), 'active', null, null) ->> 'outcome_key')
   from k, vis),
  true, 'a repeated staff cancellation replays rather than acting twice');

-- ── prepaid refund date bounds and two-leg transfer ────────────────

select is(
  (pg_temp.cancel_prepaid(pg_temp.prepaid_visit(107), 'refund_due', null,
     now() - interval '1 day')) ->> 'block_reason',
  'prepayment_refund_date_in_past',
  'a promised refund date in the past is refused');

select is(
  (select lifecycle_state from public.booking_visits
    where booking_date = pg_temp.open_day(107)),
  'active', 'the past-dated refund attempt changed nothing');

-- The transfer writes two equal, linked, immutable legs.
select pg_temp.mk(114,'08:30');
select is(
  (pg_temp.cancel_prepaid(
     (select id from public.booking_visits
       where booking_date = pg_temp.open_day(107) and lifecycle_state = 'active'),
     'transfer',
     (select id from public.booking_visits
       where booking_date = pg_temp.open_day(114) and lifecycle_state = 'active'),
     null))
    -> 'detail' -> 'financial' -> 'servicePrepayment' ->> 'kind',
  'transferred', 'a valid transfer commits');

-- Scoped to THIS transfer: the suite performs more than one.
select is(
  (select count(*)::int from public.booking_financial_ledger l
     join public.booking_visits src on src.id = l.visit_id
     join public.booking_visits dst on dst.id = l.related_visit_id
    where l.event_kind = 'service_prepayment_transferred'
      and pg_temp.open_day(107) in (src.booking_date, dst.booking_date)
      and pg_temp.open_day(114) in (src.booking_date, dst.booking_date)),
  2, 'a transfer is two linked legs, not a single row');

select is(
  (select count(distinct l.amount_pence)::int from public.booking_financial_ledger l
     join public.booking_visits src on src.id = l.visit_id
     join public.booking_visits dst on dst.id = l.related_visit_id
    where l.event_kind = 'service_prepayment_transferred'
      and pg_temp.open_day(107) in (src.booking_date, dst.booking_date)
      and pg_temp.open_day(114) in (src.booking_date, dst.booking_date)),
  1, 'the out and in legs carry equal amounts');

select ok(
  (select bool_and(l.related_visit_id is not null)
     from public.booking_financial_ledger l
    where l.event_kind = 'service_prepayment_transferred'),
  'each leg names its counterpart visit');

-- Retrying the same transfer cannot move the money twice: the ledger's
-- unique idempotency key rejects the second attempt and rolls it back.
select throws_ok(
  $$ insert into public.booking_financial_ledger
       (human_id, visit_id, event_kind, amount_pence, reason, idempotency_key)
     select human_id, visit_id, event_kind, amount_pence, reason, idempotency_key
       from public.booking_financial_ledger
      where event_kind = 'service_prepayment_transferred' limit 1 $$,
  '23505', null, 'the same transfer leg cannot be written twice');

-- ── 58-60: in-place edits advance only the optimistic row revision ──

select pg_temp.mk(121, '08:30');

create temp table update_receipt as
select smarter_dog_private.update_staff_visit_dispatch(
    (select id from public.booking_visits
      where booking_date = pg_temp.open_day(121)
      order by created_at desc limit 1),
    1,
    jsonb_build_array(jsonb_build_object(
      'bookingId',
      (select b.id from public.bookings b
        join public.booking_visits v on v.id = b.visit_id
       where v.booking_date = pg_temp.open_day(121)
       order by b.id limit 1),
      'service',
      'Bath & Brush'
    )),
    gen_random_uuid(),
    'correct the service',
    statement_timestamp(),
    'active'
  ) as receipt;

select is(
  (select receipt ->> 'outcome' from update_receipt),
  'updated',
  'an in-place staff edit succeeds with the rendered visit revision'
);

select is(
  (select receipt ->> 'revision' from update_receipt),
  '2',
  'the edit receipt returns the advanced optimistic revision'
);

select is(
  (select revision::text || '|' || row_revision::text
     from public.booking_visits
    where booking_date = pg_temp.open_day(121)
    order by created_at desc limit 1),
  '1|2',
  'an in-place edit advances the row revision and preserves lineage ordinal 1'
);

select is(
  (select b.service from public.bookings b
    join public.booking_visits v on v.id = b.visit_id
   where v.booking_date = pg_temp.open_day(121)
   order by b.id limit 1),
  'Bath & Brush',
  'the requested booking field actually changes'
);

select is(
  smarter_dog_private.update_staff_visit_dispatch(
    (select id from public.booking_visits
      where booking_date = pg_temp.open_day(121)
      order by created_at desc limit 1),
    1,
    '[]'::jsonb,
    gen_random_uuid(),
    'stale second editor',
    statement_timestamp(),
    'active'
  ) ->> 'block_reason',
  'stale_review',
  'the old rendered revision cannot overwrite the completed edit'
);

create temp table update_rejection_baseline as
select
  (select row_revision from public.booking_visits
    where booking_date = pg_temp.open_day(121)
    order by created_at desc limit 1) as row_revision,
  (select count(*) from public.booking_policy_audit
    where action = 'staff_visit_updated'
      and visit_id = (
        select id from public.booking_visits
        where booking_date = pg_temp.open_day(121)
        order by created_at desc limit 1
      )) as audit_count;

select pg_temp.mk(122, '09:00');

select is(
  smarter_dog_private.update_staff_visit_dispatch(
    (select id from public.booking_visits
      where booking_date = pg_temp.open_day(121)
      order by created_at desc limit 1),
    2,
    jsonb_build_array(jsonb_build_object(
      'bookingId',
      (select b.id from public.bookings b
        join public.booking_visits v on v.id = b.visit_id
       where v.booking_date = pg_temp.open_day(122)
       order by b.id limit 1),
      'service',
      'Full Groom'
    )),
    gen_random_uuid(),
    'foreign booking must be rejected',
    statement_timestamp(),
    'active'
  ) ->> 'block_reason',
  'invalid_changes',
  'an edit cannot name a booking from another visit'
);

select is(
  smarter_dog_private.update_staff_visit_dispatch(
    (select id from public.booking_visits
      where booking_date = pg_temp.open_day(121)
      order by created_at desc limit 1),
    2,
    '[]'::jsonb,
    gen_random_uuid(),
    'empty change set',
    statement_timestamp(),
    'active'
  ) ->> 'block_reason',
  'invalid_changes',
  'an empty edit set is rejected'
);

select is(
  smarter_dog_private.update_staff_visit_dispatch(
    (select id from public.booking_visits
      where booking_date = pg_temp.open_day(121)
      order by created_at desc limit 1),
    2,
    jsonb_build_array(jsonb_build_object(
      'bookingId',
      (select b.id from public.bookings b
        join public.booking_visits v on v.id = b.visit_id
       where v.booking_date = pg_temp.open_day(121)
       order by b.id limit 1),
      'service',
      'Bath & Brush'
    )),
    gen_random_uuid(),
    'no-op change set',
    statement_timestamp(),
    'active'
  ) ->> 'block_reason',
  'no_changes',
  'an edit that changes nothing is rejected'
);

select is(
  (select row_revision::int from public.booking_visits
    where booking_date = pg_temp.open_day(121)
    order by created_at desc limit 1),
  (select row_revision::int from update_rejection_baseline),
  'rejected edits do not advance the visit row revision'
);

select is(
  (select count(*)::bigint from public.booking_policy_audit
    where action = 'staff_visit_updated'
      and visit_id = (
        select id from public.booking_visits
        where booking_date = pg_temp.open_day(121)
        order by created_at desc limit 1
      )),
  (select audit_count::bigint from update_rejection_baseline),
  'rejected edits append no audit row'
);

-- ── complete reschedule payloads, transferable deposits and null revisions ──

create or replace function pg_temp.full_slot_assignments(p_slot text)
returns jsonb language sql as $$
  select jsonb_build_array(
    jsonb_build_object(
      'dog_id', '17000000-0000-4000-8000-000000000011',
      'slot', p_slot
    ),
    jsonb_build_object(
      'dog_id', '17000000-0000-4000-8000-000000000012',
      'slot', p_slot
    )
  );
$$;

create or replace function pg_temp.visit_fingerprint(p_visit_id uuid)
returns text language sql stable as $$
  select concat_ws(
    '|',
    v.lifecycle_state,
    v.row_revision::text,
    (select count(*)::text
       from public.booking_visits lineage_visit
      where lineage_visit.lineage_id = v.lineage_id),
    (select count(*)::text
       from public.booking_policy_audit audit
      where audit.visit_id = v.id),
    (select coalesce(
       jsonb_agg(
         jsonb_build_array(
           booking.id, booking.booking_date, booking.slot,
           booking.status, booking.service, booking.addons
         )
         order by booking.id
       ),
       '[]'::jsonb
     )::text
       from public.bookings booking
      where booking.visit_id = v.id)
  )
    from public.booking_visits v
   where v.id = p_visit_id;
$$;

-- A missing expected revision is stale, but only after an idempotent replay
-- has had its chance. These are new keys, so all three mutations are inert.
select pg_temp.mk(140, '08:30');
create temp table null_revision_baseline as
select
  v.id as visit_id,
  pg_temp.visit_fingerprint(v.id) as fingerprint
from public.booking_visits v
where v.booking_date = pg_temp.open_day(140)
  and v.lifecycle_state = 'active';

select is(
  smarter_dog_private.cancel_staff_visit_dispatch(
    (select visit_id from null_revision_baseline),
    null,
    gen_random_uuid(),
    'missing rendered revision',
    'refund',
    null,
    false,
    null,
    statement_timestamp(),
    'active',
    null,
    null
  ) ->> 'block_reason',
  'stale_review',
  'a new cancellation key cannot omit the rendered revision'
);

select is(
  pg_temp.visit_fingerprint((select visit_id from null_revision_baseline)),
  (select fingerprint from null_revision_baseline),
  'a null-revision cancellation changes no visit, booking or audit row'
);

select is(
  smarter_dog_private.reschedule_staff_visit_dispatch(
    (select visit_id from null_revision_baseline),
    null,
    pg_temp.open_day(141),
    pg_temp.full_slot_assignments('09:00'),
    gen_random_uuid(),
    'missing rendered revision',
    statement_timestamp(),
    'active'
  ) ->> 'block_reason',
  'stale_review',
  'a new reschedule key cannot omit the rendered revision'
);

select is(
  pg_temp.visit_fingerprint((select visit_id from null_revision_baseline)),
  (select fingerprint from null_revision_baseline),
  'a null-revision reschedule changes no visit, booking or audit row'
);

select is(
  smarter_dog_private.update_staff_visit_dispatch(
    (select visit_id from null_revision_baseline),
    null,
    jsonb_build_array(jsonb_build_object(
      'bookingId',
      (select b.id
         from public.bookings b
        where b.visit_id = (select visit_id from null_revision_baseline)
        order by b.id
        limit 1),
      'service',
      'Coat Care'
    )),
    gen_random_uuid(),
    'missing rendered revision',
    statement_timestamp(),
    'active'
  ) ->> 'block_reason',
  'stale_review',
  'a new update key cannot omit the rendered revision'
);

select is(
  pg_temp.visit_fingerprint((select visit_id from null_revision_baseline)),
  (select fingerprint from null_revision_baseline),
  'a null-revision update changes no visit, booking or audit row'
);

-- Reschedule assignment validation is all-or-nothing and happens before the
-- source is superseded. Array shape, completeness, uniqueness and membership
-- all share one typed refusal.
select pg_temp.mk(147, '08:30');
create temp table invalid_assignment_baseline as
select
  v.id as visit_id,
  v.row_revision,
  pg_temp.visit_fingerprint(v.id) as fingerprint
from public.booking_visits v
where v.booking_date = pg_temp.open_day(147)
  and v.lifecycle_state = 'active';

select is(
  smarter_dog_private.reschedule_staff_visit_dispatch(
    (select visit_id from invalid_assignment_baseline),
    (select row_revision from invalid_assignment_baseline),
    pg_temp.open_day(148),
    '[]'::jsonb,
    gen_random_uuid(),
    'empty assignment set',
    statement_timestamp(),
    'active'
  ) ->> 'block_reason',
  'invalid_slot_assignments',
  'an empty reschedule assignment set is refused'
);

select is(
  pg_temp.visit_fingerprint((select visit_id from invalid_assignment_baseline)),
  (select fingerprint from invalid_assignment_baseline),
  'an empty assignment set leaves visit, revision, audit and bookings unchanged'
);

select is(
  smarter_dog_private.reschedule_staff_visit_dispatch(
    (select visit_id from invalid_assignment_baseline),
    (select row_revision from invalid_assignment_baseline),
    pg_temp.open_day(148),
    jsonb_build_object('dog_id', '17000000-0000-4000-8000-000000000011',
                       'slot', '09:00'),
    gen_random_uuid(),
    'object instead of array',
    statement_timestamp(),
    'active'
  ) ->> 'block_reason',
  'invalid_slot_assignments',
  'a scalar/object assignment payload is a typed refusal, not an exception'
);

select is(
  pg_temp.visit_fingerprint((select visit_id from invalid_assignment_baseline)),
  (select fingerprint from invalid_assignment_baseline),
  'a non-array assignment payload leaves the aggregate unchanged'
);

select is(
  smarter_dog_private.reschedule_staff_visit_dispatch(
    (select visit_id from invalid_assignment_baseline),
    (select row_revision from invalid_assignment_baseline),
    pg_temp.open_day(148),
    jsonb_build_array(jsonb_build_object(
      'dog_id', '17000000-0000-4000-8000-000000000011',
      'slot', '09:00'
    )),
    gen_random_uuid(),
    'partial assignment set',
    statement_timestamp(),
    'active'
  ) ->> 'block_reason',
  'invalid_slot_assignments',
  'a partial reschedule assignment set is refused'
);

select is(
  pg_temp.visit_fingerprint((select visit_id from invalid_assignment_baseline)),
  (select fingerprint from invalid_assignment_baseline),
  'a partial assignment set leaves visit, revision, audit and bookings unchanged'
);

select is(
  smarter_dog_private.reschedule_staff_visit_dispatch(
    (select visit_id from invalid_assignment_baseline),
    (select row_revision from invalid_assignment_baseline),
    pg_temp.open_day(148),
    jsonb_build_array(
      jsonb_build_object(
        'dog_id', '17000000-0000-4000-8000-000000000011',
        'slot', '09:00'
      ),
      jsonb_build_object(
        'dog_id', '17000000-0000-4000-8000-000000000011',
        'slot', '09:30'
      )
    ),
    gen_random_uuid(),
    'duplicate dog assignment',
    statement_timestamp(),
    'active'
  ) ->> 'block_reason',
  'invalid_slot_assignments',
  'duplicate assignments for one source dog are refused'
);

select is(
  pg_temp.visit_fingerprint((select visit_id from invalid_assignment_baseline)),
  (select fingerprint from invalid_assignment_baseline),
  'duplicate assignments leave visit, revision, audit and bookings unchanged'
);

select is(
  smarter_dog_private.reschedule_staff_visit_dispatch(
    (select visit_id from invalid_assignment_baseline),
    (select row_revision from invalid_assignment_baseline),
    pg_temp.open_day(148),
    jsonb_build_array(
      jsonb_build_object(
        'dog_id', '17000000-0000-4000-8000-000000000011',
        'slot', '09:00'
      ),
      jsonb_build_object(
        'dog_id', '17000000-0000-4000-8000-000000000013',
        'slot', '09:00'
      )
    ),
    gen_random_uuid(),
    'dog not included in source visit',
    statement_timestamp(),
    'active'
  ) ->> 'block_reason',
  'invalid_slot_assignments',
  'an assignment for a dog outside the source visit is refused'
);

select is(
  pg_temp.visit_fingerprint((select visit_id from invalid_assignment_baseline)),
  (select fingerprint from invalid_assignment_baseline),
  'a foreign assignment leaves visit, revision, audit and bookings unchanged'
);

-- The update path uses the same safe container discipline: a scalar cannot
-- reach jsonb_array_elements and is a typed, atomic refusal.
select is(
  smarter_dog_private.update_staff_visit_dispatch(
    (select visit_id from invalid_assignment_baseline),
    (select row_revision from invalid_assignment_baseline),
    jsonb_build_object(
      'bookingId',
      (select b.id
         from public.bookings b
        where b.visit_id = (select visit_id from invalid_assignment_baseline)
        order by b.id limit 1),
      'service',
      'Coat Care'
    ),
    gen_random_uuid(),
    'object instead of array',
    statement_timestamp(),
    'active'
  ) ->> 'block_reason',
  'invalid_changes',
  'a scalar/object update payload is a typed refusal, not an exception'
);

select is(
  pg_temp.visit_fingerprint((select visit_id from invalid_assignment_baseline)),
  (select fingerprint from invalid_assignment_baseline),
  'a non-array update payload leaves the aggregate unchanged'
);

create or replace function pg_temp.set_received_deposit(
  p_visit_id uuid,
  p_source text
) returns uuid
language plpgsql
as $$
declare
  v_at timestamptz := statement_timestamp();
  v_event_kind text;
  v_event_id uuid;
  v_human_id uuid;
  v_terms_publication_id uuid;
  v_bank_instruction_id uuid;
begin
  v_event_kind := case p_source
    when 'bank' then 'deposit_received'
    when 'credit' then 'credit_applied'
    when 'transfer' then 'deposit_transferred'
    else null
  end;
  if v_event_kind is null then
    raise exception 'unsupported fixture satisfaction source';
  end if;

  select v.human_id, v.terms_publication_id
    into v_human_id, v_terms_publication_id
    from public.booking_visits v
   where v.id = p_visit_id;
  select current_bank_instruction_id
    into v_bank_instruction_id
    from public.booking_policy_settings
   where singleton;

  insert into public.booking_financial_ledger
    (human_id, visit_id, event_kind, amount_pence, reason,
     idempotency_key, recorded_by)
  values (
    v_human_id, p_visit_id, v_event_kind, 1000,
    'pgTAP received deposit fixture',
    'pgtap-170-deposit:' || gen_random_uuid()::text,
    auth.uid()
  )
  returning id into v_event_id;

  update public.booking_visit_deposits
     set state = 'received',
         requirement_reason = 'fixture_required',
         exemption_reason = null,
         requirement_decided_at = v_at,
         customer_payment_reference = 'fixture-' || p_visit_id::text,
         bank_instruction_id = v_bank_instruction_id,
         due_at = v_at + interval '1 day',
         bank_received_at = case when p_source = 'bank' then v_at else null end,
         satisfaction_source = p_source,
         satisfaction_event_id = v_event_id,
         disposition_event_id = null,
         recorded_at = v_at,
         recorded_by = auth.uid(),
         terms_publication_id = v_terms_publication_id,
         terms_accepted_at = v_at
   where visit_id = p_visit_id;

  return v_event_id;
end;
$$;

create or replace function pg_temp.move_received_deposit(
  p_source_offset integer,
  p_destination_offset integer,
  p_source text
) returns jsonb
language plpgsql
as $$
declare
  v_source_visit_id uuid;
  v_source_event_id uuid;
  v_receipt jsonb;
begin
  perform pg_temp.mk(p_source_offset, '08:30');
  select v.id
    into v_source_visit_id
    from public.booking_visits v
   where v.booking_date = pg_temp.open_day(p_source_offset)
     and v.lifecycle_state = 'active'
   order by v.created_at desc
   limit 1;
  v_source_event_id := pg_temp.set_received_deposit(v_source_visit_id, p_source);
  v_receipt := smarter_dog_private.reschedule_staff_visit_dispatch(
    v_source_visit_id,
    (select row_revision from public.booking_visits where id = v_source_visit_id),
    pg_temp.open_day(p_destination_offset),
    pg_temp.full_slot_assignments('09:00'),
    gen_random_uuid(),
    'move a received deposit',
    statement_timestamp(),
    'active'
  );
  return jsonb_build_object(
    'sourceVisitId', v_source_visit_id,
    'sourceEventId', v_source_event_id,
    'receipt', v_receipt
  );
end;
$$;

-- Awaiting/reconciliation states and incomplete received evidence block
-- before the source visit, its bookings, revision or audit trail can change.
select pg_temp.mk(154, '08:30');
update public.booking_visit_deposits deposit
   set state = 'awaiting_payment',
       requirement_reason = 'fixture_required',
       exemption_reason = null,
       requirement_decided_at = statement_timestamp(),
       customer_payment_reference = 'fixture-awaiting-' || deposit.visit_id::text,
       bank_instruction_id = settings.current_bank_instruction_id,
       due_at = statement_timestamp() + interval '1 day',
       bank_received_at = null,
       satisfaction_source = null,
       satisfaction_event_id = null,
       disposition_event_id = null,
       recorded_at = null,
       recorded_by = null,
       terms_publication_id = visit.terms_publication_id,
       terms_accepted_at = statement_timestamp()
  from public.booking_visits visit,
       public.booking_policy_settings settings
 where deposit.visit_id = visit.id
   and visit.booking_date = pg_temp.open_day(154)
   and settings.singleton;
create temp table awaiting_deposit_baseline as
select v.id as visit_id, v.row_revision, pg_temp.visit_fingerprint(v.id) as fingerprint
  from public.booking_visits v
 where v.booking_date = pg_temp.open_day(154);

select is(
  smarter_dog_private.reschedule_staff_visit_dispatch(
    (select visit_id from awaiting_deposit_baseline),
    (select row_revision from awaiting_deposit_baseline),
    pg_temp.open_day(155),
    pg_temp.full_slot_assignments('09:00'),
    gen_random_uuid(),
    'awaiting deposit cannot move',
    statement_timestamp(),
    'active'
  ) ->> 'block_reason',
  'deposit_state_not_transferable',
  'an awaiting-payment deposit blocks a staff reschedule'
);

select is(
  pg_temp.visit_fingerprint((select visit_id from awaiting_deposit_baseline)),
  (select fingerprint from awaiting_deposit_baseline),
  'the blocked awaiting-payment move changes no aggregate row'
);

select pg_temp.mk(161, '08:30');
update public.booking_visit_deposits deposit
   set state = 'reconciliation_required',
       exemption_reason = null
  from public.booking_visits visit
 where deposit.visit_id = visit.id
   and visit.booking_date = pg_temp.open_day(161);
create temp table reconciliation_deposit_baseline as
select v.id as visit_id, v.row_revision, pg_temp.visit_fingerprint(v.id) as fingerprint
  from public.booking_visits v
 where v.booking_date = pg_temp.open_day(161);

select is(
  smarter_dog_private.reschedule_staff_visit_dispatch(
    (select visit_id from reconciliation_deposit_baseline),
    (select row_revision from reconciliation_deposit_baseline),
    pg_temp.open_day(162),
    pg_temp.full_slot_assignments('09:00'),
    gen_random_uuid(),
    'reconciliation state cannot move',
    statement_timestamp(),
    'active'
  ) ->> 'block_reason',
  'deposit_state_not_transferable',
  'a reconciliation-required deposit blocks a staff reschedule'
);

select is(
  pg_temp.visit_fingerprint((select visit_id from reconciliation_deposit_baseline)),
  (select fingerprint from reconciliation_deposit_baseline),
  'the blocked reconciliation move changes no aggregate row'
);

select pg_temp.mk(168, '08:30');
select pg_temp.set_received_deposit(
  (select v.id from public.booking_visits v
    where v.booking_date = pg_temp.open_day(168)),
  'bank'
);
update public.booking_visit_deposits deposit
   set due_at = null
  from public.booking_visits visit
 where deposit.visit_id = visit.id
   and visit.booking_date = pg_temp.open_day(168);
create temp table incomplete_deposit_baseline as
select v.id as visit_id, v.row_revision, pg_temp.visit_fingerprint(v.id) as fingerprint
  from public.booking_visits v
 where v.booking_date = pg_temp.open_day(168);

select is(
  smarter_dog_private.reschedule_staff_visit_dispatch(
    (select visit_id from incomplete_deposit_baseline),
    (select row_revision from incomplete_deposit_baseline),
    pg_temp.open_day(169),
    pg_temp.full_slot_assignments('09:00'),
    gen_random_uuid(),
    'incomplete deposit snapshot cannot move',
    statement_timestamp(),
    'active'
  ) ->> 'block_reason',
  'deposit_transfer_evidence_incomplete',
  'received money without the frozen due snapshot is refused'
);

select is(
  pg_temp.visit_fingerprint((select visit_id from incomplete_deposit_baseline)),
  (select fingerprint from incomplete_deposit_baseline),
  'the incomplete-evidence refusal changes no aggregate row'
);

-- A bank receipt becomes a destination-bound transfer event and a one-use
-- applied reservation. The source evidence remains intact and the unique
-- source-satisfaction key prevents a second use.
create temp table bank_deposit_move as
select pg_temp.move_received_deposit(175, 182, 'bank') as result;

select is(
  (select result -> 'receipt' ->> 'outcome' from bank_deposit_move),
  'rescheduled',
  'a complete received bank deposit moves with the staff reschedule'
);

select is(
  (select concat_ws(
     '|',
     destination.state,
     destination.satisfaction_source,
     (destination.customer_payment_reference is null)::text,
     (destination.bank_instruction_id = source.bank_instruction_id)::text,
     (destination.due_at = source.due_at)::text,
     (destination.terms_publication_id = source.terms_publication_id
      and destination.terms_accepted_at = source.terms_accepted_at)::text
   )
     from bank_deposit_move move
     join public.booking_visit_deposits source
       on source.visit_id = (move.result->>'sourceVisitId')::uuid
     join public.booking_visit_deposits destination
       on destination.visit_id =
          (move.result->'receipt'->>'visit_id')::uuid),
  'received|transfer|true|true|true|true',
  'the destination has fresh transfer evidence and preserved bank/due/Terms snapshots'
);

select is(
  (select count(*)::int
     from bank_deposit_move move
     join public.booking_visit_deposits destination
       on destination.visit_id =
          (move.result->'receipt'->>'visit_id')::uuid
     join public.booking_financial_ledger event
       on event.id = destination.satisfaction_event_id
    where event.event_kind = 'deposit_transferred'
      and event.amount_pence = 1000
      and event.visit_id = destination.visit_id
      and event.related_visit_id = (move.result->>'sourceVisitId')::uuid),
  1,
  'the transfer ledger event belongs to the destination and links the source'
);

select is(
  (select count(*)::int
     from bank_deposit_move move
     join public.booking_deposit_transfer_reservations reservation
       on reservation.source_visit_id = (move.result->>'sourceVisitId')::uuid
      and reservation.destination_visit_id =
          (move.result->'receipt'->>'visit_id')::uuid
      and reservation.source_satisfaction_event_id =
          (move.result->>'sourceEventId')::uuid
    where reservation.state = 'applied'
      and reservation.applied_at is not null),
  1,
  'the applied reservation consumes the source satisfaction event exactly once'
);

select is(
  (select concat_ws(
     '|',
     source.satisfaction_source,
     (source.satisfaction_event_id =
       (move.result->>'sourceEventId')::uuid)::text,
     (source.customer_payment_reference is not null)::text,
     (source.disposition_event_id is null)::text
   )
     from bank_deposit_move move
     join public.booking_visit_deposits source
       on source.visit_id = (move.result->>'sourceVisitId')::uuid),
  'bank|true|true|true',
  'the source bank evidence and payment reference remain unchanged'
);

select throws_ok(
  $$ insert into public.booking_deposit_transfer_reservations
       (human_id, source_visit_id, destination_visit_id,
        source_satisfaction_event_id, amount_pence, state,
        fallback_source_disposition, applied_at)
     select
       '17000000-0000-4000-8000-000000000010',
       (move.result->>'sourceVisitId')::uuid,
       baseline.visit_id,
       (move.result->>'sourceEventId')::uuid,
       1000,
       'applied',
       'retain',
       statement_timestamp()
     from bank_deposit_move move
     cross join null_revision_baseline baseline $$,
  '23505',
  null,
  'a source deposit satisfaction event cannot be transferred twice'
);

-- Credit and transfer satisfaction can safely continue through the same
-- explicit transfer chain; the destination never aliases either source event.
create temp table credit_deposit_move as
select pg_temp.move_received_deposit(196, 203, 'credit') as result;
select is(
  (select result -> 'receipt' ->> 'outcome' from credit_deposit_move),
  'rescheduled',
  'a complete credit-satisfied deposit moves successfully'
);
select is(
  (select source.satisfaction_source || '|' || destination.satisfaction_source
     from credit_deposit_move move
     join public.booking_visit_deposits source
       on source.visit_id = (move.result->>'sourceVisitId')::uuid
     join public.booking_visit_deposits destination
       on destination.visit_id =
          (move.result->'receipt'->>'visit_id')::uuid),
  'credit|transfer',
  'credit evidence stays on the source while the destination uses transfer evidence'
);

create temp table transferred_deposit_move as
select jsonb_build_object(
  'sourceVisitId', destination.visit_id,
  'sourceEventId', destination.satisfaction_event_id,
  'receipt', null
) as result
  from bank_deposit_move move
  join public.booking_visit_deposits destination
    on destination.visit_id = (move.result->'receipt'->>'visit_id')::uuid;

update transferred_deposit_move move
   set result = jsonb_set(
     move.result,
     '{receipt}',
     smarter_dog_private.reschedule_staff_visit_dispatch(
       (move.result->>'sourceVisitId')::uuid,
       (select row_revision
          from public.booking_visits
         where id = (move.result->>'sourceVisitId')::uuid),
       pg_temp.open_day(189),
       pg_temp.full_slot_assignments('09:00'),
       gen_random_uuid(),
       'continue a real deposit transfer chain',
       statement_timestamp(),
       'active'
     )
   );
select is(
  (select result -> 'receipt' ->> 'outcome' from transferred_deposit_move),
  'rescheduled',
  'an already-transferred deposit can move to its next direct successor'
);
select is(
  (select source.satisfaction_source || '|' || destination.satisfaction_source
     from transferred_deposit_move move
     join public.booking_visit_deposits source
       on source.visit_id = (move.result->>'sourceVisitId')::uuid
     join public.booking_visit_deposits destination
       on destination.visit_id =
          (move.result->'receipt'->>'visit_id')::uuid),
  'transfer|transfer',
  'a transfer chain retains each source event and creates a new destination event'
);

select * from finish();
rollback;
