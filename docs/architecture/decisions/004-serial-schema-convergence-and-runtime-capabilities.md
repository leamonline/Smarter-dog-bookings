# ADR 004: Serialise schema convergence and add named runtime capabilities

**Status:** Accepted programme ordering; capability implementation proposed
**Date:** 9 August 2026
**Related issues/PRs:** Issues #603, #607, #608, #609 and #610; no implementation PR recorded
**Applies to:** Issues #607, #608, #609 and #610 and their application consumers

## Context

Runtime schema capability, notification intent, capacity authority and visit
cutover all touch migrations, generated types, RPC wrappers and shared booking
surfaces. Landing those writers in parallel would make migration order and
generated contracts depend on whichever branch merges last.

Frontend and Edge code deploy automatically after merge, while PostgreSQL is
applied manually. Existing workflows report newly unapplied migrations and
historical drift, but runtime consumers have no generic named capability
contract. A successful deployment can therefore still connect to an
incompatible schema.

## Options considered

1. Let independent issue branches add migrations/types/RPCs in parallel and
   reconcile conflicts at merge time.
2. Land one large convergence migration and switch every consumer together.
3. Serialise the shared migration spine while parallelising genuinely
   independent evidence/safety work; add only the named runtime capabilities
   required by real consumers.

## Decision

Migration-bearing convergence work is serial.

1. Land the minimal runtime compatibility seam for #607.
2. Land the reschedule notification intent/attempt schema for #610.
3. Land the authoritative capacity evaluator/reason contract for #608.
4. Land the narrow legacy-compatible reschedule/visit slice for #604/#609.

After each migration-bearing change: merge, rebase the next package, regenerate
database types, run the applicable full checks and hand off the new base SHA.
Only one active writer owns migration ordering, generated database types, the
shared RPC surface and each new schema contract.

Runtime compatibility uses named behavioural capabilities rather than failed
queries or migration filenames. At minimum it must distinguish:

- **supported:** this deployed schema/code generation knows the capability;
- **enabled:** the capability's prerequisites and deliberate release decision
  make it usable in this environment.

A consumer requiring a missing or disabled capability fails closed with an
actionable operational state. It must not silently fall back where the fallback
would change identity, policy or notification semantics.

The capability implementation remains deliberately small. This decision does
not require a generic deployment platform or an append-only release ledger
before the first high-risk slice.

## Rationale

Option 3 keeps each generated contract based on the immediately preceding
schema, preserves reviewable rollback seams and catches deployment mismatch
without a big-bang cutover. The specific order is an explicit programme
decision, not an inference from migration filenames.

## Consequences

- Independent analysis and non-overlapping safety work may proceed in
  parallel, but shared schema/type/RPC writers may not.
- Every package works from a freshly integrated schema contract rather than
  merging generated files mechanically.
- Old-schema/new-code mismatches become explicit feature states rather than
  first-customer failures.
- `supported` cannot be used as a synonym for `enabled in production`.
- Manual migration gates remain necessary; runtime capabilities complement
  rather than replace them.
- The sequence may be changed only by a new recorded decision that re-evaluates
  dependency and rollback risk.

## Revisit when

Revisit the order when a dependency is removed or new evidence makes it unsafe;
record that change before parallel schema work begins. Revisit the capability
shape after the first consumer proves it too small or unnecessarily broad.

## Evidence and implementation state

- **Explicit repository fact:** policy-specific runtime status exists, while a
  generic schema/application capability response does not.
- **Explicit repository fact:** frontend/Edge deployment and database rollout
  are separate.
- **Accepted programme decision:** the serial order above governs Tranche B.
- **Proposed implementation:** exact capability names and response shape are
  intentionally deferred to #607's smallest real consumer contract.

Related: [ADR 006](006-manual-target-verified-database-rollout.md),
[active architecture overview](../overview.md).
