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
| `engine/salonBoard.ts` | zone mapping, priority gravity, visual tiers, **the per-state action list (`tokenActions`, still the single source of legal transitions, read by the stack)**, drag legality and undo |
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

`/today` is a **time-ordered status stack**. It is not the four-zone board, and
the reasoning recorded below for that board is **superseded** — it is kept
because the board still ships as a fallback, not because it describes what staff
see.

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
| Cancelled + `No-show` reason | No-show | `#F2D9D9` | `#B33A3A` |

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
  row on the card, rendered by the existing `SafetyAlertChip`. The board showed a
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

A no-show is a `Cancelled` booking carrying `cancel_reason = 'No-show'`. There is
no no-show status and never has been.

Every other day surface drops cancelled bookings, and must keep dropping them, so
the stack opts in rather than reassembling the day itself:
`buildTodayFeed` / `buildFutureDayFeed` / `buildDailyBriefFeed` take
`includeNoShows`, **default false**. `isCountableBooking` is untouched — it
governs revenue, capacity, deposits and every report, and a no-show stays
uncountable in all of them. `FeedStage` gains `noShow`, because `Cancelled` ranks
-1 and would otherwise fall back to `booked`, which is what the "Next" scan and
the late-arrival lists key on.

**Known gap:** a no-show card offers no transitions. `tokenActions` switches on
board zone and a no-show has none, so there is currently no "they turned up" from
the stack; the booking detail modal is the way back. Adding one is a new
transition and belongs in `tokenActions`.

### The old board, behind a flag

`FEATURE_FLAGS.legacy_salon_board_enabled` (`VITE_LEGACY_SALON_BOARD=1`), **off by
default**, renders the four-zone board instead. It exists so a problem found in
the salon can be backed out by setting one deployment variable, and is expected
to be removed once the stack has run through a few trading days.

Its component tests still exercise it through that flag. Its browser coverage
does not survive: `e2e/daily-brief.spec.ts` was replaced by
[`e2e/day-stack.spec.ts`](../e2e/day-stack.spec.ts), which follows the surface
staff actually get and adds the end-to-end status-transition coverage the board
never had.

Everything from here to the end of this section describes **that fallback**, not
the shipping screen.

## The salon board — SUPERSEDED, behind `legacy_salon_board_enabled` (`views/today/board/`)

> **Superseded September 2026.** This described `/today` between August and
> September 2026. It is now the fallback behind
> `FEATURE_FLAGS.legacy_salon_board_enabled`, kept so the reasoning is available
> if the flag is ever turned back on. Read it as history, not as guidance.

The board is a **live salon board**, not a list of cards (August 2026 redesign).
Every dog on the day is one **token** — a face, a name, and one number — placed
in the zone that says where that dog physically is:

    Arriving  →  With us  →  Ready  →  Gone home

**Position carries the status.** A token in the Ready zone does not also wear a
"READY" badge, and the zone heading is the only place the noun appears. The
question staff actually ask — *"where is Teddy?"* — is answered by looking, and
the answer to *"does anything need me?"* is one sentence at the top of the page.

The zones are the existing Daily Brief lanes under new labels
(`due | withUs | ready | home` in `buildDailyBriefBoard`) — **no new statuses, no
new transitions, no mapping layer**. `engine/salonBoard.ts` adds three pure
decisions on top and nothing else:

| Decision | Function | Rule |
|---|---|---|
| Zone | `zoneForStatus` | Booked→Arriving · Checked in / In bath→With us · Ready for pick-up→Ready · Completed→Gone home. Cancelled and unknown statuses map to **null** and surface in the recovery line instead of vanishing |
| Priority | `buildBoardTokens` | Per-zone ranking + a three-step visual tier (below) |
| Actions | `tokenActions` | The legal operations for this dog right now — read by the desktop menu, the phone sheet **and** the drag layer, so the three input methods cannot diverge |

### Priority gravity (the sort rules)

