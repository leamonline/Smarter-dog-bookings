# Today live arrivals and directory cards design

**Status:** Approved on 15 July 2026

**Scope:** Refine the Daily Brief booking flow, restore visible customer confirmation, combine collection readiness and optional messaging, and polish the Humans and Dogs directory cards. Implementation is a separate step.

## Outcome

Make the Daily Brief behave like a stable, time-aware working list rather than a page with a separate summary of the same bookings. Restore the lost WhatsApp confirmation signal, make successful booking progress visually calm and obvious, reduce collection readiness to one clear action, and give Humans and Dogs balanced cards with a shared identity-led structure.

The design must:

- remove the duplicated `Now / Up next` panel;
- position the most relevant live booking at the top without moving the page while staff are interacting with it;
- restore the customer-confirmed tick that is still present on the week-calendar booking card but absent from the Daily Brief journey row;
- use a persistent green booking-card tint for customer confirmation or successful check-in;
- combine `Ready for collection` and optional collection messaging into one journey action;
- retain the existing recipient, WhatsApp template and ready-in-time behaviour;
- polish both directory card families without changing search, filtering, archive or profile behaviour;
- reuse the existing Smarter Dog silhouette and size-colour system.

## Approved product decisions

1. Keep the Daily Brief booking feed chronological. Do not reorder records as the clock changes.
2. On today's date, scroll the live focus booking to the top when the page opens, the selected date changes to today, or the current focus is resolved.
3. Do not continuously move the page as time passes. Only the live marker copy updates each minute.
4. An overdue booking that has not arrived remains the live focus while its status is `Booked`; check-in or cancellation advances the focus.
5. Replace `Now / Up next` with the approved left-gutter arrow and short live context.
6. A customer-confirmed booking has a green-tinted card and a confirmation tick.
7. An unconfirmed booking becomes the same green when checked in. Once earned, the successful green journey styling remains through grooming, ready and completed states.
8. Cancellation styling overrides green so a cancelled booking cannot look active or successful.
9. Replace the separate Ready and collection-message journey controls with one `Ready for collection` action.
10. Marking ready saves the status first, then offers optional messaging. A messaging failure never rolls back the ready status.
11. Use the approved identity-led Humans and Dogs cards.
12. Human cards keep initials. Dog cards use the existing Smarter Dog silhouette coloured by size.

## Daily Brief live position

### Feed structure

Remove `TodayNowStrip` from the Daily Brief composition. `BookingFeed` remains the single operational representation of the day.

The feed stays in appointment-time order. Automatic positioning uses scrolling, not sorting, so staff retain a predictable mental map of the day. The focus card receives an anchor position with enough top margin to remain visible below the application toolbar.

Automatic scrolling runs only when:

- the Daily Brief first opens on today's date;
- the selected date changes to today;
- the focused booking is resolved by a successful status mutation;
- the booking data initially finishes loading and a focus can be selected.

It does not run on each minute tick, background refetch, message send, payment edit or unrelated card interaction. It must not steal focus from an open modal or move the page while a pointer or keyboard action is in progress.

For a past or future selected date, no live arrow is shown and the feed begins normally at its first booking.

### Live focus selection

Create one pure selector for the arrow and scroll target. For today's date it chooses, in order:

1. the earliest overdue booking that is still awaiting arrival;
2. the closest upcoming booking still awaiting arrival;
3. the ready booking that has waited longest for collection;
4. the active in-salon booking with the longest elapsed time;
5. no focus when the day has no unresolved operational booking.

This preserves the approved rule that an overdue, unarrived dog cannot be displaced by a newer appointment. Once that booking is checked in, cancelled or resolved, the selector advances to the next useful item and the feed scrolls once.

### Gutter marker

Render a compact marker in a left gutter aligned to the focused card. It contains a right-pointing arrow and one short context line. The marker must not be positioned over the card or consume space inside the journey grid.

Supported context includes:

- `Due to arrive in 5 mins`
- `Due now`
- `12 mins overdue`
- `Checked in 8 mins ago`
- `Waiting for collection 20 mins`

Use singular `1 min` and plural `2 mins`. The accessible label combines the dog name with the context, for example `Minnie — due to arrive in 5 mins`. Time alone is not the only indicator: overdue uses the existing coral warning treatment and normal live context uses a readable success/brand tone.

