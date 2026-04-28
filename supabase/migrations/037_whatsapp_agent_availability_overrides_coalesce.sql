-- 037_whatsapp_agent_availability_overrides_coalesce.sql
--
-- Polish on top of 036. Normalises day_settings.overrides to '{}'::jsonb
-- inside get_small_medium_availability so its override-shape check stays
-- symmetric with the large_dog_can_fit_on_day helper (036:127, which
-- already coalesces). The JSON traversal is NULL-safe today, so this is
-- a no-op for production behaviour — but the explicit coalesce avoids
-- surprises if the override-shape predicate is ever extended.
--
-- Only get_small_medium_availability changes here. Everything else from
-- 036 (including large_dog_can_fit_on_day) is left untouched.

create or replace function get_small_medium_availability(
  p_from date,
  p_to   date
)
returns table (booking_date date, slot text)
language sql
stable
security definer
set search_path = public
as $$
  with days as (
    select d::date as d
      from generate_series(p_from, p_to, interval '1 day') as g(d)
  ),
  day_info as (
    select d.d as day_date,
           ds.is_open,
           coalesce(ds.overrides, '{}'::jsonb) as overrides
      from days d
      left join day_settings ds on ds.setting_date = d.d
  ),
  open_days as (
    select day_date, overrides
      from day_info
     where coalesce(
             is_open,
             extract(isodow from day_date) in (1, 2, 3)  -- Mon=1, Tue=2, Wed=3
           ) = true
  ),
  slot_grid as (
    select od.day_date, od.overrides, s.slot
      from open_days od
      cross join unnest(active_slots()) as s(slot)
  ),
  usage as (
    select sg.day_date,
           sg.slot,
           coalesce(
             (select sum(get_seats_needed(b.size, b.slot))
                from bookings b
               where b.booking_date = sg.day_date
                 and b.slot = sg.slot),
             0
           ) as seats_used,
           -- Per-slot soft cap. Default 2 (one "small/medium seat unit"
           -- per slot, with room for two small/medium dogs). Treated as 0
           -- only when staff has explicitly blocked BOTH seats via
           -- day_settings.overrides[slot][seat_idx] = 'blocked'.
           case
             when (sg.overrides -> sg.slot ->> '0') = 'blocked'
              and (sg.overrides -> sg.slot ->> '1') = 'blocked'
             then 0
             else 2
           end as slot_cap
      from slot_grid sg
  )
  select day_date, slot
    from usage
   where seats_used < slot_cap
   order by day_date, slot;
$$;

-- Comments and grants are inherited from 034 (the original CREATE
-- statement). create or replace doesn't touch them.

-- Rollback:
--   To revert: re-apply migration 036 to restore the no-coalesce body.
