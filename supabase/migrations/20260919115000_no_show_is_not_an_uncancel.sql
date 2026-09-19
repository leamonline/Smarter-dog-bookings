-- ============================================================
-- No-show is not an un-cancellation
--
-- Completes the terminal-status split begun in 20260919090000/090100/090200.
-- This must be applied BEFORE the contract migration (20260919120000), which
-- is how the defect was found: production refused the contract migration with
--
--   ERROR: SDC03: booking_visit_already_cancelled
--   CONTEXT: PL/pgSQL function validate_booking_capacity() line 59 at RAISE
--
-- and rolled the whole thing back, leaving all 631 rows untouched.
--
-- WHAT WAS WRONG
--
-- validate_booking_capacity() carries a group guard: you may not revive a
-- booking that belongs to a group somebody has already cancelled. It was
-- written when 'Cancelled' was the only terminal status, so it spells that
-- idea as two literal comparisons:
--
--   new.status is distinct from 'Cancelled'        -- "is being revived"
--   old.status = 'Cancelled'                       -- "was cancelled"
--
-- 20260919090200 deliberately left this guard alone, reasoning that a
-- cancelled sibling and a no-show sibling are different events. That reasoning
-- was right about the SIBLING test and wrong about these two, because with
-- No-show as a status of its own, `Cancelled -> No-show` now satisfies both:
-- the new status is "distinct from Cancelled", and the old status "was
-- cancelled". So reclassifying a cancelled row as a no-show reads to this
-- guard as reviving it, and is refused.
--
-- That is not only a migration problem. It is live in production right now:
-- since the new frontend deployed, marking a grouped booking as a no-show
-- raises SDC03 whenever any sibling in that group is cancelled. Nobody has hit
-- it because the salon is closed.
--
-- WHAT CHANGES
--
-- Both predicates now ask the question the guard actually means — is this
-- booking taking a seat? — through the same booking_occupies_seat() predicate
-- the rest of the split uses:
--
--   new.status is distinct from 'Cancelled'  ->  booking_occupies_seat(new.status)
--   old.status = 'Cancelled'                 ->  not booking_occupies_seat(old.status)
--
-- Cancelled -> No-show is then terminal-to-terminal, occupies nothing, and the
-- guard stays quiet. Every other transition keeps its existing behaviour:
--
--   Cancelled -> Booked   raises, as before (new occupies, old did not)
--   No-show   -> Booked   raises, which is what it did pre-split when a
--                         no-show WAS a Cancelled row
--   Booked    -> Booked   still raises if a sibling is cancelled
--   Cancelled -> Cancelled still quiet
--   INSERT                unchanged (the first arm is UPDATE-only)
--
-- The SIBLING test is still `b.status = 'Cancelled'` exactly as 20260919090200
-- left it: a dog that failed to turn up should not block reviving another dog
-- in the same group.
--
-- Idempotent: create or replace only. No data is written.
-- ============================================================

