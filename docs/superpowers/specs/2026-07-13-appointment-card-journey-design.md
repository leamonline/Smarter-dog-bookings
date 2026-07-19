# Appointment Card Journey Design

**Date:** 13 July 2026  
**Status:** Approved direction; awaiting written-spec review

## Purpose

Make the appointment card easy to scan and update throughout a groom, while removing the confusing split between **Services & add-ons** and **Payment & pickup**.

The redesign must reflect two independent facts:

- **Grooming status:** Booked, Checked in, In bath, Ready or Completed.
- **Payment status:** Due at pick-up, Deposit paid or Paid in full.

Completing a groom must not imply that payment has been taken. Recording payment must not complete the groom.

## Recommended structure

The card keeps the same order at every stage so staff build spatial memory and information does not jump around:

1. Header: dog, service, appointment value and current grooming status.
2. Grooming journey: the five existing status controls.
3. Appointment details: time and date, owner, pick-up person and grooming notes.
4. Services & payment: service and add-ons, one total, then the current payment state and relevant payment action.
5. Reminder and collection communication.
6. Booking history and destructive actions.

### Appointment details

Move **Pick-up person** from the payment card into Appointment details. It is collection logistics, not finance. Keep it beside the owner so staff can quickly answer both “who booked?” and “who is collecting?”.

In view mode use this row order:

1. Time & date
2. Owner
3. Pick-up person
4. Grooming notes
5. Source, when present

Edit mode keeps the same conceptual order, with date and time controls first. The pick-up selector remains editable and continues to use the owner and trusted contacts.

### Services & payment

Replace the two existing cards with one **Services & payment** card.

The service list comes first:

- Full Groom — £46
- Each add-on on its own row; show “Included” when it has no charge.
- Total — £46

Show the total once. Payment is a state beneath the total, not a negative line item. Never show “Paid in full −£46”, “Paid £0”, or use payment as though it were a discount.

Payment presentation:

| State | Summary | Actions |
| --- | --- | --- |
| Due at pick-up | **£46 to pay** | One-tap Cash, Card and Bank transfer |
| Deposit paid | **£10 paid · £36 to pay** | One-tap Cash, Card and Bank transfer for the remaining balance |
| Paid in full | **Paid £46 · Card** | No payment buttons |

The due and deposit states use a warm attention treatment. Paid in full uses a calm green confirmation treatment. Text and icons carry the meaning; colour is supplementary.

Payment actions remain one tap because this is a frequent front-desk task. While a payment is saving, disable every payment method, show a saving state and prevent double submission. On success, replace the actions in place with the paid confirmation. On failure, leave the amount due and actions visible and surface the existing error feedback.

Edit mode keeps the existing controls for payment status, method, amount taken, deposit and service pricing, but groups them within the same card. Editing the appointment must not be required for the normal one-tap payment flow.

## Grooming journey behaviour

The layout stays fixed; emphasis changes according to what staff are most likely to do next.

| Grooming stage | Primary reading need | Update behaviour | Payment behaviour |
| --- | --- | --- | --- |
| Booked | Confirm time, owner, notes and reminder state | Checked in is the natural next step; all statuses remain available for correction | Payment remains visible but visually secondary unless already taken |
| Checked in | Confirm notes, service and collection person before work starts | In bath is the natural next step | Payment remains visible but secondary |
| In bath | Keep grooming notes and service easy to scan | Ready is the natural next step | Payment remains visible but secondary |
| Ready | Identify the collection person and contact them | Completed is available but does not imply paid | If money is due, the payment area becomes the strongest action in the body |
| Completed | Confirm the final service, collection and financial record | Completed remains selected; earlier statuses remain available to correct mistakes | Paid shows a compact confirmation; unpaid remains an explicit warning with payment actions |

The existing five-step status control remains visible at every stage because it is compact, familiar and lets staff correct an accidental or skipped status. Strengthen the selected state, identify the next sequential step subtly, and retain the current accessible radio semantics and keyboard navigation.

During a status save, disable the status controls and show progress locally. On success, update the selected step in place and announce it through the existing live region. On failure, restore the previous state and keep the card open.

## Reminder and collection communication

Keep appointment reminders conceptually separate from payment. The existing reminder card remains below Services & payment.

The pick-up-ready message targets the saved pick-up person. It should become prominent when the appointment reaches Ready, but it must not be labelled as an appointment reminder and sending it must not change payment or grooming status.

## Visual hierarchy and density

- Preserve a single-column layout in the current narrow modal.
- Use consistent row heights, label alignment and dividers across both cards.
- Keep the dog, grooming status and appointment value visible in the header.
- Avoid repeating the payment state in both the header and body. The header may retain the value, but the body is the authoritative payment detail and action surface.
- Use one strong body action at a time: payment while Ready and unpaid; otherwise the next grooming step remains the main update affordance.
- Keep destructive actions at the bottom and visually distant from routine status and payment controls.

## Data and component boundaries

- `AppointmentDetailsCard` owns appointment and collection logistics, including the pick-up selector.
- A consolidated services-and-payment component owns the service breakdown, total, payment state and one-tap payment actions.
- `BookingStatusBar` remains responsible only for grooming status.
- `ReminderCard` remains responsible for appointment reminder state and pick-up-ready communication.
- Pricing continues to come from `computeBookingPricing`; no duplicated price calculation is introduced.
- Existing update callbacks and persisted booking fields remain unchanged.

## Accessibility

- Preserve the status control’s radiogroup behaviour and roving tab index.
- Payment actions must have unambiguous accessible names such as “Record £46 cash payment”.
- Announce successful status and payment changes through polite live regions or the existing toast pattern.
- Do not communicate due, paid or current grooming state by colour alone.
- Maintain at least 44px touch targets for primary controls and a clear focus indicator.

## Verification

Component tests should cover:

- Pick-up person appears in Appointment details and no longer appears in a separate payment card.
- Service price, add-ons and total render once.
- Due, deposit and paid summaries use the agreed wording and arithmetic.
- Completed but unpaid still presents the amount due and payment actions.
- Ready and unpaid presents payment as the prominent body action.
- One-tap payment records the full remaining amount, disables duplicate submissions and handles failure without hiding the debt.
- Status changes remain independent from payment changes.
- Existing keyboard navigation and screen-reader announcements continue to work.

Browser acceptance should exercise at least these combinations at desktop and narrow modal widths:

1. Booked + due at pick-up
2. Checked in + deposit paid
3. In bath + paid in full
4. Ready + due at pick-up
5. Ready + paid in full
6. Completed + paid in full
7. Completed + due at pick-up

Success means a staff member can identify the groom’s current stage, the next likely update, who is collecting, the total price and whether money is still due without scanning duplicate sections or interpreting accounting-style subtraction.
