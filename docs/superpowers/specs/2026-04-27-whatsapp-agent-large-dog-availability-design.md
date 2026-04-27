# WhatsApp Agent — Large-Dog Day-Level Availability

**Date:** 2026-04-27
**Approach:** A — new helper + day-level RPC, no trigger changes
**Scope:** `whatsapp-agent` edge function + one new migration

## Background

PR [#58](https://github.com/leamonline/Smarter-dog-bookings/pull/58) shipped slot-level availability awareness for small and medium dogs via `get_small_medium_availability(p_from, p_to)` (migration 034). The agent now proposes concrete `booking_action` rows for those dogs.

Large dogs were deliberately excluded from #58. The 006 capacity trigger applies several inter-slot rules — 5-slot allowlist, 09:00 conditional, 12:00/13:00 early-close, 12:30+13:00 back-to-back exception, can-share vs full-takeover capacity, 2-2-1 cap — and replicating them slot-precisely in a separate RPC was rejected as too much logic to keep in sync.

For large-dog enquiries the agent currently always says "the team will check the diary," even when the next 4 weeks are clearly empty. The customer-visible result is dishonest in both directions: it hides plenty of capacity when there is some, and it fails to set expectations when the diary is genuinely tight.

This spec closes that gap with **day-level** truth (not slot-level) for large dogs. The agent gets a coarse but reliable signal about which days have at least one bookable large-dog slot, so it can name candidate days or admit the diary is tight — without ever proposing a specific time-of-day or a `booking_action` (those still need staff).

## Goal

For large-dog enquiries, the agent:

- Names specific days that have large-dog capacity ("looks like Wed 13 May has space — would that work?") instead of always deferring.
- Acknowledges honestly when the next 30 days are tight or fully booked.
- Never proposes a `booking_action` for a large dog.
- Never cites a specific time-of-day for a large dog (we have day-level signal only).

For small/medium dogs, behaviour is unchanged from #58.

## Non-goals

- **Slot-level large-dog availability.** The agent gets a per-day boolean. If the user wants slot precision in future, that's an upgrade path via approach B (refactor 006), not this spec.
- **Booking_action for large dogs.** Staff still picks the actual slot for every large-dog booking.
- **Refactor of migration 006.** The trigger remains the safety net. The new helper duplicates a small portion of the trigger's rule application; the regression test below catches drift.
- **Volume-aware behaviour.** Agent is given the same 30-day window as small/medium regardless of how busy the diary is.

## Architecture

Three additive pieces. No changes to migration 006 or to existing booking insert/update flows.

### New: migration `035_whatsapp_agent_large_dog_availability.sql`

Adds two functions to the `public` schema.

**Helper — `large_dog_can_fit_on_day(p_date date) returns boolean`**

Walks the 5 large-dog allowed slots in order: `08:30, 09:00, 12:00, 12:30, 13:00`. Returns `true` on the first slot that passes all rules; returns `false` if none pass. Composes the existing 006 helpers (`active_slots`, `get_seats_needed`, `get_seats_used`, `has_large_dog`, `is_large_dog_slot`, `large_dog_can_share`, `get_max_seats_for_slot`) and inlines the rule branches the trigger already runs.

Pseudocode for the per-slot check (every line maps to a check that exists in `validate_booking_capacity()` in 006):

```
-- safety flag — fail open if globally disabled
if salon_config.enforce_server_capacity = false:
    return true

-- Note: day_settings.overrides is NOT read. Overrides in this codebase
-- encode per-seat blocking flags ({"<slot>": {"<seat_idx>": "blocked"|"open"}})
-- and are enforced only by the frontend capacity engine. The 006 trigger
-- does not consult them, so neither does this helper.

let seats_used   = get_seats_used(date, slot)
let seats_array  = [get_seats_used(date, s) for s in active_slots()]
let max_seats    = get_max_seats_for_slot(slot_index, seats_array)
let early_close  = has_large_dog(date, '12:00')
let has_large    = has_large_dog(date, slot)
let can_share    = large_dog_can_share(slot)
let seats_needed = get_seats_needed('large', slot)

-- 09:00 conditional
if slot = '09:00':
    if get_seats_used(date, '08:30') > 0: skip
    if get_seats_used(date, '10:00') > 1: skip

-- 12:00 conditional (only OK if 13:00 is empty)
if slot = '12:00':
    if get_seats_used(date, '13:00') > 0: skip

-- 13:00 early close
if slot = '13:00' and early_close: skip

-- back-to-back: only 12:30 + 13:00 pair allowed
if not can_share:
    if has any adjacent non-shareable large dog
       (other than the explicit 12:30+13:00 pair): skip

-- shareable + already-large
if can_share and has_large: skip

-- full-takeover slot must be empty
if not can_share and seats_used > 0: skip

-- general 2-2-1 + capacity cap
if seats_used + seats_needed > max_seats: skip

-- this slot is bookable for a large dog
return true
```

If the loop finishes without returning, returns `false`.

**RPC — `get_large_dog_day_availability(p_from date, p_to date) returns table (booking_date date, has_capacity boolean)`**

Iterates open days in the range using the same open-day filter as `get_small_medium_availability` (default Mon/Tue/Wed unless `day_settings.is_open` overrides), calls the helper per day, and returns one row per open day. Closed days are omitted from the result entirely.

Same security/grants pattern as 034:

```sql
revoke all on function ... from public;
grant execute on function ... to authenticated, service_role;
```

Both functions are `stable` and `security definer` with `set search_path = public`.

### Changed: `supabase/functions/whatsapp-agent/index.ts`

A new `buildLargeDogAvailabilityBlock(supabase, todayIso)` function structurally cloned from `buildAvailabilityBlock` (around lines 405–460). It:

1. Calls the new RPC with `p_from = today`, `p_to = today + 30`.
2. On RPC error: returns `--- Large-dog availability ---\n(unavailable — tell the customer the team will check the diary)` and logs a warning. Same fallback shape as the small/medium block.
3. On success: builds two arrays — `daysWithCapacity` and `daysFullyBooked` — by iterating the 30-day window:
   - For each row, classify as capacity / full.
   - Default-open days (Mon/Tue/Wed) without a row are also "full" (closed via `day_settings`); they're omitted entirely from both lists (closed days are noise to the agent).
4. Renders a compact two-line block:

```
--- Large-dog availability (next 30 days) ---
Days with capacity: Mon 27 Apr, Wed 29 Apr, Tue 05 May, Mon 11 May, Wed 13 May
Days fully booked: Tue 28 Apr, Mon 04 May, Wed 06 May, Tue 12 May, Mon 18 May
```

5. Edge cases for the body:
   - If `daysWithCapacity` is empty: replace the body with `(no large-dog capacity in the next 30 days — tell the customer the team will check the diary)`.
   - If `daysFullyBooked` is empty (everything has capacity): omit that line.

`buildContext` (around line 553) gets one new line: `parts.push(await buildLargeDogAvailabilityBlock(supabase, todayIso));` immediately after the existing `buildAvailabilityBlock` push. Both blocks are always rendered regardless of which dog the customer is asking about — the system prompt decides how the agent uses them.

Token cost: ~80–150 input tokens per turn — negligible against the existing context.

### Changed: system prompt (also in `index.ts`, around lines 199–210)

Two existing rules updated, one new rule inserted.

**Modify line 208** (the "NEVER invent" rule) — generalise to both blocks:

```
- NEVER invent appointment slots or days. For SMALL/MEDIUM, you may
  only cite dates and times from "--- Availability ---". For LARGE,
  you may only cite days from "--- Large-dog availability ---" (and
  never times of day). If a block is missing, empty, or says
  "unavailable", say "let me just check the diary and come back to you".
```

**Insert a new rule** between lines 203 and 204:

```
- For LARGE dogs: when "--- Large-dog availability ---" is present,
  you MAY name specific days from "Days with capacity" to be helpful
  ("looks like Wed 13 May has space — would that work?") and you MAY
  acknowledge a tight diary when "Days fully booked" is long ("the
  next few weeks are very busy for large dogs"). You MUST NOT cite a
  time-of-day for a large dog. You MUST NOT propose a booking_action
  for a large dog. The customer must still clearly expect a follow-up
  confirmation from staff — banned phrasing from above still applies.
```

**Leave line 203 as-is** — the existing "if size is large, no booking_action regardless of availability" remains correct. The new rule sits alongside it and is purely additive.

The line-204 banned-phrase list ("booked in", "pencilled in", "you're in", etc.) already covers all sizes; no change needed there. Brand voice (3-step formula, `🎓🐶❤️ X` sign-off) is unchanged.

## Data flow

```
Inbound WhatsApp message
  → whatsapp-agent edge function
    → buildContext()
      → existing queries (matched human, dogs, upcoming bookings)
      → buildAvailabilityBlock                       (existing, small/medium)
      → buildLargeDogAvailabilityBlock               ← NEW
          → rpc.get_large_dog_day_availability(today, today+30)
            → loop open days, call large_dog_can_fit_on_day
              → loop 5 allowed slots, run rule branches
      → format both blocks into prompt context
    → call Claude with context
    → parse booking_action from response if present
       (large-dog responses never include one — system prompt blocks)
    → write whatsapp_drafts row (and whatsapp_booking_actions row only
      for small/medium booking_actions, unchanged from #58)
```

## Failure modes

| Scenario | Behaviour |
|---|---|
| Helper disagrees with trigger (rule drift) | Trigger is the source of truth; insert path unaffected. Agent might mention a day that turns out to be unbookable for large dogs, but staff catches it at the booking-modal level when entering the slot. No data corruption. The regression test below catches drift in CI. |
| RPC errors (missing grant, schema drift, network) | Edge function logs warning, emits `(unavailable …)`. Agent falls back to "team will check". Customer-visible UX = pre-feature behaviour. |
| RPC returns empty for the whole 30-day window | Block body is `(no large-dog capacity in the next 30 days …)`. Agent says team will check. |
| `enforce_server_capacity = false` | Helper returns `true` for every open day (matches trigger's disabled state). Block shows every default-open day in "Days with capacity". |
| Customer asks about a large dog without a known `dog_id` | Existing `--- Dogs ---` block doesn't list the dog, so line 203 prevents `booking_action`. New rule only applies when a known large dog is in context, so agent defers cleanly. |
| Day is closed via `day_settings.is_open=false` | Day is omitted from RPC output entirely. Doesn't appear in either list. Consistent with how 034 handles closures. |
| Race between context build and staff Apply | No `booking_action` is ever proposed for large dogs in this design, so there's no race for a large-dog booking. The 006 trigger remains the safety net for any manual large-dog booking staff enters. |

## Testing

### SQL (before merging migration 035)

1. Apply on a Supabase branch (or via `apply_migration` directly — both functions are `create or replace` and idempotent).
2. **Empty-day check:** `select large_dog_can_fit_on_day('2026-05-04');` against a Monday with no bookings → expect `true`.
3. **Hand-built rule cases** (insert minimal bookings, assert helper output):
   - Day with one large dog at 12:00 → helper returns `true` (08:30/09:00/12:30 still bookable; 13:00 is correctly excluded by early-close).
   - Day with large dogs at both 12:30 and 13:00 → helper returns `false` (back-to-back + remaining slots also rule-blocked).
   - Day with bookings at 08:30 (≥1) and 10:00 (≥2) → 09:00 conditional fails. With 12:00, 12:30, 13:00 also full/blocked, helper returns `false`.
   - Day with `salon_config.enforce_server_capacity = false` → helper returns `true` even on a fully booked day.
4. **Regression test against the trigger (CI-runnable):** for ~50 random booking permutations, call `large_dog_can_fit_on_day(date)`, then attempt one large-dog INSERT at each of the 5 allowed slots inside savepoints. Assert: helper returns `true` ⇔ at least one savepoint INSERT succeeds. Catches drift in either direction.

### Edge function (after deploy)

5. Send a large-dog enquiry: "Can I book my Husky in for a full groom soon?" → confirm reply names a specific day from "Days with capacity" with no time-of-day, and the response contains no `booking_action` JSON.
6. Send a large-dog enquiry against an artificially-fully-booked test calendar → confirm reply uses honest tight-diary phrasing and still defers to staff.
7. Send a small/medium enquiry (regression) → confirm small/medium `booking_action` flow still works exactly as it does today.
8. Watch the next ~5 inbound large-dog messages in prod for any false positives where the agent named a day that turned out to be unbookable for the size.

## Rollout

1. Merge the spec.
2. Write implementation plan (separate doc under `docs/superpowers/plans/`).
3. Apply migration 035 (additive, idempotent).
4. Merge edge-function change; CI auto-deploys via `Deploy Supabase Edge Functions` workflow.
5. Manual test per items 5–7 above.
6. Watch the next inbound large-dog messages for false positives.

## Rollback

- Revert the edge function commit → auto-redeploys via CI.
- `drop function if exists get_large_dog_day_availability(date, date);`
- `drop function if exists large_dog_can_fit_on_day(date);`

No dependencies outside the agent. The rollback is safe to run at any point — the small/medium path from #58 is unaffected.
