# Live staff reschedule customer notification — scope decision

> **Historical decision note (9 August 2026):** issue #604 reopens this gap under the issue #603 evidence gate. This file records why notification work was deferred at the time; it does not authorise implementation or override the [current programme plan](../../plans/active/2026-08-09-issue-603-architecture-convergence.md).

**Status:** decided, deferred. No code in this document; nothing to implement yet.
**Scope:** item 3 of the four follow-ups recorded in PR #589.

## The gap

Every staff reschedule path that ships today moves the booking row **in place**:

| Path | Mechanism |
|---|---|
| `RescheduleModal` (staff) | in-place `UPDATE` |
| Drag-and-drop calendar move | in-place `UPDATE` |
| `useBookings.updateBooking` (shared sink both call through) | `.update().eq("id", …)` |
| `decide_customer_override_reschedule_request` (staff approving a customer's request) | in-place `UPDATE` |

None of these transition `status` into `'Cancelled'`, so `notify_booking_cancelled_trigger`'s `WHEN` clause never fires. None inserts a new row, so `trg_notify_booking_insert` never fires either. **No trigger fires at all**, and there is no `notify-booking-rescheduled` function. The only signal anywhere is the staff-only push notification (`_shared/staffPush.ts:134-135`, *"Booking moved"*).

Net effect: a groomer moves a customer's appointment, and the customer finds out when they turn up on the wrong day. This is real and live — unlike items 2 and 4, which sit behind the still-inactive Path B booking policy and cannot affect a customer yet.

## Decision

**Do not design or build a customer-facing message for this yet.** Scope stays at: confirm the gap exists (done, above), record it, stop. The existing staff-side "Booking moved" push notification is the acknowledged interim signal — imperfect (it tells staff, not the customer), but it is what exists.

## For whenever this is revisited

Two sub-decisions were made in case the scope answer above changes later — most likely once Path B's staff-request-and-acknowledgement machinery (Task 9 of the Path B execution plan) is live, since that already builds the "detect intent → notify" pattern this would need:

1. **Channel: a new approved WhatsApp template**, not free-form + fallback. A staff drag-and-drop can happen at any time, and Meta requires an approved template for a business-initiated send outside the customer's 24h reply window — which a staff-initiated move very often will be. Free-form would silently fail to deliver in exactly that case. Precedent: `booking_confirmed_v1`, the template `notify-booking-confirmed` already uses (`notify-booking-confirmed/index.ts:207`). **Template submission has real lead time (days) independent of code** — if this gets picked back up, start the Meta submission as soon as wording is agreed, not after the code is written.
2. **Sequencing: design after, build after item 4.** A multi-dog reschedule needs one message per *visit*, not one per dog — the same class of defect #584/#589 just fixed for reschedule cancellations. Item 4 (visit-level fan-in, `group_id` propagation) is the dependency; building a per-dog version now to ship sooner would knowingly reintroduce that defect on the assumption item 4 later removes it.

## What actually happens next

Per the follow-up ordering, item 4 (visit-level notification fan-in) is next after this. This document is the record that live-staff-reschedule messaging was considered, scoped down deliberately, and left an explicit trail for later — not silently dropped.
