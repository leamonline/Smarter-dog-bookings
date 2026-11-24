# Same-day cancellation is a no-show; two in 12 months requires a deposit

Status: Active
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
- One day per owner is one no-show (their dogs missing the same date count once). Retries do not double count.
- The deposit tag turns on automatically at the second unwaived no-show appointment in the preceding 12 London months, including staff-marked no-shows. It never turns off automatically.
- The staff customer card shows "No-shows in the last 12 months: N of 2" with dated entries and the existing waive action.
- Customer copy explains the rule in plain British English on the terms page and in the booking confirmation. There is no extra warning step at the moment of cancelling (owner decision).

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

1. ~~**Existing history at go-live:**~~ **Decided 24 November 2026: everyone starts from zero on the go-live date.** Earlier no-shows and late-cancellation strikes stay visible as history but do not count towards the two. The migration records its go-live time, and the count only includes no-shows after it.
2. ~~**Warning before cancelling on the day:**~~ **Decided 24 November 2026: no warning.** A same-day cancellation goes through like any other and is recorded as a no-show. The rule is stated in the terms and in general booking copy, not in a confirm step.
3. ~~**Policy wording:**~~ **Decided 24 November 2026: the owner wrote the terms text.** Use it word for word on the website terms page:

   > **Cancellations & No-Shows**
   > We know life doesn't always go to plan! If you need to cancel your dog's appointment, we'd really appreciate as much notice as possible.
   >
   > - You can cancel here any time before the day of your appointment.
   > - Cancellations on the day and missed appointments will be recorded.
   > - Repeated no-shows will require a non-refundable deposit to secure future bookings. This will be taken off the cost of the groom.
   >
   > Giving us a little notice means we can offer your appointment to another dog who might be waiting for a pamper.
   > Thank you for your understanding and for supporting our little salon.

   "Taken off the cost of the groom" matches the app: `amountDue = subtotal - depositPaid` (see `PaymentStateSection`). Recommended, not required: a qualified review before release, because the text changes when a deposit applies.

## Implementation notes (24 November 2026)

- Migration `20261124200000_same_day_cancellation_is_no_show.sql`. Classification is **one table-level BEFORE trigger** (`aa_classify_same_day_customer_cancellation`, named to fire before every other BEFORE UPDATE trigger on `bookings`), not a change to each cancel command. So portal, iPhone, WhatsApp and staff paths all inherit it, as the booking gates do. Reschedule releases carry cause `reschedule` and are never reclassified.
- `emit_booking_update_event` emits `cancelled` for a customer no-show. Staff alerts, the timeline and receipt replay keep working. The cancellation notification constraint trigger also fires for a customer no-show. `cancel_booking_impl` replay accepts `No-show`.
- `record_late_customer_cancellation` trigger dropped. The ledger and `staff_customer_cancellation_history` stay as history.
- `smarter_dog_private.no_show_count` counts one per owner and date (staff multi-dog bookings have no `group_id`), from `policy_milestones.same_day_no_show_v1` (the apply time) and within 12 London months. `flag_deposit_after_no_show` fires at 2. New staff read `staff_customer_no_show_history`.
- No no-show waiver: staff put a mistaken no-show back, and it stops counting. The deposit tag is switched off by staff only.
- Client: staff card `NoShowHistoryPanel` (old panel relabelled "old rule"), staff cancel dialog copy, booking confirmation copy, and the website terms in the owner's words.
- Tests: new pgTAP `267`. `235` and `266` were rewritten for the new policy: their old expectations (a strike for a notice-window cancellation, a deposit at the first no-show) describe behaviour the owner retired. They were not loosened. Same-day portal and WhatsApp checks skip after 23:50 London time instead of faking the clock.
- Stale but not run in CI: `scripts/late-cancellation/*` (isolated assertions and concurrency for the old strike trigger) and `scripts/no-show-deposit-backfill.sql` (first-no-show backfill). Retire or rewrite them before relying on them.

## Release evidence

- 24 November 2026, 23:11 GMT: production apply by the owner-approved workflow (run 45507776716). Receipt: applied, ledger verified, postcondition true, SHA-256 matching the committed file. See `docs/migrations.md`.
- 23:14 GMT: #1300 merged (`2d37eff0`), so the staff panel and copy deploy with it.
- Still to verify: the live terms page and staff card after the Vercel deploy, and the first real same-day cancellation (status, message, count).

## Rollout and rollback

Migration first, applied with the approval-gated production workflow after a staging run. Then client copy and staff card changes in a follow-up PR (expand/contract per `docs/migrations.md`). To roll back, apply a forward migration that restores the previous function bodies. Data written as `No-show` under the new rule stays as written, and staff can correct individual rows.

## Acceptance

- pgTAP: on-the-day customer cancel gives `No-show` with cause kept. A day-before cancel gives `Cancelled` with no ledger row. Second no-show in 12 months sets the deposit tag. First does not. Waived no-shows do not count. A group counts once. Replay returns the original receipt.
- The customer receives a cancellation message for a same-day cancel (notification trigger fires once).
- The iPhone Today and website Today show the dog as No-show on the stack.
- `npm run lint`, `check:docs`, `typecheck`, `check:migrations`, `test`, `build` and the database test suite pass.
