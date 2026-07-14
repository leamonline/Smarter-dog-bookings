# Daily Brief UX design

**Status:** Approved on 14 July 2026
**Scope:** Rename and refine the existing `/today` operational view. This document records the approved design only; application implementation is a separate step.

## Outcome

Turn the current Today page into a polished **Daily Brief** that remains quick to scan while making each booking’s operational journey directly actionable.

The design must:

- make the selected date and online availability feel balanced and intentional;
- let staff jump to any date and operate that day’s bookings;
- reduce booking rows to one expressive identity line plus a compact icon journey;
- keep dog, booking, human, messaging and payment destinations one interaction away;
- show progress through colour, icon changes and concise hover/focus labels;
- reuse the existing status, pricing, add-on, deposit and payment data rather than introducing a parallel model.

## Approved product decisions

1. Rename the page and navigation label from **Today** to **Daily Brief**.
2. Keep the existing `/today` route for backwards compatibility.
3. Add `?date=YYYY-MM-DD` as the selected-day contract.
4. The date selector opens a fully operational Daily Brief for any selected date, including past and future days.
5. Use a guided-but-flexible journey: show every stage, emphasise the next expected action, allow legitimate exceptions such as early payment, and confirm only when a care stage is skipped.
6. Use the approved icon-only booking row. Do not restore the six labelled action buttons beneath it.
7. Use the existing **Caveat** typeface request for the appointment sentence, at a bold display weight with `cursive` as the fallback.
8. The outstanding balance in payment entry is prefilled but editable.

## Page header

### Desktop and tablet

Use a split operational header:

- **Left:** `Daily Brief`, selected date, calendar control, dogs booked, actions needed and unpaid total.
- **Right:** a compact online-availability panel containing the current availability state and **Manage availability**.

The selected date must remain prominent because staff can change operational states on any date. Do not use “Today” as the date label when another date is selected.

The calendar icon opens the existing date-selection pattern. Selecting a date:

1. updates `?date=YYYY-MM-DD`;
2. updates the header date;
3. loads that date’s bookings and availability;
4. preserves the Daily Brief layout and actions.

### Mobile

Stack the two header sections. Keep the title, date and calendar control first; availability follows. Avoid a full-height hero treatment.

## Booking-row composition

### Appointment sentence

Centre the booking identity across the space between the time marker and owner-message control:

`Jack · Springer Spaniel · Full groom · David Law · £42`

Use Caveat at a bold, larger display size with `cursive` fallback. On desktop and tablet it should remain one line. On narrow mobile screens it may wrap cleanly rather than truncate a person, dog, price or service.

The sentence contains four separate keyboard-accessible targets without visible underlines:

| Target | Result |
|---|---|
| `Jack · Springer Spaniel` | Open the existing dog file/modal |
| `Full groom` | Open the existing booking-detail modal |
| `David Law` | Open the existing human file/modal |
| `£42` | Open the mini invoice |

The time circle also opens the booking-detail modal.

### Outer controls

- The time remains inside a circular control.
- The owner-message control uses the speech-bubble icon itself, without an additional surrounding circle.
- The circular body of the speech bubble should visually match the time circle; its natural pointer makes its overall silhouette slightly larger.
- Selecting the owner-message control navigates to `/inbox?human=<owner-id>` and opens/focuses that customer’s conversation.

### Equal spacing

Before collection readiness, distribute these eight centres evenly across the row:

1. time;
2. check-in;
3. groom;
4. ready without message;
5. message for collection;
6. collected;
7. paid;
8. owner message.

After the two collection choices merge, recalculate the row as seven equal centres. Do not leave an empty grid track.

The time marker and owner-message icon remain vertically centred against the complete row height.

## Grooming journey

All stage controls are icon buttons with at least a 44 × 44px interactive target. Future stages use the existing muted cream treatment. Completed/current stages gain the appropriate approved colour treatment; meaning must not depend on colour alone.

| Stage | Initial icon | Completed label/state |
|---|---|---|
| Check-in | Log-in/check-in | `Checked-in` |
| Start groom | Bubbles | `Being groomed` |
| Ready without messaging | Scissors | Merges to `Waiting to be collected` |
| Message for collection | Send | Merges to `Waiting to be collected` after successful send |
| Collected | Car | `Complete` |
| Paid | Pound sign | Changes to the recorded payment-method icon |

### Collection alternatives

The ready and collection-message controls are alternative routes:

- **Ready for collection:** immediately sets the booking to `Ready for pick-up` without sending a message.
- **Message for collection:** opens the existing collection-message template. Only a successful send sets the booking to `Ready for pick-up`.
- Cancelling or failing to send leaves both alternatives available.
- After either successful route, remove the Send icon, keep the Scissors icon, label it `Waiting to be collected`, and redistribute all icons equally.

### Labels

Do not render the six-button grid beneath the icons.

Each icon shows a compact text pill beneath it on:

- pointer hover;
- keyboard focus.

The same text is the control’s accessible name. Tooltips supplement `aria-label`; they are not the only source of meaning.

### Guided flexibility

- The expected next stage receives the strongest available-state emphasis.
- Completed stages remain visually complete.
- Payment may be recorded early.
- Selecting a later care stage while an earlier care stage is incomplete asks for confirmation and names the skipped stage.
- Do not show a confirmation for the two approved collection alternatives.

## Payment icon states

The payment icon begins as a **pound sign**.

After a successful payment save it changes to:

| Method | Icon | Hover/focus pill example |
|---|---|---|
| Cash | Notes and coins | `Paid £42 by cash` |
| Card | Card | `Paid £42 by card` |
| Bank transfer | Bank building | `Paid £42 by bank transfer` |

