-- ============================================================
-- Customer read path for slot occupancy (capacity engine input)
--
-- Customer-facing availability is computed client-side by the
-- capacity engine (src/engine/capacity.ts), which needs the
-- (slot, size) of every non-cancelled booking on a date. But the
-- bookings table's RLS limits a customer to their OWN rows (the
-- bookings -> dogs -> humans.customer_user_id = auth.uid() chain),
-- so the engine saw incomplete data and offered slots as available
-- that were actually full from OTHER customers' bookings —
-- confusing "available until checkout" failures.
--
-- (The validate_booking_capacity BEFORE trigger already rejects the
-- final insert via the SECURITY DEFINER helpers get_seats_used /
-- has_large_dog, so this was a UX bug, not a data-integrity hole.)
--
-- This function bridges the gap: SECURITY DEFINER so it sees ALL
-- rows, returns ONLY (slot, size) — no PII, no ids, no status — and
-- excludes Cancelled rows so its seat math matches the trigger's
-- get_seats_used / has_large_dog helpers exactly. Granted to
-- authenticated only: the booking wizard is gated behind a logged-in
-- customer with a matched human record (see src/CustomerApp.jsx), so
-- anon never reaches this path. Mirrors the get_open_days precedent.
-- ============================================================

create or replace function public.get_slot_occupancy(p_date date)
returns table(slot text, size text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_date is null then
    raise exception 'get_slot_occupancy: date is required';
  end if;

  return query
  select b.slot, b.size
  from   bookings b
  where  b.booking_date = p_date
    and  b.status <> 'Cancelled';
end;
$$;

comment on function public.get_slot_occupancy(date) is
  'Customer-safe read of (slot, size) for non-cancelled bookings on a date, feeding the client capacity engine. Security definer so it bypasses the per-customer bookings RLS; returns no PII/ids/status. Excludes Cancelled to match get_seats_used/has_large_dog. Granted to authenticated only (booking wizard is login-gated).';

-- Lock to authenticated only. Supabase's default privileges auto-grant
-- EXECUTE on new public functions to anon + authenticated + service_role,
-- so a bare "revoke ... from public" (as get_open_days originally did)
-- leaves anon able to call it. Explicitly revoke anon + authenticated, then
-- grant EXECUTE back to authenticated alone — matching the locked-down
-- customer RPCs (update_customer_dog, add_customer_trusted_human).
revoke all on function public.get_slot_occupancy(date) from public;
revoke all on function public.get_slot_occupancy(date) from anon;
revoke all on function public.get_slot_occupancy(date) from authenticated;
grant execute on function public.get_slot_occupancy(date) to authenticated;
