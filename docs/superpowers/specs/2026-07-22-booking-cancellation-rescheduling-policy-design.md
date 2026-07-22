# Booking, Cancellation, Rescheduling and Deposit Policy — Signed Design

**Status:** Signed off in the 22 July 2026 grilling session. This document is the product source of truth for implementation; it does not itself activate the policy.

**Policy code:** `previous_day_1500_v1`

**Timezone:** `Europe/London`

## Purpose

Replace the inconsistent rolling 24-hour rules with one visit-level policy shared by the customer website, WhatsApp, staff-created bookings, database enforcement, notifications and reporting. A visit may contain one or more dogs; policy actions apply to the dated visit, never accidentally to another date in a recurring series.

## Policy activation and grandfathering

- The new policy is inactive until an owner deliberately sets one explicit effective instant at `00:00 Europe/London` after the application, Edge Functions and public Terms are ready.
- Before that instant, additive schema/dual-write code must preserve every live legacy customer, staff, deposit, reminder and messaging behaviour. At the instant, the complete v1 runtime—not only its deadline calculation—switches together.
- Visits confirmed before that instant retain the legacy rolling 24-hour rule.
- Visits first confirmed on or after that instant use `previous_day_1500_v1`.
- Activation does not rewrite a deposit requirement or exemption already snapshotted when an unconfirmed request became commercially eligible; the eligibility time and rule used remain auditable, while the visit still receives its policy version only when it confirms.
- Once `previous_day_1500_v1` has taken effect, rescheduling a legacy visit creates a replacement governed by v1; the new deadline must be shown before confirmation.
- The policy assignment is an enforcement/audit record. Ordinary bookings do not require a separate policy-version checkbox.
- Deposit-required website bookings do require explicit acceptance of the deposit terms, with the accepted version and timestamp recorded.

## Visit identity

- A scheduled visit is one customer, one appointment date and one or more dogs/services.
- All cancellation, rescheduling, confirmation, approval, deposit, credit and incident operations are atomic at visit level.
- A recurring series is not a visit. Customer self-service affects only the selected dated visit; series changes require staff and must list the affected dates.
- A visit has a durable reschedule lineage. Replacement records inherit the lineage even though they receive a new visit ID.

## Change deadline

- Under `previous_day_1500_v1`, customer self-service cancellation and rescheduling close at **3:00 pm on the previous calendar day**.
- The calculation uses `Europe/London`, including daylight-saving changes.
- Exactly `15:00:00` is on time; any later instant is late.
- Sundays and bank holidays do not change the deadline.
- Every visit on the same appointment date has the same deadline, regardless of drop-off time.
- Staff can waive a rule. Every waiver records staff member, time, category and reason.
- A delayed or failed courtesy reminder does not move the deadline when the rule appeared during booking and in the confirmation. Staff may still waive it.

## Customer cancellation

- Before or exactly at the deadline, a confirmed visit can be cancelled through an enabled self-service channel.
- Cancellation applies to the complete visit and lists every affected dog before confirmation.
- The reason is optional and includes `Prefer not to say`.
- A committed cancellation is irreversible through self-service; the customer may create a new booking or contact staff.
- A paid deposit is refunded in full within five working days or retained as non-expiring account credit only when the customer explicitly chooses credit. For system due-date tracking, a working day is Monday to Friday excluding England-and-Wales bank holidays, calculated in `Europe/London`; salon opening days do not alter it.
- After the deadline, self-service must not mutate the booking. The original remains booked until staff act.
- When staff accept a late cancellation, it creates one incident and normally retains the deposit unless staff record a waiver, refund or transfer exception.
- A late request that staff decline creates no incident if the customer attends.
- A late cancellation request received before the appointment, followed by absence before staff respond, is one late-cancellation incident, not an additional no-show.

## Customer rescheduling

- Cancellation and rescheduling use the same deadline and independent enable/disable settings.
- A reschedule is one atomic transaction: either the complete old visit is replaced or nothing changes.
- The old visit remains active until the replacement commits.
- Only the date and time change. Dogs, services, add-ons, price basis and payment/deposit state are preserved.
- Partial dog, service or add-on changes require staff.
- A successful on-time reschedule transfers a paid deposit and creates no incident.
- Each lineage permits three successful customer self-service reschedules. The fourth and all later moves require staff until the lineage is completed or cancelled.
- Failed, abandoned and staff-proposed pre-confirmation changes do not consume the allowance.
- Cancelling and rebooking the same dogs and services within 24 hours preserves the lineage and its count.
- Rescheduling a single recurring visit never changes the rest of the series.
- An accepted unwaived late reschedule creates one incident, normally retains the old deposit and normally requires a new £10 deposit. Staff may carry the old deposit as a recorded exception.

## Self-service switches and destination window

- Upcoming bookings are always visible; there is no setting to hide them.
- Past history visibility is configurable and enforced.
- Cancellation and rescheduling have separate authoritative switches, enforced by website, WhatsApp and database commands.
- `Allow repeat booking` copies dogs and services from a past visit into a new booking journey. It is not rescheduling and creates a new lineage.
- The customer booking horizon is an authoritative number of days, default `180`, with the 180th day included.
- The horizon applies to new, repeat and reschedule destination dates on every self-service channel. Staff may override it.
- Changing the horizon affects future selections and writes; it never cancels an existing visit.

