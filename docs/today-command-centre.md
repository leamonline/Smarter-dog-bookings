# Today command centre + decision reports

> The `/today` staff landing screen and the six decision reports. This is the
> canonical reference for **what each surface shows and where every number comes
> from**. Verify against code if anything here looks stale.

## What this is

Staff see this screen as **Today** in the menu, page heading and browser tab
(it was labelled "Daily Brief" until November 2026, audit N-24). "Daily Brief"
survives only as the name of the engine module and older design documents.

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

### The stack (`views/today/stack/`) — a wallet

One card per dog, in appointment order. No grouping, and no re-sorting by
status. Two dogs in the same slot are two cards, each showing its time.

**At rest (November 2026).** Every card is the same height (128px). Each one
overlaps the one before it so exactly a 72px strip shows, later cards sit on
top (DOM order), and the last card shows in full. No gaps and no dividers —
cards only. The geometry is pure arithmetic in `stackLayout.ts`.

The stack this replaced exposed 96px of a 144px card, put the breed line at
exactly 96px — the first pixel the next card covered — and reserved an empty
44px warning row on most strips. That is why every covered card hid its bottom
line, and why the timing had already been moved up into the heading row.

**The strip carries everything essential, in two lines:**

    09:30  Nell ·························· £42 due  [Ready]
    ⚠ Bites / Nips · Cocker spaniel · Full Groom · Raman ···· waiting 50 min

- Line 1: time, dog name, the balance from Ready onward, and the status pill.
- Line 2 (small): the safety note in words (the most important warning, "+N"
  for the rest), an undelivered-message chip, then breed · service · owner
  surname, truncating with an ellipsis from the end — so the surname gives way
  before the warning does — and the timing at the right-hand end.
- The face below the strip, which only the last card shows, is a read-only
  preview of the visit notes. It is hidden from assistive technology because
  the lifted view repeats it.

**Tap = lift out, like a wallet.** The strip is the card's only tap target: a
`<button aria-expanded>`. Tapping it lifts the card to the top of what is
visible and opens its full view; every other card collapses into a shallow pile
at the bottom of the visible area, showing only its top edge (8px each, the
front card 10px — above its text — at most four edges). Pile cards are `inert`, and one
`StackPile` button over them — "Back to the day — N other dogs" — puts the day
back. This replaced the in-place expand; the full view still opens by
animating `grid-template-rows` from `0fr` to `1fr`, so it fits its own content.

Four ways back, one close: the card's **Close** button (or its strip again), a
tap on the **pile**, **Escape** (left to a dialog opened from the card, such as
the invoice), and the browser's **Back** button — lifting pushes one history
entry, and closing any other way steps back over it. Closing restores the
page's scroll position and returns focus to the strip that opened the card.
Lifting moves focus into the card's full view, a labelled region ("Nell —
details"). Under `prefers-reduced-motion` the state simply switches: no lift
animation, no pile animation and no smooth scroll. A lifted dog that leaves the
stack (collected on another till) puts the day back with it.

The history entry a lift pushes names the dog. Leave `/today` from a lifted
card — WhatsApp the owner, open the dog's file — and Back brings staff to that
dog's lifted card, where they left; the next Back closes it. Forward onto the
entry lifts it again. A browser cannot delete an entry from the middle of its
history and the app's `BrowserRouter` has no navigation blocker, so this is how
the entry stops being a dead Back press. An entry whose dog has since left the
day is cleared rather than lifting anything.

The full view holds the safety note in full, any delivery problem, the visit
notes and the dog's usual-groom notes, the photo (never in the strip), the
owner, phone, last visit and price, then three actions:

| Action | Comes from |
|---|---|
| Call / WhatsApp the owner | `call` (a `tel:` link) and `message` — the owner's thread in the in-app WhatsApp inbox, never a `wa.me` link, so STOP and opt-out still apply |
| Check in → Mark ready → Check out | `checkIn`, then `ready`, then the check-out chain below: one slot that moves with the dog. A no-show shows **They turned up** here |
| Take payment | `payment` → `MiniInvoiceModal` ("Take £42 payment", or "View payment" once paid). From Ready the chain takes the money instead |

