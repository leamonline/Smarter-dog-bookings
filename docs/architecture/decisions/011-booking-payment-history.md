# ADR 011: Database-owned booking payment history

Status: Accepted and implemented — production retention/disposal decision outstanding
Date: 2026-09-27
Issue: [#879](https://github.com/leamonline/Smarter-dog-bookings/issues/879)

## Context

Booking payment fields are overwritten in place. Reports read those fields;
changing reports to a visit ledger would change their authority and semantics.
A client-maintained log would rely on every writer remembering to record it.

## Decision

Use an AFTER INSERT/UPDATE/DELETE trigger to append the before/after payment
state in the same transaction as the booking write. Read access is staff-only;
application roles have no write access to the history table. Preserve amounts
as PostgreSQL numeric values and preserve nulls. Store only payment status,
amount, method, payment time, deposit amount and deposit received time, plus
booking and actor UUIDs, operation, timestamp and recovery provenance.

Use AFTER rather than BEFORE because existing BEFORE triggers stamp and clear
payment/deposit fields. Updates are compared after those triggers. Status-only
and no-op changes do not produce payment events unless a payment field changes.
Inserts and deletes record boundary snapshots. Failed writes leave no event.

An authenticated staff command restores the before-state of an update. It locks
the booking, verifies the caller's expected latest event, and rejects stale
state. A reason and source-event link identify the resulting correction event.
Existing booking rules still apply; inability to restore exactly rolls back.

## Consequences

- Booking rows remain authoritative for reports. History is not evidence of
  physical payment, a refund system, or a second financial ledger.
- History starts at installation. On the first subsequent edit, OLD supplies
  the existing state; missing historical values cannot be invented.
- No blanket ban on zero amounts is added: validity policy is a separate
  decision and such a ban does not prevent plausible-but-wrong amounts.
- No booking/actor cascade can erase evidence. Privileged administrators can
  still bypass database controls; this is not an external tamper-proof archive.
- Audit failures fail the booking write atomically. Rollout must validate grants,
  latency and triggers. Recovery is not available before schema installation.
- No automatic deletion schedule or historical backfill is introduced.
  Retention and authorised disposal remain a separate owner-policy decision;
  records are preserved until that decision is made.

## Alternatives

Adopting the existing visit ledger changes authority and reporting, so is out of
scope. Extending lifecycle events mixes two contracts and access/retention
needs. Client-only logging misses alternate writers. Constraints alone cannot
recover a previous value.

See the [implementation plan](../../plans/active/2026-09-27-payment-history.md)
and [operator runbook](../../payment-history.md).
