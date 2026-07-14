# Human booking rules & deposit-required flow — design

**Date:** 2026-07-14
**Status:** Approved by Bleep (chat), pending spec review

## Summary

Three per-customer controls on the human card, plus a deposit workflow:

1. **Preferred timeslots** — steering only. Shown to staff and gently highlighted in the
   customer portal. Never enforced.
2. **Blocked timeslots** — slots this customer cannot book. DB-enforced for non-staff
   (portal, WhatsApp Flow, any future route); staff can still book them deliberately.
3. **Deposit required** — a tag on the human. Every booking made for a tagged customer is
   created *awaiting a deposit*: the customer gets bank details + a unique payment
   reference, the booking holds its slot for **12 hours** (or until the appointment if
   sooner), staff confirm on receipt, and an hourly job auto-cancels unpaid ones past the
   deadline. On a no-show the deposit is non-refundable and non-transferable — policy
   text only; no mechanical refund/credit exists to build.

## Decisions taken (with Bleep)

- Blocked slots: **DB-enforced, staff exempt** (pregnancy-gate pattern).
- Preferred slots: **staff hint + portal highlight**, no restriction.
- Deposit: **a per-human tag**; amount = existing £10 default (`DEFAULT_DEPOSIT_AMOUNT`,
  still editable per booking as today).
- Unpaid deposits: **auto-release after 12 hours** (Bleep's correction from the 3-day
  proposal). Window is a salon setting, default 12 hours.
- Pending-deposit bookings are modelled as **normal `Booked` bookings with deposit
  fields**, NOT a new status (Option A). No changes to the status CHECK constraint, the
  capacity engines (×3), or status displays' state machine — the highest-risk areas.

## Data model

### `humans` (new columns)

| Column             | Type      | Default | Notes                                     |
|--------------------|-----------|---------|-------------------------------------------|
| `preferred_slots`  | `text[]`  | `'{}'`  | Values validated against slot format `HH:MM` |
| `blocked_slots`    | `text[]`  | `'{}'`  | Same format                                |
| `deposit_required` | `boolean` | `false` | The tag                                    |

### `bookings` (new columns; `deposit_amount` already exists)

| Column                | Type          | Notes                                              |
|-----------------------|---------------|-----------------------------------------------------|
| `deposit_required`    | `boolean` default `false` | Stamped at insert for tagged owners        |
| `deposit_reference`   | `text`        | e.g. `SDG-7K3M`; same reference across a booking group |
| `deposit_due_by`      | `timestamptz` | `least(created_at + interval '12 hours', appointment start)` |
| `deposit_received_at` | `timestamptz` | Stamped by the staff "Deposit received" action      |

"Deposit received/paid" continues to use the existing Deposit-paid payment state;
`deposit_received_at` is the timestamp companion, and clearing the awaiting chip keys off
the payment state + timestamp.

### `salon_config.settings` (new keys, edited in Settings view)

- `deposit_bank` — `{ accountName, sortCode, accountNumber }` (no secrets; these are the
  details customers are *given* to pay into)
- `deposit_release_hours` — number, default `12`

## Enforcement (DB is the authority)

New `BEFORE INSERT` trigger on `bookings` — `enforce_human_slot_blocks()`:

- Bypasses on `is_staff()` (same as calendar/capacity/pregnancy gates).
- Looks up the dog's owner's `blocked_slots`; if the inserted `slot` is in it, raise
  `P0001` with a customer-mappable message.
- Table-level, so the portal RPC, WhatsApp Flow RPC, and any future route inherit it.
- Migration is idempotent and ends with the standard revoke block
  (docs/migrations.md convention). Applied to prod **before** merging dependent code.

Deposit stamping is a second `BEFORE INSERT` trigger (or the same function), applying to
**all** inserts — staff insert directly via RLS, so per-RPC stamping would miss them.
When the dog's owner is tagged: set `deposit_required`, compute `deposit_due_by`, and set
`deposit_reference` — derived deterministically from the booking group id (falling back
to the booking id for singletons) so every row in a group shares one reference without
cross-row coordination.

