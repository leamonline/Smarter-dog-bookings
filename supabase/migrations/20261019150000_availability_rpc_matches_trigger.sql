-- ============================================================
-- get_small_medium_availability() offers only what the capacity trigger would
-- accept.
--
-- WHAT WAS WRONG (found 19 October 2026 from a WhatsApp Flow dead end)
--   The availability RPC decided "is there room?" with its own simplified rule,
--   `seats_used < 2 - blocked_seats`, and disagreed with validate_booking_capacity()
--   in three ways:
--
--   1. 2-2-1 rule ignored. A slot beside two full "double" slots can hold only
--      one dog (get_max_seats_for_slot), but the RPC still thought it had two.
--   2. Daily dog cap ignored. A day already at salon_config.daily_dog_cap was
--      still listed, so a customer could pick it and then find no time.
--   3. Cancelled and No-show bookings counted as seated. The trigger uses
--      booking_occupies_seat(status); the RPC summed every row, so a freed seat
--      stayed hidden from the Flow and the agent.
--
--   (1) and (2) offered days and slots the database then refused. (3) hid
--   capacity that was really free.
--
-- WHAT THIS CHANGES
--   Same signature, same return shape, same grants, so no caller changes. The
--   body now follows the trigger's own helpers rather than copying their rules:
--     - seats used per slot:  get_seats_used()   (honours booking_occupies_seat)
--     - slot ceiling:         get_max_seats_for_slot() over the whole day's grid,
--                             0 at 13:00 after a large dog at 12:00 (early close),
--                             minus staff-blocked seats, clamped at zero
--     - a dog needs:          get_seats_needed('small', slot)
--     - large dog in a slot it cannot share: not offered
--     - day at daily_dog_cap: not offered
--   Unchanged: open days (Mon-Wed unless day_settings says otherwise), the
--   canonical grid for future days and the per-date grid for today, and the
--   same-day rule (staff-flagged slot, 30+ minutes ahead, Europe/London).
--
--   The 2-2-1 ceiling is computed over active_slots_for(date) for EVERY day,
--   exactly as the trigger does, so a booked extra slot beside 13:00 still
--   counts. Future days are then narrowed to the canonical grid for what is
--   offered, as before: extra slots reach customers only as same-day openings.
--
-- SCOPE
--   One new dog of small/medium size, as the function's name says. Group
--   placement (several dogs, large-dog arrangements) stays with the allocator
--   in findGroupedSlots / groupAllocations; this function stays a day/slot
--   pre-filter, and the trigger stays the final authority.
--
-- ROLLOUT
--   CREATE OR REPLACE with an unchanged signature, so old and new application
--   code both work against it; it must still be applied to production BY HAND
--   before this pull request merges (docs/migrations.md). Idempotent. No data
--   is written.
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
  daily_cap as (
    -- Same read as the trigger: first salon_config row, 14 when unset.
    select coalesce((select sc.daily_dog_cap from salon_config sc limit 1), 14) as cap
  ),
  slot_grid as (
    -- The whole per-date grid, for every day: the 2-2-1 ceiling of a slot
    -- depends on its neighbours, extra slots included (as in the trigger).
    select od.day_date, od.overrides, od.immediate_slots,
           s.slot, s.idx::integer as idx
      from open_days od
      cross join lateral unnest(active_slots_for(od.day_date))
             with ordinality as s(slot, idx)
  ),
  usage as (
    select sg.day_date, sg.overrides, sg.immediate_slots, sg.slot, sg.idx,
           public.get_seats_used(sg.day_date, sg.slot) as seats_used
      from slot_grid sg
  ),
  day_state as (
    select u.day_date,
           array_agg(u.seats_used order by u.idx) as used_arr,
           public.has_large_dog(u.day_date, '12:00', null) as early_close,
           (select count(*)
              from bookings b
             where b.booking_date = u.day_date
               and public.booking_occupies_seat(b.status)) as dogs_booked
      from usage u
     group by u.day_date
  ),
  slot_state as (
    select u.day_date,
           u.slot,
           u.immediate_slots,
           u.seats_used,
           ds.dogs_booked,
           -- Ceiling for this slot, built in the trigger's order: 2-2-1, then
           -- early close, then staff-blocked seats (malformed legacy rows are
           -- skipped by the key/value shape guards, as in get_blocked_seats).
           greatest(
             case
               when u.slot = '13:00' and ds.early_close then 0
               else get_max_seats_for_slot(u.idx, ds.used_arr)
             end
             - (
               select count(*)
                 from jsonb_each_text(coalesce(u.overrides -> u.slot, '{}'::jsonb)) as seat(k, v)
                where seat.k ~ '^[0-9]+$'
                  and seat.v = 'blocked'
             )::integer,
             0
           ) as slot_cap,
           -- A small/medium dog cannot share a slot a large dog fills.
           (
             public.is_large_dog_slot(u.slot)
             and not public.large_dog_can_share(u.slot)
             and public.has_large_dog(u.day_date, u.slot, null)
           ) as large_fills_slot
      from usage u
      join day_state ds on ds.day_date = u.day_date
  )
  select ss.day_date, ss.slot
    from slot_state ss
    cross join daily_cap dc
   where ss.seats_used + get_seats_needed('small', ss.slot) <= ss.slot_cap
     and not ss.large_fills_slot
     and ss.dogs_booked < dc.cap
     -- Offered grid: today uses the per-date grid so flagged extra slots can
     -- surface (the same-day predicate below still requires the flag); future
     -- days offer the canonical grid only, by design.
     and (
       ss.day_date = ((now() at time zone 'Europe/London'))::date
       or ss.slot = any (active_slots())
     )
     -- Same-day rule (mirrors validate_booking_calendar): today only on a
     -- staff-flagged slot with 30+ minutes to go; past days never. Slots come
     -- from active_slots()/active_slots_for(), both strict HH:MM, so the
     -- ::time cast cannot throw.
     and (
       ss.day_date > ((now() at time zone 'Europe/London'))::date
       or (
         ss.day_date = ((now() at time zone 'Europe/London'))::date
         and ss.slot = any (ss.immediate_slots)
         and (now() at time zone 'Europe/London') <= (ss.day_date + ss.slot::time - interval '30 minutes')
       )
     )
   order by ss.day_date, ss.slot;
$$;

comment on function get_small_medium_availability(date, date) is
  'Free capacity for ONE small/medium dog per (open day, slot) in the range, as validate_booking_capacity() would accept it: seats via get_seats_used (Cancelled and No-show free their seat), ceiling via get_max_seats_for_slot (2-2-1) over the per-date grid, 13:00 closed after a large dog at 12:00, staff-blocked seats subtracted, large-dog slots excluded, days at salon_config.daily_dog_cap omitted. Today runs on the per-date grid gated by day_settings.immediate_slots with the 30-minute cutoff (Europe/London); future days offer the canonical grid; past days are never returned. Internal-only (service_role): feeds the WhatsApp Flow and agent.';

revoke all on function public.get_small_medium_availability(date, date) from public, anon, authenticated;
grant execute on function public.get_small_medium_availability(date, date) to service_role;