Order only changes on a real state change or the 60-second tick — the board must
not shuffle under a finger, because spatial memory is the point. Every rule ends
in the booking id, so the order is total and two identical bookings never swap.

| Zone | Order |
|---|---|
| Arriving | late first (most overdue leading), then soonest slot |
| With us | welfare-flagged first, then longest on site; a dog with no `checked_in_at` stamp has no claim and sorts last |
| Ready | longest wait first. A dog with **no `ready_at`** (legacy rows, pre-2026-07-02) sorts **first** — unknown must surface, never hide |
| Gone home | most recently collected first |

**Tiers** (`urgent` / `watch` / `calm`) come from the same `entryOpStatus`
mapping the cards used, so the board can never disagree with the header counts:

- **urgent** — late arrival, collected-but-owing, or a collection wait ≥ 60 min
  (`READY_URGENT_MINUTES`). Coral ring **and** coral words. Past 2 hours
  (`NO_ARRIVAL_MINUTES`) the wording flips from "N hrs late" — which reads as
  "still expected any moment" — to **"No arrival"**, with the slot heading
  still carrying when it was due. The tier stays urgent; only the story told
  changes.
- **watch** — anything on the needs-attention list, an arrival due within 15 min
  (`DUE_SOON_MINUTES`), or a dog on site ≥ 3 h (`IN_SALON_LONG_MINUTES`).
- **calm** — everything else. A **browsed past or future date is always calm**
  (money still owed excepted): nothing on it is happening now, so nothing on it
  may glow.

Urgency is never carried by colour alone — the ring, the meta text's colour and
weight, and the token's accessible name all say the same thing.

### What a token shows, and what it deliberately does not

A 64px avatar (72px on a tablet) with deterministic initials — **there are no dog
photos in this data model**; `groom_photos` is a separate staff-only gallery, not
a profile picture, and none is fabricated. Then the dog's name and **at most one**
piece of context.

Which piece depends on whether the fact belongs to the dog or to its appointment:

- **Once a dog is here**, the number is its own — elapsed time on site, or how
  long it has been waiting to be collected — so it prints on the token.
- **While a dog is still arriving**, the time belongs to the *slot*, not to the
  dog standing in it. Four dogs booked into 09:00 are all "20 min late"
  together, so printing it under each of them would repeat one fact four times.
  It is stated once, on the slot heading (see below), and an arriving token
  prints only what that heading cannot know: **To confirm**, when this
  particular booking is still unconfirmed.

Three facts earn extra ink, because each costs money or welfare if missed:

- **A welfare note stays on the board at every width.** The existing safety rule
  (a welfare fact is never hidden behind a tap or a breakpoint) survives the
  redesign: a flagged dog gets a coral mark on the token **and** its first note
  printed beneath it, with the full text in the panel.
- **A balance appears only from Ready onward** — where it actually blocks the
  handover. A dog mid-groom that will settle at pick-up is routine and must not
  look like a problem. Its settled counterpart: a **paid Ready dog carries a
  small ✓** in the same seat, so "just hand over" is visible without a press.
- **"Owner on the way"** — the read-only WhatsApp signal, as a teal mark.

Everything else — service, owner, payment sentence, who confirmed and when, the
full safety text — lives in the action panel, one press away.

### Arriving is a schedule, so it groups by slot

Arriving is the one zone with an inherent order that is not "how long has this
been going on" — it is the diary. `groupTokensBySlot` splits it into one group
per appointment time, each headed by the time, the dog count when there is more
than one, and the countdown or lateness the whole group shares
(`08:30 · 4 dogs · 45 min late`). The other zones stay a flat grid, because
their numbers genuinely differ per dog.

Grouping can never reorder the board: a group takes the position of its first
dog in the already-ranked token list, and since lateness is a property of the
slot, ranking by "late first, then soonest" and ordering groups by first
appearance produce the same sequence. A booking with **no usable slot** must
never disappear, so those collect in a trailing **Unscheduled** group.

