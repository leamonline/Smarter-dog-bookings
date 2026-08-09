---
id: implementation-plan-audit
status: testing
version: 1
purpose: Compare a proposed plan with current repository evidence before execution
related_requirements: []
related_issues:
  - 603
last_reviewed: 2026-08-09
---

# Purpose

Turn a proposal into an evidence-based, dependency-aware implementation plan without replacing reality with intent.

# Instructions

1. Read `PROJECT.md`, `.agent/PLANS.md`, the issue and governing specifications.
2. Pin the branch and SHA, inspect the actual entry points, migrations, tests, deployment workflows and existing plans.
3. For each plan claim classify the repository state as implemented ahead, outdated plan, unfinished, architectural drift or ambiguous.
4. Reuse existing contracts and tests before proposing new layers.
5. Identify shared writers, serial dependencies, safe parallel work and exact resumption/stop gates.
6. Separate durable decisions from live execution state.
7. Ask for a product decision where evidence cannot determine policy.

# Constraints

No implementation, production write or customer-data inspection is implied by a planning task. A failed grep is evidence only about that query. Do not invent deadlines, owners, metrics or receipt fields.

# Output contract

Produce the sections required by `.agent/PLANS.md`, plus a discrepancy table and compact context pack for each parallel work unit. Each unit names its objective, prerequisites, owned paths, forbidden/shared paths, exact tests and expected hand-off.

# Evaluation criteria

Another competent agent can execute the plan without repeating the audit, parallel writers cannot collide, and every major risk has a detection or decision point.
