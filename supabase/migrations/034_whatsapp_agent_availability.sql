-- 034_whatsapp_agent_availability.sql
--
-- Read-only RPC used by the WhatsApp AI agent to cite real slots when
-- proposing booking_action for small/medium dogs. Deliberately ignores
-- the 2-2-1 rule and all large-dog capacity logic — the 006 trigger is
-- the safety net, and staff approves every booking. See the spec at
-- docs/superpowers/specs/2026-04-24-whatsapp-agent-availability-design.md

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
    select d.d as day_date, ds.is_open, ds.overrides
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
           -- Per-slot capacity override from day_settings.overrides, shape:
           --   {"YYYY-MM-DD": {"HH:MM": <int cap>}}
           -- Default cap is 2 (one "small/medium seat unit" per slot, with room
           -- for two small/medium dogs; mirrors the 006 trigger's soft cap).
           coalesce(
             (sg.overrides -> (sg.day_date::text) ->> sg.slot)::int,
             2
           ) as slot_cap
      from slot_grid sg
  )
  select day_date, slot
    from usage
   where seats_used < slot_cap
   order by day_date, slot;
$$;

comment on function get_small_medium_availability(date, date) is
  'Returns (date, slot) pairs that are bookable for a small or medium dog in the given date range. Excludes the 2-2-1 rule and all large-dog capacity logic by design — staff approval is the safety net for edge cases.';

revoke all on function get_small_medium_availability(date, date) from public;
grant execute on function get_small_medium_availability(date, date) to authenticated, service_role;

-- Rollback:
--   drop function if exists get_small_medium_availability(date, date);