create or replace function public.validate_booking_capacity()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
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

  if tg_op = 'INSERT'
     or (
       tg_op = 'UPDATE'
       and (
         new.group_id is distinct from old.group_id
         or new.booking_date is distinct from old.booking_date
       )
     )
  then
    perform pg_advisory_xact_lock(
      hashtextextended(
        'customer_booking_cancellation|'
          || coalesce(new.group_id, new.id)::text
          || '|'
          || new.booking_date::text,
        0
      )
    );
  end if;

  -- The guard means "is this booking taking a seat?" — see 20260919115000.
  -- The SIBLING test below stays literal: a cancelled group and a no-show dog
  -- are different events.
  if new.group_id is not null
     and public.booking_occupies_seat(new.status)
     and (
       (tg_op = 'UPDATE' and not public.booking_occupies_seat(old.status))
       or exists (
         select 1
           from public.bookings b
          where b.id <> new.id
            and b.group_id = new.group_id
            and b.booking_date = new.booking_date
            and b.status = 'Cancelled'
       )
     )
  then
    raise exception 'booking_visit_already_cancelled'
      using errcode = 'SDC03';
  end if;

  if tg_op = 'UPDATE'
     and new.booking_date is not distinct from old.booking_date
     and new.slot is not distinct from old.slot
     and new.size is not distinct from old.size
     and coalesce(new.staff_capacity_override, false)
         is not distinct from coalesce(old.staff_capacity_override, false)
     -- CHANGE 1: any terminal -> active transition re-occupies a seat and must
     -- be revalidated, not just Cancelled -> active.
     and not (
       not public.booking_occupies_seat(old.status)
       and public.booking_occupies_seat(new.status)
     )
  then
    return new;
  end if;

  if not v_is_staff then
    new.staff_capacity_override := false;
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

  perform pg_advisory_xact_lock(
    hashtextextended(new.booking_date::text || '|' || new.slot, 0)
  );

  -- CHANGE 2: a booking that is ending terminally does not consume the cap.
  if not v_is_staff and public.booking_occupies_seat(new.status) then
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

    -- CHANGE 3: no-shows must not count toward the day's allowance.
    select count(*)
      into v_day_count
      from bookings b
     where b.booking_date = new.booking_date
       and public.booking_occupies_seat(b.status)
       and b.id <> new.id;

    perform set_config('booking_diag.v_day_count', v_day_count::text, true);
    perform set_config('booking_diag.v_daily_cap', v_daily_cap::text, true);

    if (v_day_count + 1) > v_daily_cap then
      raise exception
        'Day is fully booked: % already has % dog(s) (maximum % per day)',
        to_char(new.booking_date, 'DD Mon YYYY'), v_day_count, v_daily_cap
        using detail = 'daily_cap';
    end if;
  end if;

  v_slots := active_slots_for(new.booking_date);

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
    raise exception 'Invalid slot: %', new.slot
        using detail = 'unavailable';
  end if;

  v_seats_needed := get_seats_needed(new.size, new.slot);
  v_used         := v_seats_used[v_slot_index];
  v_early_close  := has_large_dog(new.booking_date, '12:00', v_exclude_id);
  v_has_large    := has_large_dog(new.booking_date, new.slot, v_exclude_id);

  v_max_seats := get_max_seats_for_slot(v_slot_index, v_seats_used);

  if new.slot = '13:00' and v_early_close then
    v_max_seats := 0;
  end if;

  select count(*)
    into v_blocked_seats
    from day_settings ds,
         lateral jsonb_each_text(coalesce(ds.overrides -> new.slot, '{}'::jsonb)) as seat(k, v)
   where ds.setting_date = new.booking_date
     and seat.k ~ '^[0-9]+$'
     and seat.v = 'blocked';

  v_blocked_seats := coalesce(v_blocked_seats, 0);
  v_max_seats     := greatest(v_max_seats - v_blocked_seats, 0);

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
        raise exception 'Large dogs need approval for this slot (%)', new.slot
        using detail = 'large_dog_ineligible';
      end if;
    end if;

    if new.slot = '09:00' then
      if get_seats_used(new.booking_date, '08:30', v_exclude_id) > 0
         and not v_override then
        raise exception '09:00 large dog conditional: 08:30 must be empty'
        using detail = 'large_dog_ineligible';
      end if;
      if get_seats_used(new.booking_date, '10:00', v_exclude_id) > 1
         and not v_override then
        raise exception '09:00 large dog conditional: 10:00 must have 0-1 seats used'
        using detail = 'large_dog_ineligible';
      end if;
    end if;

    if new.slot = '12:00' then
      if get_seats_used(new.booking_date, '13:00', v_exclude_id) > 0
         and not v_override then
        raise exception '12:00 large dog requires 13:00 to be empty (early close)'
        using detail = 'large_dog_ineligible';
      end if;
    end if;

    if new.slot = '13:00' and v_early_close and not v_override then
      raise exception '13:00 is closed — large dog at 12:00 triggered early close'
        using detail = 'large_dog_ineligible';
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
            raise exception 'Back-to-back large dogs only allowed at 12:30 + 13:00'
        using detail = 'large_dog_ineligible';
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
            raise exception 'Back-to-back large dogs only allowed at 12:30 + 13:00'
        using detail = 'large_dog_ineligible';
          end if;
        end if;
      end if;
    end if;

    if v_can_share and v_has_large and not v_override then
      raise exception 'Only a small/medium dog can share this slot with a large dog'
        using detail = 'large_dog_ineligible';
    end if;

    if not v_can_share and is_large_dog_slot(new.slot) and v_used > 0 and not v_override then
      raise exception 'Large dog fills this slot — already has bookings'
        using detail = 'large_dog_ineligible';
    end if;

    if not v_can_share and is_large_dog_slot(new.slot)
       and v_seats_needed > v_max_seats and not v_override then
      raise exception 'Not enough capacity (2-2-1 rule)'
        using detail = 'capacity_2_2_1';
    end if;

  end if;

  if (v_used + v_seats_needed) > v_max_seats and not v_override then
    if new.size = 'large' then
      raise exception 'Not enough capacity (2-2-1 rule)'
        using detail = 'capacity_2_2_1';
    elsif new.slot = '13:00' and v_early_close then
      raise exception '13:00 closed — early close from 12:00 large dog'
        using detail = 'large_dog_ineligible';
    elsif v_blocked_seats > 0 then
      raise exception 'Slot is full'
        using detail = 'slot_full';
    elsif v_max_seats < 2 then
      raise exception 'Capped at 1 (2-2-1 rule)'
        using detail = 'capacity_2_2_1';
    else
      raise exception 'Slot is full'
        using detail = 'slot_full';
    end if;
  end if;

  if new.size <> 'large' and v_has_large and not v_override then
    if is_large_dog_slot(new.slot) and not large_dog_can_share(new.slot) then
      raise exception 'Large dog fills this slot'
        using detail = 'large_dog_ineligible';
    end if;
  end if;

  return new;
end;
$function$;
