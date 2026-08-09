# ADR 003: Separate operation success from notification delivery

**Status:** Accepted intent; proposed implementation
**Date:** 9 August 2026
**Related issues/PRs:** Issues #603, #604 and #610; no implementation PR recorded
**Applies to:** Visit operations and all customer-facing notification channels

## Context

A database transaction and a provider request cross different reliability
boundaries. The appointment may move successfully while Meta, Twilio or
SendGrid rejects, times out or ambiguously accepts the message. Conversely,
retrying the appointment mutation merely to resend a message risks changing
the booking twice.

The current system has booking-oriented notification rows, per-row triggers,
partial idempotency and `pending`/`sent`/`failed` states. A stale-pending reaper
cannot know whether a process died before the provider call or after the
provider accepted it. It therefore cannot safely represent exactly-once
delivery.

## Options considered

1. Treat the booking mutation and provider call as one apparent success/failure.
2. Roll back or repeat the appointment operation when delivery fails.
3. Commit operation plus durable intent atomically, then process append-only
   provider attempts with a separate delivery outcome.

## Decision

The appointment operation and customer notification have related but separate
outcomes.

- The command transaction commits the operation and its durable logical
  notification intent atomically. Failure to persist the required intent is a
  command failure; provider delivery is not part of that transaction.
- One logical visit outcome produces at most one intent per recipient and
  payload version, regardless of dog/booking-line count or command replay.
- Provider work is represented by append-only attempts. The projected intent
  state must not overwrite the attempt history.
- A conclusively unsent retryable attempt may be retried without reapplying the
  appointment mutation.
- If a worker crosses the provider-send boundary and cannot determine whether
  the provider accepted the request, the attempt and intent become
  `delivery_unknown`.
- `delivery_unknown` is not automatically retryable. Staff must reconcile
  provider evidence, then make an audited decision to mark it delivered or to
  authorise a new attempt.
- Database uniqueness is not proof of provider idempotency. A provider key may
  support safe retry only when that provider contract is documented and
  tested.
- UI and receipts must state operation and delivery outcomes separately; they
  must never turn `appointment moved` into `customer informed`.

The detailed target state model is in the
[notification-delivery specification](../../specifications/notification-delivery.md).

## Rationale

The database cannot atomically commit with an external messaging provider.
Option 3 makes that boundary explicit, retains the committed customer
appointment truth and gives retries an idempotent unit that is not the domain
mutation.

## Consequences

- Provider failure does not roll back an already committed appointment.
- Staff gain explicit pending, sent, failed and ambiguous work instead of a
  false all-or-nothing success state.
- Retry operates on delivery attempts, never by repeating the domain command.
- Multi-dog visits fan in to one appointment communication rather than one
  message per booking row.
- An operations surface and provider correlation evidence are required before
  `delivery_unknown` can be enabled safely.
- Exact channel fallback remains an explicit product/operational decision; it
  cannot be inferred by a worker.

## Revisit when

Revisit if every selected provider offers a documented, tested transactional
or exactly-once contract spanning the domain commit, or if notifications stop
being required outcomes of these operations. Provider marketing claims alone
are insufficient.

## Evidence and implementation state

- **Explicit repository fact:** current `notification_log` and notification
  functions do not implement visit-level intents, append-only attempts or
  `delivery_unknown`.
- **Explicit observed gap:** staff in-place rescheduling currently emits no
  customer reschedule notification.
- **Accepted intent:** the outcome separation and no-blind-retry rule govern
  new work.
- **Proposed implementation:** the first slice is a reschedule-only visit
  intent/attempt path, not a big-bang notification migration.

Related: [reschedule go/no-go research](../../research/2026-08-09-reschedule-automation-go-no-go.md).
