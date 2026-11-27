# Codex project initialisation

- Status: Completed
- Issue: [#1314](https://github.com/leamonline/Smarter-dog-bookings/issues/1314)
- Base: `main@4f32ac83d956381e6609fe0026173646570fc191`
- Last verified: 27 November 2026
- Owners: Repository documentation and agent workflows
- Dependencies: None
- Related requirements: None
Related ADRs: [001](../../architecture/decisions/001-postgresql-capacity-authority.md), [002](../../architecture/decisions/002-separate-visit-authority-from-policy-activation.md), [006](../../architecture/decisions/006-manual-target-verified-database-rollout.md) and [015](../../architecture/decisions/015-same-day-cancellation-is-a-no-show.md) provide domain context.

## Goal

A new Codex chat can identify an authorised task, recover its context, select a workflow and hand off a verified PR using this repository's existing records.

## Why

The repository already has a durable instruction hierarchy and live GitHub records. A short recovery workflow and two targeted skills reduce repeated discovery and the chance of mistaking release evidence for authorisation.

## Current behaviour

The root [agent instructions](../../../AGENTS.md), [documentation map](../../README.md) and [prompt library](../../../prompts/README.md) govern development. GitHub tracks work. At the base revision the checkout had no repository-local skills. The architecture overview described pre-Tranche A PR browser and Edge auth controls, and the no-show ADR and iPhone notes contained stale implementation status. The sources for correction are [CI](../../../.github/workflows/ci.yml), the [Edge auth contract](../../edge-function-auth.md), the [migration record](../../migrations.md#same-day-customer-cancellation-is-a-no-show-1300--production-applied-24-november-2026) and [PR #1310](https://github.com/leamonline/Smarter-dog-bookings/pull/1310).

## Desired behaviour

A resumed session revalidates relevant evidence and ownership before editing. Booking work uses the current domain contracts and test matrix. A release review produces a decision tied to the exact candidate and reports gaps in authority or evidence.

## Scope

Root agent and project guidance, planning and documentation maps, project-management workflow, targeted architecture and iPhone corrections, two repo-local skills and their evaluation record. One documentation-and-skills PR.

## Non-goals

Application changes, dependency installation, scheduled reports, changes to account permissions, customer-data access, production operations, merges and programme decisions.

## Relevant code

Read the sample-data wrapper in [scripts/dev.mjs](../../../scripts/dev.mjs), the browser gate in [CI](../../../.github/workflows/ci.yml) and the [Edge auth guard](../../../scripts/check-edge-function-auth.mjs) for documentation evidence. Booking and release skills link directly to the relevant decision records and existing prompts.

## Architecture

[Project management](../../project-management.md) routes work. GitHub owns status and blockers, the active plan owns implementation reasoning, and one replaceable checkpoint carries transient recovery context. Skills load on demand. Graphify can shorten code discovery when the index matches the revision or relevant files are verified locally.

## Data/database changes

None.

## API changes

None.

## UI changes

None.

## Security/privacy considerations

Use synthetic evaluation cases. Keep secrets and identifiable data out of prompts, plan checkpoints and evidence. A workflow can identify a permission boundary without granting permission. The read-only tooling and GitHub Project assessment is separate from the PR.

## Dependencies

Existing GitHub repository access for the issue and PR, and a Codex session with repository skill discovery for runtime testing. The GitHub Project board and Graphify are optional for task intake.

## Risks

Duplicated status decays. Keep one checkpoint and link to the source for live status and evidence. An indexed or checked candidate can go stale. Compare revisions before relying on it.

## Migration/rollout

Review this PR using the normal branch checks. Merging and any resulting deploy are outside this task. Close the issue and move the plan to completed after the authorised merge and acceptance.

## Implementation sequence

1. Open the issue, confirm the base, and create this plan and checkpoint.
2. Add intake and recovery to the existing workflow, then reconcile verified documentation drift.
3. Add the two skills and register their synthetic rubric.
4. Run documentation and skill checks, verify discovery in a fresh session if available, then push one branch and update the issue with the PR and evidence.

## Testing

Run `npm run check:docs` and `git diff --check`. Validate both skill manifests with the installed skill validator or an equivalent local check. Evaluate the registered synthetic cases without hosted data or production rights. Run the relevant pre-PR repository checks and record remaining limits.

## Observability

The PR links the issue, plan, exact candidate and evaluation record. Use GitHub check conclusions for that candidate. Keep a skipped or unavailable check distinct from a pass.

## Documentation updates

Update the documentation and prompt registries and link the checkpoint from the workflow. Preserve the accepted ADR decisions and link release facts to the migration history.

## Definition of done

One PR contains the agreed documents and skills. The issue links the PR and verification evidence. Recovery steps and both skills are evaluated, with any unavailable capability recorded.

## Open questions

None within the approved scope.

## Checkpoint

- **Revision and ownership** — `codex/project-initialisation`, based on `4f32ac83`. One writer for documentation, skills and evaluation.
- **Evidence** — On 27 November, local documentation and skill checks, the offline build, typecheck, migration and Edge auth checks, 5,889 Vitest tests and 269 Swift package tests passed. Lint passed with 66 warnings and skipped the Chromium icon render. Both skills were discovered and exercised in the [fresh CLI pilot](../../../prompts/evals/codex-workflows.md#initial-pilot-on-27-november-2026).
- **Next** — Review the PR and its exact-head CI evidence linked from [issue #1314](https://github.com/leamonline/Smarter-dog-bookings/issues/1314). Merge requires separate approval.

## Acceptance evidence

GitHub records [PR #1315](https://github.com/leamonline/Smarter-dog-bookings/pull/1315)
merged into `main@d9c39e1187a52d16ca46ad37704fa58e74810c3e` on 27 November 2026.
The [issue](https://github.com/leamonline/Smarter-dog-bookings/issues/1314) closed
after the merge. The [PR checks](https://github.com/leamonline/Smarter-dog-bookings/pull/1315/checks)
include the five required gates. The
[post-merge migration verification](https://github.com/leamonline/Smarter-dog-bookings/actions/runs/46061585188)
and [iPhone auth run](https://github.com/leamonline/Smarter-dog-bookings/actions/runs/46061585086)
passed. GitHub recorded a successful Vercel Production deployment for that SHA.
The earlier checkpoint above records the pre-merge hand-off.
