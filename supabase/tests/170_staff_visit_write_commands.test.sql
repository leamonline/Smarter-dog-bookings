-- Staff visit write commands: whole-visit atomicity, revision staleness,
-- the prepayment branch, no incident unless deliberate, payment evidence
-- preserved across a move, and the inactive-runtime gate.
-- Fixtures are rolled back; the real policy row is never set.

begin;
create extension if not exists pgtap with schema extensions;
select plan(57);

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
  ('{"depositTermsVersion":"2026-07 v1","depositTermsContentHash":"' || repeat('c',64) || '"}')::jsonb);

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

select public.update_booking_rules(
  '{"depositTermsVersion":null,"depositTermsContentHash":null}'::jsonb);
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
    (select revision from public.booking_visits where id = pg_temp.first_visit()),
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
    (select revision from public.booking_visits where id = pg_temp.first_visit()),
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
    (select revision from public.booking_visits where id = pg_temp.first_visit()),
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
    (select revision from public.booking_visits where id = pg_temp.first_visit()),
    pg_temp.open_day(58),
    jsonb_build_array(
      jsonb_build_object('dog_id','17000000-0000-4000-8000-000000000011','slot','09:00'),
      jsonb_build_object('dog_id','17000000-0000-4000-8000-000000000012','slot','09:00')),
    gen_random_uuid(), 'staff moved the day', statement_timestamp(), 'active') ->> 'outcome',
  'rescheduled', 'a staff reschedule commits');

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
    p_visit, (select revision from public.booking_visits where id = p_visit),
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
             vis.id, (select revision from public.booking_visits where id = vis.id),
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

select * from finish();
rollback;
