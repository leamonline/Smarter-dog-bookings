-- ============================================================
-- Capacity trigger hardening
--
-- Three fixes prompted by an over-capacity booking that slipped
-- through validate_booking_capacity at 09:00 on 2026-05-19. The
-- existing trigger logic is correct; this migration tightens the
-- contract so the failure mode is observable and so legitimate
-- staff workflows aren't blocked by an already-over-capacity slot.
--
-- 1) UPDATEs that don't touch a capacity input (booking_date,
--    slot, size, staff_capacity_override) short-circuit out of the
--    trigger. Without this, staff cannot cancel a booking that
--    sits in an over-capacity slot — the same trigger that's
--    supposed to *prevent* over-capacity ends up obstructing the
--    fix. Updated_at, status snapshots and the AFTER notification
--    triggers continue to fire as before.
--
-- 2) staff_capacity_override is force-reset to false whenever
--    is_staff() returns false. Previously the trigger nulled the
--    audit columns (_by/_at) but kept the submitted boolean —
--    a customer payload of `staff_capacity_override: true` would
--    persist on the row even though it had no effect on capacity.
--    The check `NOT v_override` combined the boolean with is_staff()
--    so the immediate insert was still validated, but a later
--    staff edit that re-ran the trigger would have honoured the
--    poisoned flag as a legitimate override.
--
-- 3) booking_capacity_audit captures auth.uid(), is_staff() and
--    session_replication_role at the moment of every INSERT and
--    capacity-relevant UPDATE. If a future booking slips the gate
--    the row tells us which path was used (customer JWT vs staff
--    JWT vs service role) and whether triggers were in replica
--    mode. Marked ENABLE ALWAYS so a future
--    `set session_replication_role = replica` cannot silence it.
-- ============================================================

create table if not exists public.booking_capacity_audit (
  id                       uuid primary key default gen_random_uuid(),
  booking_id               uuid not null,
  op                       text not null check (op in ('INSERT','UPDATE')),
  booking_date             date not null,
  slot                     text not null,
  size                     text,
  status                   text,
  staff_capacity_override  boolean,
  auth_uid                 uuid,
  is_staff                 boolean,
  session_replication_role text,
  created_at               timestamptz not null default now()
);

comment on table public.booking_capacity_audit is
  'Forensic log of booking inserts and capacity-relevant updates. Captures the auth context at the moment of the write so a future capacity bypass can be traced after the fact. Written by trg_log_booking_capacity_event (ENABLE ALWAYS).';

alter table public.booking_capacity_audit enable row level security;

revoke all on table public.booking_capacity_audit from anon, authenticated;

drop policy if exists "staff can read audit" on public.booking_capacity_audit;
create policy "staff can read audit" on public.booking_capacity_audit
  for select to authenticated
  using (is_staff());

create index if not exists booking_capacity_audit_created_at_idx
  on public.booking_capacity_audit (created_at desc);

create index if not exists booking_capacity_audit_booking_id_idx
  on public.booking_capacity_audit (booking_id);

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

  -- (2) Non-staff callers cannot persist a true override flag.
  -- Normalises customer payloads / service-role defaults back to
  -- false before any other logic reads NEW.staff_capacity_override.
  if not v_is_staff then
    new.staff_capacity_override := false;
  end if;

  -- (1) Status-only / metadata-only updates skip capacity entirely.
  -- The original INSERT already validated this row; a later cancel
  -- or pickup-by edit shouldn't be re-validated against a slot it
  -- isn't moving into.
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
    return new;
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

  insert into public.booking_capacity_audit (
    booking_id, op, booking_date, slot, size, status,
    staff_capacity_override, auth_uid, is_staff, session_replication_role
  ) values (
    new.id, tg_op, new.booking_date, new.slot, new.size, new.status,
    new.staff_capacity_override, auth.uid(), is_staff(),
    current_setting('session_replication_role', true)
  );
  return null;
end;
$$;

comment on function log_booking_capacity_event() is
  'AFTER INSERT/UPDATE on bookings. Logs capacity-relevant writes to booking_capacity_audit with the calling auth context. Marked ENABLE ALWAYS so it still fires when session_replication_role is set to replica.';

drop trigger if exists trg_log_booking_capacity_event on public.bookings;
create trigger trg_log_booking_capacity_event
after insert or update on public.bookings
for each row
execute function log_booking_capacity_event();

alter table public.bookings
  enable always trigger trg_log_booking_capacity_event;
