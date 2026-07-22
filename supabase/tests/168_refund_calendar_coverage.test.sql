-- Refund calendar: verified coverage, fail-loud calculation outside it, and
-- escalating advance warnings. Fixtures are rolled back.

begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (id) values ('16800000-0000-4000-8000-000000000001');
insert into public.staff_profiles (user_id, role, display_name) values
  ('16800000-0000-4000-8000-000000000001', 'owner', 'Calendar Owner');
select set_config('request.jwt.claims',
  '{"sub":"16800000-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- ── 1-3: verified coverage backs an ordinary refund date ───────────

select ok(
  (select coverage_id from public.refund_due_at_verified(now())) is not null,
  'a refund date inside verified coverage names the coverage that backs it');

select is(
  (select calendar_source from public.refund_due_at_verified(now())),
  'gov.uk/bank-holidays', 'the audit records which calendar was used');

select is(
  (select due_at::date from public.refund_due_at_verified(
     timestamptz '2026-12-24 09:00:00 Europe/London')),
  date '2027-01-05',
  'the precise customer refund date is retained across the Christmas holidays');

-- ── 4-5: outside verified coverage it fails loudly ─────────────────

select throws_ok(
  $$ select * from public.refund_due_at_verified(
       timestamptz '2035-06-01 09:00:00 Europe/London') $$,
  'P0001', 'refund_calendar_coverage_missing',
  'a date beyond verified coverage raises rather than guessing');

-- The maximum recorded holiday is NOT the test. Coverage is an explicit
-- assertion, so a date after the asserted range fails even though weekday
-- arithmetic alone would happily produce an answer.
select ok(
  (select max(holiday_date) from public.booking_refund_non_working_days)
    < date '2035-06-01'
  and public.refund_due_at(timestamptz '2035-06-01 09:00:00 Europe/London') is not null,
  'raw refund_due_at would still return a date — which is exactly why the verified wrapper exists');

-- ── 6-9: escalating advance warning ────────────────────────────────

select is(
  public.booking_refund_calendar_status() ->> 'severity',
  'ok', 'three years of seeded coverage starts healthy');

-- Shrink coverage to cross each threshold in turn. The horizon (180 days)
-- plus a fortnight is the date range refunds may need.
create or replace function pg_temp.severity_at(p_headroom int)
returns text language plpgsql as $$
declare v_needed date;
begin
  v_needed := (statement_timestamp() at time zone 'Europe/London')::date
              + (select booking_horizon_days from public.booking_policy_settings where singleton)
              + 14;
  update public.booking_refund_calendar_coverage
     set covers_to = v_needed + p_headroom;
  return public.booking_refund_calendar_status() ->> 'severity';
end;
$$;

select is(pg_temp.severity_at(150), 'notice',
  '180 days of headroom raises a notice');
select is(pg_temp.severity_at(60), 'warning',
  '90 days of headroom escalates to a warning');
select is(pg_temp.severity_at(15), 'urgent',
  '30 days of headroom escalates to urgent');
select is(pg_temp.severity_at(-1), 'critical',
  'no headroom at all is critical');

-- ── 10-12: owner-only extension ────────────────────────────────────

-- Order-independent: build the rejection date from the CURRENT maximum so an
-- earlier test that moved coverage cannot make this pass or fail by accident.
select throws_ok(
  format($f$ select public.extend_refund_calendar(
       '[]'::jsonb, '2030-01-01', %L::date) $f$,
    (select max(covers_to) from public.booking_refund_calendar_coverage)),
  '22023', null,
  'coverage that does not extend beyond the current range is rejected');

select throws_ok(
  $$ select public.extend_refund_calendar(
       '[]'::jsonb, '   ', date '2099-12-31') $$,
  '22023', null,
  'a blank calendar version is rejected so the assertion stays auditable');

select lives_ok(
  $$ select public.extend_refund_calendar(
       jsonb_build_array(
         jsonb_build_object('date','2030-06-03','label','Exceptional bank holiday')),
       '2030-06-01', date '2099-12-31') $$,
  'the owner can record an exceptional holiday and re-assert coverage');

select ok(
  exists (select 1 from public.booking_refund_non_working_days
           where holiday_date = date '2030-06-03'),
  'the exceptional holiday is recorded');

select * from finish();
rollback;
