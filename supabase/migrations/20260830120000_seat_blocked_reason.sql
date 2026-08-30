-- ============================================================
-- Both-seats-blocked emits seat_blocked, not calendar_closed
-- ============================================================
--
-- Owner decision, 30 August 2026, closing the second question #665 left open
-- (recorded on that issue's thread). When staff block BOTH seats of one slot,
-- the day is not closed -- that slot is:
--
--   * seat_blocked is in RETRYABLE_DENIAL_REASONS, so a WhatsApp customer
--     whose chosen slot is staff-blocked is offered other same-day times.
--     Blocked seats are per-slot, so those other times genuinely can be free.
--   * calendar_closed told that customer "the salon's closed at that time"
--     and offered nothing -- false, and a lost booking.
--   * Report 2F starts categorising these refusals as what they are.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT CHANGE
--
--   * Every message is byte-identical to what production raises today; the
--     ~20 exact-text pgTAP assertions stand unedited, per the reason-code
--     contract's discipline (migration 20260826120000).
--   * errcode stays P0001 everywhere -- the wizard gates on it.
--   * No calendar decision moves: the gate allows and refuses exactly what
--     it did. Only the DETAIL on one raise site changes.
--
-- This is the contract paying for itself: the reclassification is one
-- literal, because consumers read the emitted code rather than the prose.
--
-- The full function is re-issued (a definition must be self-contained), from
-- the 20260826120000 text with that single literal changed. Idempotent:
-- CREATE OR REPLACE + revokes + assertions, all rerunnable.
-- ============================================================

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
  --
  -- Emits seat_blocked, not calendar_closed (owner decision, 30 Aug 2026,
  -- #665): the DAY is not closed, that SLOT is, and seat_blocked is retryable
  -- -- so the WhatsApp Flow offers other same-day times, which genuinely can
  -- be free. The message is deliberately byte-identical to what production
  -- has always raised; only the emitted DETAIL changes. The prose mapper
  -- still infers calendar_closed from this wording -- kept as the documented
  -- fallback for a database predating this migration -- and the emitted code
  -- wins wherever this migration is applied.
  v_overrides := coalesce(v_overrides, '{}'::jsonb);
  if (v_overrides -> p_slot ->> '0') = 'blocked'
     and (v_overrides -> p_slot ->> '1') = 'blocked' then
    raise exception 'That time slot is closed on this date' using errcode = 'P0001', detail = 'seat_blocked';
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

-- The gate stays internal-only. CREATE OR REPLACE preserves the ACL, but the
-- latest definition re-asserts it rather than relying on that.
revoke all on function public.validate_booking_calendar(date, text) from public, anon, authenticated, service_role;

-- --------------------------------------------------------------
-- Post-conditions: fail the apply loudly rather than half-land.
-- --------------------------------------------------------------
do $post$
declare
  v_src     text;
  v_details text[];
begin
  select p.prosrc into v_src
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'validate_booking_calendar';

  if v_src is null then
    raise exception 'seat_blocked reclassification: validate_booking_calendar not found';
  end if;

  -- The six raise sites, in source order, each stating its reason.
  v_details := array(
    select (regexp_matches(v_src, 'detail = ''([a-z_0-9]+)''', 'g'))[1]
  );
  if v_details is distinct from
     array['unavailable','past_date','calendar_closed','seat_blocked','past_cutoff','past_cutoff'] then
    raise exception
      'seat_blocked reclassification: expected details {unavailable,past_date,calendar_closed,seat_blocked,past_cutoff,past_cutoff}, found %',
      v_details;
  end if;

  -- Message byte-identity: every customer-facing string this gate has always
  -- raised is still present verbatim.
  if position($m$Cannot book a date in the past$m$ in v_src) = 0
     or position($m$The salon is closed on that date$m$ in v_src) = 0
     or position($m$That time slot is closed on this date$m$ in v_src) = 0
     or position($m$Same-day booking isn''t available for that time — please pick another day$m$ in v_src) = 0
     or position($m$Too close to the start time to book this online — please give us a ring$m$ in v_src) = 0 then
    raise exception 'seat_blocked reclassification: a gate message changed; messages must stay byte-identical';
  end if;

  -- Never reachable by a customer-facing role via /rest/v1/rpc.
  if exists (
    select 1
      from pg_proc p
     cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     where p.proname = 'validate_booking_calendar'
       and pg_get_userbyid(a.grantee) in ('anon', 'authenticated')
  ) then
    raise exception 'seat_blocked reclassification: the calendar gate is executable by anon or authenticated';
  end if;
end;
$post$;
