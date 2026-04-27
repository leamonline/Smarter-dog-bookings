# WhatsApp Agent — Slot Availability Awareness

**Date:** 2026-04-24
**Approach:** B3 — small/medium only, new read-only RPC, no trigger changes
**Scope:** `whatsapp-agent` edge function + one new migration

## Background

The WhatsApp AI agent can emit an optional `booking_action` alongside each draft reply (shipped in PR [#55](https://github.com/leamonline/Smarter-dog-bookings/pull/55)). Staff approve the proposal in the inbox and an RPC (`apply_whatsapp_booking_action`) inserts the real booking.

The `booking_action` schema requires an exact `dog_id`, `booking_date`, `slot`, and `service`. A system prompt hard rule forbids inventing slots: *"NEVER invent appointment slots beyond what's in the context you've been given. If the context doesn't list availability, don't make up times."*

In practice this rule wins every time: the agent's context contains the customer's dogs and their upcoming bookings, but not the salon's open slots. So the agent correctly defers to "the team will check the diary" on every booking request, and no `booking_action` has ever been proposed in production.

This spec closes that gap: give the agent enough real availability signal to cite a bookable slot for small/medium dogs, without duplicating the full capacity logic from migration 006.

## Goal

For small/medium dogs, when a customer asks to book or asks "what's the soonest", the agent proposes a concrete `booking_action` with a slot that actually exists and isn't already fully booked.

For large dogs, behaviour is unchanged — agent continues to say "the team will check the diary."

## Non-goals

- Large-dog availability — the 2-2-1 rule, large-dog slot allowlist, back-to-back rules, early-close behaviour, and can-share logic in [006_capacity_trigger.sql](supabase/migrations/006_capacity_trigger.sql) are not replicated. Large dogs stay on the "team checks" path.
- 2-2-1 rule awareness for small/medium dogs — the RPC uses a simple `seats_used < 2` check. This may over-offer a slot in rare cases where a neighbouring slot pattern would cap the slot at 1. Staff catches any such case when clicking Apply.
- `day_settings.extra_slots` support — the column exists but isn't used in production today.
- Caching — one query per inbound message is cheap enough.
- Back-filling availability into historical conversations — only applies to new inbound messages after deploy.

## Architecture

### New: migration `034_whatsapp_agent_availability.sql`

Adds one function to the `public` schema:

```sql
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
  open_days as (
    select d.d as day_date
      from days d
      left join day_settings ds on ds.setting_date = d.d
     where coalesce(
             ds.is_open,
             extract(isodow from d.d) in (1, 2, 3)  -- Mon=1, Tue=2, Wed=3
           ) = true
  ),
  slot_grid as (
    select od.day_date, s.slot
      from open_days od
      cross join unnest(active_slots()) as s(slot)
  ),
  usage as (
    select sg.day_date, sg.slot,
           coalesce(
             (select sum(get_seats_needed(b.size, b.slot))
                from bookings b
               where b.booking_date = sg.day_date
                 and b.slot = sg.slot),
             0
           ) as seats_used
      from slot_grid sg
  )
  select day_date, slot
    from usage
   where seats_used < 2
   order by day_date, slot;
$$;

comment on function get_small_medium_availability(date, date) is
  'Returns (date, slot) pairs that are bookable for a small or medium dog in the given date range. Excludes the 2-2-1 rule and all large-dog capacity logic by design — staff approval is the safety net for edge cases.';

revoke all on function get_small_medium_availability(date, date) from public;
grant execute on function get_small_medium_availability(date, date) to authenticated, service_role;
```

Reuses the existing `active_slots()` and `get_seats_needed(size, slot)` functions from 006, so the canonical slot list and seat-cost table stay single-sourced.

### Changed: `supabase/functions/whatsapp-agent/index.ts`

Inside `buildContext`, after the `--- Upcoming bookings (next 14 days) ---` block:

1. Call the new RPC with `from = today`, `to = today + 30 days`.
2. Group the returned `(date, slot)` pairs by `date`.
3. Emit an `--- Availability (next 30 days, small/medium dogs only) ---` block formatted like:
   ```
   Mon 27 Apr: 08:30 09:00 10:30 11:00 12:30
   Tue 28 Apr: (all open)
   Wed 29 Apr: 09:00 10:30
   Mon 04 May: (closed)
   ```
   - "(all open)" when all 10 slots are available
   - "(closed)" when the day is open-by-default (Mon/Tue/Wed) in the 30-day window but `is_open=false` via `day_settings`
   - Non-default-open days (Thu/Fri/Sat/Sun) that remain closed are omitted entirely — they're noise
   - Days with partial availability list only the available slots

4. On RPC error, emit `--- Availability ---\n(unavailable — tell the customer the team will check the diary)` and log a warning. The agent should gracefully fall back to the "team will check" path.

### Changed: system prompt

Two changes inside the existing `HARD RULES` block — one replacement, one addition:

- **Replace** the current "NEVER invent appointment slots beyond what's in the context" line with a version that references the new section:
  > NEVER invent appointment slots. If `--- Availability ---` is present, you may only cite dates and times from that block. If it's missing or says "unavailable", say "let me just check the diary and come back to you".

- **Add** a new rule:
  > For SMALL or MEDIUM dogs and when `--- Availability ---` is present, you MAY include a `booking_action` with a slot taken from that block, provided all other booking_action requirements are met (known `dog_id`, service, size, explicit customer intent to book). For LARGE dogs, do NOT propose a booking_action regardless of availability — say the team will check.

## Data flow

```
Inbound WhatsApp message
  → whatsapp-agent edge function
    → buildContext()
      → query: matched human, dogs, upcoming bookings
      → query: get_small_medium_availability(today, today+30)  ← NEW
      → format prompt with new --- Availability --- section    ← NEW
    → call Claude with context
    → parse booking_action from response (if present)
    → write whatsapp_drafts row (and whatsapp_booking_actions row if present)
```

## Failure modes

| Failure | Behaviour |
|---|---|
| RPC raises (e.g. missing grant, schema drift) | Availability section shows "unavailable". Agent falls back to "team will check". Warning logged. Customer-visible behaviour = current behaviour. |
| RPC returns empty set (genuine no availability in 30 days) | Availability section shows no days. System prompt's existing "check the diary" fallback still applies. |
| Availability listed but slot gets booked between context-build and staff-Apply | Staff sees the mismatch at Apply time. The `apply_whatsapp_booking_action` RPC relies on the 006 capacity trigger to reject the insert. No data corruption. |
| Large-dog booking_action proposed despite rule | System prompt forbids it, but if the model emits one, staff sees it in the inbox and can reject. No capacity safety impact (large dogs still fail 006 if the slot is bad). |

## Testing

### SQL
Before merging the migration:
1. Apply on a Supabase branch or via direct SQL in the SQL Editor against a non-prod project (or accept prod via `apply_migration` since it's pure additive and idempotent — `create or replace`).
2. Call `select * from get_small_medium_availability(current_date, current_date + 30);` and spot-check against the Weekly Calendar view in the dashboard:
   - Pick 3 random days and confirm the returned slots match what the calendar shows as "has capacity."
   - Find a day with a large dog in an early-close slot (12:00) — confirm 13:00 is still listed as available (by design — we don't replicate early-close for this RPC).

### Edge function
After deploy:
1. Send a test WhatsApp message: "Can I book my Boston Terrier in for a full groom? Soonest please."
2. Confirm the staff inbox now shows a booking-proposal panel with a specific date + slot drawn from the Availability block.
3. Confirm the Apply flow still works end-to-end: booking appears with `status = 'Booked'`, action flips to `'applied'`.
4. Repeat with a large-dog prompt ("Can I book my Husky in?") — confirm no booking_action is proposed and the reply is the holding-response style.

## Rollout

1. Merge the spec.
2. Write implementation plan (separate doc under `docs/superpowers/plans/`).
3. Apply migration 034 to prod (auto-idempotent, low-risk).
4. Merge edge-function change; CI auto-deploys via `deploy-edge-functions` workflow.
5. Manual test per the Testing section.
6. Watch the inbox over the next few inbound messages; roll back (revert migration + edge function) if anything goes sideways.

## Rollback

- Revert the edge function commit → auto-redeploys via CI.
- `drop function if exists get_small_medium_availability(date, date);` — no dependencies outside the edge function.
