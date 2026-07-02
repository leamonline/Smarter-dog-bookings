-- ============================================================
-- Enforce single-seat staff blocks at the write path
--
-- WHY
-- Staff can block ONE seat of a slot (day_settings.overrides, e.g.
-- {"09:00": {"0": "blocked"}}) to cap it at a single dog. That intent
-- was only enforced client-side: validate_booking_calendar rejects a
-- slot only when BOTH seats are blocked, and validate_booking_capacity
-- never read day_settings.overrides at all. Any direct API caller (an
-- authenticated customer token calling create_customer_booking_group,
-- or the service-role WhatsApp paths if their client-side filters
-- failed) could insert into a slot where staff blocked one seat and the
-- other was taken — overbooking a slot staff capped to one dog.
--
-- WHAT
-- 1. validate_booking_capacity(): staff-blocked seats now subtract from
--    the target slot's max seats, inside the existing per-slot advisory
--    lock, before the large-dog and general seat checks (so every
--    downstream comparison inherits the reduction). Semantics, mirrored
--    in BOTH TS engines (src/engine/capacity.ts and
--    supabase/functions/_shared/capacity.ts, changed in the same PR):
--      - a blocked seat ALWAYS removes one usable seat from its own
--        slot, regardless of which seat index a booking happens to
--        render in (previously a booking landing on a blocked index
--        silently displaced the block);
--      - blocks never cascade: they don't count toward the 2-2-1
--        windowing of neighbouring slots or the daily dog cap;
--      - staff_capacity_override bypasses it exactly like the other
--        seat rules (the staff "Override & book" path).
--    Malformed legacy overrides rows (date-keyed slots, numeric seat
--    values) are guarded with the same key/value shape checks as
--    get_blocked_seats (migration 20260627120000).
--    Known corner (fails safe): a stale block on a seat index the 2-2-1
--    cap already excluded (only possible via legacy data, not the UI)
--    now reduces capacity where the UI would not — the trigger rejects,
--    staff can override.
-- 2. get_small_medium_availability(): slot_cap becomes
--    greatest(2 - blocked_count, 0), subsuming the old "0 only when
--    BOTH seats blocked" rule — so the WhatsApp Flow/agent date
--    availability agrees with the trigger.
--
-- Everything else in both function bodies is preserved verbatim from
-- the previous definitions (20260622100000 and 20260702130000).
-- validate_booking_calendar's both-blocked check stays as-is — it fires
-- first (trigger name order) and gives the friendlier "slot is closed"
-- message for a fully-blocked slot.
--
-- Apply individually to prod BY HAND before merging; idempotent.
-- Rollback: re-apply the function bodies from 20260622100000 §3 and
-- 20260702130000 §3.
-- ============================================================

-- ── 1. validate_booking_capacity with the blocked-seat subtraction ──
create or replace function validate_booking_capacity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_enforce       boolean;
  v_override      boolean;
  v_is_staff      boolean;
  v_slots         text[];
  v_exclude_id    uuid;
  v_seats_used    integer[];
  v_slot_index    integer;
  v_max_seats     integer;
  v_used          integer;
  v_seats_needed  integer;
  v_early_close   boolean;
  v_has_large     boolean;
  v_can_share     boolean;
  i               integer;
  v_prev_slot     text;
  v_next_slot     text;
  v_daily_cap     integer;
  v_day_count     integer;
  v_blocked_seats integer;
