-- 036_whatsapp_agent_availability_honour_seat_overrides.sql
--
-- Updates 034 (get_small_medium_availability) and 035
-- (large_dog_can_fit_on_day) to read day_settings.overrides in the
-- actual seat-level shape used by the frontend
-- (src/types/index.ts:120-131 and src/engine/capacity.ts:119-178):
--
--   day_settings.overrides = { "<slot HH:MM>": { "<seat_idx>": "blocked" | "open" } }
--
-- We honour ONLY the "both seats blocked" case as cap=0 (staff has
-- manually closed the slot). Single-seat blocks and "open" expansions
-- are NOT honoured — staff approval at booking time catches those.
--
-- The 006 capacity trigger does NOT read overrides; for the agent's
-- purposes we deliberately diverge from the trigger here so the agent
-- doesn't promise customers slots that staff have manually closed.

-- ============================================================
-- get_small_medium_availability (replaces 034 body)
-- ============================================================

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
           -- Per-slot soft cap. Default 2 (one "small/medium seat unit"
           -- per slot, with room for two small/medium dogs). Treated as 0
           -- only when staff has explicitly blocked BOTH seats via
           -- day_settings.overrides[slot][seat_idx] = 'blocked'.
           case
             when (sg.overrides -> sg.slot ->> '0') = 'blocked'
              and (sg.overrides -> sg.slot ->> '1') = 'blocked'
             then 0
             else 2
           end as slot_cap
      from slot_grid sg
  )
  select day_date, slot
    from usage
   where seats_used < slot_cap
   order by day_date, slot;
$$;

-- ============================================================
-- large_dog_can_fit_on_day (re-add seat-block check to 035 helper)
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

  -- Pull day_settings.overrides once. Shape (per src/types/index.ts):
  --   { "<slot HH:MM>": { "<seat_idx>": "blocked" | "open" } }
  -- We honour the "both seats blocked" case as fully blocked.
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
    -- Skip slot if staff has manually blocked both seats via day_settings.overrides.
    if (v_overrides -> v_slot ->> '0') = 'blocked'
       and (v_overrides -> v_slot ->> '1') = 'blocked' then
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

-- Comments and grants are inherited from 034/035 (the original CREATE
-- statements). create or replace doesn't touch them.

-- Rollback:
--   To revert: re-apply migration 035 to restore the no-override-read body
--   and re-apply migration 034 to restore the (broken) override-read body.
