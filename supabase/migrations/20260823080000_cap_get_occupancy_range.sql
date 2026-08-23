-- ============================================================
-- Cap get_occupancy_range at the same 92 days its sibling already enforces.
--
-- Found while writing a disclosure-pinning test for issue #667. This
-- function has never had an unconditional range limit — not in its original
-- definition (20260622110000), and not in its current one (20260726144001),
-- which added a horizon check only inside `if booking_policy_runtime() =
-- 'active'`, with no matching `else`. Its sibling get_blocked_seats
-- (20260627120000) took the opposite shape from day one: an always-on
-- 92-day cap, "so it can't be used to harvest the calendar" per its own
-- comment; 20260726144001 added the same active-policy check to it too, but
-- kept the fallback as an `else` branch rather than replacing it.
--
-- With booking_policy_runtime() inactive — the live state on both prod
-- (nlzhllhkigmsvrzduefz) and staging (btjnxvgkpdbfrrqxvkfj), verified 23
-- August 2026 — the result is that get_occupancy_range(p_from, p_to) has NO
-- range limit at all: any authenticated customer account can request the
-- entire booking history's (booking_date, slot, size) in a single call. No
-- PII crosses that boundary — no name, id, price or status, matching its
-- documented contract — but unbounded (date, slot, size) over the whole
-- history is exactly the calendar-harvesting shape get_blocked_seats' cap
-- exists to prevent, and this function returns strictly more per row.
--
-- The booking wizard only ever requests one 28-day page at a time
-- (DateSelection.tsx, PAGE_SIZE = 28) plus headroom for grouped multi-dog
-- flows, so a 92-day cap — identical to get_blocked_seats' — costs the
-- product nothing. No Edge Function calls this RPC.
--
-- Returned columns and grants are unchanged: this only adds the missing
-- fallback branch. Idempotent (create or replace + unconditional
-- revoke/grant); safe to re-run. Apply to prod and staging individually.
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
  if public.booking_policy_runtime() = 'active' then
    perform smarter_dog_private.assert_customer_range('get_occupancy_range', p_from, p_to);
  else
    -- 28-day wizard window + headroom for grouped multi-dog flows, matching
    -- get_blocked_seats. Anything bigger smells like scraping the calendar.
    if p_to - p_from > 92 then
      raise exception 'get_occupancy_range: range too wide (max 92 days)';
    end if;
  end if;

  return query
  select b.booking_date, b.slot, b.size
  from   bookings b
  where  b.booking_date between p_from and p_to
    and  b.status <> 'Cancelled';
end;
$$;

comment on function public.get_occupancy_range(date, date) is
  'Customer-safe read of (booking_date, slot, size) for non-cancelled bookings in a date range, feeding the client capacity engine so the booking wizard can dim fully-booked days. Security definer (bypasses per-customer bookings RLS); returns no PII/ids/status. Excludes Cancelled to match get_seats_used. Capped at 92 days when the policy-horizon check is inactive, mirroring get_blocked_seats. Granted to authenticated only (booking wizard is login-gated). Mirrors get_slot_occupancy.';

-- Reasserted unconditionally so this migration is self-contained: CREATE OR
-- REPLACE preserves existing grants, but a bare re-apply should not depend
-- on that being true already.
revoke all on function public.get_occupancy_range(date, date) from public;
revoke all on function public.get_occupancy_range(date, date) from anon;
revoke all on function public.get_occupancy_range(date, date) from authenticated;
grant execute on function public.get_occupancy_range(date, date) to authenticated;