Use the closest matching icons from the application’s existing icon library. Cash may combine the library’s banknote and coins icons within the same payment control.

## Mini invoice

Selecting the price or the Pound/Paid icon opens a compact invoice editor. Use a centred compact modal on desktop/tablet and a bottom sheet on mobile.

### Content order

1. Dog and appointment context.
2. Base groom price.
3. Existing add-on selection and prices.
4. Deposit received.
5. Calculated total.
6. Outstanding balance.
7. Payment received, prefilled with the outstanding balance but editable.
8. Required method: Cash, Card or Bank transfer.
9. Cancel and Save payment actions.

### Existing data contract

Reuse the current fields and pricing rules:

- base price: booking `price_override`, dog usual price, settings guide price, then fallback pricing;
- add-ons: booking `addons`;
- deposit: `deposit_amount` / deposit payment state;
- final payment: `paid_amount`, `payment_method`, `paid_at` and `Paid in Full`;
- derived total and balance: `computeBookingPricing` and `buildMarkPaidPatch`.

The initial implementation records one deposit and one final payment method/amount, matching the current data model. The deposit method is not recorded. Split payments, multiple payment events and mixed methods are not part of this design.

### Validation and feedback

- Base price must be above £0.
- Deposit must be above £0 and below the appointment total when marked paid.
- Payment received cannot be negative.
- A payment method is required when payment is recorded.
- Keep the invoice open with inline errors if saving fails.
- On success, close the invoice, update the row price/payment icon and announce `Payment recorded`.

## Existing destinations and patterns to preserve

- Dog identity opens the existing dog file rather than a new profile surface.
- Service/time opens `BookingDetailModal` rather than a second booking editor.
- Human identity opens the existing human file rather than a new customer view.
- Owner messaging continues to use the existing Inbox deep link.
- Collection messaging continues to use the existing collection-notice template.
- Availability continues to use the existing availability modal.

## State handling

### Loading

Keep the header stable and show row-shaped skeletons for the selected date. Do not flash the previous date’s bookings beneath the new date.

### Empty

Show the selected date and `No bookings on this date`. Keep calendar navigation and Manage availability available.

### Success

Update icon and colour states only after the write succeeds. Use concise success announcements for stage, collection-message and payment changes.

### Error and recovery

- Keep the prior confirmed state if a stage update fails.
- Show an action-specific error and a retry path.
- Failed collection messages must not mark the dog ready.
- Failed invoice saves retain all entered values.

## Modal and keyboard behaviour

For the mini invoice and existing linked files/modals:

- move focus to the modal heading or first field on open;
- trap focus while open;
- close on Escape unless a save is actively running;
- restore focus to the invoking target;
- prevent background scrolling;
- provide an explicit Cancel/Close action;
- require confirmation only when closing with unsaved invoice changes.

Every icon and sentence target must be reachable by keyboard with a visible focus style. Tooltips must appear on focus as well as hover.

## Responsive behaviour

- **Desktop:** full equal-track row with a single-line appointment sentence.
- **Tablet:** retain equal-track spacing and allow the sentence slightly more vertical room if required.
- **Mobile:** preserve 44px targets; allow the appointment sentence to wrap; keep the icon sequence in chronological order without horizontal scrolling. If eight comfortable columns do not fit, use two balanced icon rows while preserving order and equal spacing.
- The mini invoice becomes a bottom sheet on mobile, with the Save action visible without covering fields.

## Code areas expected to change

- `src/components/layout/navConfig.jsx` — Daily Brief navigation and context label.
- `src/App.jsx` — selected-date route/query handling while retaining `/today`.
- `src/components/views/TodayView.jsx` — selected-date data, stage actions and modal/file wiring.
- `src/components/views/today/TodayHeader.jsx` — split header, calendar control and availability state.
- `src/components/views/today/BookingFeed.jsx` — appointment sentence, equal-track icon journey and click targets.
- `src/components/views/today/TodayNowStrip.jsx` — align any duplicated live-booking actions with the approved journey or remove duplication.
- `src/components/views/today/parts.jsx` — shared icon/tooltip primitives where useful.
- New focused mini-invoice component under `src/components/views/today/` or the existing booking-detail module.
- `src/engine/today.ts` and `src/engine/bookingRules.ts` only where selectors/derived labels are required; do not duplicate pricing rules in React.
- Existing Today component and engine tests, plus new browser coverage for date selection, interaction destinations, stage transitions and invoice payment methods.

## Acceptance criteria

1. Navigation and page heading say Daily Brief while `/today` links continue to work.
2. Selecting any date loads an operational Daily Brief for that exact date.
3. The header remains balanced at desktop, tablet and mobile widths.
4. The appointment sentence uses Caveat, is centred, and exposes four distinct accessible targets.
5. Time and service open the same booking-detail modal.
6. Dog and human targets open their existing files.
7. Owner message opens the correct Inbox conversation.
8. Journey icons remain chronological, equally spaced and keyboard accessible.
9. Ready and collection message merge into Waiting to be collected through the approved alternative paths.
10. The remaining icons redistribute evenly after the merge.
11. Hover and keyboard focus show the label pill beneath each icon.
12. The six labelled action buttons no longer appear.
13. The mini invoice edits existing price, add-on, deposit and payment fields with correct totals.
14. Payment amount defaults to the outstanding balance and remains editable.
15. The Paid icon changes correctly for cash, card and bank transfer.
16. Loading, empty, success and error states preserve the selected-date context and offer recovery.
17. Modal focus, Escape, focus restoration and background-scroll behaviour pass keyboard testing.
