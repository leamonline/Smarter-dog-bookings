# Deposit lifecycle completion — design

**Date:** 2026-07-31
**Status:** approved, ready for implementation planning
**Scope:** close the deposit loop on the legacy write path, mirror state into the
booking-policy foundation, without activating booking-policy v1.

---

## Why now

Deposit-held bookings currently receive **nothing**. The 2026-07-31 truthfulness
release correctly stopped `notify-booking-confirmed` claiming "booked in / see
you then" while a deposit was outstanding — but nothing sends anything later, so
the suppression became silence rather than a deferral.

Everything else in the legacy deposit path already works: stamping on insert and
reschedule (`trg_stamp_booking_deposit`), `deposit_received_at` on payment change
(`trg_set_booking_deposit_received_at`), and an hourly auto-release sweep
(`deposit-auto-release`, `:20` past). What is missing is everything *after* the
money is verified: no event, no visit-ledger mirror, no customer message, no
cross-booking staff view.

## Constraints (non-negotiable)

1. **Legacy booking writes remain authoritative.** The staff deposit write path
   is `bookings.payment` → `deposit_received_at`. Nothing replaces it.
2. **The trigger observes state transitions.** It is not a command path.
3. **The visit ledger is mirrored through `legacy_import`**, never written by a
   v1 command.
4. **The outbox represents intent, not delivery.**
5. **`notification_log` remains delivery history.** No second confirmation system.
6. **No booking-policy v1 mutation commands are activated.** The
   `bookingPolicyInactiveIsolation` guard stays green and unmodified.
7. **All money state changes are auditable and idempotent.**

## What the foundation already gives us

The dormant visit-policy v1 was built anticipating this migration path, so this
design consumes its vocabulary rather than inventing a parallel one:

| Foundation asset | How this phase uses it |
| --- | --- |
| `booking_visit_deposits.origin` accepts `'legacy_import'` | the mirror's origin |
| `satisfaction_source` accepts `'legacy_import'` | how a legacy receipt is explained |
| `state` includes `received` / `not_received` | the two terminal states we mirror |
| `booking_events.event_type` already permits `deposit_received` and `deposit_not_received` | **no check-constraint change needed** |
| every one of 449 bookings already has `visit_id` | the mirror has a key to hang on |

## Architecture

```
staff sets payment = 'Deposit Paid'
        │  (legacy write path — authoritative, unchanged)
        ▼
trg_set_booking_deposit_received_at   BEFORE UPDATE   → stamps deposit_received_at
        │
        ▼
trg_booking_deposit_acknowledged      AFTER UPDATE    ← NEW, thin observer
  WHEN (old.deposit_received_at IS NULL AND new.deposit_received_at IS NOT NULL)
        │
        ├─ booking_events            'deposit_received'   (audit, with actor)
        ├─ booking_visit_deposits    upsert origin='legacy_import', state='received'
        └─ booking_notification_outbox  enqueue kind='deposit_received'   (intent)
                                          │
                                          │  no HTTP in this transaction
                                          ▼
                        cron 'booking-notification-drain' (*/5)
                                          │
                                          ▼
                        notification-dispatch  (server-to-server)
                                          │  routes via _shared/notificationTargets.ts
                                          ▼
                        notify-booking-confirmed   → notification_log (delivery history)
```

### 1. The observer trigger

`trg_booking_deposit_acknowledged`, `AFTER UPDATE ON bookings`, guarded to the
exact edge:

```sql
WHEN (old.deposit_received_at IS NULL AND new.deposit_received_at IS NOT NULL)
```

It hangs off **the fact, not the route** — the booking modal, a bulk action, the
SQL editor and an MCP session all produce the same lifecycle. It performs three
durable writes and no network I/O.

A sibling trigger handles release: on transition to `status='Cancelled'` with
`cancel_reason='Deposit not received'`, emit `deposit_not_received` and mirror
`state='not_received'`. The existing `cancelled` event continues to fire
unchanged — this adds to the record, it does not replace it.

**The release path writes the event and the mirror but deliberately enqueues
nothing.** Auto-release already sets `status='Cancelled'`, which fires the
existing `notify_booking_cancelled_trigger`, so the customer is already told.
Enqueuing a `deposit_not_received` notification would send a second message
about the same cancellation. Release is an *audit* event here, not a
notification event.

Actor and timestamp come from the same helper `emit_booking_update_event` uses,
so `actor_id` / `actor_role` / `occurred_at` are populated exactly as elsewhere.

### 2. Idempotency — enforced by the database, not by careful code

Three independent guarantees:

- `booking_notification_outbox` — `UNIQUE (booking_id, kind)`; the enqueue is
  `ON CONFLICT DO NOTHING`.
- `booking_events` — a **partial** unique index on `(booking_id, event_type)`
  `WHERE event_type IN ('deposit_received','deposit_not_received')`. Partial
  because `rescheduled` legitimately repeats.
- `booking_visit_deposits` — already primary-keyed on `visit_id`, so the mirror
  is a natural single-row upsert.

On top of those, the trigger's `WHEN` clause means re-saving an
already-acknowledged booking never reaches the function at all.

### 3. The outbox — generic from the start

`booking_notification_outbox` is **not** deposit-specific. Deposits are its first
user, not its purpose.

```
id            uuid pk
booking_id    uuid not null references bookings(id) on delete cascade
kind          text not null check (kind in ('deposit_received'))
enqueued_at   timestamptz not null default now()
claimed_at    timestamptz
delivered_at  timestamptz
attempts      integer not null default 0
last_error    text
unique (booking_id, kind)
```

