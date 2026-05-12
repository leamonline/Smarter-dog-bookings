# Capacity engine — the 2-2-1 rule

This is the rule that decides whether a booking is allowed into a
slot. It runs both in the React app (so staff get an immediate yes/no
when they click a seat) and in Postgres as a `BEFORE INSERT` trigger
on `bookings` (so customer-portal inserts and direct SQL inserts
can't slip past).

## The rule, in one line

At any given time block, the salon will hold at most:

- **2 small dogs**
- **2 medium dogs**
- **1 large dog**

…hence "2-2-1". Large dogs may only be booked into time slots that
are explicitly listed in `salon_config.large_dog_slots`; outside
those slots the seat count for large is zero, not one.

## Worked example

A Monday at 09:00 with two cockapoos and a Frenchie already booked:

| Dog | Size | Allowed? |
|---|---|---|
| Cockapoo #3 | small | ❌ — small seats full (2 / 2) |
| Standard Poodle | medium | ✅ — medium has 1 / 2 used |
| Labrador (if 09:00 is an approved large slot) | large | ✅ — large has 0 / 1 used |
| Labrador (if 09:00 is **not** in `large_dog_slots`) | large | ❌ — no large seat at this time |

The detail modal will tell staff exactly which constraint blocked a
booking ("Small seats full", "Not a large-dog slot", etc.) so the
"why not" is never a mystery.

## Where the rule lives in code

- **Frontend, fast path** — [src/engine/capacity.ts](../src/engine/capacity.ts)
  exports `canBookSlot()` and `getSeatStatesForSlot()`. These compute
  the same yes/no the trigger will, and feed the seat-state
  rendering in the day grid.
- **Database, source of truth** — [supabase/migrations/20260331083432_capacity_trigger.sql](../supabase/migrations/20260331083432_capacity_trigger.sql)
  installs `enforce_booking_capacity()` as a `BEFORE INSERT` trigger
  on `bookings`. This is what rejects an insert that the frontend
  somehow let through.

## Approved large-dog slots

Configured per-salon in `salon_config.large_dog_slots` — a jsonb map
keyed by HH:MM. Each entry has:

| Field | Meaning |
|---|---|
| `seats` | How many large dogs fit in this slot (usually 1) |
| `canShare` | Whether a large dog can share the slot with smaller dogs |
| `needsApproval` | Owner has to manually wave it through |
| `conditional` | Slot is only large-eligible on certain days |

Staff edit this set from **Settings → Capacity Engine**. The chips
list every currently-allowed slot; tapping one removes it.

## Disabling the rule

`salon_config.enforce_capacity = false` switches the engine off
entirely — used for one-off events or holidays where staff want to
hand-pick whatever they fancy. The toggle is visible at the top of
the Capacity Engine settings card.

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
