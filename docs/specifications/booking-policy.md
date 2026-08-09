# Booking-policy authority and activation boundary

**Status:** Active routing specification
**Authority:** The signed source linked below; this file does not restate it
**Last verified:** 9 August 2026 against `main@8eb8800f`

## Product source of truth

The signed product policy is:

> [Booking, Cancellation, Rescheduling and Deposit Policy — Signed Design,
> 22 July 2026](../archive/superpowers/specs/2026-07-22-booking-cancellation-rescheduling-policy-design.md)

Read that source for deadlines, grandfathering, deposits, incidents,
rescheduling, cancellations, reminders, Terms and channel behaviour. Do not
copy those rules into this routing document: two maintained copies would turn
policy review into a diff exercise and create ambiguity about which wording is
authoritative.

Its location under `archive/` records the history of the implementation
programme. The document's own signed status makes it the product authority;
being archived does not supersede it.

## Current implementation layers

### 1. Legacy live authority

At the baseline, ordinary staff mutations still create, update or delete
`bookings` rows. Existing customer and channel paths continue to apply their
legacy behaviour. This is current implementation fact, not the desired final
architecture.

### 2. Dark visit substrate

The repository contains `booking_visits`, membership, lineage, policy/deposit/
incident records, projections, reconciliation functions and typed visit
commands. Compatibility triggers attach live legacy rows to `legacy_compat`
visits. Read-only projections may be used while policy mutations remain dark.

This substrate is real and populated; it is not proof that visit commands are
the current live write authority.

### 3. Separate customer-policy activation

The policy runtime is controlled by the signed policy's deliberate effective
instant. Deploying schema, dual-write, projections, a runtime capability or a
legacy-compatible visit command must not set or infer that instant.

Appointment authority can migrate to a visit command while preserving legacy
customer-policy semantics. That separation is the accepted decision in
[ADR 002](../architecture/decisions/002-separate-visit-authority-from-policy-activation.md).

## Activation protocol

The repository guard `bookingPolicyInactiveIsolation.test.ts` records the
review protocol:

1. V1-only mutation commands have no production caller while the policy is
   inactive.
2. Read-only visit projections and runtime-status reads are permitted.
3. When a mutation is deliberately made live, remove that specific command
   from `V1_ONLY_COMMANDS` **in the same commit that adds its caller**.
4. Do not delete the guard or empty the whole list; reviewers must be able to
   see which commands remain dark.
5. A legacy-compatible caller migration must use the currently applicable
   legacy semantics. It must not masquerade as v1 activation.
6. The policy's effective instant is set only through its separately approved,
   target-verified activation/release procedure after all named prerequisites
   are evidenced.

## Visit and booking-line boundary

The signed source defines the product identity of an appointment. For current
architecture work:

- **appointment** is the user-facing whole visit;
- **visit** is the technical aggregate for one appointment; and
- **booking line** is one dog/service operational row within that visit.

Whole-appointment cancellation, rescheduling, confirmation and notification
identity belong to the visit. Per-dog grooming progress may remain on booking
lines. Ambiguous legacy grouping must fail closed with
`visit_review_required`; it cannot be resolved through first-match or raw-row
fallback. See [ADR 005](../architecture/decisions/005-fail-closed-on-ambiguous-legacy-visit-grouping.md).

## Precedence and change control

When sources disagree:

1. The signed 22 July source governs intended product policy.
2. Executable code and the latest migrations describe current behaviour.
3. An accepted ADR governs architecture boundaries and future implementation.
4. A plan or issue governs sequencing, not policy wording.
5. Archived plans are historical evidence only unless a current source adopts
   their contract explicitly.

If current behaviour differs from the signed policy, record the discrepancy
and activation state. Do not silently rewrite either source to make them look
aligned.

Any policy change requires a new signed source or explicit superseding record.
Any implementation-only change must preserve the signed source and update the
relevant architecture/specification evidence.

## Related records

- [Current architecture](../architecture/overview.md)
- [Issue #603 plan-versus-reality audit](../research/2026-08-09-issue-603-plan-reality-audit.md)
- [Notification-delivery contract](notification-delivery.md)
- [Booking-policy foundation rollout](../superpowers/runbooks/2026-07-22-booking-policy-foundation-rollout.md)
- [Booking-policy reconciliation runbook](../superpowers/runbooks/2026-07-22-booking-policy-backfill-reconciliation.md)
