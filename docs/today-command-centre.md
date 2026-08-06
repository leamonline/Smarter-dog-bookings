# Today command centre + decision reports

> The `/today` staff landing screen and the six decision reports. This is the
> canonical reference for **what each surface shows and where every number comes
> from**. Verify against code if anything here looks stale.

## What this is

Two staff-facing surfaces built on one pure engine:

- **`/today`** — the default landing screen after staff login: a calm, fast
  operational work queue answering *"what needs attention right now?"*. The
  weekly calendar (`/`) stays the scheduling tool and is one tap away.
- **Reports** (`/reports`) — the existing cash-up + analytics page, extended
  with six decision-focused reports (2A–2F) below the original KPIs.

All the maths lives in **pure, unit-tested engine modules** (`src/engine/`) so
logic stays out of components and can't drift between surfaces:

| Module | Powers |
|---|---|
| `engine/today.ts` | the `/today` queues (London-time "now", late/unconfirmed/wait/payment/gap selectors, queue builders) |
| `engine/reportsAnalytics.ts` | reports 2A–2E |
| `engine/denials.ts` | report 2F + the gate-message → reason-code mapper |

## Time is Europe/London

The salon runs on Europe/London. The **database is the enforcement authority**
for every booking cutoff (`validate_booking_calendar`, `get_immediate_slots`).
The `/today` view only *displays* time-sensitive state, but it computes the
London wall clock explicitly via `Intl` (`londonNowParts` in `engine/today.ts`)
rather than the device clock, so a mis-set till can't skew "15 min overdue".
`londonWallClockToUtcMs` converts a booking date+slot (stored as London
wall-clock) to a real instant — used by the 2C late-cancel window so it's
correct year-round, BST included.

## The Today view (`src/components/views/TodayView.jsx` + `views/today/`)

**Operational priority is centralised** in `entryOpStatus` (`engine/today.ts`):
one ranked mapping (late → unpaid-collected → unconfirmed → ready-waiting →
ready → in-salon → next → upcoming → collected) drives the card's accent rail,
its status chip, its primary action AND the sticky strip, so they can never
disagree. Tones map to classes in `views/today/parts.jsx`
(`RAIL_TONE_CLASS`/`CHIP_TONE_CLASS`).

**The sticky "Now / Up next" strip** (`TodayNowStrip.jsx`) pins beneath the
header: `selectNowNext` picks NOW (most urgent actionable → next arrival due
within `DUE_SOON_MINUTES` → live dog, ready first) and UP NEXT (earliest
still-expected arrival, an unconfirmed one preferred). Its primary action is
the same contextual mapping as the cards (collection keeps its two-step
confirm, payment keeps the method chooser); tapping the identity scrolls to
and briefly highlights the card.

**Card primary actions by state:** late/booked → Mark arrived · unconfirmed →
Chase confirmation (inbox thread — reminder-send is deliberately no-resend) ·
Checked in → Start groom (sets In bath; Mark ready stays secondary) · In bath →
Mark ready · Ready → collection flow · Collected + owing → Mark paid.
"Message owner" is never removed — it demotes to the More menu where it isn't
the contextual pairing.

Sections, in priority order, each fed by `engine/today.ts` selectors:

| Section | Shows | Source |
|---|---|---|
| Immediate attention | ranked act-now queue: late arrivals, ready-but-not-collected, unconfirmed, outstanding payments, welfare flags | `buildImmediateAttention` — `isLateArrival` (Booked + slot passed + `LATE_ARRIVAL_GRACE_MINUTES`), `needsConfirmation` (reminder sent, not confirmed, `confirmation_channel != 'none'`), `isPaymentOutstanding`, dog `alerts`/`is_pregnant`/booking `notes` |
| Dogs due in | today's bookings grouped by slot (`buildSlotGrid` incl. extra slots), current/next slot prioritised | `buildArrivalsBySlot` + `currentSlotIndex` |
| In salon now / collection queue | checked-in and ready dogs with wait time | `buildCollectionQueue`, `collectionWaitMinutes` (from `ready_at`), `timeInSalonMinutes` (from `checked_in_at`) |
| Payments & handover | today's non-cancelled unpaid bookings, deposit/balance split | `buildPaymentsList`, `paymentState` (G4 mapping via `computeBookingPricing`) |
| Capacity & opportunities | remaining slots: seats free, large-dog eligibility, customer-reachable (immediate-flagged + before cutoff) | `buildSlotOpportunities` → `computeSlotCapacities` / `getBookableSeatCount` / `canBookSlot` (**never forks** the capacity engine) |
| Summary strip | "Daily progress": collected-of-total + revenue on its own line (expected vs recorded-as-paid), then the five status counters (Booked/Arrived/Expected/Ready/Collected) + takings by method | `buildDaySummary`, `buildTakingsByMethod`, `computeRevenue` |

**Typed reminder confirmations.** `needsConfirmation` only clears on
`bookings.reminder_confirmed_at`, which used to be stamped *only* by the
customer tapping the Confirm Quick Reply on the WhatsApp reminder template. An
owner who instead typed "yes" / "see you Tuesday" / 👍 was never recorded, so
their card said "Needs confirmation" indefinitely. Two layers now close that:

1. **Recorded (the write path).** `whatsapp-agent` runs every inbound message
   through `detectReplyConfirmation` (`_shared/reminderConfirmation.ts`) and, on
   a match from a known customer, calls the *same* idempotent
   `mark_reminder_confirmed` RPC the button tap uses — so a typed confirmation
   gets the identical stamp, green tick, `reconfirmed` booking_event and report
   treatment. It deliberately does **not** short-circuit the message: it stays
   in the inbox and flows on to the normal risk/gate/draft machinery. Skipped on
   a staff re-generate (`forceDraft`) so re-drafting stays side-effect free.
2. **Derived (the read path).** `engine/replyConfirmation.ts` +
   `hooks/useReplyConfirmations.ts` also read the inbox directly for bookings
   still unconfirmed, covering replies that predate (1) and anything outside
   `mark_reminder_confirmed`'s 36-hour window. `applyChatConfirmations` folds
   the result into the built feed/board so the card, lane warning, "N to
   confirm" heading and need-action count all agree. This layer never writes and
   never fabricates a `reminder_confirmed_at` — the green `ConfirmedMark` tick
   means a recorded confirmation; a derived one renders as a separate
   "Confirmed in chat" chip carrying the owner's own words.

The matching lives in **one** place, `supabase/functions/_shared/reminderConfirmation.ts`,
imported (not mirrored) by both sides. Any cancel / reschedule / "can't make it"
wording vetoes the whole signal, so "yes, but can we move it?" still reaches a
human unconfirmed.

Actions reuse existing paths: status transitions (which fire `booking_events` +
the collection-notice modal automatically), `handleOpenBooking`,
`setShowNewBooking`, inbox deep-link (`/inbox?human=…`). Per-day dismissals are
local UI state only — they never mutate booking data. "Didn't show" writes
`cancel_reason = 'No-show'` on a Cancelled booking (there is **no** no-show
status — see G2).

## The reports (`views/ReportsView.jsx`, bands 7–10)

Each windowed report extends `useReportsData` (same `(cutoff, today]` window,
cancelled excluded via `isCountableBooking`, money only via
`computeBookingPricing`). Every report carries a small-n guard and an honest
caveat; insights are template-driven from the numbers, never fabricated.