## Same-day and last-minute bookings

- Same-day customer booking is available only for slots deliberately released by staff and at least 30 minutes before the appointment start.
- Last-minute status is decided when a valid request first becomes otherwise eligible to confirm: at request creation when auto-confirm applies, at staff approval when approval is required, or at customer acceptance of a staff proposal. A mechanically later confirmation caused only by manual deposit verification does not change that decision.
- A request that becomes eligible only after its 3:00 pm previous-day deadline is a last-minute booking, even when the customer submitted an earlier incomplete or unapproved request.
- Same-day and last-minute visits require no deposit, including for customers who otherwise require one.
- They expose no self-service cancellation or rescheduling after confirmation.
- If the customer contacts staff before the appointment to cancel or move it, the change is waived and creates no incident.
- Only an uncommunicated absence creates a no-show incident.

## Confirmation and staff approval

- `Auto-confirm bookings` is authoritative.
- When enabled, an ordinary eligible request confirms immediately. A deposit-required request confirms only after the deposit is recorded, unless a no-deposit exemption applies.
- Under v1, a request for the following calendar day that first becomes otherwise eligible after 3:00 pm must enter staff approval even when auto-confirm is enabled; it is a last-minute request and requires no deposit.
- When disabled, a request enters `Waiting approval by staff` and reserves the slot.
- `Waiting approval by staff` never expires or releases automatically, including after the requested appointment start. It remains visible until staff approve or decline it.
- A customer can withdraw any unconfirmed visit at any time, including after the 3:00 pm deadline, without an incident.
- Declining requires a short customer-facing reason, sends the outcome and releases the slot.
- Staff may retrospectively approve a request when the customer attended and the service was provided.
- A request that was never approved cannot become a no-show or incident.
- Staff cannot silently edit a request and approve different details. They propose an alternative, release the original slot, reserve the proposed slot and wait for customer acceptance or staff withdrawal.
- **Implementation clarification:** in the preceding rule, `original slot` means the hold belonging to an unconfirmed new-booking request. For a change proposed against an already confirmed visit, the confirmed source remains booked until customer acceptance atomically replaces it, as required by the rescheduling rules above.
- Customer acceptance of a staff-proposed alternative does not consume a reschedule. It completes staff approval and starts any applicable deposit window.

## Deposit requirement

- The deposit is a flat **£10 per scheduled visit**, never per dog, and is part-payment credited against the final bill.
- Customers who require a deposit must complete the booking on the website and accept the deposit terms.
- WhatsApp or staff may create a provisional request and send a website link; they must not bypass website acceptance.
- Deposit hold-window choices are exactly `6`, `12`, `24`, `36` and `48` hours; the default is `12`.
- The hold window starts only after staff approval when approval is required.
- Deposit requirement and exemption are snapshotted at that same eligibility point. A pre-deadline deposit-required hold remains deposit-required if staff verify payment after the deadline; staff may then accept the late payment or decline it under the manual-verification rules below.
- If the configured window would end after the appointment begins, no deposit is required. The visit follows the normal 3:00 pm change policy and is not automatically a last-minute visit.
- Complete bank account name, sort code and account number are required before a deposit-dependent flow can start. An incomplete setup blocks that flow and creates a visible staff alert rather than an impossible deadline.
- There are no automatic deposit-payment reminders.

## Manual deposit verification

- A deposit-required visit is held but unconfirmed while waiting for payment.
- The customer's bank receipt time determines whether payment was on time; the later staff-check time does not.
- Reaching the due time never cancels the visit or releases capacity. The customer-facing visit remains `Waiting approval by staff`; staff views derive a prominent `Deposit check due` escalation.
- Only staff record `Received` or `Not received` for the entire visit.
- `Received` confirms the visit and sends confirmation.
- `Not received` releases the visit and sends a not-confirmed outcome. It creates no incident.
- Staff may accept a late payment. If they decline it, the customer chooses refund or credit and no incident is recorded.
- A payment found after a slot was released never recreates the booking automatically. Staff offer a new booking, credit or full refund after checking availability.
- Withdrawing an unconfirmed deposit visit releases capacity immediately and creates a mandatory reconciliation task until staff record no payment, refund, transfer or credit.
- If payment had arrived, the customer chooses a full refund within five working days or transfer/credit for another booking.

## Customer credit

- Deposit credit does not expire.
- Credit remains visible until applied or refunded at the customer's request.
- Existing £10 credit may satisfy a future mandatory website deposit after explicit customer allocation and deposit-terms acceptance.
- With auto-confirm disabled, allocated credit is reserved but not consumed while awaiting approval. Withdrawal or decline restores it automatically.

## Incident ledger

