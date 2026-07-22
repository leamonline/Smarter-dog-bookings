-- Authoritative booking policy rules: typed settings, runtime seam, fixed
-- previous-day-15:00 deadline, URL validation, audited writes and customer
-- capabilities. Synthetic fixtures are rolled back.

begin;
create extension if not exists pgtap with schema extensions;
select plan(56);

-- ── Fixtures ────────────────────────────────────────────────────────

insert into auth.users (id) values
  ('14500000-0000-4000-8000-000000000001'), -- owner staff
  ('14500000-0000-4000-8000-000000000002'), -- non-owner staff
  ('14500000-0000-4000-8000-000000000003'), -- customer one
  ('14500000-0000-4000-8000-000000000004'); -- customer two

insert into public.staff_profiles (user_id, role, display_name) values
  ('14500000-0000-4000-8000-000000000001', 'owner', 'Fixture Owner'),
  ('14500000-0000-4000-8000-000000000002', 'staff', 'Fixture Staff');

insert into public.humans (id, name, surname, customer_user_id) values
  ('14500000-0000-4000-8000-000000000010', 'RulesFixture145', 'One',
   '14500000-0000-4000-8000-000000000003'),
  ('14500000-0000-4000-8000-000000000020', 'RulesFixture145', 'Two',
   '14500000-0000-4000-8000-000000000004');

insert into public.dogs (id, name, breed, size, human_id) values
  ('14500000-0000-4000-8000-000000000011', 'Delta', 'Poodle', 'small',
   '14500000-0000-4000-8000-000000000010');

