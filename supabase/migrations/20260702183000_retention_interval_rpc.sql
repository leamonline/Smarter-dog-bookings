-- ============================================================
-- get_dog_grooming_intervals(): per-dog visit cadence  (retention report 2D)
--
-- The retention report needs each dog's typical gap between grooms (median of
-- the gaps between its completed bookings) plus its last groom date/service.
-- Computing that client-side would mean fetching every dog's full booking
-- history — exactly what the brief says to avoid. This pushes the aggregation
-- into SQL: one grouped scan of completed bookings, median via percentile_cont.
--
-- SECURITY INVOKER (the default): the aggregation runs under the caller's RLS,
-- and an explicit is_staff() guard makes it staff-locked (a non-staff caller
-- gets 42501, never a partial cross-customer leak). No SECURITY DEFINER, so no
-- privilege-escalation surface — staff already read all bookings via RLS.
--
-- median_interval_days is NULL for a dog with fewer than 2 completed bookings
-- (no gap to measure); the report applies the "needs >= 3 visits, else the
-- 8-12 week default band" rule client-side.
--
-- Additive + idempotent.
-- ============================================================

create or replace function public.get_dog_grooming_intervals()
returns table (
  dog_id               uuid,
  visit_count          int,
  median_interval_days numeric,
  last_groomed_date    date,
  first_groomed_date   date,
  last_service         text
)
language plpgsql
stable
set search_path = public
as $$
begin
  if not is_staff() then
    raise exception 'get_dog_grooming_intervals: staff only' using errcode = '42501';
  end if;

  return query
  with completed as (
    select
      b.dog_id,
      b.booking_date,
      b.service,
      b.booking_date - lag(b.booking_date) over (
        partition by b.dog_id order by b.booking_date
      ) as gap_days
    from public.bookings b
    where b.status = 'Completed'
  )
  select
    c.dog_id,
    count(*)::int as visit_count,
    (percentile_cont(0.5) within group (order by c.gap_days)
       filter (where c.gap_days is not null))::numeric as median_interval_days,
    max(c.booking_date) as last_groomed_date,
    min(c.booking_date) as first_groomed_date,
    (array_agg(c.service order by c.booking_date desc, c.service))[1] as last_service
  from completed c
  group by c.dog_id;
end;
$$;

comment on function public.get_dog_grooming_intervals() is
  'Per-dog grooming cadence for the retention report: visit_count, median gap (days) between completed bookings, first/last groom date, last service. Staff-locked via an is_staff() guard; SECURITY INVOKER so RLS applies. median_interval_days is NULL below 2 completed visits.';

-- New public functions default-grant EXECUTE to anon + authenticated; lock down
-- and grant only authenticated (the internal is_staff() guard restricts to staff).
revoke execute on function public.get_dog_grooming_intervals() from public, anon, authenticated;
grant execute on function public.get_dog_grooming_intervals() to authenticated;