- Incident kinds are `late_cancellation`, `late_reschedule`, `no_show`, `late_arrival_unserviceable` and a staff-recorded `late_partial_change`.
- Late cancellation, late reschedule, no-show and an arrival too late to provide the service each count as one incident unless waived.
- A visit can have at most one counting incident, regardless of dog count.
- The incident date is the affected appointment date.
- Only staff can mark a no-show; no scheduled process infers one.
- Marking a no-show sends no automatic customer message. Staff deal with the customer manually.
- If an appointment still takes place despite late arrival, it creates no incident; staff may record a non-penalising note.
- Removing one dog, reducing a service or removing an add-on after the deadline while the rest of the visit proceeds is not automatically an incident. Staff may deliberately record one with a reason.
- Waived incidents do not count toward deposit requirements.
- Incident details and counts are staff-only. Customers see the resulting deposit requirement and a plain-language reason, not a strike counter.

## Incident consequences

- One unwaived incident makes the next eligible advance booking deposit-required.
- That single-incident requirement persists after a late cancellation or no-show and clears after one successfully completed appointment.
- Three unwaived incidents in a rolling 12 months make future eligible advance bookings deposit-required.
- The ongoing requirement clears after 12 incident-free months. Staff may remove it earlier or retain it longer with an audited override.
- Existing confirmed future visits are not retroactively changed when a threshold is crossed; staff receive a review prompt.
- Incident and deposit history belongs to the customer account, not an individual dog.

## Deposit outcomes on confirmed visits

- On-time cancellation: refund within five working days, or credit only by explicit customer choice.
- On-time reschedule: transfer to the replacement visit.
- Salon-caused cancellation/reschedule: no incident or reschedule count; transfer or full refund according to customer preference.
- Accepted unwaived late cancellation/reschedule, no-show or unserviceable late arrival: normally retain the deposit, with an audited staff exception for refund or transfer.
- When only part of a multi-dog visit changes and the visit proceeds, the deposit remains part-payment against the work performed.

## WhatsApp behaviour

- Ordinary v1 confirmations state the 3:00 pm rule and link to the full Terms; legacy confirmations render their stored rolling deadline. Neither requires a separate booking-level acceptance checkbox.
- WhatsApp resolves and displays dated visits, never an undated `group_id` that might span a recurring chain.
- Ordinary WhatsApp webhook actions use the original provider message timestamp when testing the deadline, not webhook processing time. Meta's encrypted Flow data exchange does not include that timestamp, so a Flow submission uses the database receipt instant captured on its first signature-verified/decrypted request; it never uses the customer's clock, Flow-session creation time or a retry time.
- When an after-cutoff cancellation/reschedule intent is detected, the triggering message receives no automated reply.
- The whole conversation enters staff-only mode. No later automated replies are sent until staff explicitly mark it resolved and resume automation.
- Silence applies only after late change intent is detected; it is not imposed merely because a customer has a next-day visit.
- Deposit-required booking intent is handed to the website rather than booked within WhatsApp.

## Website behaviour

- Before the deadline, enabled actions are shown with the exact deadline.
- After the deadline, Cancel and Reschedule are removed and replaced with the deadline, confirmation that the appointment remains booked, and `Message the team`.
- A message sent through that route enters the staff inbox without an automated reply.
- Whole-visit confirmation lists every dog.
- All successful on-time cancellation/reschedule confirmations state the appointment and deposit/refund/credit outcome.

## Reminders and terms

- The day-before reminder runs at **10:00 am Europe/London** and states the 3:00 pm deadline.
- A booking created after 10:00 am but before the deadline relies on its booking confirmation; it receives no duplicate immediate reminder.
- The same concise deadline summary and full Terms link appear on website, WhatsApp and staff-created confirmations.
- Public Terms must cover cancellation, rescheduling, late changes, deposits, refunds/credits, no-shows, late arrival, incident consequences and last-minute exemptions before activation.

## Settings integrity

- Saving any visible Booking Rules control must change actual runtime behaviour.
- Remove `Minimum cancellation notice`; the 3:00 pm policy appears as a read-only versioned value.
- Replace `advanceBookingWeeks` with authoritative `bookingHorizonDays`, default `180`.
- Enforce `autoConfirm`, the deposit-window choice, complete bank details and the customer-portal switches at the database boundary as well as in the interfaces.
- Remove the `Show upcoming bookings` toggle.
- Keep and enforce `Show past booking history`.
- Rename and enforce `Allow repeat booking` separately from rescheduling.
- Add and enforce an independent `Allow rescheduling` switch.

## Reporting and audit

- Reporting uses the applied policy deadline, not a hard-coded rolling 24 hours.
- Replacement-style and in-place staff reschedules emit the same visit-level reschedule event.
- Approval, proposal, withdrawal, decline, confirmation, cancellation, reschedule, deposit outcome, incident, waiver, credit and staff override changes are auditable.
- Customer-facing notifications are idempotent and tied to the visit-level outcome so multi-dog visits send once.

## Explicit non-goals

- No automatic no-show detection.
- No automatic cancellation or capacity release for unpaid or unchecked deposits.
- No customer-visible incident counter.
- No deposit on same-day, last-minute or insufficient-window bookings.
- No customer self-service partial visit changes or recurring-series changes.
- No automatic reply to an after-cutoff WhatsApp change conversation until staff resume automation.
