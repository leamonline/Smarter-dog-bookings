# Capacity engine — the 2-2-1 rule

This is the rule that decides whether a booking is allowed into a
slot. It runs both in the React app (so staff get an immediate yes/no
when they click a seat) and in Postgres as a `BEFORE INSERT` trigger
on `bookings` (so customer-portal inserts and direct SQL inserts
can't slip past).

## The rule, in one line

Each slot normally has **two seats**. The engine lowers a slot to **one
seat** when either the two slots immediately before it, the slots on either
side, or the two slots immediately after it are already using two seats each.
That 2-2-1 pattern prevents a run of fully occupied neighbouring slots; it is
not a quota of two small dogs, two medium dogs, and one large dog in the same
slot.

Large dogs have separate approved-slot and sharing rules (see "Approved
large-dog slots" below). Those rules decide whether a large dog can use one or
two seats; they do not create a third size-specific seat pool.

## Worked example

A Monday where 09:00 and 09:30 each already use both seats:

| Proposed booking at 10:00 | Seats needed | Allowed? |
|---|---|---|
| One-seat booking | 1 | ✅ — the 2-2-1 rule caps 10:00 at one seat, which remains free |
| Two-seat full-takeover booking | 2 | ❌ — 10:00 is capped at one seat |

The engine evaluates the same rule around the target slot in both directions,
so the limit also applies if 10:00 sits between two fully occupied neighbours.
The detail modal will tell staff which constraint blocked a booking.

## Where the rule lives in code

- **Frontend, fast path** — [src/engine/capacity.ts](../src/engine/capacity.ts)
  exports `canBookSlot()` and `getSeatStatesForSlot()`. These compute
  the same yes/no the trigger will, and feed the seat-state
  rendering in the day grid.
- **Database, source of truth** — the `validate_booking_capacity()`
  `BEFORE INSERT` trigger on `bookings`. Originally added in
  `20260331083432_capacity_trigger.sql`, but the **live body has since been
  re-issued** — the current definition lives in
  [supabase/migrations/20260622100000_daily_dog_cap.sql](../supabase/migrations/20260622100000_daily_dog_cap.sql)
  (grep migrations for `validate_booking_capacity` and read the most recent).
  This is what rejects an insert the frontend somehow let through.

## Approved large-dog slots

The approved set is **hardcoded, once per engine copy** — it is not
read from config:

- `LARGE_DOG_SLOTS` in [src/constants/salon.ts](../src/constants/salon.ts)
  (frontend engine), a map keyed by HH:MM where each entry has:

| Field | Meaning |
|---|---|
| `seats` | How many seats the large dog consumes (1 = can share, 2 = full takeover) |
| `canShare` | Whether a large dog can share the slot with smaller dogs |
| `needsApproval` | Owner has to manually wave it through |
| `conditional` | Slot is only large-eligible situationally |

- `LARGE_DOG_SLOTS` in
  [supabase/functions/\_shared/salonConstants.ts](../supabase/functions/_shared/salonConstants.ts)
  (Deno mirror — consumed by `_shared/capacity.ts`; the same file also
  holds `LARGE_DOG_CANDIDATE_SLOTS`, a keys-only list the WhatsApp Flow
  uses for its slot options — keep that in step too), and
- the `IMMUTABLE` SQL helpers `is_large_dog_slot()` /
  `large_dog_can_share()` (added in `20260331083432_capacity_trigger.sql`)
  used by the trigger.

Current rules: **08:30** and **09:00** take 1 seat and can share
(09:00 is conditional); **12:00** takes 1 seat, can share, and
early-closes 13:00; **12:30** and **13:00** are 2-seat full
takeovers with no sharing.

> ⚠️ **`salon_config.large_dog_slots` is decorative.** The
> Settings → Capacity Engine card writes that jsonb column, but no
> enforcement path reads it — removing a chip in Settings changes
> nothing (audit finding AUDIT-1, 2026-07-01). Changing the real
> rules means changing all three hardcoded copies above **together**
> and extending the parity test
> (`src/lib/whatsapp/capacityParity.test.ts`).

## Disabling the rule

The server-side kill switch is **`salon_config.enforce_server_capacity`**
— `validate_booking_capacity()` reads it (treating a missing row as
`true`) and skips validation when it is `false`. There is no UI for
it; flip it via SQL for one-off events, and flip it back.

Two things that look like off-switches but aren't:

- The toggle on the Capacity Engine settings card writes a
  **different** column (`salon_config.enforce_capacity`) that nothing
  reads — it is currently a no-op (AUDIT-1).
- Per-booking, staff can set `bookings.staff_capacity_override` to
  bypass capacity for that row only; the trigger honours it for
  staff inserts and forces it off for non-staff.

## Assumptions and edge cases

- **Size is taken from the booking row**, not the dog row. If a dog
  is normally medium but is being booked into a "small dogs only"
  weekend, staff can override on the booking and capacity is
  enforced on the override.
- **Cancelled bookings don't count** toward the seat tally. Status
  values other than `Cancelled` do.
- **Chained / multi-dog bookings**: each row counts individually.
  The grouped booking flow validates the whole chain before any
  insert, so it's still atomic.
- **Reschedules** treat the destination slot under the same rule —
  there's no special case for the seat that just opened up.

## Open questions

- Mixed-size sharing: today, `canShare` is honoured only for large
  slots and only against smaller dogs. Whether two smalls can share
  a single seat is not yet configurable.
- Time-of-day strictness: the rule applies per discrete slot. A
  10:00 booking and a 10:30 booking don't currently see each other
  in the capacity calculation — the trigger keys on `slot`, not on
  in-salon overlap.

If you're touching the engine, run `npm run test src/engine/capacity.test.js`
before opening a PR.

## Daily dog cap (separate from per-slot seats)

Beyond the 2-2-1 per-slot rule, the salon caps the **whole day** at
`salon_config.daily_dog_cap` (default **14** dogs). This is a throughput
limit, not slots×2. It is enforced for **non-staff** inserts inside
`validate_booking_capacity()` (migration `20260622100000_daily_dog_cap.sql`),
and mirrored client-side in `findGroupedSlots()` — in the frontend engine
(`src/engine/capacity.ts`), the Deno Flow mirror
(`supabase/functions/_shared/capacity.ts`), and as the `DAILY_DOG_CAP`
constant in `src/constants/salon.ts` + `_shared/salonConstants.ts`. Staff are
never day-capped.

## Pregnancy gate

A pregnant dog (`dogs.is_pregnant`) is blocked from every non-staff booking
insert by the separate `enforce_dog_not_pregnant()` `BEFORE INSERT` trigger
(migration `20260623130000_dog_pregnancy_gate.sql`), which raises P0001. Staff
bypass it (clinical judgement). The booking wizard greys out a pregnant dog as
a preflight only — the trigger is the authority.

## Staff-blocked seats (single-seat blocks)

Staff can block individual seats (`day_settings.overrides[slot][seatIndex] =
'blocked'`). A blocked seat removes one usable seat from **its own slot only**
— it never cascades into the 2-2-1 windowing of neighbouring slots or the
daily dog cap. Enforced in all three implementations (migration
`20260702150000_enforce_single_seat_blocks.sql`):

- `validate_booking_capacity()` subtracts the target slot's blocked-seat
  count from its max seats (inside the per-slot advisory lock;
  `staff_capacity_override` bypasses it like the other seat rules), and
  `get_small_medium_availability()` uses `slot_cap = 2 − blocked`.
- Both TS engines make bookings claim **non-blocked** seat indexes, so a
  booking can no longer land on a blocked index and silently displace the
  block (the old quirk that re-opened the second seat).
- SQL reading `overrides` guards the malformed legacy rows with
  `seat.k ~ '^[0-9]+$'` / `seat.v = 'blocked'` (same as `get_blocked_seats`).

`validate_booking_calendar`'s both-seats-blocked check remains as the
friendlier first-line error for a fully closed slot. A static-SQL invariant
test (`src/engine/capacityTrigger.test.ts`) fails if a future migration
re-issues either function without the blocked-seat logic.

## Extra slots — the per-date grid

Staff can add ad-hoc slots after 13:00 (`day_settings.extra_slots`). Until
migration `20260702170000` these were display-only — the gates validated
against the fixed `active_slots()` grid, so every booking into one failed
with "Invalid slot" (prod had zero non-canonical bookings, ever). Now the
bookable grid is per-date:

- `active_slots_for(p_date)` = `active_slots()` ∪ that date's sanitised
  (strict `HH:MM`, sorted) `extra_slots`. Used by the calendar gate, the
  capacity trigger (so the 2-2-1 window runs across the 13:00 → extras
  boundary — `get_max_seats_for_slot` is array-length agnostic) and
  `get_immediate_slots`. TS mirror: `buildSlotGrid`
  (`src/engine/slotGrid.ts` + `_shared/salonConstants.ts`).
- **Customer scoping:** extra slots reach customers **only** as same-day
  "last minute" openings (flag the slot on today's calendar). Future-date
  customer surfaces (portal grid, Flow availability) stay canonical.
- Large dogs are never extra-slot eligible (`is_large_dog_slot` keeps the
  fixed five; the trigger requires staff approval elsewhere).
- pgTAP coverage: `supabase/tests/030_extra_slots.test.sql` (invalid until
  configured, 2-seat capacity, malformed-value sanitising, large-dog
  refusal, 2-2-1 across the boundary). Static invariants:
  `src/engine/capacityTrigger.test.ts`.
- Known gap: the reports slot-usage chart still only shows canonical slots.

## Immediate ("last minute") slots — the same-day rule

Customers can only book **today** on slots staff explicitly opened ("Open for
immediate booking" in today's staff calendar → `day_settings.immediate_slots`
text[]), and only until **30 minutes before** the slot starts, judged on the
salon wall clock (Europe/London). Future dates are unchanged. Staff bypass via
`is_staff()` as usual.

Three SQL touchpoints, all in migration
`20260702130000_last_minute_immediate_slots.sql`:

- `validate_booking_calendar()` — the authority. Rejects any non-staff
  same-day write on an unflagged slot or past the cutoff (P0001; fires on
  INSERT **and** UPDATE, so reschedules onto today are gated too).
- `get_small_medium_availability()` / `get_large_dog_day_availability()` —
  apply the same predicate so the WhatsApp Flow and agent never offer a
  today-slot the trigger would reject.
- `get_immediate_slots()` — the customer-safe read (portal "Today — last
  minute" entry + Flow), returning today's still-bookable flagged slots.

Client-side, `IMMEDIATE_CUTOFF_MINUTES` (30) is mirrored in
`src/constants/salon.ts` + `_shared/salonConstants.ts` (parity-tested), with
helpers in `src/engine/immediateBooking.ts` (mirrored in
`_shared/flowBooking.ts`). One subtlety: the calendar trigger validates each
inserted row's own slot, so a **multi-dog group needs EVERY assigned slot
flagged** — a 2-dog visit that spills into the next slot requires both
consecutive slots opened. Consequences to know: a last-minute booking is
immediately inside the 24 h manage cutoff (no customer self-cancel/
reschedule) and gets no day-before reminder.
