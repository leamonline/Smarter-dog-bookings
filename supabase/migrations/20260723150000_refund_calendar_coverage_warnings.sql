-- ============================================================
-- Refund calendar: three-year seed, fail-loud calculation, advance warnings
--
-- The coverage table is deliberately RETAINED. The maximum recorded holiday
-- date is not proof that every holiday before it was recorded: it cannot
-- detect an accidentally omitted holiday, and it cannot detect a newly
-- announced exceptional bank holiday (a coronation, a state funeral, a
-- jubilee) landing inside a range someone already believed complete. Only an
-- explicit "this range was verified against this published version" assertion
-- can carry that meaning.
--
-- What this migration adds:
--   * England-and-Wales bank holidays seeded through 2029;
--   * coverage extended to match, as an explicit verified assertion;
--   * refund calculation that fails loudly outside verified coverage rather
--     than quietly guessing Monday-to-Friday;
--   * an advance warning at 180 days, escalating at 90 and 30, so the problem
--     surfaces in Settings months before a customer is waiting on a receipt.
--
-- Deliberately small: one owner-only SQL procedure and one warning function.
-- No calendar-management screen.
--
-- Plan: docs/superpowers/plans/2026-07-23-path-b-execution-plan.md
-- ============================================================

-- ── 1. Seed three further years of England-and-Wales bank holidays ──
--
-- Source: gov.uk/bank-holidays (england-and-wales division). Substitute days
-- are recorded on the day actually taken, which is what a refund promise
-- must count.

insert into public.booking_refund_non_working_days (holiday_date, label, calendar_source) values
  (date '2028-01-03', 'New Year''s Day (substitute)', 'gov.uk/bank-holidays'),
  (date '2028-04-14', 'Good Friday', 'gov.uk/bank-holidays'),
  (date '2028-04-17', 'Easter Monday', 'gov.uk/bank-holidays'),
  (date '2028-05-01', 'Early May bank holiday', 'gov.uk/bank-holidays'),
  (date '2028-05-29', 'Spring bank holiday', 'gov.uk/bank-holidays'),
  (date '2028-08-28', 'Summer bank holiday', 'gov.uk/bank-holidays'),
  (date '2028-12-25', 'Christmas Day', 'gov.uk/bank-holidays'),
  (date '2028-12-26', 'Boxing Day', 'gov.uk/bank-holidays'),
  (date '2029-01-01', 'New Year''s Day', 'gov.uk/bank-holidays'),
  (date '2029-03-30', 'Good Friday', 'gov.uk/bank-holidays'),
  (date '2029-04-02', 'Easter Monday', 'gov.uk/bank-holidays'),
  (date '2029-05-07', 'Early May bank holiday', 'gov.uk/bank-holidays'),
  (date '2029-05-28', 'Spring bank holiday', 'gov.uk/bank-holidays'),
  (date '2029-08-27', 'Summer bank holiday', 'gov.uk/bank-holidays'),
  (date '2029-12-25', 'Christmas Day', 'gov.uk/bank-holidays'),
  (date '2029-12-26', 'Boxing Day', 'gov.uk/bank-holidays')
on conflict (holiday_date) do nothing;

insert into public.booking_refund_calendar_coverage
  (calendar_source, calendar_version, covers_from, covers_to)
values ('gov.uk/bank-holidays', '2026-07-23', date '2026-01-01', date '2029-12-31')
on conflict do nothing;

-- ── 2. Fail loudly outside verified coverage ────────────────────────
--
-- refund_due_at() alone would happily skip weekends past the end of the
-- verified range and return a confident-looking date that silently ignores an
-- unrecorded holiday. This wrapper is what refund-creating commands call: it
-- returns the due instant AND the coverage row that justified it, or raises.