On narrow screens, reserve only the minimum gutter width required for the arrow and two short lines. The booking card keeps the remaining width and all existing 44px journey controls. If the text cannot fit at the narrowest supported width, keep the arrow visible and expose the full context through the accessible label.

## Confirmation and successful journey styling

### Regression being corrected

`BookingCardNew` still renders a confirmation tick when `booking.reminderConfirmedAt` is present. The newer `BookingJourneyRow` does not render that field, which made customer confirmations appear to have disappeared from the Daily Brief even though the confirmation data continued to exist.

Restore the tick directly in `BookingJourneyRow`. Its accessible label includes the confirmation time and its title is `Confirmed via WhatsApp at HH:MM`.

### Card tone rules

The whole journey card receives a calm green tint when either condition is true:

- `booking.reminderConfirmedAt` is present; or
- the booking has progressed to Checked in or any later non-cancelled care state.

This means:

- confirmed and awaiting arrival: green tint plus confirmation tick;
- unconfirmed and awaiting arrival: normal or yellow attention styling;
- unconfirmed but checked in: green tint without a false confirmation tick;
- confirmed and checked in: green tint with confirmation tick;
- grooming, ready or completed after check-in: remain green;
- cancelled: cancellation styling overrides green.

Late and payment warnings remain available within the card's time control or relevant journey action. The green background communicates successful confirmation/progress; it does not suppress genuine warnings.

Use existing green tokens with sufficient border/text contrast. Do not introduce a new arbitrary green. The tick and the tint must each have a non-colour accessible meaning.

## Ready for collection and optional messaging

### Journey action

Remove `messageCollection` from the journey action model, icon map and action key. Before readiness, the journey shows one `Ready for collection` control. After a successful ready save, it becomes the completed `Waiting to be collected` state.

Selecting `Ready for collection`:

1. saves `Ready for pick-up` immediately through the existing booking update path;
2. shows the success state on the card;
3. opens a compact collection prompt only after the save succeeds;
4. asks whether staff want to message the booking's humans;
5. offers `Send message` and `Not now`.

`Not now` closes the prompt and leaves the booking ready. `Send message` reveals the existing ready-in-minutes field, message preview and available owner/trusted-contact recipients in the same modal. This avoids stacking a second modal.

### Messaging behaviour

Retain the existing `ready_for_collection_v1` WhatsApp template, default ready-in time, recipient availability checks, multi-dog naming and individual recipient send controls.

The status transition and message send are deliberately separate outcomes:

- if the ready status save fails, do not open the prompt; show the existing mutation error and leave the journey unchanged;
- if the status save succeeds and messaging is declined, keep the dog ready;
- if the message send fails, keep the dog ready, show a useful error and allow retry;
- if contacts are unavailable or offline, explain why and allow the prompt to close without changing the ready status;
- if a message succeeds, retain the sent state and notification log behaviour.

The general owner-message control at the end of the booking row remains unchanged.

## Humans and Dogs directory cards

### Shared identity-led structure

Use one visual hierarchy across both directories:

1. compact identity marker;
2. primary name;
3. essential secondary details;
4. one concise relationship line;
5. a simple arrow/profile affordance.

Cards remain explicit interactive articles rather than turning the whole surface into nested controls. Telephone, email and WhatsApp links keep their own accessible targets. The profile action continues to open the existing Human or Dog modal.

Grid and list modes use the same information priority. List mode uses denser spacing without introducing different facts or a different interaction model.

### Human card

Use a softly tinted rounded-square initials marker. Show:

- full name;
- telephone number, with existing telephone/WhatsApp actions;
- email when present;
- linked dog name and breed, using the existing size indicator;
- safety/history flag when present;
- a concise no-dog prompt when applicable.

Keep initials deterministic from the displayed first name and surname. Missing or single-word names degrade to the available initial rather than an empty marker.

### Dog card

Replace the letter avatar with `public/images/dog-silhouette.png`, used as a mask so the mark can inherit the authoritative size colour:

| Dog size | Silhouette treatment |
|---|---|
| Small | Existing yellow small-size colour |
| Medium | Existing teal medium-size colour |
| Large | Existing coral large-size colour |
| Unknown/unconfirmed | Neutral grey |

Show:

- dog name;
- breed and calculated age;
- human name;
- written size as well as the colour-coded silhouette;
- safety alerts and the existing incomplete-profile badge when relevant.

