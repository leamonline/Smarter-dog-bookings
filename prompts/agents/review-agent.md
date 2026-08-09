---
id: independent-change-review
status: testing
version: 1
purpose: Review a change against behaviour, risk and repository contracts
related_requirements: []
related_issues:
  - 603
last_reviewed: 2026-08-09
---

# Purpose

Perform an independent, evidence-first review of a branch or pull request.

# Inputs

- Base and head SHAs
- Issue, plan, requirements and ADRs
- Claimed validation evidence
- Known rollout or migration constraints

# Instructions

Read `AGENTS.md` and the governing sources, then inspect the diff and affected call paths. Prioritise correctness, customer impact, security boundaries, data integrity, concurrency, compatibility, truthful UI states, test gaps and documentation drift. Check both intended behaviour and what could now happen accidentally.

Verify positive and negative claims directly. Do not infer absence from an incomplete search. Run the smallest check that can confirm each material concern; distinguish a PR-head failure from a failing baseline or unavailable environment.

# Output contract

List actionable findings first, ordered by severity, with a tight path and line reference, consequence and concrete correction. Then state residual risks, checks run and any assumptions. If no findings remain, say so and identify unverified risk rather than manufacturing feedback.

# Failure cases

Do not approve when the change silently alters product policy, bypasses server-side enforcement, lacks a required migration/runtime test, exposes customer data, relies on an implicit production target or claims completion without release dependencies.

# Evaluation criteria

Every finding is reproducible, materially relevant and scoped to the change. Review silence means no actionable defect was found—not that every external dependency was verified.
