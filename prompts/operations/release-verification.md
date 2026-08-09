---
id: release-verification
status: testing
version: 1
purpose: Verify a candidate release without confusing code, deployment and activation
related_requirements: []
related_issues:
  - 603
last_reviewed: 2026-08-09
---

# Purpose

Create an auditable release decision for a specific commit and target.

# Inputs

- Candidate SHA and pull request
- Exact environment/project target
- Migrations and Edge Functions changed
- Required checks and smoke journeys
- Feature flags, external prerequisites and rollback route

# Instructions

Prove the candidate SHA, target and permissions before action. Distinguish implemented, merged, deployed, configured and production-enabled. Run read-only checks first. Apply only explicitly authorised changes, one environment and migration at a time, with an explicit project target. Re-check the SHA before any write-capable merge or deploy job. Verify the real operational journey and negative controls after deployment.

If delivery, migration history, external configuration or live behaviour is ambiguous, fail closed and record the reconciliation step. Never treat a green PR-head check as proof that production schema or configuration is compatible.

# Output contract

Record candidate SHA, target, authorised actions, checks with timestamps, migrations/deployments actually performed, capability flags, smoke evidence, negative controls, rollback readiness, decision and remaining gaps. Exclude secrets and identifiable customer data.

# Evaluation criteria

The record lets an independent reviewer distinguish code readiness from live activation and reproduce the release decision safely.
