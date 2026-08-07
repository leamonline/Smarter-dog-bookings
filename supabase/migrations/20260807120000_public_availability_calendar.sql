-- ============================================================
-- Public month-calendar availability for the marketing website.
--
-- The first public read exposed only explicit day_settings overrides. That
-- was enough for a short open/closed strip, but not for a real month view:
-- callers still had to recreate the Mon-Wed default and could not tell an
-- open day with space from a day at the salon's daily dog cap.
--
-- This replacement keeps the same zero-argument RPC and the existing
-- is_open column for backwards compatibility, while returning one resolved
-- row for every date from today through 180 days ahead plus a boolean
-- is_fully_booked status. It deliberately returns no booking count, dog,
-- slot, day_settings override, or extra-slot detail.
-- ============================================================

drop function if exists public.get_public_open_days();

create function public.get_public_open_days()
returns table(
  setting_date date,
  is_open boolean,
  is_fully_booked boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with bounds as (
    select (statement_timestamp() at time zone 'Europe/London')::date as today
  ),
  days as (
    select generated.day_date::date as setting_date
    from bounds b
    cross join lateral generate_series(
      b.today,
      b.today + 180,
      interval '1 day'
    ) as generated(day_date)
  ),
  daily_limit as (
    select coalesce(
      (select sc.daily_dog_cap
       from public.salon_config sc
       order by sc.updated_at desc
       limit 1),
      14
    )::bigint as dog_cap
  ),
  booking_totals as (
    select b.booking_date, count(*)::bigint as booking_count
    from public.bookings b
    cross join bounds range_bounds
    where b.booking_date between range_bounds.today and range_bounds.today + 180
      and b.status is distinct from 'Cancelled'
    group by b.booking_date
  ),
  resolved as (
    select
      d.setting_date,
      coalesce(
        ds.is_open,
        extract(isodow from d.setting_date) in (1, 2, 3)
      ) as is_open,
      coalesce(bt.booking_count, 0) as booking_count,
      dl.dog_cap
    from days d
    left join public.day_settings ds on ds.setting_date = d.setting_date
    left join booking_totals bt on bt.booking_date = d.setting_date
    cross join daily_limit dl
  )
  select
    r.setting_date,
    r.is_open,
    r.is_open and r.booking_count >= r.dog_cap as is_fully_booked
  from resolved r
  order by r.setting_date;
$$;

comment on function public.get_public_open_days() is
  'Public (anon) calendar status for today through 180 days ahead. Returns only resolved date, open/closed, and at-daily-cap status. Closed days always report is_fully_booked=false. No booking counts, customer/slot data, or day_settings internals are exposed. SECURITY DEFINER bypasses the underlying staff/customer RLS for this curated projection only.';

revoke all on function public.get_public_open_days() from public;
revoke all on function public.get_public_open_days() from anon;
revoke all on function public.get_public_open_days() from authenticated;
grant execute on function public.get_public_open_days() to anon, authenticated, service_role;