**The time sits in a left gutter beside its dogs from `xl` up**, so a slot costs
no row of its own; below `xl` the heading goes back above its row. That
breakpoint is measured, not guessed. The gutter takes 80px off the token grid,
which is free at 1280 (the zone is ~458px and still fits four tokens) and
expensive below it — at 1024 and 768 the zone is ~350px, the grid drops from
three columns to two, and the "saving" makes the zone **11-12% taller** than
the heading it replaced. Measured on a 13-dog Arriving zone:

| Width | Heading above | Gutter beside |
|---|---|---|
| 1280 | 716px | **588px** (−18%) |
| 1024 | 826px | 919px (+11%) — so: heading |
| 768 | 874px | 983px (+12%) — so: heading |
| 390 | 826px | — zones stack, height costs nothing beside anything |

For the same reason the gutter is 80px and not 88px: the wider gutter fits
`in 1 hr 45 min` on one line but drops 1280 from four token columns to three
and pushes the zone back to 698px. The long strings wrap balanced instead.
`e2e/daily-brief.spec.ts` asserted the flip geometrically — the time left of its
first token at 1280 and above it at 768. That spec was removed with the
reversal, so this breakpoint now has no browser-level guard; its component tests
remain.

### One panel, two presentations

Press a dog, get that dog's actions. The mental model is identical everywhere;
only the physical presentation changes.