## Engine (pure TS, unit-tested)

New `src/engine/deposits.ts` + additions to slot selection logic:

- `generateDepositReference()` — `SDG-` + 4 chars from an unambiguous alphabet (no
  0/O/1/I). Short because bank reference fields are tight. Mirrored in the SQL helper.
- `depositDueBy(createdAt, bookingDate, slot, releaseHours)` — the
  `least(+12h, appointment start)` rule, Europe/London aware.
- Slot filtering/sorting: portal availability filters out `blocked_slots` (defence in
  depth in front of the trigger) and sorts/labels `preferred_slots` first
  ("Your usual time").

## UI

### Human card (`HumanCardModal`)

New **Booking rules** panel:

- Slot-grid picker for preferred times, second picker for blocked times (a slot can't be
  both; picking one clears the other). Canonical grid only (08:30–13:00).
- **Deposit required** toggle with one-line explanation of the flow.
- Header chip when tagged (e.g. "Deposit customer") and a small indicator when blocks
  exist, so it's visible at a glance in the directory card.

### Customer portal

- Wizard slot list: blocked slots absent; preferred slots surfaced first with a star.
- Wizard confirmation step + dashboard `AppointmentsSection`, when awaiting deposit:
  amount, bank details, **reference**, due time, and the policy line —
  *"Your booking is confirmed once your deposit arrives. Deposits are non-refundable
  and can't be transferred to another date if you don't show."*

### Staff app

- "Awaiting deposit" chip on calendar booking cards and `BookingDetailModal`.
- One-tap **Deposit received** action (booking modal + Today tile where applicable):
  sets Deposit-paid payment state, stamps `deposit_received_at`, triggers the normal
  confirmation notification.
- Today view: an "awaiting deposit" attention item listing unpaid deposit bookings and
  time left; overdue ones flagged before the cron sweep takes them.
- Staff booking flows for a tagged customer show the generated reference + bank details
  ready to paste into WhatsApp.

## Auto-release job

- `pg_cron`, **hourly**: cancel bookings where `deposit_required`, unpaid (no
  Deposit-paid state / `deposit_received_at is null`), and `now() > deposit_due_by`.
- Cancellation is a normal status change to `Cancelled` (frees capacity as today) with a
  recorded reason ("deposit not received").
- Each release emits the existing cancellation notification path + a staff push /
  `booking_events` entry so nothing vanishes silently.
- Job body follows the Vault webhook-secret pattern if it needs to call an edge fn;
  pure-SQL cancellation preferred if notifications can ride existing AFTER triggers.

## No-show policy

No refund/credit mechanics exist in the app and none are added. When a deposit booking
is cancelled or the dog doesn't show, the deposit remains recorded against that booking.
The policy is communicated, not computed.

## Testing

- Unit: reference generator (format, alphabet), due-by rule (12h vs appointment-sooner,
  timezone), slot filter/sort, deposit stamping decision.
- Component: Booking rules panel (pick/clear/mutual-exclusion, toggle), portal deposit
  panel, awaiting-deposit chip + received action.
- Migration: idempotency + revoke block; `npm run check:migrations`.
- CI bar: lint, typecheck, check:migrations, test, build — all green before push.

## Rollout order

1. Migration (columns, trigger, helper, cron job) → applied to prod first.
2. Engine + repositories/transforms.
3. Staff UI (human card panel, chips, received action, Today item).
4. Portal UI (filtering, highlighting, deposit panel).
5. Settings (bank details + release-hours fields).

## Out of scope

- Automated payment matching (open banking / reading bank feeds).
- Card payments / online deposit taking.
- Refund or credit workflows.
- Per-customer deposit amounts (tag only; per-booking edit already exists).
