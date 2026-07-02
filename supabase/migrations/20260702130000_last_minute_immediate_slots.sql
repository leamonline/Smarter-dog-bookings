-- ============================================================
-- Last-minute ("immediate") booking slots
--
-- WHY
-- Staff want to open a specific slot on the CURRENT day for customer
-- self-booking ("Open for immediate booking" in the staff calendar),
-- bookable until 30 minutes before the slot starts. Today the two
-- customer channels disagree: the portal never offers today (frontend
-- hardcode), while the WhatsApp Flow offers today with NO time cutoff
-- at all, and validate_booking_calendar only rejects PAST dates. This
-- migration makes one authoritative rule in the DB:
--
--   Non-staff may book TODAY (Europe/London) only when the slot is in
--   day_settings.immediate_slots AND it is at least 30 minutes before
--   the slot start. Future dates are unchanged; staff keep their
--   latitude via is_staff() exactly as before.
--
-- WHAT
-- 1. day_settings.immediate_slots text[] — the whole-slot staff flag
--    (mirrors the extra_slots pattern; deliberately NOT folded into the
--    overrides jsonb, which has known malformed legacy rows and four
--    SQL consumers that iterate it).
-- 2. validate_booking_calendar() — replaced with the same-day rule
--    above. ONLY the shared gate function is replaced: the
--    enforce_booking_calendar() wrapper and its BEFORE INSERT OR UPDATE
--    trigger from 20260615160000 are left untouched (re-creating the
--    20260603140000 versions here would silently drop UPDATE gating).
--    The past-date check now uses the salon wall clock
--    (Europe/London), not the server's current_date.
-- 3. get_small_medium_availability() — same today-predicate, so the
--    ALREADY-DEPLOYED Flow endpoint and agent stop offering unbookable
--    today-slots the instant this migration applies, before any code
--    deploy. Side effect (intended): past days in the range are no
--    longer returned; every caller passes p_from = today, so this is
--    theoretical.
-- 4. get_large_dog_day_availability() — today qualifies only when at
--    least one flagged slot is still 30+ minutes away. Day-level
--    approximation: exact large-dog slot fit stays with
--    large_dog_can_fit_on_day (untouched) and the capacity trigger.
-- 5. get_immediate_slots() — new customer-safe read: today's flagged,
--    still-bookable slots. Powers the portal's "Today — last minute"
--    entry and the Flow's time screen. No parameters, minimal
--    disclosure (same posture as get_blocked_seats).
--
-- The 30-minute cutoff also lives as IMMEDIATE_CUTOFF_MINUTES in
-- src/constants/salon.ts + supabase/functions/_shared/salonConstants.ts
-- (staff-UI gating only; these RPCs and the trigger are the authority).
--
-- Idempotent: add column if not exists + create or replace throughout.
-- Rollback: behaviour reverts by re-applying the previous bodies
-- (20260603140000 §1, 20260430121357, 20260428224246); the column is
-- additive and can stay.
-- ============================================================

-- ── 1. The staff flag ───────────────────────────────────────
alter table public.day_settings
  add column if not exists immediate_slots text[] not null default '{}';

comment on column public.day_settings.immediate_slots is
  'Slots staff opened for same-day ("last minute") customer booking. Whole-slot flag: any free seat becomes bookable today until 30 minutes before the slot start (Europe/London). Seat blocks in overrides still apply. Written by the staff calendar; read by validate_booking_calendar, the availability RPCs and get_immediate_slots.';

-- ── 2. The authoritative calendar gate ──────────────────────
-- Replaces 20260603140000's body. Called by the enforce_booking_calendar
-- trigger (20260615160000, BEFORE INSERT OR UPDATE) for every non-staff
-- write — portal RPC, WhatsApp Flow and agent all land here.
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
  -- Slot must be a real bookable slot.
  if p_slot is null or not (p_slot = any (active_slots())) then
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
  -- are intentionally NOT honoured here (mirrors get_small_medium_availability);
  -- the capacity trigger still caps the remaining seats.
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
  'Shared "is this date+slot bookable?" gate: raises P0001 for an invalid slot, a past date (Europe/London), a closed day (open Mon-Wed by default; day_settings.is_open overrides), a slot with BOTH seats blocked in day_settings.overrides, or a SAME-DAY booking unless the slot is in day_settings.immediate_slots and it is 30+ minutes before the slot start. Internal-only — called by the enforce_booking_calendar trigger. SECURITY DEFINER so it can read the staff-only day_settings table.';

