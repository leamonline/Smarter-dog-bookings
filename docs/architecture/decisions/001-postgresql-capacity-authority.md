# ADR 001: PostgreSQL is the final capacity authority

**Status:** Accepted — established
**Date:** 9 August 2026
**Related issues/PRs:** Issues #603 and #608; no implementation PR recorded
**Applies to:** Every staff, customer, WhatsApp and future booking write path

## Context

Capacity is currently evaluated in the React/browser engine, Deno helpers and
PostgreSQL. The earlier layers make the interface responsive and avoid
proposing obviously invalid slots, but they cannot lock against another
concurrent booking. Mirrored constants and independently evolved algorithms
can also disagree.

This is not a greenfield decision. The current database already applies a
`BEFORE INSERT`/update capacity gate and is the hard guard described by the
[capacity reference](../../capacity-engine.md). Browser/Deno parity coverage
exists, although cross-runtime reason convergence and complete SQL race
evidence remain incomplete.

## Options considered

1. Keep PostgreSQL as final authority and make other runtimes advisory.
2. Make a shared TypeScript/Deno engine authoritative and trust clients to
   submit valid writes.
3. Retain three independent authorities and rely only on parity tests.

## Decision

PostgreSQL is the canonical authority for whether a booking mutation may
commit and why it was rejected.

- Every booking channel must reach a PostgreSQL command or write protected by
  the authoritative evaluator and final concurrency guard.
- Browser and Edge/Deno calculations may render, quote or preflight. They must
  not redefine business policy or turn a preflight result into proof that a
  later write will succeed.
- The authoritative contract must cover grouped allocation, total/day limits,
  approved large-dog behaviour, blocked seats, extra/immediate slots, closures
  and staff override semantics without changing the approved business rules.
- Structured rejection reasons should originate from the server contract.
  Where a pure mirror remains necessary, generation/parity tests must detect
  drift.
- A stale race is expected: a quote may be valid and the final transaction may
  still reject after another transaction wins capacity.

## Rationale

Only the committing database transaction can apply one rule while observing
and locking the state competing writes will change. Client/shared engines can
improve feedback, but they cannot close the stale-write window. Option 1 also
preserves the established hard guard instead of moving live safety outward.

## Consequences

- Every channel receives consistent final semantics and PostgreSQL remains the
  last defence against concurrent overbooking.
- Frontend feedback can remain fast, but consumers must handle a server
  rejection after a successful local preflight.
- The current three-copy implementation is technical debt to converge, not a
  reason to move authority into a shared TypeScript package.
- Capacity work needs pgTAP and genuine multi-session race tests in addition to
  browser/Deno fixtures.
- A customer-safe availability projection must expose only the minimum slot
  and reason data, never operational/customer records.

## Revisit when

Revisit only if PostgreSQL stops being the booking commit boundary, or a new
transactional scheduler can prove equivalent authoritative locking,
permissions and failure semantics. A desire to share code alone is not enough.

## Evidence and implementation state

- **Explicit repository fact:** `validate_booking_capacity()` and later
  migrations protect booking writes in PostgreSQL.
- **Explicit repository fact:** TypeScript and Deno engines still exist and a
  parity suite covers their current shared cases.
- **Accepted future work:** one versioned server reason contract and complete
  quote/write parity are proposed under issue #608; they are not claimed as
  implemented here.

Related: [architecture overview](../overview.md),
[plan-versus-reality audit](../../research/2026-08-09-issue-603-plan-reality-audit.md).
