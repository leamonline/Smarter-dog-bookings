# ADR 015: A customer's same-day cancellation is a no-show; two in 12 months requires a deposit

Status: Accepted by the owner on 24 November 2026. Implemented on a branch (migration `20261124200000`), which has not been applied to production.
Date: 2026-11-24
Supersedes: the counting and classification parts of [ADR 013](013-allow-late-cancellations-with-customer-history.md). ADR 013's permission to cancel late still stands.
Plan: [Same-day cancellation is a no-show](../../plans/active/2026-11-24-same-day-no-show-policy.md)

## Context

ADR 013 lets customers cancel inside the notice window (24 hours by default). It records each such cancellation as a late-cancellation strike, and staff review deposits at three unwaived strikes in 12 months. Separately, migration `20261122160000` turns `humans.deposit_required` on the first time staff mark a booking No-show.

On 24 November 2026 the owner replaced both rules with one:

- A late cancellation is now called a **no-show**.
- It is recorded **only on the appointment day** (Europe/London date). A customer cancelling before the day is a plain cancellation with no penalty.
- Staff can still mark a no-show by hand. Both kinds count.
- **Two no-shows within 12 months** means the customer must pay a deposit for future bookings.

The owner chose to put the rule in the database rather than on screens only. That way the iPhone app, website, reports and customer history give one answer.

## Decision

1. Customers still have permission to cancel up to the start of the appointment (ADR 013 unchanged).
2. Classification moves into the database. When a customer-caused cancellation of a Booked or Reconfirmed appointment is committed on the appointment's own London date, the rows are saved with status `No-show`. The cancellation cause `customer` and the customer's reason are kept. A cancellation on an earlier date stays `Cancelled`. The 24-hour notice window no longer decides anything about penalties. It still governs online rescheduling.
3. A no-show still frees its seat, exactly as now (`TERMINAL_STATUSES`). A customer who cancels on the day still gets a cancellation confirmation, and the waitlist and staff alerts still treat the freed seat as freed.
4. One appointment counts once: a group of dogs on one date is one no-show. Retries and races do not add a second.
5. The deposit response becomes automatic at **two** no-show appointments in the preceding 12 calendar months, counting both customer same-day cancellations and staff-recorded no-shows. It replaces the first-no-show trigger. Only staff can turn the tag off, as now. A mistaken no-show is corrected by putting the booking back (it then stops counting); there is no separate no-show waiver.
6. Everyone starts from zero: only no-shows dated on or after the go-live date count (owner decision). The `late_cancellation_history` ledger stays readable, waivable and transferable as history, but writes no new rows and no longer counts towards anything.
7. No warning step when a customer cancels on the day (owner decision). The rule is stated on the terms page in the owner's own words and in booking copy.

## Consequences

- Customer-facing policy text has to change: the terms page, the booking confirmation and the cancel flow. It should be checked by someone qualified before release, because it changes when a deposit becomes payable.
- The cancel commands, their idempotent receipts, the cancellation notification trigger, the provenance trigger, the strike ledger and the deposit trigger all change together in one append-only migration. It must be applied to production before any dependent client code merges ([ADR 006](006-manual-target-verified-database-rollout.md)).
- The staff customer card shows the no-show count and the threshold of two. Reports count same-day customer cancellations as no-shows from go-live. Earlier rows are not rewritten.