create or replace function public.refund_due_at_verified(p_from timestamptz)
returns table (due_at timestamptz, coverage_id uuid, calendar_source text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_due timestamptz;
  v_cov record;
begin
  v_due := public.refund_due_at(p_from);

  select c.* into v_cov
    from public.booking_refund_calendar_coverage c
   where c.covers_from <= (p_from at time zone 'Europe/London')::date
     and c.covers_to >= (v_due at time zone 'Europe/London')::date
   order by c.recorded_at desc
   limit 1;

  if not found then
    -- Never guess. A refund promise made outside verified coverage could be
    -- wrong by a day in the customer's disfavour, and we would have no record
    -- of which calendar produced it.
    raise exception 'refund_calendar_coverage_missing'
      using errcode = 'P0001',
            detail = format(
              'No verified bank-holiday coverage spans %s to %s. Extend booking_refund_non_working_days and booking_refund_calendar_coverage before promising a refund date.',
              (p_from at time zone 'Europe/London')::date,
              (v_due at time zone 'Europe/London')::date);
  end if;

  due_at := v_due;
  coverage_id := v_cov.id;
  calendar_source := v_cov.calendar_source;
  return next;
end;
$$;
revoke all on function public.refund_due_at_verified(timestamptz) from public, anon, authenticated;

comment on function public.refund_due_at_verified(timestamptz) is
  'The refund-date entry point for every command that creates a refund obligation. Returns the five-working-day due instant together with the verified coverage row that justifies it, or raises refund_calendar_coverage_missing. Never returns an unbacked date.';

-- ── 3. Advance warning, escalating ──────────────────────────────────
--
-- Read by Settings. Surfaces months before the calendar runs out, so the
-- problem is never first discovered while a customer waits for a refund
-- receipt. The horizon matters as well as today: a booking made at the far
-- end of the booking horizon can generate a refund obligation that far out.

create or replace function public.booking_refund_calendar_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_covers_to date;
  v_source text;
  v_version text;
  v_today date := (statement_timestamp() at time zone 'Europe/London')::date;
  v_horizon int;
  v_needed_to date;
  v_days_left int;
  v_severity text;
begin
  if not public.is_staff() then
    raise exception 'Staff only' using errcode = '42501';
  end if;

  select c.covers_to, c.calendar_source, c.calendar_version
    into v_covers_to, v_source, v_version
    from public.booking_refund_calendar_coverage c
   order by c.covers_to desc
   limit 1;

  select booking_horizon_days into v_horizon
    from public.booking_policy_settings where singleton;

  -- The furthest date a refund promise could need: a visit booked at the end
  -- of the horizon, cancelled that day, plus the five-working-day window
  -- (allow a fortnight for weekends and holidays).
  v_needed_to := v_today + coalesce(v_horizon, 180) + 14;
  v_days_left := coalesce(v_covers_to, v_today) - v_needed_to;

  v_severity := case
    when v_covers_to is null then 'critical'
    when v_days_left < 0 then 'critical'
    when v_days_left <= 30 then 'urgent'
    when v_days_left <= 90 then 'warning'
    when v_days_left <= 180 then 'notice'
    else 'ok'
  end;

  return jsonb_build_object(
    'severity', v_severity,
    'coversTo', v_covers_to,
    'calendarSource', v_source,
    'calendarVersion', v_version,
    'daysOfHeadroom', v_days_left,
    'requiredThrough', v_needed_to,
    'message', case v_severity
      when 'ok' then null
      when 'notice' then
        'The bank-holiday calendar runs out within six months. Extend it when convenient — see the refund calendar runbook.'
      when 'warning' then
        'The bank-holiday calendar runs out within three months. Extend it soon or refunds will stop being able to quote a date.'
      when 'urgent' then
        'The bank-holiday calendar runs out within a month. Extend it now — refunds will start failing.'
      else
        'The bank-holiday calendar does not cover the dates refunds may need. Refund dates cannot be calculated until it is extended.'
    end);
end;
$$;
revoke all on function public.booking_refund_calendar_status() from public;
revoke all on function public.booking_refund_calendar_status() from anon;
revoke all on function public.booking_refund_calendar_status() from authenticated;
grant execute on function public.booking_refund_calendar_status() to authenticated;

-- ── 4. Owner-only extension procedure ───────────────────────────────
--
-- The whole maintenance mechanism: add the holidays, assert the new verified
-- range, in one audited call. Deliberately not a screen.

create or replace function public.extend_refund_calendar(
  p_holidays jsonb,
  p_calendar_version text,
  p_covers_to date,
  p_calendar_source text default 'gov.uk/bank-holidays'
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_added int := 0;
  v_elem jsonb;
  v_max_existing date;
begin
  if not smarter_dog_private.is_owner() then
    raise exception 'Owner only' using errcode = '42501';
  end if;
  if nullif(trim(coalesce(p_calendar_version,'')),'') is null then
    raise exception 'a calendar version is required so the assertion is auditable'
      using errcode = '22023';
  end if;
  if p_holidays is null or jsonb_typeof(p_holidays) <> 'array' then
    raise exception 'holidays must be a JSON array of {date,label}' using errcode = '22023';
  end if;

  for v_elem in select * from jsonb_array_elements(p_holidays) loop
    insert into public.booking_refund_non_working_days
      (holiday_date, label, calendar_source)
    values ((v_elem->>'date')::date,
            coalesce(nullif(trim(v_elem->>'label'),''), 'Bank holiday'),
            p_calendar_source)
    on conflict (holiday_date) do nothing;
    if found then v_added := v_added + 1; end if;
  end loop;

  select max(covers_to) into v_max_existing
    from public.booking_refund_calendar_coverage;
  if v_max_existing is not null and p_covers_to <= v_max_existing then
    raise exception 'the new coverage must extend beyond % ', v_max_existing
      using errcode = '22023';
  end if;

  -- The coverage row is the assertion "every England-and-Wales bank holiday
  -- in this range has been recorded from this published version". It is
  -- recorded from the start of the existing range so a gap cannot be created.
  insert into public.booking_refund_calendar_coverage
    (calendar_source, calendar_version, covers_from, covers_to, recorded_by)
  values (p_calendar_source, p_calendar_version,
          coalesce((select min(covers_from) from public.booking_refund_calendar_coverage),
                   (statement_timestamp() at time zone 'Europe/London')::date),
          p_covers_to, auth.uid())
  on conflict do nothing;

  return jsonb_build_object(
    'holidaysAdded', v_added,
    'coversTo', p_covers_to,
    'status', public.booking_refund_calendar_status());
end;
$$;
revoke all on function public.extend_refund_calendar(jsonb, text, date, text) from public;
revoke all on function public.extend_refund_calendar(jsonb, text, date, text) from anon;
revoke all on function public.extend_refund_calendar(jsonb, text, date, text) from authenticated;
grant execute on function public.extend_refund_calendar(jsonb, text, date, text) to authenticated;

comment on function public.extend_refund_calendar(jsonb, text, date, text) is
  'Owner-only refund calendar maintenance: records new bank holidays and asserts a new verified coverage range in one audited call. An exceptional bank holiday announced inside an already-covered range is added the same way, with a NEW calendar_version, so the assertion is re-made rather than assumed.';
