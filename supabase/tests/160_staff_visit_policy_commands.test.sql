-- Audited staff visit commands: role gates, approval deposit resolution,
-- decline, manual deposit reconciliation, incidents and waivers, overrides
-- and late-change decisions. Fixtures are rolled back.

begin;
create extension if not exists pgtap with schema extensions;
select plan(43);
\ir fixtures/ensure_local_vault_secrets.psql

insert into auth.users (id) values
  ('16000000-0000-4000-8000-000000000001'), -- owner staff
  ('16000000-0000-4000-8000-000000000002'), -- second owner staff
  ('16000000-0000-4000-8000-000000000003'); -- customer

insert into public.staff_profiles (user_id, role, display_name) values
  ('16000000-0000-4000-8000-000000000001', 'owner', 'Staff Owner'),
  ('16000000-0000-4000-8000-000000000002', 'owner', 'Second Staff Owner');

insert into public.humans (id, name, surname, customer_user_id) values
  ('16000000-0000-4000-8000-000000000010', 'StaffFixture160', 'One',
   '16000000-0000-4000-8000-000000000003');

insert into public.dogs (id, name, breed, size, human_id) values
  ('16000000-0000-4000-8000-000000000011', 'India', 'Poodle', 'small',
   '16000000-0000-4000-8000-000000000010');

insert into public.booking_lineages (id, human_id)
select ('16000000-0000-4000-8000-00000000030' || g)::uuid,
       '16000000-0000-4000-8000-000000000010'
  from generate_series(1, 9) g;

