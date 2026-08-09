# ADR 002: Separate visit authority from customer-policy activation

**Status:** Accepted
**Date:** 9 August 2026
**Related issues/PRs:** Issues #603 and #609; no implementation PR recorded
**Applies to:** Booking/visit cutover, customer policy and every new visit-command caller

## Context

The database contains a substantial visit aggregate and policy substrate while
live staff operations still use legacy booking-row semantics. The signed
customer policy has a separate effective instant and explicitly says that
deploying its schema does not activate it.

Conflating the two changes creates an unsafe false choice: either retain direct
booking-row authority until the new customer policy launches, or switch both
appointment identity and customer behaviour at once. Neither coupling is
necessary.

The repository also already has two contracts that must be evolved rather than
replaced:

- `CustomerVisitSuccessReceipt` and its decoder; and
- `bookingPolicyInactiveIsolation.test.ts`, whose `V1_ONLY_COMMANDS` list
  prevents inactive-policy mutations from gaining production callers.

## Options considered

1. Couple visit-authority cutover to the instant the new customer policy
   activates.
2. Keep booking-row authority until every policy feature is ready.
3. Migrate selected operations to legacy-compatible visit authority while
   retaining a separate policy-activation gate.

## Decision

Appointment/visit authority and `previous_day_1500_v1` activation are separate
decisions and separate release gates.

- A legacy-compatible visit command may become authoritative for a live staff
  operation while preserving the currently applicable legacy policy and
  customer-visible behaviour.
- Moving a caller to visit identity must not set, schedule or infer the
  customer-policy effective instant.
- Existing typed visit receipts are extended or versioned only with fields a
  real consumer needs. A parallel speculative receipt must not be introduced.
- A v1-only mutation leaves `V1_ONLY_COMMANDS` **in the same commit that adds
  its production caller**. Read-only projections and runtime-status reads do
  not need removal because the guard deliberately excludes them.
- The guard file is not deleted or emptied wholesale. Review must continue to
  show which mutation commands are live and which remain dark.
- Customer-policy activation follows the separately approved protocol in the
  [booking-policy specification](../../specifications/booking-policy.md).

`visit authority` is a programme concept here, not the name of a currently
implemented database flag. A runtime capability may later express it, but this
ADR does not invent that schema.

## Rationale

Option 3 reduces identity and atomicity risk without bundling a customer
behaviour change. It also preserves the signed policy's explicit activation
boundary and reuses the repository's existing receipt and caller guard.

## Consequences

- The system can reduce booking-row authority incrementally without changing
  deadlines, deposits, Terms or customer self-service rules.
- Each caller migration must prove semantic compatibility with the current
  policy generation and must retain a rollback seam.
- The visit aggregate can be used for atomic multi-dog identity and
  notification fan-in before full customer-policy activation.
- An implementation that wires a dark v1 command while the policy is inactive
  is a regression, even if the command itself is well tested.
- Full direct-write retirement remains a later, separately observed cutover.

## Revisit when

Revisit after every live write caller uses visit authority and the legacy
compatibility generation is ready for retirement, or if the signed policy is
superseded by a source that explicitly couples activation and authority.

## Evidence and implementation state

- **Explicit repository fact:** legacy booking writes dual-write
  `legacy_compat` visits.
- **Explicit repository fact:** the visit receipt and CI isolation protocol
  already exist.
- **Explicit repository fact:** live staff update/delete hooks still mutate
  `bookings` rows.
- **Accepted programme decision:** a separately named legacy-compatible
  reschedule command may precede policy activation; it is not implemented at
  this baseline.

Related: [ADR 005](005-fail-closed-on-ambiguous-legacy-visit-grouping.md),
[dated audit](../../research/2026-08-09-issue-603-plan-reality-audit.md).
