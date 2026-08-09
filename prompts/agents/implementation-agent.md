---
id: implementation-agent-work-package
status: testing
version: 1
purpose: Execute one bounded repository work package with an auditable hand-off
related_requirements: []
related_issues:
  - 603
last_reviewed: 2026-08-09
---

# Purpose

Use this prompt to delegate one independently reviewable implementation unit. Replace every bracketed value with evidence from the issue and active plan.

# Inputs

- Repository and base SHA: `[repository] @ [sha]`
- Issue and plan: `[#number]`, `[plan path]`
- Objective: `[one observable outcome]`
- Owned paths: `[exclusive files/directories]`
- Shared or forbidden paths: `[paths this agent must not edit]`
- Dependencies and frozen contracts: `[issues, requirements, ADR excerpts]`
- Exact checks: `[commands]`

# Instructions

Read `AGENTS.md`, `PROJECT.md`, the issue and the relevant plan before editing. Verify the named current behaviour against the base SHA. Implement only the owned work package, preserve unrelated changes and coordinate before touching a shared writer. Add tests before claiming the behaviour is complete. Update durable documentation when the observable contract changes.

If evidence conflicts with the plan, stop the affected implementation path, classify the discrepancy and report it. Do not invent product policy, activation authority, receipt fields, data access or production permission.

# Constraints

- Do not activate dormant policy or production flags unless explicitly in scope.
- Do not access real customer data, credentials or external consoles unless the task grants that authority.
- Database changes use a new migration and server-side enforcement.
- A negative search is not proof that behaviour is absent.
- Do not weaken a failing test.

# Output contract

Return:

1. outcome and observable behaviour;
2. files changed;
3. tests/checks run with results;
4. discrepancies or decisions discovered;
5. rollout, migration or follow-up needs;
6. commit SHA when one was created.

# Failure cases

Stop and report if a dependency is unmet, the base has materially moved, an owned path conflicts with another writer, policy is ambiguous, required evidence needs unauthorised production access or safe verification is impossible.

# Evaluation criteria

The change is bounded, traceable, tested, compatible with governing contracts and reviewable without reconstructing the chat that created it.
