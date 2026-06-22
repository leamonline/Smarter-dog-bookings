-- ============================================================
-- Daily dog cap (max total dogs per day, across all slots).
--
-- WHY: validate_booking_capacity() only enforced the per-slot 2-2-1 seat
--   rule — nothing looked at the day total. The salon's real ceiling is a
--   fixed number of dogs per day (14), which lived only as DAY_CAPACITY in
--   the frontend (utilisation.ts) for the utilisation bar; it was enforced
--   NOWHERE on the write path. So on any day that still had a free seat in
--   some slot (e.g. a near-empty 13:00), a customer could book past the cap.
--   A customer self-booked a 15th dog into an empty 13:00 on a 14-dog day.
--
-- WHAT:
--   1. salon_config.daily_dog_cap (configurable, default 14).
--   2. validate_booking_capacity(): enforce the day total for NON-STAFF
--      writes (customers + the WhatsApp/AI agent, which runs as a non-staff
--      role). Staff are trusted to overbook deliberately and are NOT capped,
--      matching the existing per-slot staff_capacity_override behaviour
--      (a normal staff booking never sets that flag, so a `not v_override`
--      gate would wrongly block routine staff bookings on a full day).
--      Made race-safe with a per-DATE advisory lock — the existing per-slot
--      lock does not serialise inserts into different slots on the same day.
--   3. booking_capacity_audit + log_booking_capacity_event(): record the
--      day count / cap that applied, for forensics.
--
-- Apply individually to prod; idempotent. Migrations aren't auto-applied.
-- ============================================================

-- 1. Configurable cap on salon_config (one row). Default mirrors the
--    frontend DAY_CAPACITY constant.
alter table public.salon_config
  add column if not exists daily_dog_cap integer not null default 14;

comment on column public.salon_config.daily_dog_cap is
  'Maximum total dogs bookable in a single day (across all slots). Enforced for non-staff writes by validate_booking_capacity().';

-- 2. Forensic columns on the capacity audit log.
alter table public.booking_capacity_audit
  add column if not exists v_day_count integer;
alter table public.booking_capacity_audit
  add column if not exists v_daily_cap integer;

-- 3. Re-issue validate_booking_capacity() with the day-total check.
--    Body is the current production definition plus the daily-cap block;
--    every existing guard (un-cancel re-validation, per-slot advisory lock,
--    2-2-1 / large-dog rules, staff override) is preserved verbatim.
create or replace function validate_booking_capacity()
returns trigger
language plpgsql
security definer
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
  v_daily_cap    integer;
  v_day_count    integer;
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

-- 4. Re-issue the audit logger so it records the day count / cap that applied.
create or replace function log_booking_capacity_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
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
     -- Keep the audit log in step with validate_booking_capacity: an
     -- un-cancel is capacity-relevant, so record it instead of skipping.
     and not (old.status = 'Cancelled' and new.status is distinct from 'Cancelled')
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
    v_enforce, v_override, v_used, v_max_seats, v_seats_needed, v_seats_used_array,
    v_day_count, v_daily_cap
  ) values (
    new.id, tg_op, new.booking_date, new.slot, new.size, new.status,
    new.staff_capacity_override, auth.uid(), is_staff(),
    current_setting('session_replication_role', true),
    nullif(current_setting('booking_diag.v_enforce',      true), '')::boolean,
    nullif(current_setting('booking_diag.v_override',     true), '')::boolean,
    nullif(current_setting('booking_diag.v_used',         true), '')::integer,
    nullif(current_setting('booking_diag.v_max_seats',    true), '')::integer,
    nullif(current_setting('booking_diag.v_seats_needed', true), '')::integer,
    v_used_arr,
    nullif(current_setting('booking_diag.v_day_count',    true), '')::integer,
    nullif(current_setting('booking_diag.v_daily_cap',    true), '')::integer
  );
  return null;
end;
$function$;
