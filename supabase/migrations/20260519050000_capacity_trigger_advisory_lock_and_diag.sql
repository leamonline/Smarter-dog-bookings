-- ============================================================
-- Capacity trigger: advisory lock + diagnostic audit columns
--
-- Follow-up to 20260519000000_capacity_trigger_hardening.sql
-- prompted by a second over-capacity insert at 10:30 on
-- 2026-05-20 that the earlier patch should have blocked. The
-- audit log added in the previous migration confirmed:
--
--   - is_staff: false (customer-portal auth)
--   - staff_capacity_override: false (correctly force-reset)
--   - session_replication_role: origin (not the replica bypass)
--
-- The trigger fired (the audit row exists) but didn't raise. We
-- cannot reproduce the bypass on demand from a fresh transaction
-- — re-running the same scenario manually now correctly blocks
-- with "Slot is full". That leaves a snapshot-race between two
-- near-simultaneous inserts as the most plausible mechanism:
-- two transactions both read v_used = 1 in their BEFORE trigger
-- before either commits, both compute "1 + 1 = 2 ≤ 2" and both
-- pass.
--
-- This patch does two things:
--
-- 1) Take a transaction-scoped advisory lock keyed on
--    (booking_date, slot) before the BEFORE trigger reads seats.
--    Concurrent inserts/updates targeting the same slot now
--    serialise; the second one sees the first one's committed
--    row when it computes v_used. Closes the race class of
--    bypass once and for all. The lock is per-slot so different
--    slots are still concurrent.
--
-- 2) Capture the trigger's view of v_used, v_max_seats,
--    v_seats_needed, v_enforce, v_override and the full
--    v_seats_used array into booking_capacity_audit via
--    set_config(local=true) + current_setting in the AFTER
--    trigger. Next time a row slips through we will know
--    exactly what the trigger thought the slot looked like.
-- ============================================================

alter table public.booking_capacity_audit
  add column if not exists v_used             integer,
  add column if not exists v_max_seats        integer,
  add column if not exists v_seats_needed     integer,
  add column if not exists v_seats_used_array integer[],
  add column if not exists v_enforce          boolean,
  add column if not exists v_override         boolean;

comment on column public.booking_capacity_audit.v_used is
  'Seats already used at the target slot AS SEEN BY THE TRIGGER (excludes the new row). Stashed via set_config from validate_booking_capacity before the AFTER trigger reads it. Lets us confirm what the trigger thought the capacity state was when a row was about to be written.';

create or replace function validate_booking_capacity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
declare
  v_enforce      boolean;
  v_override     boolean;
  v_is_staff     boolean;
  v_slots        text[];
  v_exclude_id   uuid;
  v_seats_used   integer[];
  v_slot_index   integer;
  v_max_seats    integer;
  v_used         integer;
  v_seats_needed integer;
  v_early_close  boolean;
  v_has_large    boolean;
  v_can_share    boolean;
  i              integer;
  v_prev_slot    text;
  v_next_slot    text;
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

  -- Stash diagnostics for the AFTER trigger. set_config(local=true)
  -- persists for the rest of the transaction.
  perform set_config('booking_diag.v_enforce',          v_enforce::text,      true);
  perform set_config('booking_diag.v_override',         v_override::text,     true);
  perform set_config('booking_diag.v_used',             v_used::text,         true);
  perform set_config('booking_diag.v_max_seats',        v_max_seats::text,    true);
  perform set_config('booking_diag.v_seats_needed',     v_seats_needed::text, true);
  perform set_config('booking_diag.v_seats_used_array', v_seats_used::text,   true);

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

create or replace function log_booking_capacity_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_used_arr_text text;
  v_used_arr integer[];
begin
  if tg_op = 'UPDATE'
     and new.booking_date is not distinct from old.booking_date
     and new.slot is not distinct from old.slot
     and new.size is not distinct from old.size
     and coalesce(new.staff_capacity_override, false)
         is not distinct from coalesce(old.staff_capacity_override, false)
  then
    return null;
  end if;

  v_used_arr_text := nullif(current_setting('booking_diag.v_seats_used_array', true), '');
  if v_used_arr_text is not null then
    begin
      v_used_arr := v_used_arr_text::integer[];
    exception when others then
      v_used_arr := null;
    end;
  end if;

  insert into public.booking_capacity_audit (
    booking_id, op, booking_date, slot, size, status,
    staff_capacity_override, auth_uid, is_staff, session_replication_role,
    v_enforce, v_override, v_used, v_max_seats, v_seats_needed, v_seats_used_array
  ) values (
    new.id, tg_op, new.booking_date, new.slot, new.size, new.status,
    new.staff_capacity_override, auth.uid(), is_staff(),
    current_setting('session_replication_role', true),
    nullif(current_setting('booking_diag.v_enforce',      true), '')::boolean,
    nullif(current_setting('booking_diag.v_override',     true), '')::boolean,
    nullif(current_setting('booking_diag.v_used',         true), '')::integer,
    nullif(current_setting('booking_diag.v_max_seats',    true), '')::integer,
    nullif(current_setting('booking_diag.v_seats_needed', true), '')::integer,
    v_used_arr
  );
  return null;
end;
$$;