- **≥ 768px** — `DogActionMenu`, a portalled `role="menu"` anchored beside the
  token, growing out of its edge, in **three tiers of weight** matching how
  often each action is needed mid-groom: the workflow transition dominates as
  one large filled button, contact and payment sit in a compact row beneath
  it, and reference material (booking details, files, reversals) is a quiet
  list at the bottom. All items keep `role="menuitem"` in DOM order, so arrow
  traversal is unchanged by the visual grouping. Deliberately **not** a radial
  menu: a dog offers 3–9 actions and several labels are long ("Take £52
  payment"), so arc placement would collide or shrink below a comfortable
  target and the screen reader order would stop matching the visual one.
- **< 768px** — `DogActionSheet`, a bottom sheet on `ModalShell`, sized for a
  thumb at 320px.

Both render the same `tokenActions` list. Actions are state-derived and never
symmetrical: a collected dog has no "Mark collected", an on-time booking has no
"Confirm", a booking with no number on file has no "Call".

### Movement, drag and undo

A state change **moves** the token, via FLIP (measure, invert, play — 220 ms,
one ease-out), because a token that teleports leaves the user asking whether it
worked. Reduced motion is honoured by doing nothing: the toast and the aria-live
announcement carry the change instead.

**Drag is an accelerator, never a requirement** (`useTokenDrag`). Forward,
one zone at a time only — skipping a care step is a decision that deserves the
confirm dialog, and going backwards is a correction that belongs in the panel
where the words can be read first. Mouse activates at 6px; **touch needs a
200 ms hold**, so a busy board can still be scrolled. A drop runs the same
handler the menu item does, so the unpaid-collection safeguard and the
staff-reviewed collection notice still fire. Drag is off below 768px, where the
sheet is faster and there is no room to drag across.

**Undo replaces confirmation** for ordinary reversible moves (check in, start
groom, ready, collected): the common case costs one tap and the mistake costs
two. `reverseStatusFor` decides what is reversible; a cancellation ("Didn't
show") is confirmed, never quietly undone, and the undo write carries
`_skipCollectionPrompt` so going back never re-opens the owner notice.

### Needs attention

`buildAttentionSummary` — zero reads *"Everything's on track"*; non-zero renders
an **itemised strip, one segment per reason**: `2 late · 1 to confirm · 3
waiting · £88 due`. An opaque "11 things need you" sounded urgent but forced a
second round of interpretation; the segments make the number define itself.
Pressing a segment **dims the calm dogs (to 55%, never lower — highlighting
raises the important dogs, it must not make the application look disabled) and
rings exactly the dogs that segment names, where they already are**. It never
filters them into a separate list: moving a dog to prove it needs attention
would destroy the spatial memory the board exists to build. Membership is
exactly the existing `needsAction` union — the segments name reasons, they do
not invent a second definition. The `£` segment carries the **due-now** amount
(dogs from Ready onward, where taking it unblocks the door); the whole-day
total lives in the end-of-day facts, and the header's money says only what is
in the till — one financial voice per surface. Selecting a segment also scrolls
to its first dog **only if that dog is off screen**; that press is the one
place the viewport is allowed to move.

### The phone shows one lane at a time

Below 768px the three zones do not stack. Stacking buried Ready several screens
beneath Arriving exactly when its dogs mattered most — mid-afternoon, with
owners at the door. Instead a **segmented switcher** (`Arriving 6 · With us 2 ·
Ready 3`) shows one lane at a time: every lane's count stays readable from one
row, a coral dot marks a lane holding an urgent dog so nothing hides behind the
tab you are not on, and a deliberate horizontal swipe (≥56px, and clearly more
horizontal than vertical, so a drifting scroll never changes lane) moves
between neighbours. The switcher resets to Arriving when the browsed date
changes. Wider screens keep all three zones in place at once — the switcher
never renders there. Each zone also sits on a **2% tinted surface** at every
width, so the emptiness has structure: a lane reads as a place dogs stand, not
leftover page.

## Shared by both surfaces

### The header

One anatomy at every width. The date **is** the date-picker control and never
leaves the screen — it is the only guard against doing today's work on
Thursday's bookings. Beside it the salon open/closed pill and the
Manage-availability button carrying its own state. Beneath: the attention
sentence, the shape of the day (`3 arriving · 6 with us · 2 ready` — still
phrased in the board's zones, because the counts themselves are unchanged), and
money
kept secondary (`£286 collected · £152 to collect`), with an over-cap day in
coral. Deliberately not a KPI row.

### Everything the board did not replace

`AwaitingDepositsCard`, `MissingSizeNotice`, `TodayBriefNotes`, the
Manage-availability modal (still `buildSlotOpportunities` → `buildAvailabilityView`,
which **never** forks the capacity engine), `MiniInvoiceModal`, the
`UnpaidCollectionModal` safeguard, the care-step `ConfirmDialog` and the
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

"Didn't show" writes `cancel_reason = 'No-show'` on a Cancelled booking (there
is **no** no-show status — see G2).

## Accessibility contract

Every card header is a focusable button carrying `aria-expanded` and an
accessible name that is a whole sentence ("09:00. Bramble. Cockapoo · Full
Groom. Ready. waiting 50 min. £42 due. owner Sarah Wilson. Safety note: Hates
the dryer."). The badge and the safety chip are both `aria-hidden`, precisely so
that sentence is the single spoken version rather than the third repetition of
the same fact.

Touch targets are ≥ 44px everywhere, including the quiet action tier — the
prototype drops those to 40px and this does not, because the hands using it are
wet and one of them is usually holding a dog. Urgency is never colour alone, and
there is no hover-only information: the safety note in particular is words on the
card, not a tooltip.

The stack does not move a card when its status changes — the row stays where the
appointment time puts it — so the board's focus-restoration problem does not
arise here.

### The board's contract (superseded, behind the flag)

Every token is a focusable button whose accessible name is a sentence ("Teddy.
Ready, waiting 18 min. £52 due. owner Rik Patel."). The menu keeps the full
`role="menu"` contract — first item focused on open, arrows/Home/End traverse,
Escape closes and returns focus to the dog, outside click and scroll dismiss.
**A token that changes zone is a different DOM node in a different list**, so
focus would otherwise drop to `<body>`; `SalonBoard` remembers the focused
booking id and restores it after any rearrangement — but only when focus was
genuinely orphaned, so a modal is never interrupted. Drag has no keyboard
equivalent because it needs none: every move it performs is a labelled menu
item. Touch targets are ≥ 44px, urgency is never colour-alone, and there is no
hover-only information.

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
