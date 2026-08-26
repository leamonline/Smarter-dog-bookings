-- ============================================================
-- Emit a machine-readable reason code from every booking gate (#665)
--
-- WHY
--
-- The reason a booking was refused is already understood by every consumer --
-- the wizard, the WhatsApp Flow, report 2F -- but it is RE-DERIVED by regex
-- over the prose the gate happened to produce (mapDenialReason). The component
-- that made the decision never states it. That is fragile in one specific way:
-- a wording change made for UX reasons silently re-categorises the denial log
-- and the 2F report.
--
-- This moves the code from inferred to emitted. Each gate now carries its
-- reason in the exception's DETAIL field, alongside -- never instead of -- the
-- human message.
--
-- WHAT IS DELIBERATELY NOT CHANGED
--
--   * every `message` is byte-identical. The generator that produced this file
--     proves it: stripping the added clauses restores the previous text exactly.
--     The ~20 exact-text pgTAP assertions (19 in the parity harness) therefore
--     stand unedited, and they are the evidence that no DECISION moved. A
--     migration that required any of them to be edited would be changing
--     behaviour and should be rejected on that basis alone.
--   * every SQLSTATE. All three gates keep P0001; the wizard gates on it, and
--     CLAUDE.md calls it load-bearing. SDC03 on the visit-state error stays.
--   * what any gate DECIDES. Adding DETAIL changes what a gate SAYS, never
--     what it allows.
--   * grants. CREATE OR REPLACE preserves the existing ACL.
--
-- CODE VOCABULARY
--
-- The codes are the ones mapDenialReason already produces -- no new vocabulary
-- is invented here. 26 of 28 raise sites carry a code. Two deliberately do not,
-- because there is no genuine denial reason to state:
--
--   booking_visit_already_cancelled   a visit-state error (SDC03), not a denial
--   'That dog is no longer available' the dog-integrity check, which #681
--                                     documents as deliberately `unknown`
--
-- Absence of DETAIL means "fall back to the prose mapper", which is exactly
-- today's behaviour, so those two paths are untouched end to end.
--
-- ONE DEFECT FIXED IN PASSING
--
-- validate_booking_calendar's 30-minute cutoff refusal reads "Too close to the
-- start time to book this online". mapDenialReason keys the cutoff on the
-- substring "same-day", which that message does not contain -- so it fell
-- through to `unknown`. Two consequences, both live: report 2F under-counted
-- past_cutoff, and because #681 makes `unknown` fail closed, a customer who hit
-- the cutoff was offered NO alternative times, even though past_cutoff is in
-- RETRYABLE_DENIAL_REASONS precisely because "a later slot today can still be
-- far enough out". It now emits past_cutoff, and the mappers are taught the
-- wording so the fallback agrees. This is the exact failure mode #665 exists to
-- eliminate, found by building the contract.
--
-- Idempotent: CREATE OR REPLACE only, safe to re-run.
-- ============================================================

-- --------------------------------------------------------------
-- 1. Capacity gate (18 of 19 raises keyed)
-- --------------------------------------------------------------
create or replace function public.validate_booking_capacity()
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

  -- BEGIN: cancellation visit membership serialisation
  -- A cancellation takes this visit key before it captures and locks the
  -- visit's rows. Every INSERT and every membership/date-changing UPDATE must
  -- take the same destination key before the metadata-only return below, or a
  -- writer could join the visit after cancellation captured its member IDs.
  --
  -- Deliberately do not take OLD's visit key here. PostgreSQL already holds an
  -- UPDATE's target row before this row trigger; taking OLD's key would invert
  -- cancellation's visit-key-then-row-lock order. The existing cancellation
  -- scope revalidation serialises departures through that row lock instead.
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

  -- The application write paths use READ COMMITTED. If the destination lock
  -- waited for a cancellation, this VOLATILE trigger's following query sees
  -- that commit and prevents a Booked row joining the cancelled visit. Also
  -- prevent an existing grouped cancellation from being reactivated.
  if new.group_id is not null
     and new.status is distinct from 'Cancelled'
     and (
       (tg_op = 'UPDATE' and old.status = 'Cancelled')
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
  -- END: cancellation visit membership serialisation

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
        to_char(new.booking_date, 'DD Mon YYYY'), v_day_count, v_daily_cap
        using detail = 'daily_cap';
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
      -- The shortfall involves a staff-blocked seat; "Slot is full" is the
      -- honest customer-facing message (and is already in the client's
      -- capacity-rejection matcher).
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

-- --------------------------------------------------------------
-- 2. Calendar gate (6 of 6) -- includes the cutoff fix above
-- --------------------------------------------------------------
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
    raise exception 'Invalid slot: %', coalesce(p_slot, '(null)') using errcode = 'P0001', detail = 'unavailable';
  end if;

  -- Past dates judged on the salon wall clock (Europe/London).
  if p_booking_date is null or p_booking_date < v_today_ldn then
    raise exception 'Cannot book a date in the past' using errcode = 'P0001', detail = 'past_date';
  end if;

  select ds.is_open, ds.overrides, ds.immediate_slots
    into v_is_open, v_overrides, v_immediate
    from day_settings ds
   where ds.setting_date = p_booking_date;

  -- No day_settings row (or is_open NULL) -> weekly default: open Mon-Wed.
  -- Matches coalesce(is_open, isodow in (1,2,3)) in get_small_medium_availability.
  if not coalesce(v_is_open, extract(isodow from p_booking_date) in (1, 2, 3)) then
    raise exception 'The salon is closed on that date' using errcode = 'P0001', detail = 'calendar_closed';
  end if;

  -- "Both seats blocked" = slot manually closed by staff. Single-seat blocks
  -- are honoured by the capacity trigger (blocked-seat subtraction).
  v_overrides := coalesce(v_overrides, '{}'::jsonb);
  if (v_overrides -> p_slot ->> '0') = 'blocked'
     and (v_overrides -> p_slot ->> '1') = 'blocked' then
    raise exception 'That time slot is closed on this date' using errcode = 'P0001', detail = 'calendar_closed';
  end if;

  -- Same-day ("last minute") rule: today is bookable only on a slot staff
  -- explicitly opened, and only until 30 minutes before it starts. These
  -- messages surface verbatim in the portal wizard and the WhatsApp Flow,
  -- so they are customer-facing copy.
  if p_booking_date = v_today_ldn then
    if not (p_slot = any (coalesce(v_immediate, '{}'::text[]))) then
      raise exception 'Same-day booking isn''t available for that time — please pick another day'
        using errcode = 'P0001', detail = 'past_cutoff';
    end if;
    if v_now_ldn > (p_booking_date + p_slot::time - interval '30 minutes') then
      raise exception 'Too close to the start time to book this online — please give us a ring'
        using errcode = 'P0001', detail = 'past_cutoff';
    end if;
  end if;
end;
$$;

-- --------------------------------------------------------------
-- 3. Pregnancy gate (1 of 2; dog-integrity stays bare)
-- --------------------------------------------------------------
create or replace function public.assert_booking_dog_not_pregnant(p_dog_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pregnant boolean;
begin
  select is_pregnant into v_pregnant
    from public.dogs
   where id = p_dog_id
   for share;

  if not found then
    raise exception using errcode = 'P0001',
      message = 'That dog is no longer available. Please refresh and try again.';
  end if;

  if v_pregnant then
    raise exception using errcode = 'P0001',
      message = 'We can''t book a pregnant dog online — please call the salon.', detail = 'pregnant';
  end if;
end;
$$;

-- --------------------------------------------------------------
-- 4. Per-customer slot block (1 of 1)
-- --------------------------------------------------------------
create or replace function public.enforce_human_slot_blocks()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_blocked text[];
begin
  if is_staff() then
    return new;
  end if;

  -- Cancelling (or already cancelled) rows are never gated.
  if coalesce(new.status, 'Booked') = 'Cancelled' then
    return new;
  end if;

  -- Metadata-only updates pass; validate when slot or date moves, or a
  -- Cancelled row is reactivated (same guard shape as validate_booking_capacity).
  if tg_op = 'UPDATE'
     and new.slot is not distinct from old.slot
     and new.booking_date is not distinct from old.booking_date
     and not (old.status = 'Cancelled' and new.status is distinct from 'Cancelled')
  then
    return new;
  end if;

  select h.blocked_slots into v_blocked
    from public.dogs d
    join public.humans h on h.id = d.human_id
   where d.id = new.dog_id;

  if v_blocked is not null and new.slot = any (v_blocked) then
    -- Distinct, customer-mappable message (wizard + WhatsApp Flow map on
    -- error.code/message; must not collide with calendar/capacity/pregnancy).
    raise exception using errcode = 'P0001',
      message = 'That time isn''t available for your account — please pick a different time or message the salon.', detail = 'customer_slot_blocked';
  end if;

  return new;
end;
$$;

-- ── Grants ──────────────────────────────────────────────────
-- CREATE OR REPLACE preserves the existing ACL, so these are not strictly
-- required to keep production safe. They are here because the repository's
-- security tests read the LATEST definition of a function and expect it to be
-- self-contained (src/security/pregnancyGate.test.ts does exactly that, and
-- failed against an earlier draft of this file that omitted them). A definition
-- that cannot be read on its own is one a future rebuild can silently weaken.
--
-- These mirror the live posture, read from production's proacl today:
--   validate_booking_capacity()             owner only
--   validate_booking_calendar(date, text)   owner only
--   assert_booking_dog_not_pregnant(uuid)   owner + service_role
--   enforce_human_slot_blocks()             owner + service_role
revoke all on function public.validate_booking_capacity() from public, anon, authenticated, service_role;
revoke all on function public.validate_booking_calendar(date, text) from public, anon, authenticated, service_role;
-- Written one role per statement, matching 20260623130000 and the shape
-- src/security/pregnancyGate.test.ts reads back from the latest definition.
revoke all on function public.assert_booking_dog_not_pregnant(uuid) from public;
revoke all on function public.assert_booking_dog_not_pregnant(uuid) from anon;
revoke all on function public.assert_booking_dog_not_pregnant(uuid) from authenticated;
revoke all on function public.enforce_human_slot_blocks() from public, anon, authenticated;

-- ── Post-condition ──────────────────────────────────────────
-- Assert the contract actually landed. A silent partial apply on a
-- hand-applied database is exactly the failure this repository guards against.
do $verify$
declare
  v_total integer;
begin
  select sum(n) into v_total from (
    select (select count(*) from regexp_matches(prosrc, 'detail = ''[a-z_0-9]+''', 'g')) as n
      from pg_proc
     where proname in ('validate_booking_capacity','validate_booking_calendar',
                       'assert_booking_dog_not_pregnant','enforce_human_slot_blocks')
  ) s;

  if v_total <> 26 then
    raise exception
      'reason-code contract: expected 26 emitted codes across the four gates, found %', v_total;
  end if;

  -- No gate may be reachable by a customer-facing role. The revokes above set
  -- this; asserting it here means a future edit that grants one of these by
  -- accident fails the migration rather than shipping quietly.
  if exists (
    select 1
      from pg_proc p
     cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     where p.proname in ('validate_booking_capacity', 'validate_booking_calendar',
                         'assert_booking_dog_not_pregnant', 'enforce_human_slot_blocks')
       and pg_get_userbyid(a.grantee) in ('anon', 'authenticated')
  ) then
    raise exception
      'reason-code contract: a booking gate is executable by anon or authenticated; refusing to leave it so';
  end if;

  raise notice 'reason-code contract: 26 codes emitted across 4 gates; messages unchanged; gates not client-callable';
end
$verify$;
