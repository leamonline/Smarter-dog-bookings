-- Visit deposits, incidents, overrides and credit ledger: thresholds,
-- exemptions, evidence constraints, refund working days, credit arithmetic
-- and the guarded legacy compatibility paths. Fixtures are rolled back.

begin;
create extension if not exists pgtap with schema extensions;
select plan(48);

-- ── Fixtures ────────────────────────────────────────────────────────

insert into auth.users (id) values
  ('15000000-0000-4000-8000-000000000001'), -- owner staff
  ('15000000-0000-4000-8000-000000000003'); -- customer

insert into public.staff_profiles (user_id, role, display_name) values
  ('15000000-0000-4000-8000-000000000001', 'owner', 'Ledger Owner');

insert into public.humans (id, name, surname, customer_user_id) values
  ('15000000-0000-4000-8000-000000000010', 'LedgerFixture150', 'One',
   '15000000-0000-4000-8000-000000000003'),
  ('15000000-0000-4000-8000-000000000020', 'LedgerFixture150', 'Two', null);

insert into public.dogs (id, name, breed, size, human_id) values
  ('15000000-0000-4000-8000-000000000011', 'Echo', 'Poodle', 'small',
   '15000000-0000-4000-8000-000000000010'),
  ('15000000-0000-4000-8000-000000000012', 'Foxtrot', 'Beagle', 'small',
   '15000000-0000-4000-8000-000000000010');

insert into public.booking_lineages (id, human_id) values
  ('15000000-0000-4000-8000-000000000301', '15000000-0000-4000-8000-000000000010'),
  ('15000000-0000-4000-8000-000000000302', '15000000-0000-4000-8000-000000000010'),
  ('15000000-0000-4000-8000-000000000303', '15000000-0000-4000-8000-000000000010'),
  ('15000000-0000-4000-8000-000000000304', '15000000-0000-4000-8000-000000000010'),
  ('15000000-0000-4000-8000-000000000305', '15000000-0000-4000-8000-000000000010');

-- Helper: a confirmed legacy visit on a given date.
create or replace function pg_temp.mk_visit(p_id uuid, p_lineage uuid, p_date date, p_state text)
returns uuid language plpgsql as $$
begin
  insert into public.booking_visits
    (id, lineage_id, human_id, booking_date, lifecycle_state, approval_state,
     confirmation_state, policy_code, confirmed_at, customer_change_deadline_at,
     runtime_generation, legacy_compat_key,
     completed_at, cancelled_at)
  values (p_id, p_lineage, '15000000-0000-4000-8000-000000000010', p_date,
          p_state, 'not_required', 'confirmed', 'legacy_24h', now(),
          public.legacy_visit_change_deadline(p_date, '08:30'),
          'legacy_compat', 'test:' || p_id::text,
          case when p_state = 'completed' then now() else null end,
          case when p_state = 'cancelled' then now() else null end);
  return p_id;
end;
$$;

