-- Staff visit write commands: whole-visit atomicity, revision staleness,
-- the prepayment branch, no incident unless deliberate, payment evidence
-- preserved across a move, and the inactive-runtime gate.
-- Fixtures are rolled back; the real policy row is never set.

begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

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
    '17000000-0000-4000-8000-000000000010', gen_random_uuid()) $f$, pg_temp.open_day(30)),
  '42501', null, 'a customer cannot use the staff create command');
select set_config('request.jwt.claims',
  '{"sub":"17000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is(public.booking_policy_runtime(), 'inactive', 'the runtime is inactive');

select is(
  (public.create_staff_booking_visit(
     pg_temp.two_dog_payload('08:30'), pg_temp.open_day(30),
     '17000000-0000-4000-8000-000000000010', gen_random_uuid()) ->> 'outcome'),
  'policy_not_active',
  'the v1 staff create is inert while the policy is inactive');

-- ── 4-9: create makes ONE visit for all dogs ───────────────────────

create or replace function pg_temp.mk(p_offset int, p_slot text)
returns jsonb language sql as $$
  select smarter_dog_private.create_staff_visit_dispatch(
    pg_temp.two_dog_payload(p_slot), pg_temp.open_day(p_offset),
    '17000000-0000-4000-8000-000000000010', gen_random_uuid(), 'staff',
    statement_timestamp(), 'active');
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
             statement_timestamp(), 'active') ->> 'visit_id')
        = (smarter_dog_private.create_staff_visit_dispatch(
             pg_temp.two_dog_payload('10:00'), pg_temp.open_day(65),
             '17000000-0000-4000-8000-000000000010', k.u, 'staff',
             statement_timestamp(), 'active') ->> 'visit_id')
   from k),
  true, 'a retried key replays the same visit rather than creating a second');

select * from finish();
rollback;