begin
  v_is_staff := is_staff();

  if not v_is_staff then
    new.staff_capacity_override := false;
  end if;

  if tg_op = 'UPDATE'
     and new.booking_date is not distinct from old.booking_date
     and new.slot is not distinct from old.slot
     and new.size is not distinct from old.size
     and coalesce(new.staff_capacity_override, false)
         is not distinct from coalesce(old.staff_capacity_override, false)
     -- Reactivating a Cancelled booking re-adds a seat, so it is NOT a
     -- metadata-only change — fall through to the full capacity check.
     and not (old.status = 'Cancelled' and new.status is distinct from 'Cancelled')
  then
    return new;
  end if;

  select coalesce(sc.enforce_server_capacity, true)
    into v_enforce
    from salon_config sc
   limit 1;

  if not found then
    v_enforce := true;
  end if;

  v_override := coalesce(new.staff_capacity_override, false) and v_is_staff;
  if v_override then
    new.staff_capacity_override_by := auth.uid();
    new.staff_capacity_override_at := now();
  else
    new.staff_capacity_override_by := null;
    new.staff_capacity_override_at := null;
  end if;

  if not v_enforce then
    perform set_config('booking_diag.v_enforce',  v_enforce::text,  true);
    perform set_config('booking_diag.v_override', v_override::text, true);
    return new;
  end if;

  -- Serialise concurrent inserts/updates targeting the same (date, slot).
  -- Without this, two transactions inserting into the same slot can both
  -- read v_used = N-1 in their BEFORE trigger before either commits,
  -- both pass the (v_used + needed > max) check, and both rows land.
  -- The lock is transaction-scoped (released on commit/rollback) and
  -- keyed per-slot, so different slots remain concurrent.
  perform pg_advisory_xact_lock(
    hashtextextended(new.booking_date::text || '|' || new.slot, 0)
  );

  -- ------------------------------------------------------------------
  -- DAILY DOG CAP (total dogs per day, across every slot).
  --
  -- The per-slot 2-2-1 logic below never looks at the day total, so a day
  -- with spare seats in some slot could be pushed past the salon's real
  -- throughput. Cap the day total for non-staff writes only (customers and
  -- the WhatsApp/AI agent run as a non-staff role); staff are trusted to
  -- overbook deliberately. A cancelled row frees its place, so skip when
  -- the resulting row is Cancelled.
  --
  -- The per-slot lock above does NOT make this race-safe (two inserts into
  -- DIFFERENT slots on the same day wouldn't contend), so take a second
  -- lock keyed on the date alone. Acquired AFTER the slot lock, so the lock
  -- order is identical for every transaction (no deadlock).
  -- ------------------------------------------------------------------
  if not v_is_staff and coalesce(new.status, 'Booked') <> 'Cancelled' then
    perform pg_advisory_xact_lock(
      hashtextextended('booking_day_cap|' || new.booking_date::text, 0)
    );

    select coalesce(sc.daily_dog_cap, 14)
      into v_daily_cap
      from salon_config sc
     limit 1;
    if v_daily_cap is null then
      v_daily_cap := 14;
    end if;

    select count(*)
      into v_day_count
      from bookings b
     where b.booking_date = new.booking_date
       and b.status is distinct from 'Cancelled'
       and b.id <> new.id;

    perform set_config('booking_diag.v_day_count', v_day_count::text, true);
    perform set_config('booking_diag.v_daily_cap', v_daily_cap::text, true);

    if (v_day_count + 1) > v_daily_cap then
      raise exception
        'Day is fully booked: % already has % dog(s) (maximum % per day)',
        to_char(new.booking_date, 'DD Mon YYYY'), v_day_count, v_daily_cap;
    end if;
  end if;

  v_slots := active_slots();

  if tg_op = 'UPDATE' then
    v_exclude_id := new.id;
  else
    v_exclude_id := null;
  end if;

  v_seats_used := array[]::integer[];
  for i in 1..array_length(v_slots, 1) loop
    v_seats_used := v_seats_used || get_seats_used(new.booking_date, v_slots[i], v_exclude_id);
  end loop;

  v_slot_index := null;
  for i in 1..array_length(v_slots, 1) loop
    if v_slots[i] = new.slot then
      v_slot_index := i;
      exit;
    end if;
  end loop;

  if v_slot_index is null then
    raise exception 'Invalid slot: %', new.slot;
  end if;

  v_seats_needed := get_seats_needed(new.size, new.slot);
  v_used         := v_seats_used[v_slot_index];
  v_early_close  := has_large_dog(new.booking_date, '12:00', v_exclude_id);
  v_has_large    := has_large_dog(new.booking_date, new.slot, v_exclude_id);

  v_max_seats := get_max_seats_for_slot(v_slot_index, v_seats_used);

  if new.slot = '13:00' and v_early_close then
    v_max_seats := 0;
  end if;

  -- ------------------------------------------------------------------
  -- STAFF-BLOCKED SEATS (day_settings.overrides).
  --
  -- A blocked seat removes one usable seat from THIS slot only — it never
  -- cascades into the 2-2-1 windowing of neighbours (v_seats_used) or the
  -- daily cap, mirroring the TS engines. Placed before the large-dog and
  -- general checks so every downstream comparison inherits the reduction,
  -- and inside the per-slot advisory lock taken above. The key/value shape
  -- guards skip the known malformed legacy overrides rows (date-keyed
  -- slots, numeric seat values — same pattern as get_blocked_seats).
  -- ------------------------------------------------------------------
  select count(*)
    into v_blocked_seats
    from day_settings ds,
         lateral jsonb_each_text(coalesce(ds.overrides -> new.slot, '{}'::jsonb)) as seat(k, v)
   where ds.setting_date = new.booking_date
     and seat.k ~ '^[0-9]+$'
     and seat.v = 'blocked';

  v_blocked_seats := coalesce(v_blocked_seats, 0);
  v_max_seats     := greatest(v_max_seats - v_blocked_seats, 0);

  -- Stash diagnostics for the AFTER trigger. set_config(local=true)
  -- persists for the rest of the transaction.
  perform set_config('booking_diag.v_enforce',          v_enforce::text,       true);
  perform set_config('booking_diag.v_override',         v_override::text,      true);
  perform set_config('booking_diag.v_used',             v_used::text,          true);
  perform set_config('booking_diag.v_max_seats',        v_max_seats::text,     true);
  perform set_config('booking_diag.v_seats_needed',     v_seats_needed::text,  true);
  perform set_config('booking_diag.v_seats_used_array', v_seats_used::text,    true);
  perform set_config('booking_diag.v_blocked_seats',    v_blocked_seats::text, true);

  if new.size = 'large' then

    if not is_large_dog_slot(new.slot) then
      if not v_is_staff then
        raise exception 'Large dogs need approval for this slot (%)', new.slot;
      end if;
    end if;

    if new.slot = '09:00' then
      if get_seats_used(new.booking_date, '08:30', v_exclude_id) > 0
         and not v_override then
        raise exception '09:00 large dog conditional: 08:30 must be empty';
      end if;
      if get_seats_used(new.booking_date, '10:00', v_exclude_id) > 1
         and not v_override then
        raise exception '09:00 large dog conditional: 10:00 must have 0-1 seats used';
      end if;
    end if;

    if new.slot = '12:00' then
      if get_seats_used(new.booking_date, '13:00', v_exclude_id) > 0
         and not v_override then
        raise exception '12:00 large dog requires 13:00 to be empty (early close)';
      end if;
    end if;

    if new.slot = '13:00' and v_early_close and not v_override then
      raise exception '13:00 is closed — large dog at 12:00 triggered early close';
    end if;

    v_can_share := large_dog_can_share(new.slot);

    if not v_can_share then
      if v_slot_index > 1 then
        v_prev_slot := v_slots[v_slot_index - 1];
        if is_large_dog_slot(v_prev_slot)
           and not large_dog_can_share(v_prev_slot)
           and has_large_dog(new.booking_date, v_prev_slot, v_exclude_id) then
          if not (
            (v_prev_slot = '12:30' and new.slot = '13:00') or
            (v_prev_slot = '13:00' and new.slot = '12:30')
          ) and not v_override then
            raise exception 'Back-to-back large dogs only allowed at 12:30 + 13:00';
          end if;
        end if;
      end if;

      if v_slot_index < array_length(v_slots, 1) then
        v_next_slot := v_slots[v_slot_index + 1];
        if is_large_dog_slot(v_next_slot)
           and not large_dog_can_share(v_next_slot)
           and has_large_dog(new.booking_date, v_next_slot, v_exclude_id) then
          if not (
            (new.slot = '12:30' and v_next_slot = '13:00') or
            (new.slot = '13:00' and v_next_slot = '12:30')
          ) and not v_override then
            raise exception 'Back-to-back large dogs only allowed at 12:30 + 13:00';
          end if;
        end if;
      end if;
    end if;

    if v_can_share and v_has_large and not v_override then
      raise exception 'Only a small/medium dog can share this slot with a large dog';
    end if;

    if not v_can_share and is_large_dog_slot(new.slot) and v_used > 0 and not v_override then
      raise exception 'Large dog fills this slot — already has bookings';
    end if;

    if not v_can_share and is_large_dog_slot(new.slot)
       and v_seats_needed > v_max_seats and not v_override then
      raise exception 'Not enough capacity (2-2-1 rule)';
    end if;

  end if;

  if (v_used + v_seats_needed) > v_max_seats and not v_override then
    if new.size = 'large' then
      raise exception 'Not enough capacity (2-2-1 rule)';
    elsif new.slot = '13:00' and v_early_close then
      raise exception '13:00 closed — early close from 12:00 large dog';
    elsif v_blocked_seats > 0 then
      -- The shortfall involves a staff-blocked seat; "Slot is full" is the
      -- honest customer-facing message (and is already in the client's
      -- capacity-rejection matcher).
      raise exception 'Slot is full';
    elsif v_max_seats < 2 then
      raise exception 'Capped at 1 (2-2-1 rule)';
    else
      raise exception 'Slot is full';
    end if;
  end if;

  if new.size <> 'large' and v_has_large and not v_override then
    if is_large_dog_slot(new.slot) and not large_dog_can_share(new.slot) then
      raise exception 'Large dog fills this slot';
    end if;
  end if;

  return new;
end;
$function$;

comment on function validate_booking_capacity() is
  'BEFORE trigger on bookings: 2-2-1 seat rules, large-dog rules, daily dog cap (non-staff), and staff-blocked seats (day_settings.overrides reduce the target slot''s max seats — no cascade to neighbours or the day cap). Serialised by per-slot + per-date advisory locks. staff_capacity_override (staff only) bypasses the seat rules.';

-- Trigger function is internal-only (docs/migrations.md convention).
revoke all on function validate_booking_capacity() from public, anon, authenticated, service_role;

-- ── 2. get_small_medium_availability: slot_cap honours single blocks ─
-- Body from 20260702130000 with only the slot_cap expression changed:
-- greatest(2 - blocked_count, 0) subsumes the old both-blocked → 0 rule.
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
           coalesce(ds.overrides, '{}'::jsonb) as overrides,
           coalesce(ds.immediate_slots, '{}'::text[]) as immediate_slots
      from days d
      left join day_settings ds on ds.setting_date = d.d
  ),
  open_days as (
    select day_date, overrides, immediate_slots
      from day_info
     where coalesce(
             is_open,
             extract(isodow from day_date) in (1, 2, 3)  -- Mon=1, Tue=2, Wed=3
           ) = true
  ),
  slot_grid as (
    select od.day_date, od.overrides, od.immediate_slots, s.slot
      from open_days od
      cross join unnest(active_slots()) as s(slot)
  ),
  usage as (
    select sg.day_date,
           sg.slot,
           sg.immediate_slots,
           coalesce(
             (select sum(get_seats_needed(b.size, b.slot))
                from bookings b
               where b.booking_date = sg.day_date
                 and b.slot = sg.slot),
             0
           ) as seats_used,
           -- Per-slot soft cap: 2 seats minus any staff-blocked seats
           -- (day_settings.overrides[slot][seat_idx] = 'blocked'). The
           -- key/value shape guards skip malformed legacy rows, same as
           -- get_blocked_seats. Mirrors validate_booking_capacity.
           greatest(
             2 - (
               select count(*)
                 from jsonb_each_text(coalesce(sg.overrides -> sg.slot, '{}'::jsonb)) as seat(k, v)
                where seat.k ~ '^[0-9]+$'
                  and seat.v = 'blocked'
             ),
             0
           )::integer as slot_cap
      from slot_grid sg
  )
  select day_date, slot
    from usage
   where seats_used < slot_cap
     -- Same-day rule (mirrors validate_booking_calendar): today only on a
     -- staff-flagged slot with 30+ minutes to go; past days never. slot
     -- comes from active_slots(), so the ::time cast cannot throw.
     and (
       day_date > ((now() at time zone 'Europe/London'))::date
       or (
         day_date = ((now() at time zone 'Europe/London'))::date
         and slot = any (immediate_slots)
         and (now() at time zone 'Europe/London') <= (day_date + slot::time - interval '30 minutes')
       )
     )
   order by day_date, slot;
$$;

comment on function get_small_medium_availability(date, date) is
  'Free small/medium capacity per (open day, slot) in the range. slot_cap = 2 minus staff-blocked seats (day_settings.overrides). Same-day rows appear only for slots in day_settings.immediate_slots with 30+ minutes before the start (Europe/London); past days are never returned. Internal-only (service_role): feeds the WhatsApp Flow and agent.';

-- Posture from 20260615180000: internal helper, service_role only.
revoke all on function public.get_small_medium_availability(date, date) from public, anon, authenticated;
grant execute on function public.get_small_medium_availability(date, date) to service_role;