Adding a future notification type (`deposit_request`, day-closure, rebooking
nudge) is one value in the check constraint plus one line in the shared target
map — no new table, no new cron job.

**Why not reuse `notification_log`:** it is a per-recipient *send ledger* claimed
by the edge function at send time. `channel` is `NOT NULL`, rows are keyed per
`human_id`, and idempotency is
`UNIQUE (booking_id, trigger_type, human_id) WHERE status IN ('pending','sent')`.
Enqueuing from a trigger would require resolving recipients and choosing a
channel **in SQL**, reimplementing `recipientIdsForBooking` and
`resolveConfirmationChannel` — precisely the second confirmation system this
design forbids. The `notification-pending-reaper` is a stuck-row sweeper, not a
dispatcher. There is no existing abstraction to extend.

**What we do reuse unchanged:** because the confirmation is suppressed *before*
any log row is written, a deposit booking has no `notification_log` row, so the
deferred send inserts cleanly. If a booking was somehow already confirmed, the
unique index rejects with `23505` and that recipient is skipped — the correct
outcome. `notification_log` needs no changes.

### 4. Delivery — an extensible dispatcher, not a hard-wired call

The drain must not be permanently coupled to `notify-booking-confirmed`.

`resend-booking-notification` already contains the routing concept:

```ts
const TARGET: Record<string, { fn: string; key: "record" | "old_record" | "booking_id" }> = {
  confirmed: { fn: "notify-booking-confirmed", key: "record" },
  ready:     { fn: "notify-booking-ready",     key: "record" },
  cancelled: { fn: "notify-booking-cancelled", key: "old_record" },
  reminder:  { fn: "notify-booking-reminder",  key: "booking_id" },
};
```

It is gated behind a staff JWT and CORS, so a cron cannot call it. Therefore:

- **Extract** that map to `supabase/functions/_shared/notificationTargets.ts`.
  `resend-booking-notification` imports it (staff path, behaviour unchanged).
- **Add** `notification-dispatch`: a thin server-to-server function,
  webhook-secret authenticated, that claims pending outbox rows, resolves each
  `kind` through the shared map, forwards the booking in the shape that target
  expects, and records the outcome.
- The cron job is one generic line that names **no** notification function.

Routing then lives in exactly one place, shared by the staff resend path and the
automated drain.

Each `kind` resolves to three things in one place — the target function, the
payload shape it expects, and the `notification_log.trigger_type` that proves it
landed:

| outbox `kind` | target fn | payload key | settles against `trigger_type` |
| --- | --- | --- | --- |
| `deposit_received` | `notify-booking-confirmed` | `record` | `confirmed` |

**Settlement and retry.** The dispatcher stamps `claimed_at` and increments
`attempts`. A row is settled (`delivered_at`) once a `notification_log` row
exists for that booking with the `trigger_type` named above — delivery truth
stays in the ledger, the outbox only tracks intent. After 3 attempts it stops and retains
`last_error`, surfaced rather than looping silently. Delivery failure touches
only outbox rows, so it can never roll back the payment acknowledgement.

### 5. Staff visibility

Extend `buildImmediateAttention` in `src/engine/today.ts`. No new route, no
accounting features.

An item appears only when action is genuinely required:
- `deposit_required` is true
- not yet acknowledged (`deposit_received_at` is null and `payment` not in
  `Deposit Paid` / `Paid in Full`)
- not cancelled or auto-released

Sorted by: nearest appointment deadline → deposit release time → booking
creation time.

Actions: view booking, and mark deposit paid — which goes through the ordinary
legacy write path, so the trigger produces the event, mirror and outbox row as a
consequence rather than as a separate command.

### 6. Wording

`booking_confirmed_v1` is already truthful for this moment: once the deposit is
verified, "booked in … see you then" is exactly what is true. No template change,
no Meta lead time. The customer-facing copy shipped on 2026-07-31 already tells
them the appointment is held until the deadline and released otherwise, so the
receipt completes a promise the UI has already made honestly.

## Testing

| Proof | Level |
| --- | --- |
| One acknowledgement → exactly one event, one outbox row, one mirror row | pgTAP |
| Repeating the update creates no duplicate — the unique indexes *reject* | pgTAP |
| Notification failure cannot roll back the acknowledgement | pgTAP |
| Auto-release emits `cancelled` **and** `deposit_not_received`, mirrors `not_received` | pgTAP |
| Auto-release enqueues **no** outbox row — the customer is not told twice | pgTAP |
| The trigger fires on the transition regardless of caller (direct UPDATE, no RPC) | pgTAP |
| Mirror row carries `origin='legacy_import'` and `satisfaction_source='legacy_import'` | pgTAP |
| Attention-queue inclusion rules and sort order | vitest (`today.ts`) |
| Shared target map resolves every outbox `kind` | vitest / deno |
| No v1 mutation command is wired to UI | existing `bookingPolicyInactiveIsolation` |

## Out of scope

- Activating booking-policy v1 or any of its mutation commands.
- `deposit_request` messaging — needs a new Meta template (phase 2/3).
- Automatic bank matching / Open Banking.
- A dedicated deposits page.
- Accounting or financial reporting.

## Rollout

Migration-first, per the repo's hand-apply rule: the migration goes to
production **before** the code that depends on it merges. The trigger is inert
until a deposit is acknowledged, and with one (cancelled) deposit booking in
production today the live blast radius is effectively zero — the first real
exercise will be the next deposit-required booking.
