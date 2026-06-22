-- ============================================================
-- Customer read path for slot occupancy across a DATE RANGE.
--
-- WHY: the booking wizard's date step (DateSelection) only knew which days
--   were open/closed (get_open_days), so a fully-booked day looked identical
--   to a free one and stayed selectable — the customer picked it, chose a
--   time, reached "Confirm", and only then hit the daily-cap rejection from
--   validate_booking_capacity. A dead end after four steps.
--
-- WHAT: a range sibling of get_slot_occupancy so the date step can run the
--   same client capacity engine (findGroupedSlots) per day and dim the days
--   the selected dogs can't actually be booked into (daily cap reached, or
--   no slot/size arrangement left).
--
-- Same security posture as get_slot_occupancy: SECURITY DEFINER (bypass the
-- per-customer bookings RLS), returns only (booking_date, slot, size) — no
-- PII / ids / status — excludes Cancelled to match get_seats_used, and is
-- granted to authenticated only (the wizard is login-gated).
--
-- Apply individually to prod; idempotent. Migrations aren't auto-applied.
-- ============================================================

create or replace function public.get_occupancy_range(p_from date, p_to date)
returns table(booking_date date, slot text, size text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_from is null or p_to is null then
    raise exception 'get_occupancy_range: p_from and p_to are required';
  end if;
  if p_to < p_from then
    raise exception 'get_occupancy_range: p_to must be on or after p_from';
  end if;

  return query
  select b.booking_date, b.slot, b.size
  from   bookings b
  where  b.booking_date between p_from and p_to
    and  b.status <> 'Cancelled';
end;
$$;

comment on function public.get_occupancy_range(date, date) is
  'Customer-safe read of (booking_date, slot, size) for non-cancelled bookings in a date range, feeding the client capacity engine so the booking wizard can dim fully-booked days. Security definer (bypasses per-customer bookings RLS); returns no PII/ids/status. Excludes Cancelled to match get_seats_used. Granted to authenticated only (booking wizard is login-gated). Mirrors get_slot_occupancy.';

-- Lock to authenticated only. Supabase auto-grants EXECUTE on new public
-- functions to anon + authenticated + service_role, so revoke explicitly and
-- grant back to authenticated alone — matching get_slot_occupancy.
revoke all on function public.get_occupancy_range(date, date) from public;
revoke all on function public.get_occupancy_range(date, date) from anon;
revoke all on function public.get_occupancy_range(date, date) from authenticated;
grant execute on function public.get_occupancy_range(date, date) to authenticated;
