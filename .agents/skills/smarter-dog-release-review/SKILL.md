---
name: smarter-dog-release-review
description: Assess Smarter Dog PR or release readiness read-only, including exact-head GitHub checks, migration evidence, target, compatibility, and rollout. Do not use to merge pull requests, apply migrations, deploy functions, or implement booking or UI changes.
---

# Release readiness

1. Read the issue and applicable plan. Resolve the repository, PR, base and full head SHA. Use the [current branch rules and merge procedure](../../../docs/project-management.md#branch-controls-and-merge-gate) to find required checks and publishers. Include the applicable database, customer journey, website, Edge and iPhone checks.
2. Read the latest result per expected publisher for that head. Distinguish failed, pending, skipped and absent evidence. If the head moves, report the new SHA and invalidate the old candidate decision. Re-run the read-only assessment on the new head when it is within scope.
3. Trace changed migrations, Edge Functions, web targets and feature flags. Follow the [migration runbook](../../../docs/migrations.md), [hosted target guard](../../../docs/hosted-supabase-target-guard.md) and [rollback runbook](../../../docs/rollback.md) as applicable. Use dated, authorised evidence for the exact target. With an unknown target or missing authority, stop hosted inspection (and do not use hosted MCP or CLI probes) and state what would establish readiness. Separate implemented, merged, deployed and enabled.
4. Return the candidate SHA, target or verification gap, check and receipt links, rollout dependencies, rollback route, and a ready or blocked decision with its reason. Use the [release-verification prompt](../../../prompts/operations/release-verification.md) for the evidence fields. This skill is read-only. Merge, migration, deployment, activation and provider changes require separate authority.
