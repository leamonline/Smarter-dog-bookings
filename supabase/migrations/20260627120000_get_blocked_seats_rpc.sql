-- ============================================================
-- Customer read path for staff-blocked seats (capacity engine input)
--
-- Staff can block individual seats on a slot; these live in the
-- day_settings.overrides JSONB as { "<slot>": { "<seatIndex>": "blocked" } }.
-- They are NOT bookings, so get_slot_occupancy can't surface them, and
-- day_settings itself is staff-only (the staff_*_day_settings RLS
-- policies). The customer booking wizard therefore couldn't see a blocked
-- seat and offered it as available — the same class of "available until
-- checkout" UX bug get_slot_occupancy fixed for cross-customer bookings.
--
-- This function bridges the gap for the customer client: SECURITY DEFINER
-- so it bypasses the staff-only RLS, returns ONLY blocked seat positions
-- (setting_date, slot, seat_index) — never the "open" overrides, extra_slots
-- or any other staff field — and is range-capped so it can't be used to
-- harvest the calendar. Mirrors the get_open_days / get_slot_occupancy
-- precedents (security posture + grants).
-- ============================================================

create or replace function public.get_blocked_seats(p_start date, p_end date)
returns table(setting_date date, slot text, seat_index int)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_start is null or p_end is null then
    raise exception 'get_blocked_seats: start and end are required';
  end if;
  if p_end < p_start then
    raise exception 'get_blocked_seats: end must be on or after start';
  end if;
  -- 28-day wizard window + headroom for grouped multi-dog flows.
  -- Anything bigger smells like scraping the calendar.
  if p_end - p_start > 92 then
    raise exception 'get_blocked_seats: range too wide (max 92 days)';
  end if;

  -- The seat.value = 'blocked' and numeric-key guards skip legacy malformed
  -- overrides rows that exist in prod (a handful were written date-keyed with
  -- numeric values, e.g. {"2026-04-06":{"09:00":0}}). Without the
  -- seat.key ~ '^[0-9]+$' guard the (seat.key)::int cast could choke on a
  -- time-like key; with it those rows are simply ignored.
  return query
  select d.setting_date, kv.key as slot, (seat.key)::int as seat_index
  from   day_settings d,
         lateral jsonb_each(d.overrides)   as kv(key, value),
         lateral jsonb_each_text(kv.value) as seat(key, value)
  where  d.setting_date between p_start and p_end
    and  seat.value = 'blocked'
    and  seat.key ~ '^[0-9]+$';
end;
$$;

comment on function public.get_blocked_seats(date, date) is
  'Customer-safe read of staff-blocked seat positions (day_settings.overrides = "blocked") within a short forward window. Returns only (setting_date, slot, seat_index); "open" overrides and all other staff fields stay hidden. Security definer to bypass the staff-only day_settings RLS. Granted to authenticated only (booking wizard is login-gated).';

-- Lock to authenticated only. Supabase's default privileges auto-grant
-- EXECUTE on new public functions to anon + authenticated + service_role,
-- so revoke anon + authenticated explicitly, then grant EXECUTE back to
-- authenticated alone — matching get_slot_occupancy.
revoke all on function public.get_blocked_seats(date, date) from public;
revoke all on function public.get_blocked_seats(date, date) from anon;
revoke all on function public.get_blocked_seats(date, date) from authenticated;
grant execute on function public.get_blocked_seats(date, date) to authenticated;
