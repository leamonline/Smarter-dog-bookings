# Architecture decision records

**Status:** Active
**Authority:** Index of accepted and proposed architecture decisions
**Last verified:** 22 August 2026

An architecture decision record (ADR) states a durable choice, the evidence
available when it was made and its consequences. `Accepted` means future work
must respect the decision; it does not by itself mean implementation is
complete.

| ADR | Decision | Status |
|---|---|---|
| [001](001-postgresql-capacity-authority.md) | PostgreSQL is the final capacity authority | Accepted — established |
| [002](002-separate-visit-authority-from-policy-activation.md) | Visit authority is separate from customer-policy activation | Accepted |
| [003](003-separate-operation-success-from-notification-delivery.md) | Operation success and notification delivery have separate outcomes | Accepted intent; implementation proposed |
| [004](004-serial-schema-convergence-and-runtime-capabilities.md) | Schema convergence is serial and consumers use named runtime capabilities | Ordering accepted; capability implementation proposed |
| [005](005-fail-closed-on-ambiguous-legacy-visit-grouping.md) | Ambiguous legacy visit grouping fails closed | Accepted plan decision |
| [006](006-manual-target-verified-database-rollout.md) | Production database rollout remains manual and target verified | Accepted — current release model |
| [007](007-customer-capacity-read-disclosure.md) | Customer capacity-read RPCs disclose occupancy shape only, range reads capped at 92 days | Accepted — gap found and fixed |
| [008](008-customer-facing-refusal-wording.md) | A refused customer is told what to do next, never the rule, the clock or the capacity number | Accepted — wording rule decided and enforced |

| [009](009-independent-applications-in-one-repository.md) | Website and bookings retain independent builds and deployments in one repository | Accepted |

| [010](010-holiday-notices-operational-closures.md) | Scheduled holiday notices assert operational diary closures | Accepted |

The [architecture overview](../overview.md) explains how these decisions fit
together. Implementation status and issue differences are recorded separately
in the [dated audit](../../research/2026-08-09-issue-603-plan-reality-audit.md).
