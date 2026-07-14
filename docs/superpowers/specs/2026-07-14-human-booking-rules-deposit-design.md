# Human booking rules & deposit-required flow — design

**Date:** 2026-07-14
**Status:** Approved by Bleep (chat); spec reviewed against the codebase 2026-07-14
(five findings folded in — see "Review findings" notes inline)

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

- Blocked slots: **DB-enforced, staff exempt** — but on the **calendar/capacity-gate
  pattern (`BEFORE INSERT OR UPDATE`)**, not the pregnancy gate's INSERT-only shape.
  Reschedules are UPDATEs (the WhatsApp manage-booking path updates `bookings` in
  place — migration `20260619130000` — and autonomous applies run as service role,
  so `is_staff()` is false there); an INSERT-only gate would let a customer be
  rescheduled straight into a blocked slot.
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
| `deposit_reference`   | `text`        | e.g. `SDG-7K3M`; same reference across a customer-visit (see derivation below) |
| `deposit_due_by`      | `timestamptz` | `least(created_at + interval '12 hours', appointment start)` |
| `deposit_received_at` | `timestamptz` | Stamped by the staff "Deposit received" action      |

"Deposit received/paid" continues to use the existing payment state — the exact stored
literal is **`"Deposit Paid"`** (`bookingRules.ts:100`; the other states are
`"Due at Pick-up"` and `"Paid in Full"`). `deposit_received_at` is the timestamp
companion, and clearing the awaiting chip keys off the payment state + timestamp.

### `salon_config.settings` (new keys, edited in Settings view)

- `deposit_bank` — `{ accountName, sortCode, accountNumber }` (no secrets; these are the
  details customers are *given* to pay into)
- `deposit_release_hours` — number, default `12`

## Enforcement (DB is the authority)

New `BEFORE INSERT OR UPDATE` trigger on `bookings` — `enforce_human_slot_blocks()`:

- **Fires on UPDATE as well as INSERT** (review finding 1). Reschedules are UPDATEs —
  the WhatsApp manage-booking path updates `bookings` in place
  (`20260619130000_whatsapp_manage_booking.sql`), and the calendar + capacity gates are
  `BEFORE INSERT OR UPDATE` for exactly this reason. Copy the capacity gate's guard
  shape (`20260622100000_daily_dog_cap.sql` lines 78–86): skip when the resulting row is
  `Cancelled`, only validate when the row is (or moves to) an active state. The portal
  reschedule happens to be create-then-cancel (insert path), but the WhatsApp/autonomous
  route and any future path must be covered.
