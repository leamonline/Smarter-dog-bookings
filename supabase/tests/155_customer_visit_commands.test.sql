-- Atomic customer visit commands: inactive-runtime blocking, the private
-- runtime/time seam, review-token binding, cancellation money outcomes,
-- withdrawal reconciliation, idempotency and credit refunds.
-- Fixtures are rolled back; the real v1 effective row is never set outside
-- this transaction.

begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

insert into auth.users (id) values
  ('15500000-0000-4000-8000-000000000001'), -- staff owner
  ('15500000-0000-4000-8000-000000000003'), -- customer one
  ('15500000-0000-4000-8000-000000000004'); -- customer two

insert into public.staff_profiles (user_id, role, display_name) values
  ('15500000-0000-4000-8000-000000000001', 'owner', 'Command Owner');

insert into public.humans (id, name, surname, customer_user_id) values
  ('15500000-0000-4000-8000-000000000010', 'CommandFixture155', 'One',
   '15500000-0000-4000-8000-000000000003'),
  ('15500000-0000-4000-8000-000000000020', 'CommandFixture155', 'Two',
   '15500000-0000-4000-8000-000000000004');

insert into public.dogs (id, name, breed, size, human_id) values
  ('15500000-0000-4000-8000-000000000011', 'Golf', 'Poodle', 'small',
   '15500000-0000-4000-8000-000000000010'),
  ('15500000-0000-4000-8000-000000000012', 'Hotel', 'Beagle', 'small',
   '15500000-0000-4000-8000-000000000010');

insert into public.booking_lineages (id, human_id) values
  ('15500000-0000-4000-8000-000000000301', '15500000-0000-4000-8000-000000000010'),
  ('15500000-0000-4000-8000-000000000302', '15500000-0000-4000-8000-000000000010'),
  ('15500000-0000-4000-8000-000000000303', '15500000-0000-4000-8000-000000000010'),
  ('15500000-0000-4000-8000-000000000304', '15500000-0000-4000-8000-000000000010');

-- A confirmed v1 visit, with two dogs, on the next open salon day at least
-- p_days away. Fixture inserts run under the staff claim so the calendar and
-- capacity gates bypass exactly as they do for staff in the app; the caller's
-- own claim is restored before returning.
create or replace function pg_temp.mk_v1_visit(p_id uuid, p_lineage uuid, p_days int)
returns uuid language plpgsql as $$
declare
  v_date date := current_date + p_days;
  v_caller text := current_setting('request.jwt.claims', true);
