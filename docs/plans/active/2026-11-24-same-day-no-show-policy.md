# Same-day cancellation is a no-show; two in 12 months requires a deposit

Status: Draft
Issue: None yet. Owner decision taken in the project thread on 24 November 2026.
Base: origin/main, d72b2bf0
Last verified: 2026-11-24
Owners: customer and WhatsApp cancel commands, cancellation/no-show triggers, deposit trigger, staff customer card history, customer policy copy, reports
Dependencies: Production migration requires separate owner authorisation (ADR 006). Policy wording needs qualified review before release.
Related requirements: [PROJECT](../../../PROJECT.md) GOAL-01, GOAL-02, GOAL-05
Related ADRs: [ADR 013](../../architecture/decisions/013-allow-late-cancellations-with-customer-history.md) (partly superseded), [ADR 015](../../architecture/decisions/015-same-day-cancellation-is-a-no-show.md), [ADR 003](../../architecture/decisions/003-separate-operation-success-from-notification-delivery.md), [ADR 006](../../architecture/decisions/006-manual-target-verified-database-rollout.md)

## Goal

A customer who cancels on the day of the appointment is recorded as a No-show everywhere: iPhone, website, reports and the customer file. A customer who cancels on an earlier day is recorded as Cancelled with no penalty. Two unwaived no-show appointments in 12 months turn the deposit requirement on automatically.

## Why

The owner set this policy on 24 November 2026 to replace two rules that disagree: ADR 013's three late-cancellation strikes leading to staff review, and migration `20261122160000`'s deposit after the first staff-marked no-show. One simple rule is easier for customers to understand and for staff to apply.

## Current behaviour

Confirmed from source at the base revision. No production reads were made.

- `smarter_dog_private.cancel_booking_impl` (latest in `20261110140000_portal_switches_read_typed_settings.sql`) cancels an owned group plus date atomically. It sets `status = 'Cancelled'` and `cancellation_cause = 'customer'`, and writes a private receipt. Receipt replay matches `current_target.status = 'Cancelled'` and a `booking_events` row of type `cancelled`. It is called by `cancel_customer_booking` (portal and iPhone).
- WhatsApp cancellations use `cancel_whatsapp_booking_group` and `cancel_whatsapp_booking_by_id`, plus their `_for_reschedule` variants (latest in `20261001160000_late_cancellation_history.sql`). Each sets `status = 'Cancelled'`.
- `record_late_cancellation` (AFTER UPDATE OF status) writes `smarter_dog_private.late_cancellation_history` when a customer-caused cancellation lands between the notice deadline (`cancellation_notice_hours()`, default 24) and the start. It deduplicates by owner, group or booking, and date. Staff undo waives it.
- `clear_cancellation_cause` (BEFORE UPDATE OF status) nulls `cancellation_cause` whenever the new status is not `Cancelled`.
- `staff_customer_cancellation_history` counts unwaived strikes in 12 London months, with `reviewRequired` at 3. `CancellationHistoryPanel.tsx` shows it on the customer card.
- `flag_deposit_after_no_show` (`20261122160000`) turns `humans.deposit_required` on at the **first** transition to `No-show`.
- The cancellation notification trigger (`20260723090000`) fires only `when new.status = 'Cancelled'`. A No-show today sends no customer message.
- Customer copy: `BookingConfirmation.tsx` says "late cancellations are recorded". The website `TermsPage.jsx` says "at least 24 hours' notice" and "No-shows or late cancellations may require a non-refundable deposit".

## Desired behaviour

- A customer-caused cancellation of a Booked or Reconfirmed appointment, committed on the appointment's London date before it starts, is saved as `No-show` with `cancellation_cause = 'customer'` and the customer's reason. This applies to portal, iPhone, WhatsApp, and staff recording a customer's request.
- Before the day, the cancellation is saved as `Cancelled` with no strike, whatever the notice.
- After the start, customers still cannot cancel (unchanged). Staff mark a no-show by hand (unchanged).
- The customer still gets a cancellation confirmation when they cancel on the day. The seat is freed and the waitlist and staff alerts behave as for a cancellation.
- One appointment (a group of dogs on one date) is one no-show. Retries do not double count.
- The deposit tag turns on automatically at the second unwaived no-show appointment in the preceding 12 London months, including staff-marked no-shows. It never turns off automatically.
- The staff customer card shows "No-shows in the last 12 months: N of 2" with dated entries and the existing waive action.
- Customer copy explains the rule in plain British English before they confirm a same-day cancellation, and on the terms page.

## Scope

- One append-only migration that changes: `cancel_booking_impl`, the four WhatsApp cancel functions, `clear_cancellation_cause`, the cancellation notification trigger condition, receipt replay, the strike ledger (no-shows instead of notice-window strikes), `staff_customer_cancellation_history`, and `flag_deposit_after_no_show` (threshold 2).
- pgTAP tests for each behaviour, including London DST, group dedupe, retries, staff undo, and both the before-day and on-the-day cases.
- Customer portal and iPhone cancel confirmation copy, booking confirmation copy, the website terms page, and the staff card history panel.
- `src/constants`, `bookingRules` and reports only where they read strike counts.

## Non-goals

- Activating the dormant visit policy (`previous_day_1500_v1`).
- Changing rescheduling's notice rule.
- Refunds, deposit amounts or charging for no-shows.
- Rewriting historical bookings.

## Open questions (owner)

1. **Existing history at go-live:** should late-cancellation strikes and no-shows from the last 12 months count towards the new two, or should everyone start from zero on the go-live date?
2. **Warning before cancelling on the day:** should the customer see "Cancelling today counts as a no-show" and confirm, before it goes through?
3. **Policy wording:** approve the new terms text, and decide whether it needs legal review before release.

## Rollout and rollback

Migration first, applied with the approval-gated production workflow after a staging run. Then client copy and staff card changes in a follow-up PR (expand/contract per `docs/migrations.md`). To roll back, apply a forward migration that restores the previous function bodies. Data written as `No-show` under the new rule stays as written, and staff can correct individual rows.

## Acceptance

- pgTAP: on-the-day customer cancel gives `No-show` with cause kept. A day-before cancel gives `Cancelled` with no ledger row. Second no-show in 12 months sets the deposit tag. First does not. Waived no-shows do not count. A group counts once. Replay returns the original receipt.
- The customer receives a cancellation message for a same-day cancel (notification trigger fires once).
- The iPhone Today and website Today show the dog as No-show on the stack.
- `npm run lint`, `check:docs`, `typecheck`, `check:migrations`, `test`, `build` and the database test suite pass.