- Bypasses on `is_staff()` (same as calendar/capacity/pregnancy gates).
- Looks up the dog's owner's `blocked_slots`; if the target `slot` is in it, raise
  `P0001` with a **distinct, customer-friendly message** — the wizard and the WhatsApp
  Flow both map on `error.code`/message, so the text must be distinguishable from the
  calendar/capacity/pregnancy messages (review finding 4; see "Blocked slots and the
  WhatsApp Flow" below).
- Table-level, so the portal RPC, WhatsApp Flow RPC, and any future route inherit it.
- Migration is idempotent and ends with the standard revoke block
  (docs/migrations.md convention). Applied to prod **before** merging dependent code.

Deposit stamping is a second `BEFORE INSERT` trigger (or the same function), applying to
**all** inserts — staff insert directly via RLS, so per-RPC stamping would miss them.
When the dog's owner is tagged: set `deposit_required`, compute `deposit_due_by`, and set
`deposit_reference`.

**Reference derivation (review finding 2):** derive deterministically from
**owner id + booking_date**, NOT the booking group id. Staff multi-dog bookings
deliberately have no `group_id` (`20260701230000_staff_booking_group_rpc.sql`:
"group_id is deliberately NOT assigned"), and deposit-tagged customers are precisely the
ones staff book over WhatsApp — a group-id derivation would give each dog in a staff
two-dog visit a different bank reference. Owner + date gives one reference per
customer-visit on every route, with no cross-row coordination. (Two visits by the same
owner on the same day share a reference — harmless, it's the same person paying.)

**Reschedule of an awaiting-deposit booking (review finding 5):** the stamping function
also runs on `UPDATE OF booking_date, slot` for rows still awaiting
(`deposit_required and deposit_received_at is null and payment not in
('Deposit Paid','Paid in Full')`): recompute `deposit_due_by` against the new
appointment start (still `least(created_at + window, new start)`), keep the existing
`deposit_reference`, and never touch `deposit_received_at`. Paid or received rows are
left alone.

### Blocked slots and the WhatsApp Flow

The availability RPCs (`get_small_medium_availability` etc.) are per-day, not per-human,
so the Flow will still *offer* a blocked slot; the trigger then rejects the insert.
Accepted for v1 as the backstop — the build must verify how
`create_whatsapp_booking_group` surfaces the P0001 so the customer gets the friendly
message, not a raw error. Filtering inside the Flow's data-exchange availability call is
a nice-to-have follow-up, not in scope.

### Verified against the codebase (no build-time surprises)

- Customers **cannot un-tag themselves or clear their own blocks**: the broad customer
  UPDATE on `humans` was removed 2026-07-12 (`20260712115759_legal_risk_tranche1.sql`);
  customer profile writes go through fixed-column SECURITY DEFINER functions.
- Customers **can read** `salon_config` (`customer_select_salon_config`, phase-2
  migration), so the portal can render `settings.deposit_bank` directly.
- `bookings.deposit_amount`, `DEFAULT_DEPOSIT_AMOUNT` (£10, `bookingRules.ts:43`) and
  `salon_config.settings` (jsonb, `20260604120000`) all exist as assumed.

## Engine (pure TS, unit-tested)

New `src/engine/deposits.ts` + additions to slot selection logic:

- `generateDepositReference()` — `SDG-` + 4 chars from an unambiguous alphabet (no
  0/O/1/I), derived from owner id + booking date (see Enforcement). Short because bank
  reference fields are tight. Mirrored in the SQL helper. ~1M combinations: when
  matching an incoming payment, staff/UI match against **awaiting** bookings only, so
  collisions across history are a non-issue.
- `depositDueBy(createdAt, bookingDate, slot, releaseHours)` — the
  `least(+12h, appointment start)` rule, Europe/London aware.
- Slot filtering/sorting: portal availability filters out `blocked_slots` (defence in
  depth in front of the trigger) and sorts/labels `preferred_slots` first
  ("Your usual time").

## UI

### Human card (`HumanCardModal`)

New **Booking rules** panel:

- Slot-grid picker for preferred times, second picker for blocked times (a slot can't be
  both; picking one clears the other). Canonical grid only (08:30–13:00) — a
  known consequence: per-date extra slots (after 13:00) can never be blocked. Acceptable,
  since extras only reach customers as staff-flagged last-minute openings.
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

- `pg_cron`, **hourly**: cancel bookings where `deposit_required`, unpaid, and
  `now() > deposit_due_by`. **Unpaid predicate (review finding 3):**
  `payment not in ('Deposit Paid', 'Paid in Full') and deposit_received_at is null` —
  `'Paid in Full'` must count as satisfied, otherwise the sweep cancels a booking the
  customer paid for in full up front. (Exact literals from `PaymentStateSection.jsx` /
  `bookingRules.ts:100`.)
- Cancellation is a normal status change to `Cancelled` (frees capacity as today) with a
  recorded reason ("deposit not received").
- Each release emits the existing cancellation notification path + a staff push /
  `booking_events` entry so nothing vanishes silently.
- **Pure-SQL cancellation confirmed viable** (review-verified): `pg_cron` is already in
  use (`notification-pending-reaper`, `20260615140000`); the capacity/calendar gates
  explicitly skip when the resulting row is `Cancelled`
  (`20260622100000_daily_dog_cap.sql`); and the AFTER-UPDATE status-notification
  triggers (`20260505202745`) plus `booking_events` → staff push fire from a cron-driven
  update. No edge-function call, so no Vault secret needed.

## No-show policy

No refund/credit mechanics exist in the app and none are added. When a deposit booking
is cancelled or the dog doesn't show, the deposit remains recorded against that booking.
The policy is communicated, not computed.

## Testing

- Unit: reference generator (format, alphabet, owner+date determinism — same visit ⇒
  same reference across rows), due-by rule (12h vs appointment-sooner, timezone,
  recompute-on-reschedule), slot filter/sort, deposit stamping decision, sweep
  predicate (`Paid in Full` counts as satisfied).
- Trigger coverage: blocked slot rejected on INSERT **and** on UPDATE (reschedule into a
  blocked slot); staff bypass on both; cancellation UPDATE not blocked.
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
