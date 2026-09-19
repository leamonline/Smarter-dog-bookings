-- ============================================================
-- No-show frees its seat, exactly as Cancelled always did
--
-- Companion to 20260919090000, and the half of it that actually carries risk.
--
-- Before that migration a no-show WAS a Cancelled row. Every occupancy rule in
-- the database is written as `status <> 'Cancelled'`, so no-shows already fell
-- out of capacity, availability and the duplicate-booking guards. Splitting
-- No-show into its own status without touching those rules would silently
-- reclassify every no-show as an ACTIVE booking:
--
--   * get_seats_used / get_slot_occupancy / get_occupancy_range / has_large_dog
--     would count it, so the 2-2-1 engine would see a phantom dog and refuse
--     real bookings in that slot;
--   * validate_booking_capacity would enforce against it;
--   * the customer availability RPCs would show the slot as full.
--
-- This migration widens every one of those predicates. It changes NO
-- behaviour: it restores the behaviour the salon already had.
--
-- The predicate lives in ONE function, booking_occupies_seat(), so a future
-- status cannot be added to the lifecycle while half the occupancy rules keep
-- an out-of-date list. The partial unique indexes in 20260919090000
-- deliberately spell the list out instead of calling the helper: an index
-- predicate must be immutable, and changing a function a live index depends on
-- is a much worse trap than repeating two literals.
--
-- Idempotent. Read-path functions only; no data is written.
-- ============================================================

begin;

-- ── The single shared predicate ──────────────────────────────────────
create or replace function public.booking_occupies_seat(p_status text)
returns boolean
language sql
immutable
parallel safe
set search_path = public
as $$
  -- NULL/absent status defaults to Booked: legacy rows and freshly inserted
  -- rows are active until told otherwise, matching isCountableBooking() in
  -- src/engine/bookingRules.ts.
  select coalesce(p_status, 'Booked') <> all (array['Cancelled'::text, 'No-show'::text]);
$$;

comment on function public.booking_occupies_seat(text) is
  'True when a booking still holds its seat. False for the two terminal statuses, Cancelled and No-show. The single source of truth for occupancy in SQL; mirrors isActiveBooking() in src/constants/salon.ts.';

-- ── Seats used in a slot ─────────────────────────────────────────────
create or replace function public.get_seats_used(p_date date, p_slot text, p_exclude_id uuid default null::uuid)
returns integer
language plpgsql
stable security definer
set search_path = public, pg_temp
as $$
declare total integer;
begin
  select coalesce(sum(get_seats_needed(b.size, b.slot)), 0) into total
    from bookings b
   where b.booking_date = p_date
     and b.slot = p_slot
     and public.booking_occupies_seat(b.status)
     and (p_exclude_id is null or b.id <> p_exclude_id);
  return total;
end;
$$;

-- ── Occupancy for one day ────────────────────────────────────────────
create or replace function public.get_slot_occupancy(p_date date)
returns table(slot text, size text)
language plpgsql
stable security definer
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
    and  public.booking_occupies_seat(b.status);
end;
$$;

-- ── Large-dog presence in a slot ─────────────────────────────────────
create or replace function public.has_large_dog(p_date date, p_slot text, p_exclude_id uuid default null::uuid)
returns boolean
language plpgsql
stable security definer
set search_path = public, pg_temp
as $$
begin
  return exists (
    select 1 from bookings b
     where b.booking_date = p_date
       and b.slot = p_slot
       and b.size = 'large'
       and public.booking_occupies_seat(b.status)
       and (p_exclude_id is null or b.id <> p_exclude_id)
  );
end;
$$;

-- ── Occupancy across a range (customer availability) ─────────────────
-- Body preserved verbatim apart from the status predicate, including the
-- range guards and the policy-runtime branch.
create or replace function public.get_occupancy_range(p_from date, p_to date)
returns table(booking_date date, slot text, size text)
language plpgsql
stable security definer
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
    and  public.booking_occupies_seat(b.status);
end;
$$;

-- ── Grants ───────────────────────────────────────────────────────────
-- REPLACE preserves existing grants, but a bare re-apply must not depend on
-- that being true already, and Supabase auto-grants EXECUTE on new public
-- functions to anon — so "revoke from public" alone would leave anon able to
-- read the salon's occupancy. Stated explicitly for every function re-issued
-- above; enforced by src/security/customerCapacityReadDisclosure.test.ts.
revoke all on function public.get_seats_used(date, text, uuid) from public;
revoke all on function public.get_seats_used(date, text, uuid) from anon;
revoke all on function public.get_seats_used(date, text, uuid) from authenticated;
grant execute on function public.get_seats_used(date, text, uuid) to authenticated;

revoke all on function public.get_slot_occupancy(date) from public;
revoke all on function public.get_slot_occupancy(date) from anon;
revoke all on function public.get_slot_occupancy(date) from authenticated;
grant execute on function public.get_slot_occupancy(date) to authenticated;

revoke all on function public.has_large_dog(date, text, uuid) from public;
revoke all on function public.has_large_dog(date, text, uuid) from anon;
revoke all on function public.has_large_dog(date, text, uuid) from authenticated;
grant execute on function public.has_large_dog(date, text, uuid) to authenticated;

revoke all on function public.get_occupancy_range(date, date) from public;
revoke all on function public.get_occupancy_range(date, date) from anon;
revoke all on function public.get_occupancy_range(date, date) from authenticated;
grant execute on function public.get_occupancy_range(date, date) to authenticated;

revoke all on function public.booking_occupies_seat(text) from public;
revoke all on function public.booking_occupies_seat(text) from anon;
revoke all on function public.booking_occupies_seat(text) from authenticated;
grant execute on function public.booking_occupies_seat(text) to authenticated;

commit;
