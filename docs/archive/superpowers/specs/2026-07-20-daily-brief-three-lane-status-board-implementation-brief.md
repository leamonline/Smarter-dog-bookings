# Daily Brief three-lane status board — implementation brief

**Status:** Approved for implementation on 20 July 2026

**Design reference:** [Annotated three-lane implementation brief](https://www.figma.com/design/xzwQe7pQJ9V8mqwwhI9TLK?node-id=8-2)

**Scope:** Replace the Daily Brief's single chronological journey feed with a status-led operating board while preserving the existing booking model, live-focus behaviour, payment handling, collection messaging and selected-date support.

## Recommendation

Implement three active lanes — **Due and late**, **With us** and **Ready to go** — followed by a compact **Home today** history row.

This is a presentation and interaction change, not a new workflow model. The existing booking statuses remain authoritative. Payment remains a parallel state and must never become a lane or prevent staff from progressing a dog through the visit.

The first release should not add drag and drop, hidden mobile tabs, grooming sub-stages, staff assignment or database migrations.

## User outcome

At a glance, staff should be able to answer:

- who is still due or late;
- which dogs are physically in the salon;
- who is ready and has waited longest;
- what the next useful action is for each dog;
- who still owes money, without confusing payment with care progress;
- who has already gone home.

The default view must show every active dog for the selected date. Staff should not have to decode a row of icons or remember hidden gestures to move the day forward.

## Non-negotiable design rules

1. **Dog first.** The dog name is the card headline. The human name is visibly secondary.
2. **Name the outcome.** Use `Check in`, `Start groom`, `Ready for collection`, `Take £42` and `Mark collected`; never use a vague label such as `Next step`.
3. **One operational home per dog.** Each active booking appears in exactly one lane.
4. **Payment is independent.** A paid or unpaid state can appear in any lane and remains visible after collection when unresolved.
5. **No automatic no-show.** The app may calculate lateness, but only a person can choose `Didn't show`, cancel or reschedule.
6. **Save before messaging.** `Ready for collection` saves the booking status before offering an optional customer message.
7. **No hidden active work.** Mobile tabs, swipe-only navigation and automatic hiding are prohibited.
8. **Stable movement.** Realtime updates may move a card between lanes, but must not steal focus, scroll unexpectedly or continuously reorder the page as the clock ticks.
9. **Restrained lane colour.** Use the existing due, with-us and ready colours as headers, borders or quiet accents around neutral card surfaces. Do not turn the page into three oversized pastel panels.

## Existing statuses and lane derivation

The board is derived from the current `BOOKING_STATUS` values. No status migration is required.

| Existing status | Board destination | Meaning |
| --- | --- | --- |
| `Booked` | Due and late | The dog has not been checked in. |
| `Checked in` | With us | The dog is physically on site and grooming has not been started in the system. |
| `In bath` | With us | Grooming is in progress. No additional sub-stage is inferred. |
| `Ready for pick-up` | Ready to go | Work is complete and the dog is waiting for collection. |
| `Completed` | Home today / Home on this date | The visit is complete. |
| `Cancelled` | Excluded from active lanes | The record remains available through existing diary/history/detail routes. |

Unknown or missing statuses must not silently enter an active lane. Log them, exclude them from the active counts and expose a recoverable error state in development/test environments.

## Lane ordering

Sorting must be pure, deterministic and stable. Use booking ID as the final tie-break so a refetch cannot shuffle equal records.

### Due and late

1. Overdue `Booked` records first.
2. Among overdue records, earliest appointment first, which is also the longest overdue.
3. Upcoming records follow in ascending appointment time.
4. Missing or invalid appointment times appear after valid times and receive a visible `Time missing` warning.

Use the existing late grace period. A minute tick updates timing copy but does not cause continuous page scrolling.

### With us

1. Longest time on site first, using `checkedInAt` where available.
2. Records without `checkedInAt` follow in appointment-time order.
3. Actionable exceptions — welfare alerts, missing confirmation data needed for safe work or a failed mutation — are made visually clear without creating a new lane or permanently overriding the stable order.

### Ready to go

1. Longest ready wait first, using `readyAt`.
2. Records without `readyAt` follow in appointment-time order.
3. Payment due does not affect lane order.

### Home today

Show the most recently collected dog first. This is a compact, expandable history row rather than a fourth working lane. On a non-today selected date, label it **Home on this date**.

## Card anatomy

Each active card contains the following information in this order:

1. dog name;
2. human name, visually secondary;
3. appointment time and service;
4. current status and useful elapsed/relative timing;
5. welfare, arrival-confirmation or operational warning when relevant;
6. payment state and amount;
7. one primary outcome action;
8. one optional secondary action and an overflow menu when needed.

Do not recreate the current five-icon journey grid inside each card. Completed states can be understood from the lane, status wording and card history; the board should prioritise the next useful decision.

### Useful timing copy

- `Due in 18 mins`
- `Due now`
- `12 mins late`
- `On site 1 hr 25 mins`
- `Ready 24 mins`
- `Collected 14:22`

Use `1 min` and `2 mins`. Do not rely on colour to communicate lateness or waiting time.

## Actions by lane

### Due and late

| Condition | Primary action | Secondary / overflow |
| --- | --- | --- |
| Upcoming or on-time | `Check in` | Message human, open booking |
| Late with a telephone number | `Call {first name}` | Check in, message, `Didn't show`, cancel, reschedule, open booking |
| Late without a telephone number | `Contact {first name}` | Check in, message, `Didn't show`, cancel, reschedule, open booking |

`Call` must use a valid existing telephone number. If no valid number exists, do not render a dead `tel:` link.

The existing local `Hide until tomorrow` action must not be offered on this board. An unresolved active booking stays visible until staff resolve its real state.

### With us

| Existing status | Primary action | Secondary / overflow |
| --- | --- | --- |
| `Checked in` | `Start groom` | Message human, open booking |
| `In bath` | `Ready for collection` | Message human, open booking |

`Ready for collection` follows the current confirmed contract:

1. save `Ready for pick-up` through the existing update path;
2. move the dog to Ready to go after the save succeeds;
3. then offer the optional collection message;
4. never roll back readiness when messaging is declined, unavailable or fails.

### Ready to go

`Mark collected` is the primary action.

When money is due, show `Take £{amount}` as a clear secondary action. It opens the existing mini invoice with the calculated balance; it must not silently mark the booking paid.

If staff select `Mark collected` while money remains due, open a compact accessible confirmation with:

- `Take £{amount}`;
- `Mark collected anyway`;
- `Cancel`.

Choosing `Mark collected anyway` completes the visit. The unpaid amount remains visible in Home today and in the existing reporting/payment surfaces. Payment never blocks the status transition.

When the booking is already paid, do not leave an empty secondary-action slot merely for symmetry.

### Home today

The compact row has no primary workflow action. Dog name, collected time and any unresolved balance remain visible. `View all` expands the history or routes to the existing appropriate detail surface; it must not create a separate working board.

## Live arrival marker

Preserve the existing single live-focus marker and vertical day line. Adapt it to the lane layout rather than creating a second `Now` panel.

The existing selection priority remains:

1. earliest overdue awaiting-arrival booking;
2. closest upcoming awaiting-arrival booking;
3. ready booking waiting longest;
4. active in-salon booking on site longest;
5. no marker when no unresolved operational booking remains.

The marker attaches to the matching card in its current lane. It may update its words each minute. It must not continuously reorder cards or move the viewport.

Keep the current permission-based scrolling behaviour: initial load on today, changing the selected date to today and successfully resolving the current focus may request one scroll. Minute ticks, background refetches, filter changes and unrelated mutations may not.

## Realtime and concurrent use

The existing Supabase week subscription remains the source of remote booking updates.

When another device changes a booking's status:

1. calculate the old and new lane from the same pure mapping;
2. remove the card from the old lane and insert it into the new lane in one render;
3. announce, for example, `Charlie moved from With us to Ready to go` through a polite live region;
4. show one concise visual toast;
5. preserve the user's keyboard focus and scroll position.

If focus is inside a card whose remote update removes the focused control, restore focus to the moved card container or the closest equivalent action with `preventScroll: true`. Do not move focus when the user is working elsewhere.

Track locally initiated booking IDs until their realtime echo is received so local changes do not produce duplicate success toasts and announcements.

If two updates conflict, the latest server state wins. A failed local save keeps the card in its previous lane and shows the existing specific mutation error.

## Responsive layout

### Wide desktop

- Three equal active lanes in one grid.
- Natural page height; no independently scrolling columns.
- Home today spans the board width below the lanes.

### Tablet / medium content width

- Use a two-column grid when three readable cards do not fit.
- Ready to go may occupy the next grid position or span the row when that improves card width.
- Keep document scroll as the only vertical scroll container.

### Mobile

- Stack Due and late, With us, Ready to go and Home today in that order.
- Use one continuous vertical page.
- Empty active lanes may reduce to their labelled heading and `0` count.
- A lane containing any dog is expanded and cannot be hidden behind a tab, carousel or swipe gesture.
- Keep primary and secondary actions at least 44px high.

## Filters

The default board shows every active booking. The existing `Needs action` filter may remain as an explicit temporary filter only if it:

- clearly says that the board is filtered;
- provides a one-tap reset;
- is never persisted across date changes;
- leaves lane headings and counts understandable;
- does not alter the underlying lane assignment or summary totals.

## Accessibility

- Each lane is a labelled region with a heading and count.
- Each booking is an `article` labelled by dog name, appointment time and status.
- Actions use outcome-led accessible names; icon-only actions require visible tooltips and full labels.
- Lane colour is supplementary to written status.
- All controls have a minimum 44px target and a visible focus indicator.
- Card movement is announced through one `aria-live="polite"` region.
- Remote updates do not steal focus or trigger unexpected scrolling.
- The unpaid-collection confirmation traps focus, closes with Escape and returns focus to `Mark collected`.
- Reduced-motion preferences disable smooth scrolling and non-essential movement.
- Reading order follows the visual lane order at every breakpoint.

## Selected-date, loading and failure states

### Today

Show live relative timings, lateness, ready waits and the single live marker.

### Future date

Show the same status-derived lanes. Do not calculate lateness or show a live marker. Due cards are ordered by appointment time.

### Past date

Show the stored final statuses for that date. Do not fabricate historical lateness from the current clock. Unresolved `Booked` records remain visibly unresolved.

### Closed date

The existing closed state in the header remains authoritative. Existing bookings still appear in their correct lanes. A closed date with no bookings shows one calm board-level empty state, not three oversized empty cards.

### Loading

Use one board skeleton that preserves the approximate lane structure and avoids layout shift. Do not show zero counts before the data is known.

### Refetch failure with cached data

Keep the last confirmed board visible, add the existing failure banner and offer `Retry`.

### Initial load failure

Show a board-level error with `Retry`. Do not simultaneously claim that the date has no bookings.

### Empty date

Show `No bookings on this date`, selected-date context and the existing route into availability/new booking. Do not render three tall empty lane panels.

## Visual language

- Reuse the current Smarter Dog variables and Tailwind brand tokens.
- Use Quicksand for dog names and meaningful display headings; use Montserrat for operational copy and controls.
- Yellow identifies the primary next action.
- Coral identifies late or genuinely attention-required states.
- Teal and purple support status recognition without replacing written labels.
- Keep cards predominantly neutral with strong hierarchy, modest radii and restrained shadows.
- Do not introduce a new component library, colour system or decorative illustration for this feature.

## Technical approach

### Pure engine work

Add a board selector in `src/engine/dailyBrief.ts` or a tightly scoped adjacent module. It should return:

```ts
interface DailyBriefBoard {
  due: DailyBriefBoardEntry[];
  withUs: DailyBriefBoardEntry[];
  ready: DailyBriefBoardEntry[];
  home: DailyBriefBoardEntry[];
  excludedCount: number;
}
```

Each entry should retain the existing booking and derived feed facts, plus only the board-specific values required to render:

```ts
type DailyBriefLane = "due" | "withUs" | "ready" | "home";

interface DailyBriefBoardEntry extends TodayFeedEntry {
  lane: DailyBriefLane;
  sortMinutes: number;
  timingLabel: string | null;
}
```

Do not duplicate payment, welfare, pricing or late-arrival calculations in JSX.

### View composition

Create one feature-level board component, for example:

- `src/components/views/today/StatusBoard.jsx`

Keep small `StatusLane` and `StatusBookingCard` helpers private to the same module initially. Extract them only if reuse becomes real; avoid spreading this slice across a collection of generic components.

`TodayView.jsx` remains responsible for:

- selected-date data;
- booking mutations;
- live-focus selection and permission-based scrolling;
- invoice and collection-message modals;
- local/remote mutation coordination;
- board-level loading and error states.

`StatusBoard.jsx` remains responsible for:

- lane and card semantics;
- responsive board layout;
- card action hierarchy;
- attaching the existing live marker to the selected card;
- Home today compact history.

Reuse the existing update path, `MiniInvoiceModal`, collection prompt, toast provider, `paymentState`, `requiresCareSkipConfirmation`, `useOnTheWaySignals` and Supabase booking subscription.

### Existing feed code

Do not delete `BookingFeed.jsx` or `BookingJourneyRow.jsx` in the first board commit. Remove them from the Daily Brief composition only after the new board passes the equivalent tests. Delete or repurpose them in a later cleanup commit so rollback remains straightforward.

### Database

No migration. Do not add groomer assignment, grooming sub-stage, lane, order or payment-gate columns. Every lane remains derived from existing booking data.

## Acceptance criteria

1. A `Booked` dog appears once in Due and late; `Checked in` and `In bath` appear once in With us; `Ready for pick-up` appears once in Ready to go; `Completed` appears once in Home today.
2. Cancelled bookings do not appear in active lanes or active counts.
3. Dog name is the card headline and the human name is secondary.
4. No active card contains `Next step` or an unexplained icon-only journey.
5. Due records order overdue-first, then upcoming by time, with a stable ID tie-break.
6. With-us records order longest-on-site first.
7. Ready records order longest-waiting first.
8. Home records order most-recently-collected first.
9. `Ready for collection` saves before any message prompt opens; message failure leaves the dog ready.
10. An unpaid ready card shows the calculated `Take £{amount}` action.
11. Staff can mark an unpaid dog collected after an explicit choice; the outstanding balance remains visible.
12. No system event automatically marks a dog as a no-show.
13. One live marker remains, with no duplicated `Now` surface or continuous auto-reordering.
14. A remote status change moves the card once, announces the move, shows one toast and preserves focus/scroll.
15. Desktop has no nested lane scrollbars.
16. Mobile contains every non-empty lane in one continuous scroll and no active-dog tabs.
17. Closed, past, future, empty, loading and error states remain selected-date correct.
18. No database migration or new workflow status is introduced.

## Test plan

### Engine tests

Add coverage in `src/engine/dailyBrief.test.ts` and/or `src/engine/today.test.ts` for:

- every status-to-lane mapping;
- cancelled and unknown exclusion;
- overdue/upcoming ordering and invalid times;
- longest-on-site ordering and missing `checkedInAt`;
- longest-ready ordering and missing `readyAt`;
- most-recently-collected ordering;
- stable ID tie-breaks;
- future and past timing behaviour;
- payment state not changing lane assignment.

### Component tests

Add focused tests beside the new board and update `today.component.test.jsx` for:

- lane headings, counts and article labels;
- dog-first hierarchy;
- outcome-led actions per status;
- late contact fallback with and without a telephone number;
- paid and unpaid ready cards;
- `Take £{amount}` opening the existing invoice;
- unpaid collection confirmation paths;
- save-before-message behaviour;
- one live marker attached to the correct card;
- remote move announcement and focus restoration;
- loading, cached-error, initial-error and empty states;
- mobile empty-lane collapse without hiding active lanes.

### Browser journeys

Update `e2e/daily-brief.spec.ts` and validate the real route at desktop, tablet and narrow mobile widths with:

- upcoming confirmed and unconfirmed arrivals;
- an overdue unarrived dog;
- checked-in and in-bath dogs;
- ready paid and ready unpaid dogs;
- collection messaging accepted, declined and failed;
- collection with money still due;
- completed and cancelled bookings;
- a closed date with bookings and without bookings;
- future and past selected dates;
- a simulated realtime move while keyboard focus is inside and outside the affected card;
- long dog/human names and missing appointment/contact data;
- no horizontal overflow or nested vertical lane scroll.

## Rollout sequence

1. Add pure board derivation and sorting with tests.
2. Add the board behind a local development flag while retaining the current feed.
3. Wire existing actions and modals; prove payment and ready-message sequencing.
4. Add responsive, accessibility and realtime-focus behaviour.
5. Run component and browser journeys across real operational states.
6. Replace the current feed in the Daily Brief composition after review.
7. Remove the flag; defer old-feed cleanup to a separate low-risk commit.

## Out of scope

- drag and drop, swipe-to-move or double-tap status changes;
- staff/groomer assignment;
- detailed grooming sub-stages;
- household or invoice grouping across cards;
- new booking, payment or messaging database fields;
- changes to WhatsApp templates or recipient rules;
- changes to the Daily Brief header, capacity rules or availability engine;
- redesigning booking detail, Human or Dog profiles;
- a separate analytics or historical Kanban view.

## Implementation decision required before coding

Review the annotated board and this brief together, then explicitly approve the three-lane structure and the unpaid-collection confirmation. Those are the only decisions that would materially alter the build contract.