select set_config(
  'request.jwt.claims',
  '{"sub":"14500000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

-- ── 1-4: defaults and shape ────────────────────────────────────────

select is(
  (select booking_horizon_days from public.booking_policy_settings where singleton),
  180, 'the signed default horizon is 180 days');
select is(
  (select auto_confirm from public.booking_policy_settings where singleton),
  true, 'auto-confirm defaults on');
select is(
  (select deposit_hold_hours from public.booking_policy_settings where singleton),
  12::smallint, 'the deposit hold window defaults to 12 hours');
select is(
  public.current_booking_rules() -> 'customerPortal' ->> 'allowRescheduling',
  'true', 'rescheduling starts enabled to preserve existing availability');

-- ── 5-7: role gates ────────────────────────────────────────────────

select lives_ok(
  $$ select public.current_booking_rules() $$,
  'staff can read the full booking rules');

select set_config(
  'request.jwt.claims',
  '{"sub":"14500000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
select throws_ok(
  $$ select public.current_booking_rules() $$,
  '42501', null, 'customers cannot read the staff rules projection');
select ok(
  not (public.current_customer_booking_rules() ? 'depositBank')
  and public.current_customer_booking_rules()::text !~ 'ContentHash'
  and not (public.current_customer_booking_rules() ? 'autoConfirm'),
  'the customer rules projection excludes bank, hash and approval internals');

-- Non-owner staff cannot write rules.
select set_config(
  'request.jwt.claims',
  '{"sub":"14500000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select throws_ok(
  $$ select public.update_booking_rules('{"autoConfirm":false}'::jsonb) $$,
  '42501', null, 'ordinary staff cannot save booking rules');
select set_config(
  'request.jwt.claims',
  '{"sub":"14500000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

-- ── 9-16: update_booking_rules validation ──────────────────────────

select throws_ok(
  $$ select public.update_booking_rules('[]'::jsonb) $$,
  '22023', null, 'a non-object payload fails closed');
select throws_ok(
  $$ select public.update_booking_rules('{"minCancellationHours":24}'::jsonb) $$,
  '22023', null, 'unknown keys are rejected (minimum notice is gone)');
select throws_ok(
  $$ select public.update_booking_rules('{"bookingHorizonDays":0}'::jsonb) $$,
  '22023', null, 'horizon 0 is out of bounds');
select throws_ok(
  $$ select public.update_booking_rules('{"bookingHorizonDays":731}'::jsonb) $$,
  '22023', null, 'horizon 731 is out of bounds');
select lives_ok(
  $$ select public.update_booking_rules('{"bookingHorizonDays":1}'::jsonb) $$,
  'horizon 1 is the lower bound');
select lives_ok(
  $$ select public.update_booking_rules('{"bookingHorizonDays":730}'::jsonb) $$,
  'horizon 730 is the technical upper bound');
select throws_ok(
  $$ select public.update_booking_rules('{"depositHoldHours":18}'::jsonb) $$,
  '22023', null, 'deposit hold hours outside the choice set are rejected');
select lives_ok(
  $$ select public.update_booking_rules('{"depositHoldHours":36,"bookingHorizonDays":180}'::jsonb) $$,
  'a valid hold window and the signed horizon save');

-- ── 17-22: bank details: complete set or full clear, never partial ──

select throws_ok(
  $$ update public.booking_policy_settings set bank_account_name = 'Partial' where singleton $$,
  '23514', null, 'direct partial bank write (name only) is rejected');
select throws_ok(
  $$ update public.booking_policy_settings set bank_sort_code = '12-34-56' where singleton $$,
  '23514', null, 'direct partial bank write (sort code only) is rejected');
select throws_ok(
  $$ update public.booking_policy_settings set bank_account_number = '12345678' where singleton $$,
  '23514', null, 'direct partial bank write (account number only) is rejected');
select throws_ok(
  $$ select public.update_booking_rules(
       '{"depositBank":{"accountName":"Smarter Dog","sortCode":"12-34-56"}}'::jsonb) $$,
  '22023', null, 'a two-field bank save is rejected');
select lives_ok(
  $$ select public.update_booking_rules(
       '{"depositBank":{"accountName":"Smarter Dog","sortCode":"12-34-56","accountNumber":"12345678"}}'::jsonb) $$,
  'a complete bank save succeeds');
select is(
  (select count(*)::int from public.booking_deposit_bank_instruction_versions
    where account_name = 'Smarter Dog'),
  1, 'a complete bank save records one immutable instruction version');

-- ── 23-27: deposit terms publication pairing ───────────────────────

select throws_ok(
  $$ select public.update_booking_rules('{"depositTermsVersion":"v1"}'::jsonb) $$,
  '22023', null, 'a version without its content hash is rejected');
select throws_ok(
  $$ select public.update_booking_rules(
       ('{"depositTermsVersion":"  ","depositTermsContentHash":"' ||
        repeat('a', 64) || '"}')::jsonb) $$,
  '22023', null, 'a blank version label is rejected');
select throws_ok(
  $$ select public.update_booking_rules(
       ('{"depositTermsVersion":"v1","depositTermsContentHash":"' ||
        upper(repeat('a', 64)) || '"}')::jsonb) $$,
  '22023', null, 'a non-lowercase content hash is rejected');
select lives_ok(
  $$ select public.update_booking_rules(
       ('{"depositTermsVersion":"2026-07 v1","depositTermsContentHash":"' ||
        repeat('a', 64) || '"}')::jsonb) $$,
  'a complete publication pair saves');
select is(
  public.current_booking_rules() ->> 'depositTermsVersion',
  '2026-07 v1', 'the staff projection shows the recorded publication version');

-- ── 28-33: URL validation and normalisation ────────────────────────

select ok(not smarter_dog_private.is_valid_booking_terms_url('http://smarterdog.co.uk/terms'),
  'plain http is rejected');
select ok(not smarter_dog_private.is_valid_booking_terms_url('https://user:pw@smarterdog.co.uk/'),
  'credentials in the URL are rejected');
select ok(not smarter_dog_private.is_valid_booking_terms_url('https://smarterdog.co.uk/a b'),
  'whitespace is rejected');
select ok(not smarter_dog_private.is_valid_booking_terms_url('https://smarterdog.co.uk:70000/'),
  'an out-of-range port is rejected');
select ok(
  smarter_dog_private.is_valid_booking_terms_url('https://smarterdog.co.uk:8443/a/b?c=d#e')
  and not smarter_dog_private.is_valid_booking_terms_url('https://' || repeat('x', 2050))
  and not smarter_dog_private.is_valid_booking_terms_url(null),
  'a full valid URL passes; overlength and null return strict false');
select is(
  smarter_dog_private.normalise_booking_terms_url('https://SmarterDog.co.uk:443/Terms'),
  'https://smarterdog.co.uk/Terms',
  'normalisation lowercases the host and drops the default port');

-- ── 34-39: the fixed previous-day 15:00 deadline ───────────────────

select is(
  public.change_deadline_for('previous_day_1500_v1', date '2026-10-26', '08:30'),
  timestamptz '2026-10-25 15:00:00 Europe/London',
  'fixed previous-calendar-day deadline survives the autumn DST change');
select is(
  public.change_deadline_for('previous_day_1500_v1', date '2026-03-30', '09:00'),
  timestamptz '2026-03-29 15:00:00 Europe/London',
  'fixed deadline survives the spring DST change');
select is(
  public.change_deadline_for('previous_day_1500_v1', date '2026-09-01', '10:00'),
  timestamptz '2026-08-31 15:00:00 Europe/London',
  'a bank holiday Monday does not move the deadline');
select is(
  public.change_deadline_for('previous_day_1500_v1', date '2026-09-07', '08:30'),
  timestamptz '2026-09-06 15:00:00 Europe/London',
  'a Sunday deadline is not adjusted');
select is(
  public.change_deadline_for('previous_day_1500_v1', date '2026-10-26', '13:00'),
  public.change_deadline_for('previous_day_1500_v1', date '2026-10-26', '08:30'),
  'every slot on one date shares one deadline');
select is(
  public.change_deadline_for('legacy_24h', date '2026-03-29', '08:30'),
  timestamptz '2026-03-28 08:30:00 Europe/London',
  'the grandfathered legacy rule keeps London wall-clock subtraction across DST');

-- ── 40-41: exact 15:00 is on time ──────────────────────────────────

select ok(
  timestamptz '2026-10-25 15:00:00 Europe/London'
    <= public.change_deadline_for('previous_day_1500_v1', date '2026-10-26', '13:00'),
  'exactly 15:00:00 is on time');
select ok(
  timestamptz '2026-10-25 15:00:00.000001 Europe/London'
    > public.change_deadline_for('previous_day_1500_v1', date '2026-10-26', '13:00'),
  'one microsecond past 15:00 is late');

-- ── 42-45: intake kill switch and audit ────────────────────────────

select throws_ok(
  $$ select public.set_customer_booking_intake_enabled(false, '  ') $$,
  '22023', null, 'the emergency intake pause requires a reason');
select lives_ok(
  $$ select public.set_customer_booking_intake_enabled(false, 'incident drill') $$,
  'the owner can pause customer intake with a reason');
select is(
  public.current_customer_booking_rules() ->> 'intakeEnabled',
  'false', 'the customer projection reflects the paused intake');
select ok(
  (select count(*) >= 2 from public.booking_policy_settings_audit),
  'every successful save appends an audit row');

-- ── 46-49: visit actionability and customer capabilities ───────────

insert into public.bookings (id, booking_date, slot, dog_id, size, service, status) values
  ('14500000-0000-4000-8000-000000000101', current_date + 30, '08:30',
   '14500000-0000-4000-8000-000000000011', 'small', 'Full Groom', 'Booked');

select set_config(
  'request.jwt.claims',
  '{"sub":"14500000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
select is(
  (public.get_customer_booking_visit_capabilities(
     (select visit_id from public.bookings
       where id = '14500000-0000-4000-8000-000000000101'))
   -> 'cancel' ->> 'allowed'),
  'true', 'an on-time confirmed visit can be cancelled by its owner');

select set_config(
  'request.jwt.claims',
  '{"sub":"14500000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);
select throws_ok(
  format($f$ select public.get_customer_booking_visit_capabilities(%L) $f$,
    (select visit_id from public.bookings
      where id = '14500000-0000-4000-8000-000000000101')),
  'P0001', null, 'another customer gets a non-disclosing not-found');

set local role authenticated;
select throws_ok(
  format($f$ select public.visit_actionability(%L, 'cancel', now()) $f$,
    (select visit_id from public.bookings
      where id = '14500000-0000-4000-8000-000000000101')),
  '42501', null, 'the timestamp-taking helper is not callable by customers');
reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"14500000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

-- Switch precedence: past deadline outranks a disabled switch.
select lives_ok(
  $$ select public.update_booking_rules(
       '{"customerPortal":{"allowCancellations":false}}'::jsonb) $$,
  'the owner can disable customer cancellations');
update public.booking_visits
   set customer_change_deadline_at = now() - interval '1 hour'
 where id = (select visit_id from public.bookings
              where id = '14500000-0000-4000-8000-000000000101');
select is(
  (public.visit_actionability(
     (select visit_id from public.bookings
       where id = '14500000-0000-4000-8000-000000000101'),
     'cancel', now()) ->> 'reasonCode'),
  'deadline_passed',
  'a passed deadline has reason precedence over the disabled switch');

-- ── 52+: runtime states via the owner latch (rolled back) ──────────

select is(public.booking_policy_runtime(), 'inactive', 'the runtime starts inactive');

select set_config('smarter_dog.booking_policy_latch', 'previous_day_1500_v1', true);
update public.booking_policy_versions
   set effective_at = timestamptz '2026-01-01 00:00:00 Europe/London'
 where code = 'previous_day_1500_v1';

select is(
  public.booking_policy_runtime_at(timestamptz '2025-12-31 23:59:59 Europe/London'),
  'scheduled', 'before the effective instant the runtime is scheduled');
select is(
  public.booking_policy_runtime_at(timestamptz '2026-01-01 00:00:00 Europe/London'),
  'active', 'the exact effective instant is active');

-- With an active runtime the availability RPCs enforce the inclusive horizon.
select lives_ok(
  format($f$ select count(*) from public.get_open_days(%L, %L) $f$,
    (now() at time zone 'Europe/London')::date,
    (now() at time zone 'Europe/London')::date + 180),
  'day 180 is inside the inclusive horizon');
select throws_ok(
  format($f$ select count(*) from public.get_open_days(%L, %L) $f$,
    (now() at time zone 'Europe/London')::date,
    (now() at time zone 'Europe/London')::date + 181),
  'P0001', 'booking_horizon_exceeded',
  'day 181 exceeds the inclusive horizon');

-- Active runtime refuses to leave booking creation without Terms.
update public.booking_policy_settings
   set current_terms_publication_id = null where singleton;
select throws_ok(
  $$ select public.update_booking_rules(
       '{"depositTermsVersion":null,"depositTermsContentHash":null}'::jsonb) $$,
  'P0001', 'terms_publication_required_active',
  'clearing the Terms publication at active runtime is rejected');

select * from finish();
rollback;
