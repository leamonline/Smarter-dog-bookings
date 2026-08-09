# ADR 005: Fail closed on ambiguous legacy visit grouping

**Status:** Accepted plan decision; implementation pending
**Date:** 9 August 2026
**Related issues/PRs:** Issues #603, #604 and #609; no implementation PR recorded
**Applies to:** Any legacy-compatible command that must resolve booking rows to one visit

## Context

Legacy booking rows were not all created with visit-level intent. Date,
customer, `group_id`, current membership and per-dog rows can provide evidence,
but a heuristic match is not proof that two active records are one appointment.
A preceding planning audit reported three future candidate pairs (six active
visits) in an aggregate-only 9 August snapshot. The target, query and execution
record were not retained, so the count is unverified prior context and does not
authorise merging anything.

Silently choosing one candidate would risk moving or notifying the wrong
appointment. Falling back to the current raw `bookings` update would hide the
same ambiguity while bypassing visit-level atomicity and notification fan-in.

## Options considered

1. Select the first matching visit or booking row.
2. Infer identity from `group_id`, owner/date proximity or another heuristic,
   then repair mistakes later.
3. Fall back to the current raw booking-row update.
4. Return typed `visit_review_required` and perform no mutation or send.

## Decision

Ambiguous legacy visit resolution fails closed.

- The command returns the typed discriminator `visit_review_required`.
- No booking row, visit, lineage or audit state is mutated.
- No notification intent is created and no provider is called.
- The UI presents a review/manual-contact action.
- The UI and command do not fall back to `useBookings.updateBooking`, a single
  booking-row mutation, `group_id` guessing or first-match selection.
- A later repair/reconciliation is a separately authorised, audited operation;
  retrying the original command before resolution must return the same
  non-mutating outcome.

The discriminator is the frozen semantic contract. The enclosing receipt may
extend the existing visit receipt when implemented, but it must not translate
`visit_review_required` into a generic transport error or apparent success.

## Rationale

The potential harm of moving/notifying the wrong appointment outweighs the
cost of manual review. Option 4 keeps uncertainty visible and prevents a
fallback from bypassing the exact visit-level safety the migration is meant to
provide. This is an explicit plan decision; it is not inferred from the three
aggregate candidate pairs.

## Consequences

- Some legitimate operations require human review instead of immediate
  automation.
- Ordinary unambiguous visits can proceed without being blocked by unrelated
  review records.
- Review volume becomes an observable cutover measure rather than hidden data
  corruption.
- Tests must prove the absence of mutation and notification, not merely the
  returned error text.
- Production reconciliation remains aggregate/read-only unless separate
  authority permits inspecting and repairing identifiable records.

## Revisit when

Revisit after every legacy record has a proven unambiguous identity and a
direct-write barrier prevents new ambiguity, or if a formally approved
resolver can prove deterministic equivalence without customer-data heuristics.

## Evidence and implementation state

- **Unverified prior observation:** a preceding audit reported three candidate
  pairs/six active visits. The count and their semantic relationship must be
  re-established before use as evidence.
- **Accepted plan decision:** `visit_review_required`, no mutation and no
  fallback govern the planned command.
- **Implementation gap:** that typed command result and UI path are not present
  at the repository baseline.

Related: [dated audit](../../research/2026-08-09-issue-603-plan-reality-audit.md),
[reschedule go/no-go record](../../research/2026-08-09-reschedule-automation-go-no-go.md).
