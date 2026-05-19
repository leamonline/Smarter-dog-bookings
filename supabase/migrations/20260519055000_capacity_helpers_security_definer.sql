-- ============================================================
-- ROOT CAUSE FIX: capacity-check helpers need to bypass RLS.
--
-- Both the 2026-05-19 09:00 (Alfie) and 2026-05-20 10:30 (Alfie
-- again, different date) capacity bypasses had the same actual
-- mechanism, which neither of the two earlier hardening
-- migrations addressed:
--
--   validate_booking_capacity() runs as SECURITY INVOKER, so
--   when it calls get_seats_used() / has_large_dog(), those
--   helpers run with the calling user's RLS context. The
--   bookings table's combined_select_bookings policy filters
--   customers to their own rows. So when a customer (Leam)
--   submits a booking from the customer portal, the trigger's
--   seat count for the target slot never includes any other
--   customer's bookings — Agatha and Charlie were invisible to
--   it. seats_used returned 0, the check (0 + 1 ≤ 2) passed,
--   and the row landed even though the slot was full.
--
-- Reproduced empirically: get_seats_used('2026-05-20','10:30')
-- returned 3 as postgres but 1 as Leam (just his own
-- now-Cancelled row) — confirming RLS was hiding the other
-- customers' bookings from the trigger.
--
-- Making both helpers SECURITY DEFINER + pinned search_path is
-- the safe fix. They are read-only by construction and now see
-- the full table state regardless of the caller's role.
--
-- While we are touching these, exclude Cancelled rows from the
-- seat count — they don't occupy capacity, and counting them
-- would cause phantom-full slots as cancellations accumulate.
-- The previous version of the helpers had no status filter at
-- all, so this also fixes the (currently latent) bug where two
-- customers cancelling and rebooking the same slot would
-- progressively use up its capacity.
--
-- The pg_advisory_xact_lock and audit-diagnostic columns
-- introduced in the previous migration stay — they remain
-- valuable as defense-in-depth and forensics, even though the
-- RLS bug, not a race, was the actual mechanism.
-- ============================================================

create or replace function public.get_seats_used(
  p_date date, p_slot text, p_exclude_id uuid default null
)
returns integer
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare total integer;
begin
  select coalesce(sum(get_seats_needed(b.size, b.slot)), 0) into total
    from bookings b
   where b.booking_date = p_date
     and b.slot = p_slot
     and b.status <> 'Cancelled'
     and (p_exclude_id is null or b.id <> p_exclude_id);
  return total;
end;
$function$;

create or replace function public.has_large_dog(
  p_date date, p_slot text, p_exclude_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
begin
  return exists (
    select 1 from bookings b
     where b.booking_date = p_date
       and b.slot = p_slot
       and b.size = 'large'
       and b.status <> 'Cancelled'
       and (p_exclude_id is null or b.id <> p_exclude_id)
  );
end;
$function$;

revoke all on function public.get_seats_used(date, text, uuid) from public;
grant execute on function public.get_seats_used(date, text, uuid)
  to authenticated, anon, service_role;

revoke all on function public.has_large_dog(date, text, uuid) from public;
grant execute on function public.has_large_dog(date, text, uuid)
  to authenticated, anon, service_role;