Colour is supplementary. The written size and accessible silhouette label remain available. An unknown silhouette supports, and does not replace, the existing incomplete-profile signal.

### Responsive behaviour

At desktop grid widths, cards form balanced rows with consistent marker, content and arrow alignment. On mobile they remain horizontal and compact, with text truncation applied only to secondary content. Names receive priority and use the full remaining width.

All direct actions retain at least a 44px touch target. The silhouette is decorative when the written size is present; otherwise its accessible label describes the size state.

## Component boundaries

Keep the implementation focused in existing feature areas:

- `engine/today.ts`: pure live-focus selection and live-context calculation;
- `TodayView.jsx`: stable scroll triggers and focus advancement after successful mutations;
- `BookingFeed.jsx`: focused-row/gutter composition;
- `BookingJourneyRow.jsx`: confirmation tick, persistent green card tone and simplified journey;
- `engine/dailyBrief.ts`: remove the separate collection-message journey action;
- `CollectionNoticeModal.jsx`: initial yes/no prompt state before revealing existing send controls;
- `HumansView.jsx` and `DogsView.jsx`: shared identity-led card composition using small local components rather than one cross-directory component with many conditional branches;
- existing size/brand utilities: authoritative colours; no duplicate colour map.

Small focused helpers are preferred where they make card tone, live context or identity markers independently testable. Do not refactor unrelated directory loading, pagination, filters or booking mutation infrastructure.

## Error handling and accessibility

- Booking mutation errors remain visible and specific to the attempted journey action.
- Automatic scrolling uses the user's reduced-motion preference: smooth scrolling only when motion is allowed, otherwise immediate positioning.
- Programmatic scrolling does not move keyboard focus.
- The live arrow has an accessible label and does not rely on colour alone.
- Confirmation tick text distinguishes actual customer confirmation from a card that is green because the dog checked in.
- Collection messaging reports offline, unavailable-contact and send-failure states without undoing readiness.
- Directory markers and arrows do not replace explicit accessible names or profile actions.
- Existing modal focus trapping, Escape behaviour and scroll locking remain owned by `ModalShell`.

## Verification

### Pure logic tests

Cover:

- earliest overdue awaiting-arrival booking wins;
- an overdue booking remains selected as a newer appointment approaches;
- focus advances after check-in/cancellation;
- nearest upcoming arrival wins when nothing is overdue;
- ready and in-salon fallbacks are ordered as approved;
- past/future dates return no live focus;
- live copy handles due now, singular/plural minutes, overdue, checked-in and collection-wait states;
- card green-state precedence, including cancellation override;
- journey actions no longer contain `messageCollection`.

### Component tests

Cover:

- Daily Brief journey row renders the WhatsApp confirmation tick and accessible time;
- confirmed awaiting-arrival and checked-in-unconfirmed rows both use the green tint;
- an unconfirmed awaiting-arrival row does not show a false tick;
- cancellation overrides green;
- gutter marker aligns to the selected row and exposes useful accessible copy;
- scrolling occurs only on the approved triggers and does not occur every minute;
- Ready saves before the prompt opens;
- `Not now` retains Ready status without sending;
- send success, failure, offline and unavailable-contact states retain Ready status;
- Humans cards render initials and existing contact actions;
- Dogs cards render the silhouette with small, medium, large and unknown treatments;
- alert, incomplete, archived, no-dog and missing-owner states remain usable.

### Operational browser checks

Validate the real Daily Brief at desktop, tablet and narrow mobile widths with:

- a confirmed upcoming booking;
- an unconfirmed overdue booking;
- an unconfirmed booking that is checked in;
- a ready booking with available and unavailable recipients;
- collection-message success and failure;
- payment due alongside a green card;
- cancelled and completed bookings;
- a full Humans and Dogs directory row, long names, missing data and safety alerts.

Confirm that the focused card is correctly positioned on initial load and after resolution, but the page remains stationary during minute updates and unrelated mutations.

## Out of scope

- changing WhatsApp confirmation persistence or templates;
- changing booking chronological order in storage or queries;
- continuous auto-scrolling;
- replacing directory search, filters, pagination or archive behaviour;
- introducing dog photo upload or photo-led cards;
- changing the Human or Dog profile modals;
- changing general owner messaging from the Daily Brief;
- adding new booking statuses or payment fields.
