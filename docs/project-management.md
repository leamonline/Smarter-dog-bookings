# GitHub execution model

Status: Active
Last verified: 11 August 2026
Programme: #603

The repository is durable project memory. GitHub Issues and a repository Project are the live execution layer: priority, ownership, status, blockers and day-to-day discussion belong there.

## Work hierarchy

Use the smallest hierarchy that preserves an independently understandable outcome:

```text
Initiative / epic
└── Feature or risk outcome
    └── PR-sized implementation or research task
```

Issue #603 is the architecture-convergence initiative. Issues #604–#612 are its feature outcomes. PR-sized tasks should be native sub-issues of the feature they advance where GitHub supports that relationship.

Every implementation issue should normally include Goal, Why, Scope, observable Acceptance criteria, Dependencies, Relevant requirements, Relevant documentation, Risks/notes and Definition of done. Do not use a phase-sized issue as a hidden checklist for unrelated changes, and do not split a coherent pull request into administrative fragments.

Use GitHub's native blocked-by relationship for programme dependencies and
mirror it in each issue's Dependencies section so the constraint remains
readable outside a Project view. Native relationships were verified for the
#603 work packages on 9 August 2026. A dependency is not satisfied merely
because code exists: migration, deployment, configuration, decision or
evidence gates may still block the consumer.

## Status workflow

| Status | Meaning | Exit condition |
|---|---|---|
| Inbox | New, untriaged work | Problem and destination are understood |
| Backlog | Valid but not ready or not prioritised now | Dependencies and priority permit refinement |
| Ready | Scoped, accepted and unblocked | Work starts against a pinned base |
| In progress | Owned implementation or research is active | Reviewable outcome and evidence exist |
| Blocked | Cannot progress without a named decision/dependency | Blocker closes or scope changes |
| Review | Pull request, evidence or product decision is under review | Accepted, returned for work or closed |
| Done | Acceptance criteria and release/documentation obligations are complete | Terminal |

Closing code is not enough for `Done` when the issue also requires deployment, migration, external configuration or operational verification.

## Labels and milestone

Use labels for durable classification, not status that belongs in the Project:

- type: `type:initiative`, `type:feature`, `type:implementation`, `type:research`, `type:bug`, `type:technical-debt`, `type:infrastructure`, `type:documentation`;
- risk/control: `production-risk`, `security`, `database-migration`, `release-gate`;
- existing focused labels such as `accessibility`, `performance`, `github_actions` and `ui` where useful.

The no-date `Architecture convergence (#603)` milestone groups the bounded programme without inventing a deadline. Priority is a Project field; existing `P0`/`P1` labels remain compatible with older issues but should not be applied in parallel with a contradictory Project priority.

## Project configuration

Recommended title: **Smarter Dog — Architecture Convergence**
Repository: `leamonline/Smarter-dog-bookings`
Visibility: private unless the repository's privacy changes

The current GitHub token has repository and workflow scopes but not `read:project` / `project`. Therefore this Project was not inspected or configured as part of the 9 August repository-memory change. Obtain the scopes deliberately, then create or adapt one Project rather than creating duplicates:

```bash
gh auth refresh -s read:project,project
gh project list --owner leamonline
gh project create --owner leamonline \
  --title "Smarter Dog — Architecture Convergence" --format json
```

After creation, link the Project URL here and in issue #603. Do not refresh scopes in an unattended agent run: expanded account permission is a human decision.

Capture the returned project number as `SD_PROJECT_NUMBER`, then link the
repository and create the custom fields exactly once. Inspect existing fields
first so rerunning these commands cannot create duplicates:

```bash
gh project field-list "$SD_PROJECT_NUMBER" --owner leamonline
gh project link "$SD_PROJECT_NUMBER" --owner leamonline \
  --repo Smarter-dog-bookings

gh project field-create "$SD_PROJECT_NUMBER" --owner leamonline \
  --name Priority --data-type SINGLE_SELECT \
  --single-select-options "P0 Critical,P1 High,P2 Normal,P3 Low"
gh project field-create "$SD_PROJECT_NUMBER" --owner leamonline \
  --name Type --data-type SINGLE_SELECT \
  --single-select-options "Initiative,Feature,Bug,Research,Technical debt,Infrastructure,Documentation"
gh project field-create "$SD_PROJECT_NUMBER" --owner leamonline \
  --name Area --data-type SINGLE_SELECT \
  --single-select-options "Booking,Capacity,Notifications,Edge & integrations,Release & CI,Product UI,Measurement,Documentation"
gh project field-create "$SD_PROJECT_NUMBER" --owner leamonline \
  --name Effort --data-type SINGLE_SELECT \
  --single-select-options "XS,S,M,L,XL"
gh project field-create "$SD_PROJECT_NUMBER" --owner leamonline \
  --name Phase --data-type SINGLE_SELECT \
  --single-select-options "Tranche A,Evidence gate,Tranche B,Later"
gh project field-create "$SD_PROJECT_NUMBER" --owner leamonline \
  --name "Start date" --data-type DATE
gh project field-create "$SD_PROJECT_NUMBER" --owner leamonline \
  --name "Target date" --data-type DATE
gh project field-create "$SD_PROJECT_NUMBER" --owner leamonline \
  --name Release --data-type TEXT
```