-- Internal-only: the SECURITY DEFINER trigger calls it as the owner.
revoke all on function public.validate_booking_calendar(date, text) from public, anon, authenticated, service_role;

-- ── 3. Small/medium availability honours the same-day rule ──
-- Body from 20260430121357 with immediate_slots threaded through and the
-- final predicate extended. Keeping this in the SAME migration as the
-- trigger change means the already-deployed Flow/agent never offer a
-- today-slot the trigger would then reject.
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
  'Free small/medium capacity per (open day, slot) in the range. Same-day rows appear only for slots in day_settings.immediate_slots with 30+ minutes before the start (Europe/London); past days are never returned. Internal-only (service_role): feeds the WhatsApp Flow and agent.';

-- Posture from 20260615180000: internal helper, service_role only.
revoke all on function public.get_small_medium_availability(date, date) from public, anon, authenticated;
grant execute on function public.get_small_medium_availability(date, date) to service_role;

-- ── 4. Large-dog day availability honours the same-day rule ─
-- Body from 20260428224246; only the day filter changes.
-- large_dog_can_fit_on_day is untouched.
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
  v_day   date;
  v_today date      := ((now() at time zone 'Europe/London'))::date;
  v_now   timestamp := (now() at time zone 'Europe/London');
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
       -- Same-day rule (mirrors validate_booking_calendar): today counts
       -- only when at least one staff-flagged slot is still 30+ minutes
       -- away. Iterate the canonical grid and membership-test the flag
       -- array, so a junk immediate_slots value can never break a cast.
       and (
         d.d > v_today
         or (
           d.d = v_today
           and exists (
             select 1
               from unnest(active_slots()) as a(slot)
              where a.slot = any (coalesce(ds.immediate_slots, '{}'::text[]))
                and v_now <= (d.d + a.slot::time - interval '30 minutes')
           )
         )
       )
  loop
    booking_date := v_day;
    has_capacity := large_dog_can_fit_on_day(v_day);
    return next;
  end loop;
  return;
end;
$$;

comment on function get_large_dog_day_availability(date, date) is
  'Returns (date, has_capacity) for each open day in the range; has_capacity is true if at least one large-dog slot would pass the trigger rules. Today appears only when a day_settings.immediate_slots entry is still 30+ minutes away (Europe/London). Internal-only (service_role).';

-- Posture from 20260615180000: internal helper, service_role only.
revoke all on function public.get_large_dog_day_availability(date, date) from public, anon, authenticated;
grant execute on function public.get_large_dog_day_availability(date, date) to service_role;

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
  -- Today's staff-flagged slots that a customer could still book: day open,
  -- canonical slot, not fully blocked, 30+ minutes before the start. No
  -- parameters and nothing beyond today's flags is disclosed (same minimal
  -- posture as get_blocked_seats). Returning setting_date hands clients the
  -- SERVER's London "today", so device clocks are never trusted. Iterates
  -- active_slots() and membership-tests immediate_slots, so a junk array
  -- value can never break the ::time cast. The coalesce('') wrappers keep
  -- the both-seats-blocked test NULL-safe inside a WHERE clause.
  return query
  select ds.setting_date, a.slot
    from day_settings ds
    cross join unnest(active_slots()) as a(slot)
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
  'Today''s (Europe/London) staff-flagged last-minute slots a customer could still book: day open, slot in day_settings.immediate_slots, not fully seat-blocked, 30+ minutes before the slot start. Read path for the portal wizard''s "Today — last minute" entry and the WhatsApp Flow. SECURITY DEFINER so customers never read the staff-only day_settings table directly.';

revoke all on function public.get_immediate_slots() from public, anon, authenticated, service_role;
grant execute on function public.get_immediate_slots() to authenticated, service_role;