select set_config(
  'request.jwt.claims',
  '{"sub":"15000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

-- ── 1-5: refund working days ───────────────────────────────────────

-- Friday 2026-07-24 + 5 working days = Friday 2026-07-31.
select is(
  (public.refund_due_at(timestamptz '2026-07-24 09:00:00 Europe/London')
     at time zone 'Europe/London')::date,
  date '2026-07-31', 'five working days from a Friday skips the weekend');
-- Thursday 2026-12-24 + 5 working days skips Christmas Day, the Boxing Day
-- substitute and New Year's Day: 29, 30, 31 Dec then 4, 5 Jan.
select is(
  (public.refund_due_at(timestamptz '2026-12-24 09:00:00 Europe/London')
     at time zone 'Europe/London')::date,
  date '2027-01-05', 'bank holidays extend the five-working-day promise');
select ok(
  public.refund_calendar_coverage_for(timestamptz '2026-09-01 09:00:00 Europe/London') is not null,
  'the activation horizon is inside recorded calendar coverage');
select ok(
  public.refund_calendar_coverage_for(timestamptz '2029-09-01 09:00:00 Europe/London') is null,
  'an uncovered date returns no coverage rather than a silent weekday guess');
select throws_ok(
  $$ insert into public.booking_financial_ledger
       (human_id, event_kind, amount_pence, reason, idempotency_key, due_at,
        refund_origin, refund_deadline_basis)
     values ('15000000-0000-4000-8000-000000000010', 'refund_due', 1000,
             'no calendar evidence', 'test-refund-nocal', now(),
             'deposit', 'deposit_working_days') $$,
  '23514', null, 'a deposit refund obligation without calendar evidence is rejected');

-- ── 6-11: ledger constraint shapes ─────────────────────────────────

select throws_ok(
  $$ insert into public.booking_financial_ledger
       (human_id, event_kind, amount_pence, reason, idempotency_key)
     values ('15000000-0000-4000-8000-000000000010', 'refund_paid', 1000,
             'no obligation', 'test-paid-noobligation') $$,
  '23514', null, 'a refund payment must settle an obligation');
select throws_ok(
  $$ insert into public.booking_financial_ledger
       (human_id, event_kind, amount_pence, reason, idempotency_key)
     values ('15000000-0000-4000-8000-000000000010', 'deposit_received', 0,
             'zero money', 'test-zero') $$,
  '23514', null, 'a zero-amount money event is impossible');

insert into public.booking_financial_ledger
  (id, human_id, event_kind, amount_pence, reason, idempotency_key, due_at,
   refund_origin, refund_deadline_basis, refund_calendar_source, refund_calendar_coverage_id)
values ('15000000-0000-4000-8000-000000000401',
        '15000000-0000-4000-8000-000000000010', 'refund_due', 1000,
        'on-time cancellation refund', 'test-refund-due-1',
        public.refund_due_at(timestamptz '2026-07-24 09:00:00 Europe/London'),
        'deposit', 'deposit_working_days', 'gov.uk/bank-holidays',
        public.refund_calendar_coverage_for(timestamptz '2026-07-24 09:00:00 Europe/London'));

select lives_ok(
  $$ insert into public.booking_financial_ledger
       (human_id, event_kind, amount_pence, reason, idempotency_key,
        settles_event_id, actual_paid_at, bank_reference)
     values ('15000000-0000-4000-8000-000000000010', 'refund_paid', 1000,
             'paid by transfer', 'test-refund-paid-1',
             '15000000-0000-4000-8000-000000000401', now(), 'FPS-12345') $$,
  'a refund payment with actual time and bank reference settles the obligation');

select throws_ok(
  $$ insert into public.booking_financial_ledger
       (human_id, event_kind, amount_pence, reason, idempotency_key,
        settles_event_id, actual_paid_at, bank_reference)
     values ('15000000-0000-4000-8000-000000000010', 'refund_paid', 1000,
             'double settle', 'test-refund-paid-2',
             '15000000-0000-4000-8000-000000000401', now(), 'FPS-99999') $$,
  '23505', null, 'an obligation cannot be settled twice');

select throws_ok(
  $$ update public.booking_financial_ledger set reason = 'rewritten'
      where id = '15000000-0000-4000-8000-000000000401' $$,
  'P0001', null, 'ledger rows are immutable');

select throws_ok(
  $$ delete from public.booking_financial_ledger
      where id = '15000000-0000-4000-8000-000000000401' $$,
  'P0001', null, 'ledger rows cannot be deleted');

-- ── 12-17: deposit evidence constraints ────────────────────────────

select pg_temp.mk_visit('15000000-0000-4000-8000-000000000501',
  '15000000-0000-4000-8000-000000000301', current_date + 40, 'active');

select throws_ok(
  $$ insert into public.booking_visit_deposits
       (visit_id, origin, state, requirement_decided_at, satisfaction_source, recorded_at)
     values ('15000000-0000-4000-8000-000000000501', 'visit_v1', 'received', now(), 'bank', now()) $$,
  '23514', null, 'received without a satisfaction event is rejected');

select throws_ok(
  $$ insert into public.booking_visit_deposits
       (visit_id, origin, state, requirement_decided_at, satisfaction_source,
        satisfaction_event_id, bank_received_at, recorded_at, recorded_by)
     values ('15000000-0000-4000-8000-000000000501', 'visit_v1', 'received', now(), 'credit',
             '15000000-0000-4000-8000-000000000401', now(), now(),
             '15000000-0000-4000-8000-000000000001') $$,
  '23514', null, 'credit satisfaction cannot carry a fabricated bank receipt time');

select throws_ok(
  $$ insert into public.booking_visit_deposits
       (visit_id, origin, state, requirement_decided_at, requirement_reason, due_at)
     values ('15000000-0000-4000-8000-000000000501', 'visit_v1', 'awaiting_payment', now(),
             'incident history', null) $$,
  '23514', null, 'an awaiting deposit must carry its due time');

select throws_ok(
  $$ insert into public.booking_visit_deposits
       (visit_id, origin, state, requirement_decided_at, amount_pence,
        requirement_reason, due_at, bank_instruction_id, terms_publication_id, terms_accepted_at)
     values ('15000000-0000-4000-8000-000000000501', 'visit_v1', 'awaiting_payment', now(), 2000,
             'incident history', now() + interval '12 hours', null, null, now()) $$,
  '23514', null, 'the deposit is always exactly 1000 pence');

-- A settled legacy import needs no bank instruction version.
select lives_ok(
  $$ insert into public.booking_visit_deposits
       (visit_id, origin, state, requirement_decided_at, recorded_at)
     values ('15000000-0000-4000-8000-000000000501', 'legacy_import', 'not_received', now(), now()) $$,
  'a settled legacy import without reconstructable bank instructions is valid');

select throws_ok(
  $$ insert into public.booking_visit_deposits
       (visit_id, origin, state, requirement_decided_at, recorded_at)
     values ('15000000-0000-4000-8000-000000000501', 'legacy_import', 'not_received', now(), now()) $$,
  '23505', null, 'a visit has at most one deposit record');

delete from public.booking_visit_deposits where visit_id = '15000000-0000-4000-8000-000000000501';

-- ── 18-21: received_liability needs an open reconciliation ─────────

insert into public.booking_financial_ledger
  (id, human_id, visit_id, event_kind, amount_pence, reason, idempotency_key)
values ('15000000-0000-4000-8000-000000000402',
        '15000000-0000-4000-8000-000000000010',
        '15000000-0000-4000-8000-000000000501',
        'deposit_received', 1000, 'money found after release', 'test-liability-1');

select throws_ok(
  $q$
  do $body$
  begin
    insert into public.booking_visit_deposits
      (visit_id, origin, state, requirement_decided_at, satisfaction_source,
       satisfaction_event_id, bank_received_at, recorded_at, recorded_by)
    values ('15000000-0000-4000-8000-000000000501', 'legacy_import', 'received_liability',
            now(), 'bank', '15000000-0000-4000-8000-000000000402', now(), now(),
            '15000000-0000-4000-8000-000000000001');
    set constraints all immediate;
  end
  $body$;
  $q$,
  'P0001', null, 'a liability without an open reconciliation is rejected');

set constraints all immediate;

insert into public.booking_deposit_money_reconciliations
  (visit_id, human_id, amount_pence, state, opened_reason)
values ('15000000-0000-4000-8000-000000000501', '15000000-0000-4000-8000-000000000010',
        1000, 'open', 'payment found after the slot was released');

select lives_ok(
  $$ insert into public.booking_visit_deposits
       (visit_id, origin, state, requirement_decided_at, satisfaction_source,
        satisfaction_event_id, bank_received_at, recorded_at, recorded_by)
     values ('15000000-0000-4000-8000-000000000501', 'legacy_import', 'received_liability',
             now(), 'bank', '15000000-0000-4000-8000-000000000402', now(), now(),
             '15000000-0000-4000-8000-000000000001') $$,
  'a liability with exactly one open reconciliation is valid');

select is(
  (select deposit_part_payment_pence from public.booking_visit_bill_summary
    where visit_id = '15000000-0000-4000-8000-000000000501'),
  0, 'an unresolved liability contributes nothing to the bill');

select throws_ok(
  $$ insert into public.booking_deposit_money_reconciliations
       (visit_id, human_id, amount_pence, state, opened_reason)
     values ('15000000-0000-4000-8000-000000000501', '15000000-0000-4000-8000-000000000010',
             1000, 'open', 'second task') $$,
  '23505', null, 'only one reconciliation can be open per visit');

-- ── 22-24: bill summary counts the £10 exactly once ────────────────

select pg_temp.mk_visit('15000000-0000-4000-8000-000000000502',
  '15000000-0000-4000-8000-000000000302', current_date + 41, 'active');

-- Two dogs, both carrying the duplicated legacy deposit flag.
insert into public.bookings
  (id, booking_date, slot, dog_id, size, service, status, visit_id,
   deposit_required, deposit_reference, paid_amount)
values
  ('15000000-0000-4000-8000-000000000601', current_date + 41, '08:30',
   '15000000-0000-4000-8000-000000000011', 'small', 'Full Groom', 'Booked',
   '15000000-0000-4000-8000-000000000502', true, 'REF-1', 40),
  ('15000000-0000-4000-8000-000000000602', current_date + 41, '09:00',
   '15000000-0000-4000-8000-000000000012', 'small', 'Bath & Brush', 'Booked',
   '15000000-0000-4000-8000-000000000502', true, 'REF-1', 25);

insert into public.booking_financial_ledger
  (id, human_id, visit_id, event_kind, amount_pence, reason, idempotency_key)
values ('15000000-0000-4000-8000-000000000403',
        '15000000-0000-4000-8000-000000000010',
        '15000000-0000-4000-8000-000000000502',
        'deposit_received', 1000, 'one visit deposit', 'test-bill-1');

insert into public.booking_visit_deposits
  (visit_id, origin, state, requirement_decided_at, satisfaction_source,
   satisfaction_event_id, bank_received_at, recorded_at, recorded_by)
values ('15000000-0000-4000-8000-000000000502', 'legacy_import', 'received', now(),
        'legacy_import', '15000000-0000-4000-8000-000000000403', now(), now(),
        '15000000-0000-4000-8000-000000000001');

select is(
  (select deposit_part_payment_pence from public.booking_visit_bill_summary
    where visit_id = '15000000-0000-4000-8000-000000000502'),
  1000, 'a multi-dog visit credits exactly one £10, never one per dog');
select is(
  (select gross_service_total_pence from public.booking_visit_bill_summary
    where visit_id = '15000000-0000-4000-8000-000000000502'),
  6500, 'the gross service total sums the visit''s own rows');
select is(
  (select amount_due_pence from public.booking_visit_bill_summary
    where visit_id = '15000000-0000-4000-8000-000000000502'),
  5500, 'the final bill is reduced by the deposit exactly once');

-- ── 25-31: the deposit requirement resolver ────────────────────────

-- Give the salon complete bank and Terms so a requirement is not blocked.
-- A 24-hour hold makes the insufficient-window rule reachable: the widest
-- on-time eligibility instant is 15:00 the previous day, only 17.5 hours
-- before an 08:30 start.
select public.update_booking_rules(
  ('{"depositBank":{"accountName":"Smarter Dog","sortCode":"12-34-56","accountNumber":"12345678"},'
   || '"depositHoldHours":24,'
   || '"depositTermsVersion":"2026-07 v1","depositTermsContentHash":"' || repeat('a',64) || '"}')::jsonb);

select is(
  public.resolve_deposit_requirement(
    '15000000-0000-4000-8000-000000000010', current_date + 30,
    (current_date + 29)::timestamp at time zone 'Europe/London', 'previous_day_1500_v1')
    ->> 'reasonCode',
  'not_required', 'a clean customer needs no deposit');

-- A last-minute eligibility instant (after the 15:00 previous-day deadline).
select is(
  public.resolve_deposit_requirement(
    '15000000-0000-4000-8000-000000000010', current_date + 30,
    ((current_date + 29)::text || ' 15:00:01')::timestamp at time zone 'Europe/London',
    'previous_day_1500_v1') ->> 'reasonCode',
  'same_day_or_last_minute', 'a last-minute booking never requires a deposit');

-- A hold window that would outlast the appointment: on-time eligibility at
-- 14:00 the previous day plus 24 hours lands after the 08:30 start.
select is(
  public.resolve_deposit_requirement(
    '15000000-0000-4000-8000-000000000010', current_date + 30,
    ((current_date + 29)::text || ' 14:00')::timestamp at time zone 'Europe/London',
    'previous_day_1500_v1') ->> 'reasonCode',
  'insufficient_window', 'an insufficient hold window exempts the deposit');

-- One unwaived incident makes the next booking deposit-required.
select pg_temp.mk_visit('15000000-0000-4000-8000-000000000503',
  '15000000-0000-4000-8000-000000000303', current_date - 40, 'cancelled');
insert into public.booking_policy_incidents
  (visit_id, human_id, kind, appointment_date, recorded_by, reason)
values ('15000000-0000-4000-8000-000000000503', '15000000-0000-4000-8000-000000000010',
        'late_cancellation', current_date - 40,
        '15000000-0000-4000-8000-000000000001', 'cancelled after the deadline');

select is(
  public.resolve_deposit_requirement(
    '15000000-0000-4000-8000-000000000010', current_date + 30,
    (current_date + 29)::timestamp at time zone 'Europe/London', 'previous_day_1500_v1')
    ->> 'reasonCode',
  'next_booking_after_incident', 'one unwaived incident requires the next deposit');

select is(
  public.resolve_deposit_requirement(
    '15000000-0000-4000-8000-000000000010', current_date + 30,
    (current_date + 29)::timestamp at time zone 'Europe/London', 'previous_day_1500_v1')
    ->> 'customerReason',
  'recent_booking_history',
  'the customer-safe reason never exposes the internal code or a count');

-- A later completed visit clears the single-incident requirement.
select pg_temp.mk_visit('15000000-0000-4000-8000-000000000504',
  '15000000-0000-4000-8000-000000000304', current_date - 10, 'completed');
select is(
  public.resolve_deposit_requirement(
    '15000000-0000-4000-8000-000000000010', current_date + 30,
    (current_date + 29)::timestamp at time zone 'Europe/London', 'previous_day_1500_v1')
    ->> 'reasonCode',
  'not_required', 'one successfully completed appointment clears the requirement');

-- A waived incident does not count at all.
update public.booking_policy_incidents
   set waived_at = now(), waived_by = '15000000-0000-4000-8000-000000000001',
       waiver_reason = 'salon closed that day'
 where visit_id = '15000000-0000-4000-8000-000000000503';
select is(
  public.resolve_deposit_requirement(
    '15000000-0000-4000-8000-000000000010', current_date + 30,
    (current_date + 29)::timestamp at time zone 'Europe/London', 'previous_day_1500_v1')
    ->> 'incidentCount12m',
  '0', 'waived incidents are excluded from the count');

-- ── 32-35: three-incident episodes and the 12-month gap ────────────

update public.booking_policy_incidents set waived_at = null, waived_by = null,
       waiver_reason = null
 where visit_id = '15000000-0000-4000-8000-000000000503';
update public.booking_policy_incidents set appointment_date = date '2026-01-10'
 where visit_id = '15000000-0000-4000-8000-000000000503';

insert into public.booking_lineages (id, human_id) values
  ('15000000-0000-4000-8000-000000000306', '15000000-0000-4000-8000-000000000010'),
  ('15000000-0000-4000-8000-000000000307', '15000000-0000-4000-8000-000000000010'),
  ('15000000-0000-4000-8000-000000000308', '15000000-0000-4000-8000-000000000010');

select pg_temp.mk_visit('15000000-0000-4000-8000-000000000505',
  '15000000-0000-4000-8000-000000000306', date '2026-06-10', 'cancelled');
select pg_temp.mk_visit('15000000-0000-4000-8000-000000000506',
  '15000000-0000-4000-8000-000000000307', date '2027-01-10', 'cancelled');

insert into public.booking_policy_incidents
  (visit_id, human_id, kind, appointment_date, recorded_by, reason)
values
  ('15000000-0000-4000-8000-000000000505', '15000000-0000-4000-8000-000000000010',
   'no_show', date '2026-06-10', '15000000-0000-4000-8000-000000000001', 'no show'),
  ('15000000-0000-4000-8000-000000000506', '15000000-0000-4000-8000-000000000010',
   'late_reschedule', date '2027-01-10', '15000000-0000-4000-8000-000000000001', 'late move');

-- 2026-01-10, 2026-06-10 and 2027-01-10 span exactly 12 months inclusive.
select is(
  public.resolve_deposit_requirement(
    '15000000-0000-4000-8000-000000000010', date '2027-02-01',
    timestamptz '2027-01-20 09:00:00 Europe/London', 'previous_day_1500_v1')
    ->> 'reasonCode',
  'three_incidents_12m',
  'three incidents inside an inclusive 12 months form a threshold');

-- The threshold persists until, but not beyond, 12 months after the latest.
select is(
  public.resolve_deposit_requirement(
    '15000000-0000-4000-8000-000000000010', date '2028-01-10',
    timestamptz '2028-01-01 09:00:00 Europe/London', 'previous_day_1500_v1')
    ->> 'reasonCode',
  'three_incidents_12m',
  'the ongoing requirement lasts to the exact 12-month anniversary');

select isnt(
  public.resolve_deposit_requirement(
    '15000000-0000-4000-8000-000000000010', date '2028-06-01',
    timestamptz '2028-05-01 09:00:00 Europe/London', 'previous_day_1500_v1')
    ->> 'reasonCode',
  'three_incidents_12m',
  'twelve incident-free months clear the ongoing requirement');

-- A lone incident after a 12-month gap starts a fresh episode and must not
-- resurrect the old three-incident threshold.
insert into public.booking_lineages (id, human_id) values
  ('15000000-0000-4000-8000-000000000309', '15000000-0000-4000-8000-000000000010');
select pg_temp.mk_visit('15000000-0000-4000-8000-000000000507',
  '15000000-0000-4000-8000-000000000309', date '2028-06-10', 'cancelled');
insert into public.booking_policy_incidents
  (visit_id, human_id, kind, appointment_date, recorded_by, reason)
values ('15000000-0000-4000-8000-000000000507', '15000000-0000-4000-8000-000000000010',
        'late_cancellation', date '2028-06-10',
        '15000000-0000-4000-8000-000000000001', 'fresh episode');

select is(
  public.resolve_deposit_requirement(
    '15000000-0000-4000-8000-000000000010', date '2028-08-01',
    timestamptz '2028-07-01 09:00:00 Europe/London', 'previous_day_1500_v1')
    ->> 'reasonCode',
  'next_booking_after_incident',
  'a lone incident after a cleared gap follows the next-booking rule only');

-- ── 36-38: staff overrides ─────────────────────────────────────────

insert into public.customer_booking_rule_overrides
  (human_id, mode, reason, recorded_by, idempotency_key)
values ('15000000-0000-4000-8000-000000000010', 'waived', 'long-standing customer',
        '15000000-0000-4000-8000-000000000001', 'test-override-waive');

select is(
  public.resolve_deposit_requirement(
    '15000000-0000-4000-8000-000000000010', date '2028-08-01',
    timestamptz '2028-07-01 09:00:00 Europe/London', 'previous_day_1500_v1')
    ->> 'reasonCode',
  'staff_waived', 'an audited staff waiver overrides incident history');

select throws_ok(
  $$ insert into public.customer_booking_rule_overrides
       (human_id, mode, reason, idempotency_key)
     values ('15000000-0000-4000-8000-000000000010', 'required', 'second current',
             'test-override-2') $$,
  '23505', null, 'a customer has at most one current override');

select throws_ok(
  $$ insert into public.customer_booking_rule_overrides
       (human_id, mode, reason, effective_to, idempotency_key)
     values ('15000000-0000-4000-8000-000000000020', 'required', '  ', null,
             'test-override-blank') $$,
  '23514', null, 'an override needs a real reason');

update public.customer_booking_rule_overrides
   set effective_to = timestamptz '2028-06-30 00:00:00 Europe/London'
 where idempotency_key = 'test-override-waive';

-- ── 39-41: incidents are one per visit, waivers audited ────────────

select throws_ok(
  $$ insert into public.booking_policy_incidents
       (visit_id, human_id, kind, appointment_date, recorded_by, reason)
     values ('15000000-0000-4000-8000-000000000507', '15000000-0000-4000-8000-000000000010',
             'no_show', date '2028-06-10', '15000000-0000-4000-8000-000000000001', 'second') $$,
  '23505', null, 'a visit can carry at most one counting incident');

select throws_ok(
  $$ update public.booking_policy_incidents
        set waived_at = now(), waived_by = '15000000-0000-4000-8000-000000000001'
      where visit_id = '15000000-0000-4000-8000-000000000507' $$,
  '23514', null, 'a waiver without a reason is rejected');

select throws_ok(
  $$ insert into public.booking_policy_incidents
       (visit_id, human_id, kind, appointment_date, recorded_by, reason)
     values ('15000000-0000-4000-8000-000000000507', '15000000-0000-4000-8000-000000000020',
             'no_show', date '2028-06-10', '15000000-0000-4000-8000-000000000001', 'wrong human') $$,
  null, 'an incident cannot name a different customer than its visit');

-- ── 42-45: credit arithmetic ───────────────────────────────────────

insert into public.booking_financial_ledger
  (id, human_id, event_kind, amount_pence, reason, idempotency_key)
values ('15000000-0000-4000-8000-000000000410',
        '15000000-0000-4000-8000-000000000010', 'credit_issued', 1000,
        'customer chose credit', 'test-credit-issued-1');

select is(
  (public.customer_credit_balance('15000000-0000-4000-8000-000000000010') ->> 'availablePence'),
  '1000', 'issued credit is available');

insert into public.booking_financial_ledger
  (id, human_id, visit_id, event_kind, amount_pence, reason, idempotency_key)
values ('15000000-0000-4000-8000-000000000411',
        '15000000-0000-4000-8000-000000000010',
        '15000000-0000-4000-8000-000000000502', 'credit_reserved', 1000,
        'allocated while awaiting approval', 'test-credit-reserved-1');

insert into public.customer_credit_reservations
  (human_id, visit_id, amount_pence, state, reserve_event_id)
values ('15000000-0000-4000-8000-000000000010',
        '15000000-0000-4000-8000-000000000502', 1000, 'reserved',
        '15000000-0000-4000-8000-000000000411');

select is(
  (public.customer_credit_balance('15000000-0000-4000-8000-000000000010') ->> 'availablePence'),
  '0', 'a reservation removes credit from available exactly once');
select is(
  (public.customer_credit_balance('15000000-0000-4000-8000-000000000010') ->> 'grossPence'),
  '1000', 'a reservation never changes permanent gross credit');

-- Releasing restores it automatically.
insert into public.booking_financial_ledger
  (id, human_id, visit_id, event_kind, amount_pence, reason, idempotency_key)
values ('15000000-0000-4000-8000-000000000412',
        '15000000-0000-4000-8000-000000000010',
        '15000000-0000-4000-8000-000000000502', 'credit_released', 1000,
        'request withdrawn', 'test-credit-released-1');
update public.customer_credit_reservations
   set state = 'released', terminal_event_id = '15000000-0000-4000-8000-000000000412'
 where visit_id = '15000000-0000-4000-8000-000000000502';

select is(
  (public.customer_credit_balance('15000000-0000-4000-8000-000000000010') ->> 'availablePence'),
  '1000', 'withdrawal restores reserved credit automatically');

-- ── 46-48: legacy compatibility remains guarded ────────────────────

select is(
  (select count(*)::int from public.customer_booking_rule_overrides
    where idempotency_key like 'legacy-deposit-tag:%'),
  0, 'no legacy deposit tag existed in this fixture set to migrate');

select is(public.run_legacy_deposit_auto_release(), 0,
  'the guarded legacy sweep releases nothing when no legacy row is overdue');

-- With the runtime active the sweep is a no-op even for an overdue row.
select set_config('smarter_dog.booking_policy_latch', 'previous_day_1500_v1', true);
update public.booking_policy_versions
   set effective_at = timestamptz '2026-01-01 00:00:00 Europe/London'
 where code = 'previous_day_1500_v1';
update public.bookings
   set deposit_required = true, deposit_due_by = now() - interval '1 day', status = 'Booked'
 where id = '15000000-0000-4000-8000-000000000601';
select is(public.run_legacy_deposit_auto_release(), 0,
  'once the policy is active the legacy sweep performs no mutation');

select * from finish();
rollback;