Everything else the engine allows sits underneath in a quiet **More** row:
Booking details, the dog's and the owner's files, Didn't show, and Open full
invoice. There is **no Confirm button**: confirmation comes from reminder
replies. The engine still lists `reconfirm`, `confirm` and `unconfirm` as
legal; the card does not present them (`NOT_ON_CARD` in `StackCard.jsx`).

Pulling down at the top of the app still spreads the resting stack in
proportion to finger movement and refreshes once on release; a
keyboard-accessible Refresh appointments button does the same.

There is no feature flag for the wallet: the board's rollback flag went with
the board (#995). Roll back with Vercel's Instant Rollback or by reverting the
change ([rollback](rollback.md)).

**Colour is never the only signal.** Every card states its status as a word in
a pill, and every tone is dark ink on a light tint — checked against the WCAG AA
ratio in `BookingStatusBadge`'s test, pills included. A Booked dog takes its
colour from where it stands on confirmation (`stackConfirmation` in
`engine/dayStack.ts`, read from the board token so it agrees with the
attention strip):

| State | Word | Tint | Edge | When |
|---|---|---|---|---|
| Booked, nothing to wait for | Expected | `#E8ECF0` | `#97A6B5` | no reminder sent yet, or booked with confirmation off |
| Booked, asked, no answer | **Unconfirmed** | `#FFD9BF` | `#C2500A` | reminder sent with no reply, **or the reminder failed to send** |
| Booked, answered | Confirmed | `#DBEAFE` | `#3B82F6` | a recorded confirmation, or a typed reply found in the inbox |
| Reconfirmed | Reconfirmed | `#DBEAFE` | `#3B82F6` | staff set the status |
| Arrived | Arrived | `#D3EAE4` | `#2E8B76` | |
| Ready for collection | Ready | `#F7E6BE` | `#B8860B` | |
| No-show | No-show | `#F2D9D9` | `#B33A3A` | |

Unconfirmed needs chasing, so it is not grey: apricot, apart from Ready's gold
and No-show's red, which share the list, and its pill inverts (ink fill, tint
text). Completed leaves the stack.

**One palette everywhere (November 2026).** The tones live in
`src/constants/statusPalette.ts`. The calendar's booking cards, the booking
detail modal (header, accent bar and status stepper) and the Needs attention
page read the same tones through `STATUS_DISPLAY` in `constants/salon.ts`; they
used to have their own palette (mustard Booked, green Ready), so a booking
changed colour between screens. Those screens keep their labels, which name the
stored status ("Booked", "Completed"), and they do not layer confirmation on a
Booked dog — that needs the reply and delivery data only `/today` loads. The
stepper's selected step is the status ink filled behind tint text, the pill's
pair inverted; the white-on-mid-tone it used before failed WCAG AA on blue
Reconfirmed among others.

**The timing** is the only place a number about *now* appears, computed on the
London clock, at the right-hand end of line 2:

| State | Reads | From |
|---|---|---|
| The next dog not yet arrived | `in 27 min`, or `due now` inside the late grace | the slot — **one card only** |
| Any other dog not yet arrived | nothing; `15 min late`, or `No arrival` past 2 h | the slot |
| Arrived | `2 hrs 15 min` | `checked_in_at` |
| Ready | `waiting 50 min` | `ready_at` |
| No-show | nothing | — |

There is exactly one countdown, on the next dog not yet arrived and not late;
it moves on once that dog is checked in, and the minute tick in `TodayView`
refreshes it. "X min away" is gone from every other card: the list is already
in time order. `nextArrivalId` in `engine/dayStack.ts` picks it from the rows
the stack actually draws, by the feed's own rule: the first Booked or
Reconfirmed dog that is not late.

**Reconfirmed is still coming in (November 2026).** Reconfirmed took rank 1
after the feed's thresholds were written, and a bare `rank >= 1` then read a
reconfirmed dog as already in the salon: it was never marked late, it counted
towards "arrived so far" and the day summary's on-site figure, it could not be
next, and its balance was chased before it arrived. The feed (`STAGE_BY_RANK`,
`isLateArrival`, `buildDaySummary`, the payment reason and `isGroupSettled` in
`engine/today.ts` and `engine/dailyBrief.ts`) now uses `RANK_ARRIVED`, as
`lifecycleStamps.ts` already did, so it agrees with the board's zones.