| # | Report | Answers | Source |
|---|---|---|---|
| 2A | Hardest to fill | which days/slots are quietest | `computeSlotFill` (fill % vs capacity) + `computeSlotLevers` (extra/immediate uptake from `day_settings`) |
| 2B | Value per hour by service | what each service is worth per booked hour | `computeServiceValue` — completed revenue ÷ scheduled 30-min slots (labelled an estimate), 12-week rebooking rate, cancel rate |
| 2C | Reschedules, cancellations & no-shows | how often bookings fall through | `computeOutcomes` — from `booking_events`; **confirmed no-shows (`cancel_reason='No-show'`) kept distinct from the legacy still-Booked proxy**; late cancels (<24h, London-correct); reminder-confirmed vs not |
| 2D | Due back but not booked | who to bring back | `useRetentionData` → `get_dog_grooming_intervals()` RPC (median cadence in SQL) + `retention_marks`; excludes archived / all-channel-opted-out / snoozed / excluded |
| 2E | Booking source | is self-service holding up | `computeSourceMix` — share by `created_by_role`, value + cancel rate per source |
| 2F | Turned-away demand | what demand we refused, and why | `useDenialsData` → `computeDenialStats` over `booking_denials`; reasons ranked, most-wanted slots, alternatives shown-vs-taken |

### Caveats rendered in the UI (by design)

- **2C history start** — `booking_events` only backfilled created/cancelled;
  reschedules/completions accrue from ~2026-05-20. Rendered as a caveat.
- **2E link conversion** — booking-link → completion isn't captured; the report
  says so rather than guessing.
- **2F** — reads empty until denials accrue from deploy; framed to separate
  protective limits from avoidable lost demand.
- **Offline** — `booking_events`, `notification_log`, `booking_denials` and the
  retention RPC have no sample data, so 2C/2D/2F degrade to an honest note.

## Data foundations (all applied to prod 2026-07-02)

Additive, idempotent migrations — none touch the status CHECK, capacity engine,
or existing RLS. Every new function ends with the `docs/migrations.md` revoke block.

| Migration | Adds |
|---|---|
| `…180000_booking_lifecycle_timestamps` | `bookings.checked_in_at` + `ready_at`, rank-based BEFORE-UPDATE stamp trigger (set-once, cleared on regression, Cancelled preserves). **No backfill — accrues from deploy.** |
| `…181000_booking_denials` | staff-read-only capture table + fire-and-forget `log_booking_denial()` (SECURITY DEFINER; authenticated + service_role) |
| `…182000_retention_marks` | staff snooze/exclude table |
| `…183000_retention_interval_rpc` | `get_dog_grooming_intervals()` (median cadence, staff-locked, SECURITY INVOKER) |

`log_booking_denial` is called **strictly fire-and-forget** from the portal
wizard and the WhatsApp Flow endpoint (`engine/denials.ts` `mapDenialReason` +
a synced Deno copy `flowDenialReason`). A logging failure can never block or
change a booking.

## What the system still does NOT capture (be honest)

Carried from the build's gap analysis (G1–G7):

- **Arrival/ready timings** accrue only from 2026-07-02 (no history) — "time
  waiting" is blank for anything before that.
- **No no-show status** — represented as `Cancelled` + `cancel_reason='No-show'`,
  staff-action only; never auto-labelled.
- **Portal funnel abandonment** ("started but didn't finish") and
  **booking-link → completion conversion** — not captured (2E/2F can't show them).
- **Actual groom duration** — until `checked_in_at→ready_at` data builds up,
  2B uses the scheduled 30-min slot (labelled an estimate).
- **Per-groomer attribution** — `created_by_role` is who *booked*, not who groomed.
- **No payment ledger** — payment state is `payment` + `deposit_amount` only
  (no method, no paid_at, no disputed state).
- **Pre-2026-05-20 reschedule/cancel history** — not reconstructable.

## Recommended next improvements (ranked)

1. **Actual-duration analytics** once `checked_in_at→ready_at` data accrues —
   turns 2B's estimate into a real per-service groom time.
2. **"Owner on the way"** state on the collection queue (needs inbound-message
   intent parsing).
3. **Payment method + paid_at** — a minimal ledger would unlock a real till view.
4. **Portal funnel telemetry** — instrument wizard start→complete to measure
   drop-off (the missing half of 2E/2F).