The built-in Status and Assignees fields already exist; edit Status in the web
Project settings to the workflow below instead of creating duplicate fields.
Add Iteration only if a real cadence is adopted. Add issues with
`gh project item-add "$SD_PROJECT_NUMBER" --owner leamonline --url <issue-url>`.
The current `gh project` CLI cannot create or configure views, so create the
named views in the web interface with the filters and grouping below.

### Fields

| Field | Type / values | Why |
|---|---|---|
| Status | Inbox, Backlog, Ready, In progress, Blocked, Review, Done | Single workflow state |
| Priority | P0 Critical, P1 High, P2 Normal, P3 Low | Ordering within a phase |
| Type | Initiative, Feature, Bug, Research, Technical debt, Infrastructure, Documentation | Reporting and routing |
| Area | Booking, Capacity, Notifications, Edge & integrations, Release & CI, Product UI, Measurement, Documentation | Actual product/system boundary |
| Effort | XS, S, M, L, XL | Relative planning signal, not hours |
| Phase | Tranche A, Evidence gate, Tranche B, Later | Dependency-aware roadmap stage |
| Start date | Date, optional | Use only when work actually starts |
| Target date | Date, optional | Use only for a real external commitment |
| Iteration | Iteration, optional | Add only if the team adopts a regular cadence |
| Release | Text, optional | Compatibility/release grouping |

GitHub's built-in Assignees field is the owner. Do not create a second Owner field unless cross-repository planning proves it necessary.

### Views

- **Inbox:** Status = Inbox; newest first.
- **Now:** Status is Ready, In progress, Blocked or Review; group by Status and sort by Priority.
- **Roadmap:** timeline grouped by Phase, showing initiatives/features; omit artificial dates.
- **Backlog:** Status = Backlog; sort by Priority then Effort.
- **Bugs:** Type = Bug and not Done; group by Area.
- **Technical debt:** Type = Technical debt and not Done; group by Area.
- **By area:** not Done; group by Area, then sort by Priority.
- **Next release:** Release is set and Status is not Done; group by Status.

Automations should set newly added items to Inbox, moved-to-review pull requests to Review where reliable, and closed issues to Done. Avoid an automation that marks an issue Done merely because a pull request merged when operational acceptance remains.

## Issue #603 execution sequence

The canonical sequence and stop/continue gate live in [ROADMAP.md](../ROADMAP.md) and the [active implementation plan](plans/active/2026-08-09-issue-603-architecture-convergence.md). In summary:

1. Tranche A establishes measurement, authoritative capacity tests, truthful capability states, an Edge Function authentication manifest, a real pull-request browser gate and an explicit-target migration guard.
2. An evidence issue records the measures and makes a default-STOP decision. Tranche B is not automatic.
3. Only a recorded GO proceeds to the minimal release/capability seam, visit-level reschedule notification delivery, canonical capacity evaluator and legacy-compatible staff reschedule command.

Serialise migration writers and the generated types/RPC/client integration spine. Documentation, authentication inventory and isolated CI work can proceed in parallel when their owned paths do not overlap.

## Branch controls and merge gate

Live inspection on 11 August 2026 confirmed that `main` was not protected.
GitHub rejected ruleset enforcement for this private repository on the current
plan, so branch rules were not created. This is an external account limitation,
not a repository guarantee.

Until native enforcement is available, every pull request targeting `main`
uses the
[human merge-control runbook](superpowers/runbooks/2026-08-11-human-merge-control.md).
The control records a named human decision against the exact pull-request head
and independently read current-`main` SHAs after the required PR evidence
succeeds, and requires the candidate head to contain that main commit.
Immediately before merge, the operator must compare those SHAs and all checks
again; a stale, missing, skipped, failed or ambiguous result means `HOLD`.

The resulting `human-merge-control` check is auditable operational evidence,
but it cannot prevent a writer or administrator from bypassing it while `main`
is unprotected. When the repository plan supports enforcement, require pull
requests, dismiss stale approvals, prevent force/direct pushes as policy
permits and require the exact contexts named in the runbook. A required status
alone is not the native human authority because a publisher may never start;
use GitHub-native review/ruleset state and prove the missing-run case live.
Keep write-capable release jobs separate from untrusted pull-request code.

## Traceable completion

A material change should leave a navigable chain:

```text
PROJECT goal → requirement/specification → issue → active plan → PR → tests
→ deployment/release evidence → changelog/completed plan
```

Use [docs/traceability.md](traceability.md) for the governing relationships, not as a duplicate task tracker.
