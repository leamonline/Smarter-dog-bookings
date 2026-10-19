# Today command centre + decision reports

> The `/today` staff landing screen and the six decision reports. This is the
> canonical reference for **what each surface shows and where every number comes
> from**. Verify against code if anything here looks stale.

## What this is

Two staff-facing surfaces built on one pure engine:

- **`/today`** — the default landing screen after staff login: a **time-ordered
  status stack**, one card per dog in strict appointment order, answering *"how
  long has Teddy been here?"* and *"what needs me right now?"* with as little
  reading as possible. The weekly calendar (`/`) stays the scheduling tool and
  is one tap away. (This replaced the four-zone salon board in September 2026 —
  see [the reversal](#september-2026-the-zone-decision-was-reversed).)
- **Reports** (`/reports`) — the existing cash-up + analytics page, extended
  with six decision-focused reports (2A–2F) below the original KPIs.

All the maths lives in **pure, unit-tested engine modules** (`src/engine/`) so
logic stays out of components and can't drift between surfaces:

| Module | Powers |
|---|---|
| `engine/today.ts` | London-time "now", the late/unconfirmed/wait/payment selectors and the ranked `entryOpStatus` mapping every surface reads |
| `engine/dailyBrief.ts` | the four zones (`buildDailyBriefBoard`) and the care-step rules |
| `engine/salonBoard.ts` | zone mapping, priority gravity, visual tiers, **the per-state action list (`tokenActions`, still the single source of legal transitions, read by the stack)** and undo. The four-zone board that first read it is gone (October 2026, #995); the stack, the header and `useBookingActions` still do |
| `engine/dayStack.ts` | the stack: strict time ordering, the one timing line per row, and the check-out chain |
| `engine/lifecycleStamps.ts` | the offline mirror of the two `checked_in_at` / `ready_at` / `completed_at` database triggers |
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

## September 2026: the zone decision was reversed

`/today` is a **time-ordered status stack**. It replaced the four-zone board,
which was then **deleted in October 2026** (#995) once the stack had run
through its first trading weeks. The reasoning recorded below is history —
why the zones were tried and why they were reversed — not a description of a
fallback that still ships.

**What the board decided.** Position carries the status: a dog sits in the zone
that says where it physically is, and therefore wears no status badge, because
the zone heading is the only place the noun needs to appear. That answered
*"where is Teddy?"* very well.

**Why it was reversed.** It cannot answer *"how long has Teddy been here?"* In a
zone, a dog checked in at 08:35 and one checked in at 11:50 sit side by side
looking identical. Within-zone ranking put the longest-waiting first, but rank is
not a duration: nothing on the screen said two hours. Elapsed time is what the
salon actually runs on — it decides who gets picked up next, which dog has been
on the table too long, and which owner is about to ring.

Strict time order plus one elapsed figure per row makes that difference the most
visible thing on the screen. The trade is real and was made knowingly: finding a
named dog is now a scan down a list rather than a glance at a region.

**What survived unchanged.** No new statuses and no new transitions.
`tokenActions` is still the single source of what is legal, and the stack calls
it. Writes still go through `useBookingActions` into `useBookings.updateBooking`,
so the database gates, the optimistic rollback, the realtime subscription and the
spoken announcement when a colleague moves a dog on another till all behave
exactly as they did.

### The stack (`views/today/stack/`)

One card per dog, in appointment order. No grouping, and no re-sorting by status.

**Collapsed**, a card carries the time in tabular figures, the dog's name, its
breed and service, the status **as a word**, the safety note if there is one, and
one timing line. **Expanded**, it adds owner, phone, last visit, price, notes and
that dog's actions. One card is open at a time: the cards are tinted by status
and an open one is tall, so two at once pushes the day off screen.

**Overlapping appointment cards (#891).** The first appointment is initially
in focus, with its details closed. Selecting another card opens its existing
information and brings it into view. Earlier cards stay in chronological order;
future cards gather at the bottom of the available app scrollport. These are
opaque, full-height cards positioned with transforms, not shortened rows or a
list with negative margins. Within the future stack later cards cover the lower
part of earlier cards, exposing consistent 96px strips. The focused card has the
highest layer. Long days retain these reachable strips and scroll normally.

Every collapsed card and expanded header is 144px tall. A reserved 44px warning
row keeps optional warnings from changing dimensions. Time, name, status/balance
and warnings sit in the exposed portion; breed/service and timing remain in the
full header. Pressing a warning reveals its complete text in the details area,
including long or multiple alerts, without resizing the header.

Pulling down at the top of the app progressively separates future cards in
proportion to finger movement. Crossing the threshold and releasing calls the
existing refresh callback once; short/cancelled pulls settle without a refresh.
Scrolling away from the top, horizontal gestures, multi-touch and gestures
inside detail controls retain their normal behaviour. A keyboard-accessible
Refresh appointments button provides the same action without a gesture.
Reduced motion disables settling transitions. Navigation/visual viewport size
and expanded content are measured; no phone-specific bottom position is used.

The disclosure animates `grid-template-rows` from `0fr` to `1fr` rather than a
height, so the drawer fits its own content without anybody measuring it, and
`prefers-reduced-motion` is honoured.

**Colour is never the only signal.** Every card states its status as a word, and
every tone is dark ink on a light tint — checked against the WCAG AA ratio in
`BookingStatusBadge`'s test, so white ink on the gold fails the build rather than
reaching a till. The palette:

| Status | Word | Tint | Edge |
|---|---|---|---|
| Booked | Expected | `#E8ECF0` | `#97A6B5` |
| Checked in | Checked in | `#D3EAE4` | `#2E8B76` |
| In bath | In the bath | `#D9EAC6` | `#5C9A33` |
| Ready for pick-up | Ready | `#F7E6BE` | `#B8860B` |
| No-show | No-show | `#F2D9D9` | `#B33A3A` |

Completed leaves the stack. The olive is deliberately not mint: it sits directly
below the teal in the progression and therefore directly beside it on screen, so
the two have to separate cleanly.

**The timing line** is the only place a number about *now* appears, and it is
computed on the London clock:

| State | Reads | From |
|---|---|---|
| Expected | `20 min away`, `15 min late`, or `No arrival` past 2 h | the slot |
| Checked in / In the bath | `2 hrs 15 min` | `checked_in_at` |
| Ready | `waiting 50 min` | `ready_at` |
| No-show | `Did not arrive` | — |

It **degrades quietly**. A booking from before July 2026 has no lifecycle stamps
and never will — the migration could not backfill — so its row simply does not
mention time rather than saying "n/a". A browsed date shows no live timing at
all: a countdown next to work that finished last week is a number about the wrong
moment.

**Urgency is weight and words, never a new hue.** The left rule thickens (7px →
10px, and 14px for a collection past `READY_OVERDUE_MINUTES` = 45, which also
adds a clock icon), and the timing line goes bold. The hue stays whatever the
status says it is.

**The three facts the token carried all survived**, each with its own channel:

- **The safety note is now words, not an icon.** It has its own always-visible
  reserved row on the card. Pressing it reveals complete warning text in the
  details area while the header stays fixed. The board showed a
  coral triangle with the text in a `title` tooltip, which reaches neither a
  touch user nor a screen reader — the June 2026 review said so, and this is
  welfare information. The chip is a real button, so it sits beside the
  disclosure button rather than inside it, which also keeps both tappable.
- **The balance** sits in the header from Ready onward, where it blocks the
  handover, as bold tabular figures and the word "due".
- **Urgency** as above.

### Check out

Handing a dog back is one gesture, three presses when there is money to take and
two when there is not:

    Check out  →  Cash £32 | Card £32  →  Collected · £32 cash
    Check out  →  Collected

Each step replaces the last in the same place, so the button under the thumb does
not move. Only the last press writes. "Back" steps one place rather than
abandoning the chain, because the mistake it exists to fix is usually "wrong
method", not "wrong dog".

The chain **presents** two of the engine's actions rather than replacing them: it
appears exactly when `tokenActions` says `collected` is legal, and the `payment`
and `collected` entries drop out of the button list beneath it.

**Collection and payment are one database write.** Splitting them opens a window
where a dog is collected but unpaid, and the thing that interrupts a member of
staff mid-sequence is usually the next customer walking in. Undo restores both
facts; reverting `payment` also makes `set_booking_paid_at` clear `paid_at`, the
method and the amount.

`paid_amount` records **what was handed over**, not the appointment gross. On a
deposit-paid visit those differ and the till only saw the balance. (The
mini-invoice path still writes the gross — that is issue #874, deliberately not
changed here.)

**Price is editable before payment** and writes `price_override` in **pounds**,
rounded to 2dp. Pounds because that is what the column holds and what
`computeBookingPricing` expects back; its only constraint is `> 0`, so a figure
in pence would pass validation and overcharge by a hundred times. The editable
figure is the **base** price, not the total — writing a subtotal into the
override would add the add-ons a second time on the next read — so when there are
add-ons the card shows the arithmetic, `£52 (£42 + £10)`. A quiet **Open full
invoice** reaches `MiniInvoiceModal` for anything the chain cannot do: an add-on,
a split, a discount.

### Collected, and the takings

Collected dogs leave the stack for a `<details>` summary at the foot, closed by
default with the running total on the closed row. Open it for the cash and card
split and the per-dog rows. Both come from `buildTakingsByMethod`, **including
the rows**, so a list and the total above it cannot disagree.

### No-shows

A no-show is the first-class `No-show` status. A legacy `Cancelled` booking
carrying `cancel_reason = 'No-show'` is still read the same way so an
unconverted row remains usable.

Every other day surface drops cancelled bookings, and must keep dropping them, so
the stack opts in rather than reassembling the day itself:
`buildTodayFeed` / `buildFutureDayFeed` / `buildDailyBriefFeed` take
`includeNoShows`, **default false**. `isCountableBooking` is untouched — it
governs revenue, capacity, deposits and every report, and a no-show stays
uncountable in all of them. `FeedStage` gains `noShow`, because `Cancelled` ranks
-1 and would otherwise fall back to `booked`, which is what the "Next" scan and
the late-arrival lists key on.

A no-show card has no board zone and exposes **They turned up** through a
zone-less `TokenActionSubject`. The correction returns the booking to `Booked`
and clears `cancel_reason`; it does not claim the dog is already checked in.
The ordinary **Arrived** action is then available. The write follows the same
update path as booking details, including database capacity and grouped-visit
guards. Because the grouped-visit guard refuses a grouped booking moving back
onto a seat (`SDC03`), a no-show in a grouped visit is not offered the button.
A no-show card also hides the price field and **Open full invoice**: there is
no money to take on an appointment that did not happen.
On a closed day the database's closed-day guard refuses the revival (`SCL03`)
unless the visit has an open closure-rearrangement task, exactly as it does
for a revived cancellation (migration `20260927204500`).

### The old board

The four-zone board that the stack replaced was **deleted in October 2026**
(#995) once the stack had run through its first trading weeks. Its component
directory under `views/today/`, the build-time rollback flag in
`constants/features.ts` (and the `VITE_` variable that set it) and the drag
helpers in `engine/salonBoard.ts` went with it. What stayed is what the stack
still reads: the zone vocabulary (`BOARD_ZONES`, `zoneForStatus`,
`BOARD_ZONE_META`), `buildBoardTokens` and `buildAttentionSummary` behind the
attention strip, `buildZoneCounts` behind the header's shape of the day, and
`tokenActions` / `reverseStatusFor` behind every card action and its undo.
`NeedsAttentionSummary`, `UnknownStatusRecovery` and `EndOfDayFacts` moved up
a directory rather than going, because the page still renders them.

Its browser coverage had already gone: `e2e/daily-brief.spec.ts` was replaced by
[`e2e/day-stack.spec.ts`](../e2e/day-stack.spec.ts), which follows the surface
staff actually get and adds the end-to-end status-transition coverage the board
never had. The design reasoning the board recorded lives in the repository
history of its deleted directory, not here.

## Around the stack

### The header

One anatomy at every width. The date **is** the date-picker control and never
leaves the screen — it is the only guard against doing today's work on
Thursday's bookings. Beside it the salon open/closed pill and the
Manage-availability button carrying its own state. Beneath: the attention
sentence, the shape of the day (`3 arriving · 6 with us · 2 ready` — phrased in
the zone vocabulary `salonBoard.ts` still owns, because the counts are the same
selectors), and money kept secondary (`£286 collected · £152 to collect`), with
an over-cap day in coral. Deliberately not a KPI row.

### Needs attention

`buildAttentionSummary` — zero reads *"Everything's on track"*; non-zero renders
an **itemised strip, one segment per reason**: `2 late · 1 to confirm · 3
waiting · £88 due`. An opaque "11 things need you" sounded urgent but forced a
second round of interpretation; the segments make the number define itself.
Pressing a segment **dims the other cards (to 50%, never lower — highlighting
raises the important dogs, it must not make the application look disabled) and
leaves exactly the dogs that segment names at full strength, where they already
are**. It never filters them into a separate list: moving a dog to prove it
needs attention would break the time order the stack exists to keep. Membership
is exactly the existing `needsAction` union — the segments name reasons, they do
not invent a second definition. The `£` segment carries the **due-now** amount
(dogs from Ready onward, where taking it unblocks the door); the whole-day
total lives in the end-of-day facts, and the header's money says only what is
in the till — one financial voice per surface. Selecting a segment also scrolls
to its first dog **only if that dog is off screen**; that press is the one
place the viewport is allowed to move.

### Everything neither redesign replaced

`AwaitingDepositsCard`, `MissingSizeNotice`, `TodayBriefNotes`, the
Manage-availability modal (still `buildSlotOpportunities` → `buildAvailabilityView`,
which **never** forks the capacity engine), `MiniInvoiceModal`, the care-step `ConfirmDialog` and the
end-of-day facts row (arrived, till by method, expected revenue, capacity) all
carry over unchanged. Writes go through **one** path — `useBookingActions` →
the same `onUpdateBooking` the booking detail modal uses — so the three
BEFORE-INSERT/UPDATE database gates and the optimistic rollback in `useBookings`
behave exactly as before. There is no second mutation system.

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
   the result into the built board so the token's tier, the zone's exception
   line and the attention count all agree. This layer never writes and never
   fabricates a `reminder_confirmed_at`.

The matching lives in **one** place, `supabase/functions/_shared/reminderConfirmation.ts`,
imported (not mirrored) by both sides. Any cancel / reschedule / "can't make it"
wording vetoes the whole signal, so "yes, but can we move it?" still reaches a
human unconfirmed.

**Staff confirmation (customer wins).** An unconfirmed Arriving dog also offers
a quiet **Confirm booking** action for the owner reached off-channel (phone, in
person). It writes `reminder_confirmed_at` + `reminder_confirmed_source =
'staff'` through the ordinary staff update path (the `_confirmArrival` marker in
`useBookings.updateBooking`), and the panel then reads "Confirmed by staff". If
the customer later answers the WhatsApp reminder themselves,
`mark_reminder_confirmed` **overwrites** the staff stamp with a customer one
(fresher evidence, straight from the owner) — never the reverse. A date move
clears both halves (`reset_reminder_on_reschedule`), and each transition emits a
correctly attributed `reconfirmed` booking event. Authority: migration
`20260825100000_staff_booking_confirmation.sql`; DB contract test
`supabase/tests/181_staff_reminder_confirmation.test.sql`.

A mis-tapped staff Confirm is reversible two ways: the success toast carries
**Undo** for its 10-second life, and the dog's panel keeps an **Unconfirm
booking** item. Both clear the pair through the `_unconfirmArrival` marker,
whose update is filtered on `reminder_confirmed_source = 'staff'` — so a
customer confirmation that raced in matches nothing and stands (the UI then says
so in an info toast). A customer's confirmation is never removable from the UI.

"Didn't show" writes the first-class `No-show` status and keeps
`cancel_reason = 'No-show'` as readable context while that status stands. It
sends no customer message.

## Accessibility contract

Every card header is a focusable button carrying `aria-expanded` and an
accessible name that is a whole sentence ("09:00. Bramble. Cockapoo · Full
Groom. Ready. waiting 50 min. £42 due. owner Sarah Wilson. Safety note: Hates
the dryer."). The status is included in that sentence, and the separate safety control has
its own complete accessible label. Hidden drawer controls remain inert.

Touch targets are ≥ 44px everywhere, including the quiet action tier — the
prototype drops those to 40px and this does not, because the hands using it are
wet and one of them is usually holding a dog. Urgency is never colour alone, and
there is no hover-only information: the safety note in particular is words on the
card, not a tooltip.

Status changes do not re-sort appointments. Selection changes only presentation:
stable booking keys and DOM order preserve focus, and keyboard focus brings a
header out of the future stack. Browser scroll anchoring is disabled within this
view so it cannot counteract intentional card transitions.

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
- **No-shows are staff-classified only** — the first-class `No-show` status is
  never inferred or applied automatically.
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