It **degrades quietly**. A booking from before July 2026 has no lifecycle
stamps and never will, so its row does not mention time rather than saying
"n/a". A browsed date shows no live timing at all: a countdown next to work
that finished last week is a number about the wrong moment.

**Urgency is weight and words, never a new hue.** The left rule thickens (7px →
10px, and 14px for a collection past `READY_OVERDUE_MINUTES` = 45, which also
adds a clock icon), and the timing goes bold. The hue stays whatever the status
says it is.

**The safety note is words, not an icon**, at the start of line 2 so the
overlap can never hide it, and in full in the lifted view and in the strip's
accessible name. It used to be a separate 44px button (`SafetySummary`) in a
reserved header row; the strip is now the only tap target, so it became words
inside it and `SafetySummary` was removed. The board before that showed a
coral triangle with the text in a `title` tooltip, which reaches neither a
touch user nor a screen reader — and this is welfare information.

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

A no-show is not a broken status. `buildDailyBriefBoard` leaves terminal statuses
(`TERMINAL_STATUSES`: Cancelled and No-show) out of `excludedBookings`, so the
"needs its status fixed" alert lists only a status nothing recognises. A day whose
only booking is a no-show is not an empty day: the empty-day message also waits
for the stack itself to be empty.

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
Thursday's bookings. **Previous day** and **Next day** arrows sit either side of
it and step one calendar day; while any other date is showing, **Back to today**
appears on the attention line. Beside the date, the Manage-availability button
carries its own state in its accessible name. Beneath: the attention sentence,
then the quieter day totals — salon open/closed, the online status, the shape of
the day (`3 arriving · 6 with us · 2 ready` — phrased in the zone vocabulary
`salonBoard.ts` still owns, because the counts are the same selectors), and money
kept secondary (`£286 taken`, or `All paid`), with an over-cap day in coral.
Deliberately not a KPI row. The header's figure is every Paid-in-Full booking,
including dogs that paid ahead and are still here, so it says **taken**, like the
end-of-day line's "Taken £286"; "Collected today" further down is a different
number, the dogs that have gone home, and is the only thing called collected.

"Salon closed" is neutral ink, not red: closed is the salon's normal state four
days a week, not a fault. On a closed day the online status is not repeated,
because `validate_booking_calendar` refuses every customer booking on a closed
date (`calendar_closed`) before it looks at same-day slots, so "Online booking
closed" always follows. For the same reason closed beats a flagged slot: the
header never says "Next online 10:00" on a closed day. The button's name keeps
"Online booking closed" for screen readers. An empty day drops "Everything's on
track" — there is nothing on it to be on track — and lets the empty state speak.

### The empty day

`TodayEmptyState` gives a day with no bookings a job instead of "No bookings on
this date":

- **Closed day:** the next open day, what is booked on it (`6 dogs booked ·
  first at 09:00`) and **Go to Monday**. The lookup is `useNextOpenDayBrief`,
  which reads `day_settings` and `bookings` itself because `useBookings` holds
  only the current week, and on a Saturday the next open day is always in the
  next one. A failed read says it could not check — never "Nothing booked" —
  and sample mode names the day without asserting its diary.
- **Open today with free slots:** a real **Manage availability** button, by the
  name of the dialog it opens. Not on other dates or once today's slots have
  passed, because the dialog sets same-day online slots.
- **Every empty day:** **Needs you** links unread messages (`/inbox`) and new
  customers awaiting approval (`/humans`) — the two counts already badged in the
  navigation — and the Later notes open by default.

