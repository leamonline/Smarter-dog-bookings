-- 035_whatsapp_agent_large_dog_availability.sql
--
-- Read-only helpers used by the WhatsApp AI agent to give honest
-- day-level availability for large dogs. The 006 trigger remains the
-- safety net for any insert; this file mirrors a subset of its rules
-- so the agent can name candidate days without ever proposing a
-- booking_action or specific slot for a large dog.
--
-- Spec: docs/superpowers/specs/2026-04-27-whatsapp-agent-large-dog-availability-design.md

-- ============================================================
-- large_dog_can_fit_on_day(p_date)
--
-- Returns true if at least one of the 5 large-dog allowed slots
-- (08:30, 09:00, 12:00, 12:30, 13:00) on p_date passes every rule
-- the 006 trigger runs for size='large'. Returns false otherwise.
--
-- Composes the 006 helpers active_slots, get_seats_used,
-- has_large_dog, is_large_dog_slot, large_dog_can_share,
-- get_max_seats_for_slot and get_seats_needed.
-- ============================================================

create or replace function large_dog_can_fit_on_day(p_date date)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_enforce       boolean;
  v_slots         text[];
  v_seats_array   integer[];
  v_overrides     jsonb;
  v_large_slots   text[] := array['08:30', '09:00', '12:00', '12:30', '13:00'];
  v_slot          text;
  v_slot_index    integer;
  v_seats_used    integer;
  v_max_seats     integer;
  v_early_close   boolean;
  v_has_large     boolean;
  v_can_share     boolean;
  v_seats_needed  integer;
  v_slot_cap      integer;
  v_prev_slot     text;
  v_next_slot     text;
  i               integer;
begin
  -- Safety flag: if global enforcement disabled, fail open (matches trigger).
  select coalesce(sc.enforce_server_capacity, true)
    into v_enforce
    from salon_config sc
    limit 1;

  if not coalesce(v_enforce, true) then
    return true;
  end if;

  -- Pull day_settings.overrides once for the per-slot soft cap.
  select ds.overrides into v_overrides
    from day_settings ds
   where ds.setting_date = p_date;
  v_overrides := coalesce(v_overrides, '{}'::jsonb);

  -- Build seats_used array for ALL slots on this date (used by 2-2-1 rule).
  v_slots := active_slots();
  v_seats_array := array[]::integer[];
  for i in 1..array_length(v_slots, 1) loop
    v_seats_array := v_seats_array || get_seats_used(p_date, v_slots[i], null);
  end loop;

  v_early_close := has_large_dog(p_date, '12:00', null);

  -- Try each large-dog allowed slot in order; return true on first that fits.
  foreach v_slot in array v_large_slots loop
    -- Per-slot soft cap from day_settings.overrides; cap=0 means closed.
    v_slot_cap := coalesce(
      (v_overrides -> (p_date::text) ->> v_slot)::int,
      2
    );
    if v_slot_cap = 0 then
      continue;
    end if;

    -- Find slot index in active_slots() for 2-2-1 lookup.
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
  'Returns true if at least one of the 5 large-dog allowed slots passes the same rules the 006 trigger checks. Read-only; the trigger remains the source of truth on insert.';

revoke all on function large_dog_can_fit_on_day(date) from public;
grant execute on function large_dog_can_fit_on_day(date) to authenticated, service_role;

-- ============================================================
-- get_large_dog_day_availability(p_from, p_to)
--
-- Returns one row per OPEN day in [p_from, p_to], with
-- has_capacity = large_dog_can_fit_on_day(day). Closed days are
-- omitted entirely (mirrors get_small_medium_availability's filter).
-- ============================================================

create or replace function get_large_dog_day_availability(
  p_from date,
  p_to   date
)
returns table (booking_date date, has_capacity boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_day date;
begin
  for v_day in
    with days as (
      select g::date as d
        from generate_series(p_from, p_to, interval '1 day') as g
    )
    select d.d
      from days d
      left join day_settings ds on ds.setting_date = d.d
     where coalesce(
             ds.is_open,
             extract(isodow from d.d) in (1, 2, 3)  -- Mon=1, Tue=2, Wed=3
           ) = true
  loop
    booking_date := v_day;
    has_capacity := large_dog_can_fit_on_day(v_day);
    return next;
  end loop;
  return;
end;
$$;

comment on function get_large_dog_day_availability(date, date) is
  'Returns (date, has_capacity) for each open day in the range. has_capacity is true if at least one large-dog slot would pass the 006 trigger rules.';

revoke all on function get_large_dog_day_availability(date, date) from public;
grant execute on function get_large_dog_day_availability(date, date) to authenticated, service_role;

-- Rollback:
--   drop function if exists get_large_dog_day_availability(date, date);
--   drop function if exists large_dog_can_fit_on_day(date);
