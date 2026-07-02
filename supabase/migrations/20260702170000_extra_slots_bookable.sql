-- ============================================================
-- Make extra slots bookable (per-date slot grid)
--
-- WHY
-- day_settings.extra_slots has existed since the initial schema but was
-- NEVER read by any SQL: the write-path gates validate slots against the
-- fixed 10-slot active_slots() grid, so every booking into an extra slot
-- — staff included — failed with 'Invalid slot'. Prod confirms it: zero
-- bookings in history sit outside the canonical grid. Extra slots were
-- display-only. Staff want ad-hoc afternoon slots (13:30, 14:00, …) to be
-- real — bookable by staff, and openable to customers via the same-day
-- "Open for immediate booking" flag.
--
-- WHAT
-- 1. active_slots_for(p_date) — the per-date bookable grid: canonical
--    active_slots() ∪ that date's day_settings.extra_slots, sanitised
--    (strict HH:MM 00-23:00-59 — the staff UI could historically generate
--    '24:00'+; those stay unbookable) and sorted (zero-padded HH:MM sorts
--    chronologically). active_slots() itself is untouched — it remains
--    the canonical customer grid for future dates.
-- 2. validate_booking_calendar — the invalid-slot check uses the per-date
--    grid. Everything else (open day, both-seats-blocked, same-day
--    immediate rule) is preserved verbatim from 20260702130000.
-- 3. validate_booking_capacity — v_slots becomes the per-date grid, so
--    the seats array includes extra-slot bookings and the 2-2-1 windowing
--    runs across the 13:00 → extras boundary (get_max_seats_for_slot is
--    already array-length agnostic). Everything else is preserved
--    verbatim from 20260702150000 (un-cancel guard, advisory locks, daily
--    cap, staff-blocked seats).
-- 4. get_immediate_slots — iterates the per-date grid, so a flagged extra
--    slot reaches the portal + WhatsApp Flow.
-- 5. get_small_medium_availability — TODAY's grid is per-date (flagged
--    extras appear, since same-day rows already require the immediate
--    flag); FUTURE days stay canonical. Extra slots reach customers ONLY
--    as same-day last-minute openings — that scoping is deliberate.
-- 6. large_dog_can_fit_on_day — builds its seats array over the per-date
--    grid so extra-slot occupancy is visible to the 2-2-1 windowing; the
--    candidate large-dog slots stay the fixed five (extra slots are never
--    large-dog eligible — is_large_dog_slot is unchanged).
--
-- Companion pgTAP coverage: supabase/tests/030_extra_slots.test.sql
-- (CI dumps prod's schema, so those tests verify THIS migration once
-- applied). Apply individually to prod BY HAND before merging; idempotent.
-- Rollback: re-apply the previous bodies (20260702130000 §§2/5,
-- 20260702150000 §§1/2, 20260428224246) and drop active_slots_for.
-- ============================================================

-- ── 1. The per-date bookable grid ───────────────────────────
create or replace function public.active_slots_for(p_date date)
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select array(
    select distinct s
      from (
        select unnest(active_slots()) as s
        union all
        select unnest(coalesce(ds.extra_slots, '{}'::text[]))
          from day_settings ds
         where ds.setting_date = p_date
      ) t
     where s ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
     order by s
  );
$$;

comment on function public.active_slots_for(date) is
  'The bookable slot grid for a date: canonical active_slots() plus that date''s day_settings.extra_slots, sanitised to strict HH:MM and sorted chronologically. Used by the booking gates and availability RPCs. SECURITY DEFINER so triggers can read the staff-only day_settings table. Internal-only.';

revoke all on function public.active_slots_for(date) from public, anon, authenticated, service_role;

-- ── 2. Calendar gate: per-date slot validity ────────────────
create or replace function public.validate_booking_calendar(
  p_booking_date date,
  p_slot         text
)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_is_open   boolean;
  v_overrides jsonb;
  v_immediate text[];
  -- Salon wall clock. Both are naive London time, so date + time
  -- arithmetic below never crosses a timezone.
  v_now_ldn   timestamp := (now() at time zone 'Europe/London');
  v_today_ldn date      := ((now() at time zone 'Europe/London'))::date;
begin
  -- Slot must be bookable on THIS date (canonical grid + the date's
  -- sanitised extra_slots).
  if p_slot is null or not (p_slot = any (active_slots_for(p_booking_date))) then
    raise exception 'Invalid slot: %', coalesce(p_slot, '(null)') using errcode = 'P0001';
  end if;

  -- Past dates judged on the salon wall clock (Europe/London).
  if p_booking_date is null or p_booking_date < v_today_ldn then
    raise exception 'Cannot book a date in the past' using errcode = 'P0001';
  end if;

  select ds.is_open, ds.overrides, ds.immediate_slots
    into v_is_open, v_overrides, v_immediate
    from day_settings ds
   where ds.setting_date = p_booking_date;

  -- No day_settings row (or is_open NULL) -> weekly default: open Mon-Wed.
  -- Matches coalesce(is_open, isodow in (1,2,3)) in get_small_medium_availability.
  if not coalesce(v_is_open, extract(isodow from p_booking_date) in (1, 2, 3)) then
    raise exception 'The salon is closed on that date' using errcode = 'P0001';
  end if;

  -- "Both seats blocked" = slot manually closed by staff. Single-seat blocks
  -- are honoured by the capacity trigger (blocked-seat subtraction).
  v_overrides := coalesce(v_overrides, '{}'::jsonb);
  if (v_overrides -> p_slot ->> '0') = 'blocked'
     and (v_overrides -> p_slot ->> '1') = 'blocked' then
    raise exception 'That time slot is closed on this date' using errcode = 'P0001';
  end if;

  -- Same-day ("last minute") rule: today is bookable only on a slot staff
  -- explicitly opened, and only until 30 minutes before it starts. These
  -- messages surface verbatim in the portal wizard and the WhatsApp Flow,
  -- so they are customer-facing copy.
  if p_booking_date = v_today_ldn then
    if not (p_slot = any (coalesce(v_immediate, '{}'::text[]))) then
      raise exception 'Same-day booking isn''t available for that time — please pick another day'
        using errcode = 'P0001';
    end if;
    if v_now_ldn > (p_booking_date + p_slot::time - interval '30 minutes') then
      raise exception 'Too close to the start time to book this online — please give us a ring'
        using errcode = 'P0001';
    end if;
  end if;