The Later disclosure itself names what it holds (`Later · 3 unpaid grooms · 4
dogs due back`) instead of "2 things worth reviewing", and stays closed on a
working day.

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
in the till — one financial voice per surface. Selecting a segment also puts
any lifted card back and scrolls the first dog it names into view **only if its
strip is off screen** (`DayStack`'s `focusRequest`); that press is the one
place the viewport is allowed to move. Every strip shows at rest, so nothing
needs bringing forward.

### Everything neither redesign replaced

`AwaitingDepositsCard`, `MissingSizeNotice`, `TodayBriefNotes`, the
Manage-availability modal (still `buildSlotOpportunities` → `buildAvailabilityView`,
which **never** forks the capacity engine; on a closed day it lists no slots
and says the day can't be booked until it is reopened from the Bookings
calendar, because `validate_booking_calendar` refuses every customer booking on
a closed date and `NewBookingModal` refuses a closed date for staff too), `MiniInvoiceModal`, the care-step `ConfirmDialog` and the
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

**A reminder that never arrived counts as unconfirmed (November 2026).**
`needsConfirmation` waits on a reminder that was *sent*, so a send that failed
left the dog a calm Expected while the owner had not been told at all.
`applyReminderFailures` (`engine/reminderFailure.ts`) folds a live failed
reminder — exactly what the delivery-failure store calls live
(`useLiveFailuresByBooking`), resends and Meta's later verdicts included — into
the same `confirmation` reason, before the chat fold. The card turns
Unconfirmed, the attention strip counts it under "to confirm", and a typed
"yes" still clears it. A failed booking confirmation, ready message or
cancellation is not folded: it is a delivery problem the card already names.
Display-level only; it writes nothing.

**Staff confirmation (customer wins).** Since November 2026 the day stack does
not offer this: confirmation comes from reminder replies. The mechanism below is
unchanged and still pinned by `useBookingActions.component.test.tsx` and the
database tests, but no `/today` control reaches it, so a confirmation taken by
phone or in person cannot be recorded from `/today`; that dog stays Unconfirmed
until the owner answers. It used to be a quiet **Confirm booking** action on an
unconfirmed Arriving dog, for the owner reached off-channel (phone, in
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

A mis-tapped staff Confirm was reversible two ways: the success toast carries
**Undo** for its 10-second life, and the `unconfirm` action (once an
**Unconfirm booking** item on the card). Both clear the pair through the `_unconfirmArrival` marker,
whose update is filtered on `reminder_confirmed_source = 'staff'` — so a
customer confirmation that raced in matches nothing and stands (the UI then says
so in an info toast). A customer's confirmation is never removable from the UI.

"Didn't show" writes the first-class `No-show` status and keeps
`cancel_reason = 'No-show'` as readable context while that status stands. It
sends no customer message.
Because it is a single quiet tap, its success toast carries **Undo** for its
10-second life, which writes back exactly the status and `cancel_reason` the
booking had before; after that, **They turned up** on the no-show card is the
correction.

The stack shows **one toast at a time**: each new action's toast replaces the
last, so three quick state changes never pile up over Check out or the owner's
phone link, and the Undo on screen is always the Undo for the newest action
(#1001). On phones the toast spans the width less the gutters so it stays one
short line. Each group of card actions sits in a two-column grid with the
primary action first; when the count is odd it takes the whole first row, so no
action is ever left alone on a row.

## Accessibility contract

Every card's strip is a focusable `<button>` carrying `aria-expanded` and an
accessible name that is a whole sentence, starting with the strip's visible
words in order (label in name): "09:30. Nell. Arrived. Safety note: Bites /
Nips. Cocker spaniel · Full Groom · Raman. 1 hr 35 min. owner Priya Raman". It
is the card's only control until the card is lifted: the full view is `inert`
until then, the face is `aria-hidden`, and while one card is lifted every other
card is `inert` behind the single pile button. Lifting moves focus into the
full view; closing returns it to the strip.

Touch targets are ≥ 44px everywhere, including the quiet action tier and the
pile — the prototype drops quiet buttons to 40px and this does not, because the
hands using it are wet and one of them is usually holding a dog. Urgency is
never colour alone, and there is no hover-only information: the safety note in
particular is words on the card, not a tooltip.

Status changes do not re-sort appointments. Stable booking keys and DOM order
preserve focus. Browser scroll anchoring is disabled within this view so it
cannot counteract intentional card transitions.

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

## iPhone header hierarchy (27 October 2026)

TodayHeader keeps date and availability action first, actionable attention next,
and a labelled Day totals group for salon state, online availability, progress
and collected money. Repair/deposit warnings remain before the first dog.
The hierarchy refinement leaves day-stack geometry, 144px card headers, ordering
and expansion calculations untouched. See the [current design-system rules](ux/design-system.md).