select set_config(
  'request.jwt.claims',
  '{"sub":"16000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

-- An unconfirmed v1 request awaiting staff approval, on an open salon day.
create or replace function pg_temp.mk_request(p_id uuid, p_lineage uuid, p_days int)
returns uuid language plpgsql as $$
declare v_date date := current_date + p_days;
begin
  while extract(isodow from v_date) > 3 loop v_date := v_date + 1; end loop;
  insert into public.booking_visits
    (id, lineage_id, human_id, booking_date, lifecycle_state, approval_state,
     confirmation_state, runtime_generation, source)
  values (p_id, p_lineage, '16000000-0000-4000-8000-000000000010', v_date,
          'active', 'waiting_staff', 'unconfirmed', 'visit_v1', 'website');
  insert into public.bookings
    (booking_date, slot, dog_id, size, service, status, visit_id)
  values (v_date, '08:30', '16000000-0000-4000-8000-000000000011',
          'small', 'Full Groom', 'Booked', p_id);
  return p_id;
end;
$$;

-- Give the salon complete bank and Terms so a required deposit is not blocked.
select public.update_booking_rules(
  ('{"depositBank":{"accountName":"Smarter Dog","sortCode":"12-34-56","accountNumber":"12345678"},'
   || '"depositTermsVersion":"2026-07 v1","depositTermsContentHash":"' || repeat('b',64) || '"}')::jsonb);

-- ── 1-5: every staff command denies a non-staff caller ─────────────

select set_config(
  'request.jwt.claims',
  '{"sub":"16000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
select throws_ok(
  $$ select public.approve_booking_visit(
       '16000000-0000-4000-8000-000000000501', 1, gen_random_uuid()) $$,
  '42501', null, 'approval is staff-only');
select throws_ok(
  $$ select public.decline_booking_visit(
       '16000000-0000-4000-8000-000000000501', 1, 'no space', gen_random_uuid()) $$,
  '42501', null, 'declining is staff-only');
select throws_ok(
  $$ select public.record_visit_deposit_outcome(
       '16000000-0000-4000-8000-000000000501', 1,
       'received', now(), 'ref', gen_random_uuid()) $$,
  '42501', null, 'deposit reconciliation is staff-only');
select throws_ok(
  $$ select public.mark_booking_visit_no_show(
       '16000000-0000-4000-8000-000000000501', 1, 'absent', gen_random_uuid()) $$,
  '42501', null, 'only staff may mark a no-show');
select throws_ok(
  $$ select public.set_customer_deposit_override(
       '16000000-0000-4000-8000-000000000010', 'required', 'because', gen_random_uuid()) $$,
  '42501', null, 'deposit overrides are staff-only');
select set_config(
  'request.jwt.claims',
  '{"sub":"16000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select pg_temp.mk_request('16000000-0000-4000-8000-000000000501',
  '16000000-0000-4000-8000-000000000301', 30);

-- The public command is inert until the guarded activation instant. The
-- activation below exists only inside this rolled-back fixture.
select is(public.booking_policy_runtime(), 'inactive', 'the runtime starts inactive');
select is(
  public.approve_booking_visit(
    '16000000-0000-4000-8000-000000000501', 1,
    '16000000-0000-4000-8000-000000000800') ->> 'block_reason',
  'policy_not_active', 'approval is inert before activation');
select is(
  (select revision::text || '|' || row_revision::text || '|' ||
          approval_state || '|' || confirmation_state
     from public.booking_visits
    where id = '16000000-0000-4000-8000-000000000501'),
  '1|1|waiting_staff|unconfirmed',
  'an inactive approval changes no visit state or revision');

select set_config('smarter_dog.booking_policy_latch', 'previous_day_1500_v1', true);
update public.booking_policy_versions
   set effective_at = statement_timestamp() - interval '1 second'
 where code = 'previous_day_1500_v1';
select is(public.booking_policy_runtime(), 'active',
  'the guarded rolled-back fixture activates the policy');

-- ── approval of a clean customer confirms with no deposit ───────────

select is(
  public.approve_booking_visit(
    '16000000-0000-4000-8000-000000000501', 1,
    '16000000-0000-4000-8000-000000000801') ->> 'outcome',
  'confirmed', 'approving a clean request confirms it immediately');
select is(
  (select confirmation_state from public.booking_visits
    where id = '16000000-0000-4000-8000-000000000501'),
  'confirmed', 'the visit is confirmed');
select is(
  (select approval_state from public.booking_visits
    where id = '16000000-0000-4000-8000-000000000501'),
  'approved', 'the approval axis records staff approval');
select ok(
  (select customer_change_deadline_at is not null and policy_code is not null
     from public.booking_visits where id = '16000000-0000-4000-8000-000000000501'),
  'confirmation assigns the policy and its deadline');

-- Two staff members rendered row revision 1. The first approval advanced it,
-- so the second staff member cannot overwrite that decision with a decline.
select set_config(
  'request.jwt.claims',
  '{"sub":"16000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select is(
  public.decline_booking_visit(
    '16000000-0000-4000-8000-000000000501', 1, 'second editor',
    '16000000-0000-4000-8000-000000000822') ->> 'block_reason',
  'stale_review', 'a second staff member cannot overwrite a changed visit');
select is(
  (select revision::text || '|' || row_revision::text || '|' ||
          confirmation_state
     from public.booking_visits
    where id = '16000000-0000-4000-8000-000000000501'),
  '1|3|confirmed',
  'the stale decision preserves lineage revision 1 and current row revision 3');
select set_config(
  'request.jwt.claims',
  '{"sub":"16000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

-- ── 10-14: approval with an incident requires a deposit ────────────

select pg_temp.mk_request('16000000-0000-4000-8000-000000000502',
  '16000000-0000-4000-8000-000000000302', 40);

-- One unwaived incident on an earlier confirmed visit.
insert into public.booking_visits
  (id, lineage_id, human_id, booking_date, lifecycle_state, approval_state,
   confirmation_state, policy_code, confirmed_at, customer_change_deadline_at,
   runtime_generation, cancelled_at)
values ('16000000-0000-4000-8000-000000000590',
        '16000000-0000-4000-8000-000000000309',
        '16000000-0000-4000-8000-000000000010', current_date - 20,
        'cancelled', 'not_required', 'confirmed', 'previous_day_1500_v1', now(),
        public.change_deadline_for('previous_day_1500_v1', current_date - 20, '08:30'),
        'visit_v1', now());
insert into public.booking_policy_incidents
  (visit_id, human_id, kind, appointment_date, recorded_by, reason)
values ('16000000-0000-4000-8000-000000000590', '16000000-0000-4000-8000-000000000010',
        'late_cancellation', current_date - 20,
        '16000000-0000-4000-8000-000000000001', 'cancelled late');

select is(
  public.approve_booking_visit(
    '16000000-0000-4000-8000-000000000502', 1,
    '16000000-0000-4000-8000-000000000802') ->> 'outcome',
  'awaiting_terms', 'an incident makes the approved booking deposit-required');
select is(
  (select state from public.booking_visit_deposits
    where visit_id = '16000000-0000-4000-8000-000000000502'),
  'awaiting_terms', 'the deposit record opens awaiting Terms');
select ok(
  (select due_at > now() from public.booking_visit_deposits
    where visit_id = '16000000-0000-4000-8000-000000000502'),
  'the hold window starts at approval, not at request time');
select is(
  (select confirmation_state from public.booking_visits
    where id = '16000000-0000-4000-8000-000000000502'),
  'unconfirmed', 'a deposit-required visit stays unconfirmed');
select ok(
  (select terms_publication_id is not null from public.booking_visits
    where id = '16000000-0000-4000-8000-000000000502'),
  'the visit snapshots the immutable Terms publication at eligibility');

-- ── 15-19: manual deposit reconciliation ───────────────────────────

-- Reaching the due time must not cancel the visit or release capacity.
update public.booking_visit_deposits
   set due_at = now() - interval '1 hour', state = 'awaiting_payment',
       terms_accepted_at = now()
 where visit_id = '16000000-0000-4000-8000-000000000502';

select is(
  (select lifecycle_state from public.booking_visits
    where id = '16000000-0000-4000-8000-000000000502'),
  'active', 'an overdue deposit never cancels the visit');
select is(
  (select count(*)::int from public.bookings
    where visit_id = '16000000-0000-4000-8000-000000000502' and status = 'Booked'),
  1, 'an overdue deposit never releases capacity');

-- An on-time bank receipt cannot be refused merely because staff checked late.
select is(
  public.record_visit_deposit_outcome(
    '16000000-0000-4000-8000-000000000502', 2, 'received',
    now() - interval '2 hours', 'BANK-REF-1',
    '16000000-0000-4000-8000-000000000803') ->> 'outcome',
  'confirmed', 'a deposit verified late but received on time confirms the visit');
select is(
  (select count(*)::int from public.booking_financial_ledger
    where visit_id = '16000000-0000-4000-8000-000000000502'
      and event_kind = 'deposit_received'),
  1, 'exactly one deposit_received event is written');
-- A separate still-awaiting visit proves a fabricated future receipt time is
-- refused before any money is written.
select pg_temp.mk_request('16000000-0000-4000-8000-000000000507',
  '16000000-0000-4000-8000-000000000307', 35);
select public.approve_booking_visit(
  '16000000-0000-4000-8000-000000000507', 1,
  '16000000-0000-4000-8000-000000000820');
update public.booking_visit_deposits set state = 'awaiting_payment',
       terms_accepted_at = now()
 where visit_id = '16000000-0000-4000-8000-000000000507';

select throws_ok(
  $$ select public.record_visit_deposit_outcome(
       '16000000-0000-4000-8000-000000000507', 2, 'received',
       now() + interval '1 day', 'FUTURE', gen_random_uuid()) $$,
  'P0001', 'a bank receipt time cannot be in the future',
  'a fabricated future receipt time is rejected');

-- ── 20-22: Not received releases without creating an incident ──────

select pg_temp.mk_request('16000000-0000-4000-8000-000000000503',
  '16000000-0000-4000-8000-000000000303', 45);
select public.approve_booking_visit(
  '16000000-0000-4000-8000-000000000503', 1,
  '16000000-0000-4000-8000-000000000804');
update public.booking_visit_deposits set state = 'awaiting_payment',
       terms_accepted_at = now()
 where visit_id = '16000000-0000-4000-8000-000000000503';

select is(
  public.record_visit_deposit_outcome(
    '16000000-0000-4000-8000-000000000503', 2,
    'not_received', null, 'checked',
    '16000000-0000-4000-8000-000000000805') ->> 'outcome',
  'withdrawn', 'Not received releases the visit');
select is(
  (select lifecycle_state from public.booking_visits
    where id = '16000000-0000-4000-8000-000000000503'),
  'declined', 'the released visit is terminal');
select is(
  (select count(*)::int from public.booking_policy_incidents
    where visit_id = '16000000-0000-4000-8000-000000000503'),
  0, 'Not received creates no incident');

-- ── 23-26: incidents, waivers and the never-confirmed rule ─────────

select pg_temp.mk_request('16000000-0000-4000-8000-000000000504',
  '16000000-0000-4000-8000-000000000304', 50);

select throws_ok(
  $$ select public.mark_booking_visit_no_show(
       '16000000-0000-4000-8000-000000000504', 1, 'absent',
       '16000000-0000-4000-8000-000000000806') $$,
  'P0001', 'a request that was never confirmed cannot become an incident',
  'an unapproved request can never become a no-show');

-- This customer still carries an unwaived incident, so approval opens a
-- deposit; a staff waiver on THIS visit confirms it without touching the
-- account-level override.
select public.approve_booking_visit(
  '16000000-0000-4000-8000-000000000504', 1,
  '16000000-0000-4000-8000-000000000807');
select is(
  public.waive_visit_deposit_requirement(
    '16000000-0000-4000-8000-000000000504', 2,
    'goodwill for a long-standing customer',
    '16000000-0000-4000-8000-000000000821') ->> 'outcome',
  'confirmed', 'a staff deposit waiver confirms the visit');

select ok(
  (public.mark_booking_visit_no_show(
     '16000000-0000-4000-8000-000000000504', 4, 'did not arrive',
     '16000000-0000-4000-8000-000000000808') ->> 'incident_id') is not null,
  'staff can mark a confirmed visit as a no-show');

select throws_ok(
  $$ select public.record_booking_incident(
       '16000000-0000-4000-8000-000000000504', 5,
       'late_cancellation', 'second',
       gen_random_uuid()) $$,
  '23505', null, 'a visit carries at most one counting incident');

select is(
  (public.set_booking_incident_waiver(
     (select id from public.booking_policy_incidents
       where visit_id = '16000000-0000-4000-8000-000000000504'),
     1, true, 'salon error', '16000000-0000-4000-8000-000000000809') ->> 'waived'),
  'true', 'staff can waive an incident with a reason');

select set_config(
  'request.jwt.claims',
  '{"sub":"16000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select is(
  public.set_booking_incident_waiver(
    (select id from public.booking_policy_incidents
      where visit_id = '16000000-0000-4000-8000-000000000504'),
    1, false, 'second editor', '16000000-0000-4000-8000-000000000823')
    ->> 'block_reason',
  'stale_review', 'a second staff member cannot overwrite a changed incident');
select is(
  (select revision::text || '|' || (waived_at is not null)::text
     from public.booking_policy_incidents
    where visit_id = '16000000-0000-4000-8000-000000000504'),
  '2|true', 'the stale incident decision appends no mutation');
select set_config(
  'request.jwt.claims',
  '{"sub":"16000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

-- ── 27-29: overrides ───────────────────────────────────────────────

select throws_ok(
  $$ select public.set_customer_deposit_override(
       '16000000-0000-4000-8000-000000000010', 'required', '  ', gen_random_uuid()) $$,
  '22023', null, 'an override needs a real reason');

select ok(
  (public.set_customer_deposit_override(
     '16000000-0000-4000-8000-000000000010', 'waived', 'long-standing customer',
     '16000000-0000-4000-8000-000000000810') ->> 'override_id') is not null,
  'staff can waive future deposits for a customer');

select is(
  (select count(*)::int from public.customer_booking_rule_overrides
    where human_id = '16000000-0000-4000-8000-000000000010' and effective_to is null),
  1, 'superseding leaves exactly one current override');

-- ── 30-32: late change decisions ───────────────────────────────────

select pg_temp.mk_request('16000000-0000-4000-8000-000000000505',
  '16000000-0000-4000-8000-000000000305', 55);
select public.approve_booking_visit(
  '16000000-0000-4000-8000-000000000505', 1,
  '16000000-0000-4000-8000-000000000811');

insert into public.booking_change_requests
  (id, source_visit_id, human_id, kind, channel, reason_code, status, requested_at)
values ('16000000-0000-4000-8000-000000000601',
        '16000000-0000-4000-8000-000000000505',
        '16000000-0000-4000-8000-000000000010', 'cancel', 'whatsapp',
        'source_deadline_late', 'pending_staff', now())
;
update public.booking_change_requests set provider_message_id = 'wamid.TEST'
 where id = '16000000-0000-4000-8000-000000000601';

select is(
  public.decide_booking_change_request(
    '16000000-0000-4000-8000-000000000601', 1, 'accept',
    'customer is unwell', '16000000-0000-4000-8000-000000000812')
    -> 'incident' ->> 'kind',
  'late_cancellation',
  'an accepted unwaived late cancellation records one incident');

select is(
  (select count(*)::int from public.booking_policy_incidents
    where visit_id = '16000000-0000-4000-8000-000000000505'),
  1, 'the accepted late change creates exactly one incident');

-- A declined late request creates no incident: the customer may still attend.
select pg_temp.mk_request('16000000-0000-4000-8000-000000000506',
  '16000000-0000-4000-8000-000000000306', 60);
select public.approve_booking_visit(
  '16000000-0000-4000-8000-000000000506', 1,
  '16000000-0000-4000-8000-000000000813');
insert into public.booking_change_requests
  (id, source_visit_id, human_id, kind, channel, reason_code, status, requested_at)
values ('16000000-0000-4000-8000-000000000602',
        '16000000-0000-4000-8000-000000000506',
        '16000000-0000-4000-8000-000000000010', 'cancel', 'website',
        'source_deadline_late', 'pending_staff', now());

select is(
  (select count(*)::int
     from (select public.decide_booking_change_request(
             '16000000-0000-4000-8000-000000000602', 1, 'decline',
             'we cannot fill the slot', '16000000-0000-4000-8000-000000000814')) x
     cross join public.booking_policy_incidents i
    where i.visit_id = '16000000-0000-4000-8000-000000000506'),
  0, 'a declined late request creates no incident');

select set_config(
  'request.jwt.claims',
  '{"sub":"16000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select is(
  public.decide_booking_change_request(
    '16000000-0000-4000-8000-000000000602', 1, 'accept',
    'second editor', '16000000-0000-4000-8000-000000000824')
    ->> 'block_reason',
  'stale_review', 'a second staff member cannot overwrite a changed request');
select is(
  (select revision::text || '|' || status
     from public.booking_change_requests
    where id = '16000000-0000-4000-8000-000000000602'),
  '2|declined', 'the stale request decision appends no mutation');

select * from finish();
rollback;