end;
$$;

comment on function public.validate_booking_calendar(date, text) is
  'Shared "is this date+slot bookable?" gate: raises P0001 for a slot outside the date''s grid (active_slots_for: canonical + that date''s extra_slots), a past date (Europe/London), a closed day, a slot with BOTH seats blocked, or a SAME-DAY booking unless the slot is in day_settings.immediate_slots and it is 30+ minutes before the slot start. Internal-only — called by the enforce_booking_calendar trigger.';

revoke all on function public.validate_booking_calendar(date, text) from public, anon, authenticated, service_role;

-- ── 3. Capacity trigger: per-date grid for the seats array ──
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

  -- The bookable grid for THIS date: canonical slots plus the date's
  -- sanitised extra_slots. Extra-slot bookings join the seats array, so
  -- the 2-2-1 windowing runs across the 13:00 → extras boundary
  -- (get_max_seats_for_slot is array-length agnostic).
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
  'BEFORE trigger on bookings: 2-2-1 seat rules over the per-date grid (active_slots_for: canonical + extra_slots), large-dog rules, daily dog cap (non-staff), and staff-blocked seats. Serialised by per-slot + per-date advisory locks. staff_capacity_override (staff only) bypasses the seat rules.';

revoke all on function validate_booking_capacity() from public, anon, authenticated, service_role;

-- ── 4. Availability: today per-date, future canonical ───────
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
    -- TODAY uses the per-date grid so flagged extra slots can surface (the
    -- same-day predicate below still requires the immediate flag); FUTURE
    -- days stay on the canonical grid — extra slots reach customers only
    -- as same-day last-minute openings, by design.
    select od.day_date, od.overrides, od.immediate_slots, s.slot
      from open_days od
      cross join lateral unnest(
        case when od.day_date = ((now() at time zone 'Europe/London'))::date
             then active_slots_for(od.day_date)
             else active_slots()
        end
      ) as s(slot)
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
     -- staff-flagged slot with 30+ minutes to go; past days never. Slots
     -- come from active_slots()/active_slots_for(), both strict HH:MM, so
     -- the ::time cast cannot throw.
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
  'Free small/medium capacity per (open day, slot) in the range. slot_cap = 2 minus staff-blocked seats. Today runs on the per-date grid (canonical + extra_slots) gated by day_settings.immediate_slots with the 30-minute cutoff (Europe/London); future days use the canonical grid; past days are never returned. Internal-only (service_role): feeds the WhatsApp Flow and agent.';

revoke all on function public.get_small_medium_availability(date, date) from public, anon, authenticated;
grant execute on function public.get_small_medium_availability(date, date) to service_role;

-- ── 5. Customer-safe read of today's last-minute slots ──────
create or replace function public.get_immediate_slots()
returns table (setting_date date, slot text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_today date      := ((now() at time zone 'Europe/London'))::date;
  v_now   timestamp := (now() at time zone 'Europe/London');
begin
  -- Iterates the per-date grid (canonical + today's sanitised extra_slots),
  -- so a flagged extra slot reaches the portal and Flow. Malformed
  -- extra_slots values never appear (active_slots_for filters them), and
  -- flags on slots outside the grid are ignored.
  return query
  select ds.setting_date, a.slot
    from day_settings ds
    cross join unnest(active_slots_for(v_today)) as a(slot)
   where ds.setting_date = v_today
     and a.slot = any (coalesce(ds.immediate_slots, '{}'::text[]))
     and coalesce(ds.is_open, extract(isodow from v_today) in (1, 2, 3))
     and not (coalesce(ds.overrides -> a.slot ->> '0', '') = 'blocked'
          and coalesce(ds.overrides -> a.slot ->> '1', '') = 'blocked')
     and v_now <= (ds.setting_date + a.slot::time - interval '30 minutes')
   order by a.slot;
end;
$$;

comment on function public.get_immediate_slots() is
  'Today''s (Europe/London) staff-flagged last-minute slots a customer could still book — over the per-date grid, so flagged extra slots are included: day open, slot in day_settings.immediate_slots, not fully seat-blocked, 30+ minutes before the slot start. Read path for the portal wizard''s "Today — last minute" entry and the WhatsApp Flow.';

revoke all on function public.get_immediate_slots() from public, anon, authenticated, service_role;
grant execute on function public.get_immediate_slots() to authenticated, service_role;

-- ── 6. Large-dog day availability sees extra-slot occupancy ─
-- Body from 20260428224246: only the v_slots source changes, so the 2-2-1
-- windowing sees bookings in extra slots. The candidate large-dog slots
-- stay the fixed five — extra slots are never large-dog eligible.
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
  'Returns true if at least one of the 5 large-dog allowed slots passes the same rules the capacity trigger checks, over the per-date grid (so extra-slot occupancy caps neighbours). Read-only; the trigger remains the source of truth on insert.';

revoke all on function large_dog_can_fit_on_day(date) from public, anon, authenticated;
grant execute on function large_dog_can_fit_on_day(date) to service_role;
