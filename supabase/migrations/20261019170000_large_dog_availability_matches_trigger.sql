-- ============================================================
-- large_dog_can_fit_on_day() offers a day only when the capacity trigger would
-- accept a large dog on it, whatever the kill switch says.
--
-- WHAT WAS WRONG (found 19 October 2026, follow-up to #1039 and #1040)
--   get_large_dog_day_availability() — what the WhatsApp agent reads for large
--   dogs — asks this function whether a day has room. It differed from
--   validate_booking_capacity() in three ways:
--
--   1. Kill switch. With salon_config.enforce_server_capacity = false it
--      returned true for every open day. The switch relaxes the trigger for
--      every insert, but the owner decided (#1040) that it must never loosen
--      what customers are offered; get_small_medium_availability() already
--      behaves that way.
--   2. Daily dog cap. Never checked, so a day already at the cap could be
--      listed for a large dog. The trigger refuses any non-staff booking there.
--   3. Staff-blocked seats. Never subtracted, so a slot staff had blocked
--      (including every slot inside a partial-day closure) could be listed.
--   4. Same-day rules. For today the caller only checked that SOME slot was
--      flagged for last-minute booking and 30+ minutes away; this function
--      could then answer yes through a large-dog slot that was not flagged, or
--      already past its cutoff. validate_booking_calendar() refuses that slot.
--
--   All four only ever OFFERED days the database then refused; none hid real
--   capacity.
--
-- WHAT THIS CHANGES
--   The body is 20260702170000's, with these edits, each copying the reads of
--   validate_booking_capacity() or validate_booking_calendar():
--     - the enforce_server_capacity early return is removed;
--     - a past day, or a day that is not open, returns false;
--     - a day at salon_config.daily_dog_cap (14 when unset; seats counted with
--       booking_occupies_seat) returns false;
--     - for today, only large-dog slots flagged in day_settings.immediate_slots
--       and still 30+ minutes away (Europe/London) are candidates;
--     - each candidate slot's ceiling has its staff-blocked seats subtracted,
--       clamped at zero, after the early-close rule — the trigger's order.
--   Signature, return type, grants and every other rule are unchanged, and
--   get_large_dog_day_availability() is untouched (it calls this function).
--
-- ROLLOUT
--   CREATE OR REPLACE with an unchanged signature: old and new application code
--   both work against either version. It must still be applied to production
--   BY HAND before the pull request merges (docs/migrations.md). Idempotent. No
--   data is written. Rollback: re-apply the definition from
--   20260702170000_extra_slots_bookable.sql.
-- ============================================================

create or replace function large_dog_can_fit_on_day(p_date date)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_slots         text[];
  v_seats_array   integer[];
  v_large_slots   text[] := array['08:30', '09:00', '12:00', '12:30', '13:00'];
  v_slot          text;
  v_slot_index    integer;
  v_seats_used    integer;
  v_max_seats     integer;
  v_early_close   boolean;
  v_has_large     boolean;
  v_can_share     boolean;
  v_seats_needed  integer;
  v_prev_slot     text;
  v_next_slot     text;
  v_daily_cap     integer;
  v_day_count     integer;
  v_blocked_seats integer;
  v_is_open       boolean;
  v_immediate     text[];
  v_now_ldn       timestamp := (now() at time zone 'Europe/London');
  v_today_ldn     date      := ((now() at time zone 'Europe/London'))::date;
  i               integer;
begin
  -- No kill-switch shortcut: enforce_server_capacity relaxes the trigger, but
  -- never what customers are offered (decision in #1040).

  -- Calendar, read exactly as validate_booking_calendar() reads it.
  if p_date is null or p_date < v_today_ldn then
    return false;
  end if;

  select ds.is_open, ds.immediate_slots
    into v_is_open, v_immediate
    from day_settings ds
   where ds.setting_date = p_date;

  if not coalesce(v_is_open, extract(isodow from p_date) in (1, 2, 3)) then
    return false;
  end if;

  -- Same day: only staff-flagged slots with 30+ minutes to go are bookable.
  if p_date = v_today_ldn then
    v_large_slots := array(
      select u.slot
        from unnest(v_large_slots) with ordinality as u(slot, ord)
       where u.slot = any (coalesce(v_immediate, '{}'::text[]))
         and v_now_ldn <= (p_date + u.slot::time - interval '30 minutes')
       order by u.ord
    );
  end if;

  -- Daily dog cap, read exactly as validate_booking_capacity() reads it.
  select coalesce((select sc.daily_dog_cap from salon_config sc limit 1), 14)
    into v_daily_cap;

  select count(*)
    into v_day_count
    from bookings b
   where b.booking_date = p_date
     and public.booking_occupies_seat(b.status);

  if v_day_count >= v_daily_cap then
    return false;
  end if;

  -- Build seats_used array for ALL slots on this date (used by 2-2-1 rule) —
  -- the per-date grid, so extra-slot occupancy caps neighbours correctly.
  v_slots := active_slots_for(p_date);
  v_seats_array := array[]::integer[];
  for i in 1..array_length(v_slots, 1) loop
    v_seats_array := v_seats_array || get_seats_used(p_date, v_slots[i], null);
  end loop;

  v_early_close := has_large_dog(p_date, '12:00', null);

  -- Try each large-dog allowed slot in order; return true on first that fits.
  foreach v_slot in array v_large_slots loop
    -- Find slot index in the grid for 2-2-1 lookup.
    v_slot_index := null;
    for i in 1..array_length(v_slots, 1) loop
      if v_slots[i] = v_slot then
        v_slot_index := i;
        exit;
      end if;
    end loop;
    if v_slot_index is null then
      continue;
    end if;

    v_seats_used    := v_seats_array[v_slot_index];
    v_max_seats     := get_max_seats_for_slot(v_slot_index, v_seats_array);
    v_has_large     := has_large_dog(p_date, v_slot, null);
    v_can_share     := large_dog_can_share(v_slot);
    v_seats_needed  := get_seats_needed('large', v_slot);

    -- Early close: large dog at 12:00 means 13:00 capacity is 0.
    if v_slot = '13:00' and v_early_close then
      v_max_seats := 0;
    end if;

    -- Staff-blocked seats, counted with the same key/value guards as the
    -- trigger (malformed legacy rows are skipped).
    select count(*)
      into v_blocked_seats
      from day_settings ds,
           lateral jsonb_each_text(coalesce(ds.overrides -> v_slot, '{}'::jsonb)) as seat(k, v)
     where ds.setting_date = p_date
       and seat.k ~ '^[0-9]+$'
       and seat.v = 'blocked';

    v_max_seats := greatest(v_max_seats - coalesce(v_blocked_seats, 0), 0);

    -- Rule 5: 09:00 conditional.
    if v_slot = '09:00' then
      if get_seats_used(p_date, '08:30', null) > 0 then continue; end if;
      if get_seats_used(p_date, '10:00', null) > 1 then continue; end if;
    end if;

    -- Rule 6: 12:00 conditional (only OK if 13:00 is empty).
    if v_slot = '12:00' then
      if get_seats_used(p_date, '13:00', null) > 0 then continue; end if;
    end if;

    -- Rule 7: 13:00 early close.
    if v_slot = '13:00' and v_early_close then
      continue;
    end if;

    -- Rule 10: back-to-back, only for non-shareable slots (12:30, 13:00).
    if not v_can_share then
      -- Previous slot
      if v_slot_index > 1 then
        v_prev_slot := v_slots[v_slot_index - 1];
        if is_large_dog_slot(v_prev_slot)
           and not large_dog_can_share(v_prev_slot)
           and has_large_dog(p_date, v_prev_slot, null) then
          if not (
            (v_prev_slot = '12:30' and v_slot = '13:00') or
            (v_prev_slot = '13:00' and v_slot = '12:30')
          ) then
            continue;
          end if;
        end if;
      end if;
      -- Next slot
      if v_slot_index < array_length(v_slots, 1) then
        v_next_slot := v_slots[v_slot_index + 1];
        if is_large_dog_slot(v_next_slot)
           and not large_dog_can_share(v_next_slot)
           and has_large_dog(p_date, v_next_slot, null) then
          if not (
            (v_slot = '12:30' and v_next_slot = '13:00') or
            (v_slot = '13:00' and v_next_slot = '12:30')
          ) then
            continue;
          end if;
        end if;
      end if;
    end if;

    -- Rule 8: shareable slot, second large dog blocked.
    if v_can_share and v_has_large then
      continue;
    end if;

    -- Rule 9: full-takeover slot must be empty.
    if not v_can_share and v_seats_used > 0 then
      continue;
    end if;

    -- Rule 11: general capacity check (covers Rule 9's seats_needed > max_seats too).
    if (v_seats_used + v_seats_needed) > v_max_seats then
      continue;
    end if;

    -- All rules passed for this slot.
    return true;
  end loop;

  return false;
end;
$$;

comment on function large_dog_can_fit_on_day(date) is
  'Returns true if at least one of the 5 large-dog allowed slots passes the same rules the capacity and calendar triggers check for a non-staff booking: open future day, same-day flag and 30-minute cutoff (Europe/London), 2-2-1 over the per-date grid, large-dog slot rules, early close, staff-blocked seats and the daily dog cap. Ignores salon_config.enforce_server_capacity by design: the kill switch never loosens customer-facing availability. Read-only; the trigger remains the source of truth on insert.';

revoke all on function large_dog_can_fit_on_day(date) from public, anon, authenticated;
grant execute on function large_dog_can_fit_on_day(date) to service_role;