begin
  -- Mon/Tue/Wed are the salon's open days.
  while extract(isodow from v_date) > 3 loop
    v_date := v_date + 1;
  end loop;
  perform set_config('request.jwt.claims',
    '{"sub":"15500000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  insert into public.booking_visits
    (id, lineage_id, human_id, booking_date, lifecycle_state, approval_state,
     confirmation_state, policy_code, confirmed_at, customer_change_deadline_at,
     runtime_generation, source)
  values (p_id, p_lineage, '15500000-0000-4000-8000-000000000010', v_date,
          'active', 'not_required', 'confirmed', 'previous_day_1500_v1', now(),
          public.change_deadline_for('previous_day_1500_v1', v_date, '08:30'),
          'visit_v1', 'website');
  insert into public.bookings
    (booking_date, slot, dog_id, size, service, status, visit_id)
  values
    (v_date, '08:30', '15500000-0000-4000-8000-000000000011', 'small', 'Full Groom', 'Booked', p_id),
    (v_date, '09:00', '15500000-0000-4000-8000-000000000012', 'small', 'Bath & Brush', 'Booked', p_id);
  perform set_config('request.jwt.claims', coalesce(v_caller, ''), true);
  return p_id;
end;
$$;

select set_config(
  'request.jwt.claims',
  '{"sub":"15500000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);

-- Capture the exact reviewId each preview returns rather than guessing by
-- timestamp: several previews happen inside this one transaction.
create temp table review_tokens (label text primary key, review_id uuid);
create or replace function pg_temp.take_review(p_label text, p_visit uuid)
returns uuid language plpgsql as $$
declare v uuid;
begin
  v := (public.preview_customer_cancel_visit(p_visit) ->> 'reviewId')::uuid;
  insert into review_tokens values (p_label, v)
    on conflict (label) do update set review_id = excluded.review_id;
  return v;
end;
$$;

select pg_temp.mk_v1_visit('15500000-0000-4000-8000-000000000501',
  '15500000-0000-4000-8000-000000000301', 30);

-- ── 1-4: inactive runtime blocks every v1 mutation ─────────────────

select is(public.booking_policy_runtime(), 'inactive', 'the runtime starts inactive');

select is(
  public.cancel_customer_booking_visit(
    '15500000-0000-4000-8000-000000000501',
    '15500000-0000-4000-8000-000000000901',
    '15500000-0000-4000-8000-000000000801') ->> 'block_reason',
  'policy_not_active', 'cancellation is inert while the policy is inactive');

select is(
  public.withdraw_customer_booking_visit(
    '15500000-0000-4000-8000-000000000501',
    '15500000-0000-4000-8000-000000000802') ->> 'block_reason',
  'policy_not_active', 'withdrawal is inert while the policy is inactive');

select is(
  (select lifecycle_state from public.booking_visits
    where id = '15500000-0000-4000-8000-000000000501'),
  'active', 'an inert command mutates nothing');

-- ── 5-8: the runtime/time seam is not reachable by application roles ─

set local role authenticated;
select throws_ok(
  $$ select smarter_dog_private.cancel_customer_visit_dispatch(
       '15500000-0000-4000-8000-000000000501', null, null, null, 'refund', now(), 'active') $$,
  '42501', null, 'the cancel dispatcher is not callable by authenticated');
select throws_ok(
  $$ select smarter_dog_private.confirm_booking_visit_core(
       '15500000-0000-4000-8000-000000000501', 'exempt', now(), 'customer') $$,
  '42501', null, 'the confirmation core is not callable by authenticated');
select throws_ok(
  $$ select smarter_dog_private.record_late_booking_change_core(
       '15500000-0000-4000-8000-000000000501', 'cancel', 'website', now(),
       null, null, null, null, '15500000-0000-4000-8000-000000000803') $$,
  '42501', null, 'the late-change core is not callable by authenticated');
select throws_ok(
  $$ select * from smarter_dog_private.booking_change_reviews $$,
  '42501', null, 'review tokens are unreadable by application roles');
reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"15500000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);

-- ── 9-12: preview binds what the customer saw ──────────────────────

select ok(
  (public.preview_customer_cancel_visit('15500000-0000-4000-8000-000000000501')
   ->> 'reviewId') is not null,
  'preview issues a review token');
select is(
  jsonb_array_length(
    public.preview_customer_cancel_visit('15500000-0000-4000-8000-000000000501') -> 'dogs'),
  2, 'the cancellation preview lists every dog on the visit');

select set_config(
  'request.jwt.claims',
  '{"sub":"15500000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);
select throws_ok(
  $$ select public.preview_customer_cancel_visit('15500000-0000-4000-8000-000000000501') $$,
  'P0001', 'Booking not found',
  'another customer gets a non-disclosing not-found');
select set_config(
  'request.jwt.claims',
  '{"sub":"15500000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);

-- ── 13-22: active-runtime behaviour via the private dispatcher ──────
--
-- The real previous_day_1500_v1 row stays null; the dispatcher's test-only
-- override exercises the v1 branches inside this rolled-back fixture.

-- A stale review token cannot mutate.
select is(
  smarter_dog_private.cancel_customer_visit_dispatch(
    '15500000-0000-4000-8000-000000000501',
    '15500000-0000-4000-8000-000000000901',
    '15500000-0000-4000-8000-000000000811',
    null, 'refund', statement_timestamp(), 'active') ->> 'block_reason',
  'review_required', 'a missing review token blocks the cancellation');

-- A genuine review token, then a staff edit that changes the visit contents.
select pg_temp.take_review('stale', '15500000-0000-4000-8000-000000000501');
select set_config(
  'request.jwt.claims',
  '{"sub":"15500000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
update public.bookings set service = 'Bath & De-shed'
 where visit_id = '15500000-0000-4000-8000-000000000501' and slot = '09:00';
select set_config(
  'request.jwt.claims',
  '{"sub":"15500000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);

select is(
  smarter_dog_private.cancel_customer_visit_dispatch(
    '15500000-0000-4000-8000-000000000501',
    (select review_id from review_tokens where label = 'stale'),
    '15500000-0000-4000-8000-000000000812',
    null, 'refund', statement_timestamp(), 'active') ->> 'block_reason',
  'review_required',
  'a staff edit between review and submit invalidates the token');

-- A fresh review then cancels cleanly, with a deposit refund outcome.
insert into public.booking_financial_ledger
  (id, human_id, visit_id, event_kind, amount_pence, reason, idempotency_key)
values ('15500000-0000-4000-8000-000000000701',
        '15500000-0000-4000-8000-000000000010',
        '15500000-0000-4000-8000-000000000501',
        'deposit_received', 1000, 'deposit paid', 'test-155-deposit-1');
insert into public.booking_visit_deposits
  (visit_id, origin, state, requirement_decided_at, satisfaction_source,
   satisfaction_event_id, bank_received_at, recorded_at, recorded_by)
values ('15500000-0000-4000-8000-000000000501', 'legacy_import', 'received', now(),
        'bank', '15500000-0000-4000-8000-000000000701', now(), now(),
        '15500000-0000-4000-8000-000000000001');

select pg_temp.take_review('fresh', '15500000-0000-4000-8000-000000000501');

select is(
  smarter_dog_private.cancel_customer_visit_dispatch(
    '15500000-0000-4000-8000-000000000501',
    (select review_id from review_tokens where label = 'fresh'),
    '15500000-0000-4000-8000-000000000813',
    'Away that week', 'refund', statement_timestamp(), 'active') ->> 'outcome',
  'cancelled', 'an on-time cancellation with a valid review succeeds');

select is(
  (select lifecycle_state from public.booking_visits
    where id = '15500000-0000-4000-8000-000000000501'),
  'cancelled', 'the visit is cancelled');
select is(
  (select count(*)::int from public.bookings
    where visit_id = '15500000-0000-4000-8000-000000000501' and status <> 'Cancelled'),
  0, 'every dog on the visit is cancelled together');
select is(
  (select count(*)::int from public.booking_financial_ledger
    where visit_id = '15500000-0000-4000-8000-000000000501'
      and event_kind = 'refund_due' and refund_origin = 'deposit'),
  1, 'an on-time cancellation creates exactly one refund obligation');
select ok(
  (select due_at > now() from public.booking_financial_ledger
    where visit_id = '15500000-0000-4000-8000-000000000501' and event_kind = 'refund_due'),
  'the refund obligation carries a future five-working-day due date');

-- An idempotent retry replays the committed receipt rather than acting twice.
-- A genuine browser retry resends identical parameters, including the
-- already-consumed review id: the receipt replays before any review check.
select is(
  smarter_dog_private.cancel_customer_visit_dispatch(
    '15500000-0000-4000-8000-000000000501',
    (select review_id from review_tokens where label = 'fresh'),
    '15500000-0000-4000-8000-000000000813',
    'Away that week', 'refund', statement_timestamp(), 'active') ->> 'outcome',
  'cancelled', 'a retried key replays the committed receipt');
select is(
  (select count(*)::int from public.booking_financial_ledger
    where visit_id = '15500000-0000-4000-8000-000000000501' and event_kind = 'refund_due'),
  1, 'the replay creates no second refund obligation');

select throws_ok(
  $$ select smarter_dog_private.cancel_customer_visit_dispatch(
       '15500000-0000-4000-8000-000000000501',
       (select review_id from review_tokens where label = 'fresh'),
       '15500000-0000-4000-8000-000000000813',
       'Different reason', 'credit', statement_timestamp(), 'active') $$,
  'P0001', 'idempotency key reused with different input',
  'the same key with different input is rejected');

-- ── 23-25: deadline and prepayment blocks ──────────────────────────

select pg_temp.mk_v1_visit('15500000-0000-4000-8000-000000000502',
  '15500000-0000-4000-8000-000000000302', 1);
update public.booking_visits
   set customer_change_deadline_at = statement_timestamp() - interval '1 microsecond'
 where id = '15500000-0000-4000-8000-000000000502';
select pg_temp.take_review('late', '15500000-0000-4000-8000-000000000502');

select is(
  smarter_dog_private.cancel_customer_visit_dispatch(
    '15500000-0000-4000-8000-000000000502',
    (select review_id from review_tokens where label = 'late'),
    '15500000-0000-4000-8000-000000000814',
    null, 'refund', statement_timestamp(), 'active') ->> 'block_reason',
  'source_deadline_late', 'one microsecond past the deadline is late');
select is(
  (select lifecycle_state from public.booking_visits
    where id = '15500000-0000-4000-8000-000000000502'),
  'active', 'a late cancellation leaves the original booked');

-- Non-deposit prepayment routes to staff instead of a £10-only refund.
select pg_temp.mk_v1_visit('15500000-0000-4000-8000-000000000503',
  '15500000-0000-4000-8000-000000000303', 30);
update public.bookings set payment = 'Paid in Full', paid_amount = 45
 where visit_id = '15500000-0000-4000-8000-000000000503' and slot = '08:30';
select pg_temp.take_review('prepaid', '15500000-0000-4000-8000-000000000503');
select is(
  smarter_dog_private.cancel_customer_visit_dispatch(
    '15500000-0000-4000-8000-000000000503',
    (select review_id from review_tokens where label = 'prepaid'),
    '15500000-0000-4000-8000-000000000815',
    null, 'refund', statement_timestamp(), 'active') ->> 'block_reason',
  'financial_review_required',
  'a paid-in-full visit routes to staff rather than refunding only the deposit');

-- ── 26-28: withdrawal of an unconfirmed request ────────────────────

insert into public.booking_visits
  (id, lineage_id, human_id, booking_date, lifecycle_state, approval_state,
   confirmation_state, runtime_generation, source)
select '15500000-0000-4000-8000-000000000504',
       '15500000-0000-4000-8000-000000000304',
       '15500000-0000-4000-8000-000000000010', d,
       'active', 'waiting_staff', 'unconfirmed', 'visit_v1', 'website'
  from (select generate_series(current_date + 20, current_date + 27, interval '1 day')::date as d) s
 where extract(isodow from s.d) <= 3
 limit 1;
select set_config(
  'request.jwt.claims',
  '{"sub":"15500000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
insert into public.bookings
  (booking_date, slot, dog_id, size, service, status, visit_id)
select v.booking_date, '08:30', '15500000-0000-4000-8000-000000000011',
       'small', 'Full Groom', 'Booked', v.id
  from public.booking_visits v where v.id = '15500000-0000-4000-8000-000000000504';
select set_config(
  'request.jwt.claims',
  '{"sub":"15500000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);

select is(
  smarter_dog_private.withdraw_customer_visit_dispatch(
    '15500000-0000-4000-8000-000000000504',
    '15500000-0000-4000-8000-000000000816',
    'changed my mind', statement_timestamp(), 'active') ->> 'outcome',
  'withdrawn', 'a customer may withdraw an unconfirmed request at any time');
select is(
  (select lifecycle_state from public.booking_visits
    where id = '15500000-0000-4000-8000-000000000504'),
  'withdrawn', 'the withdrawn request is terminal');
select is(
  (select count(*)::int from public.booking_policy_incidents
    where visit_id = '15500000-0000-4000-8000-000000000504'),
  0, 'withdrawal never creates an incident');

-- ── 29-30: credit refund request and cancellation ──────────────────

insert into public.booking_financial_ledger
  (human_id, event_kind, amount_pence, reason, idempotency_key)
values ('15500000-0000-4000-8000-000000000010', 'credit_issued', 1000,
        'earlier cancellation credit', 'test-155-credit-1');

select is(
  public.request_customer_credit_refund(1000, '15500000-0000-4000-8000-000000000820')
    ->> 'outcome',
  'refund_requested', 'a customer may request a refund of their credit');

select throws_ok(
  $$ select public.request_customer_credit_refund(
       1000, '15500000-0000-4000-8000-000000000821') $$,
  'P0001', 'refund exceeds the available credit balance',
  'a pending refund request removes that credit from available immediately');

select * from finish();
rollback;
