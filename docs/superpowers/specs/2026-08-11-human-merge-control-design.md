# Human merge control — design

**Date:** 2026-08-11
**Status:** approved for implementation
**Issue:** enforcement follow-up to
[#606](https://github.com/leamonline/Smarter-dog-bookings/issues/606),
[#619](https://github.com/leamonline/Smarter-dog-bookings/issues/619) and parent
[#603](https://github.com/leamonline/Smarter-dog-bookings/issues/603)
**Scope:** make the temporary human control for unprotected `main` explicit,
fail closed on stale evidence, and preserve a clean path to native enforcement.

## Context

Live GitHub inspection on 11 August 2026 confirmed that `main` has no branch
protection rule or ruleset. GitHub rejected protection for this private
repository on its current plan. The existing checks therefore provide useful
evidence but do not prevent an authorised person from merging or pushing while
they are red, absent or stale.

The repository must not imply otherwise. Changing billing or repository
visibility is an external account decision, so the safe in-repository response
is a visible, auditable human control with an explicit bypass limitation.

## Decision

Add a fail-closed `human-merge-control` check run for pull requests. A
named human may turn it green only by editing a structured attestation in the
pull-request body after the required evidence is green for the exact pull-
request head SHA.

The check is operational evidence, not native merge prevention. Until GitHub
protection is available, the operator must still refuse a direct merge or push
that bypasses the control.

## Attestation contract

The pull-request template contains one machine-readable block that begins in a
safe state:

```text
Decision: HOLD
Approved head SHA:
Approved base SHA:
Approved by:
Approved at (UTC):
Migration review:
```

Approval requires all of the following:

- `Decision` is exactly `MERGE`;
- the approved SHA is the current 40-character pull-request head SHA;
- the approved base SHA is the freshly read target-branch SHA;
- `Approved by` names the GitHub actor who submitted the body edit and that
  actor is in the base-controlled merge-approver allow-list;
- the timestamp is a valid UTC timestamp;
- migration disposition is explicit rather than inferred from a green no-op;
  and
- every required pull-request check is successful for that SHA.

Any new commit produces a different head SHA and therefore invalidates the old
attestation. Opening, reopening, converting from draft or synchronising a pull
request cannot itself approve a merge; the final passing evaluation must be
caused by an explicit body edit after the evidence is ready. The evaluator
requires a real body change, checks the authenticated actor and rejects workflow
re-runs so an old edited event cannot become approval after its prerequisites
later turn green.

## Evidence matrix

The pull-request attestation checks these contexts:

| Context | Required meaning |
| --- | --- |
| `build` | lint, documentation links, types, migration-file validation, Vitest and production build passed |
| `agent-tests` | Edge Function type checks and Deno tests passed |
| `pr-production-smoke` | non-empty production-build Chromium and mobile WebKit smoke suite passed |
| `migrations-applied` | workflow passed; the human separately records whether it queried production or self-skipped |
| `Vercel` | the deployment integration reported success for the same head SHA |

The PR `e2e` job is deliberately excluded because it exits successfully after
printing a skip message. Full Chromium E2E remains post-merge evidence on the
resulting `main` SHA.

## Trusted workflow boundary

Use `pull_request_target` only for the narrow attestation workflow. It must:

- execute repository code from the base commit, never the pull-request head;
- receive no repository secrets;
- request only repository read, pull-request read, commit-status read, Actions
  read and check write permissions;
- treat the pull-request body and API responses as untrusted data;
- create or update an in-progress check before evaluation and complete it with
  `success` or `action_required` on the exact pull-request head SHA; and
- fail closed if the event, API response, attestation or required context is
  missing, duplicated, stale, skipped, neutral, cancelled or otherwise
  ambiguous.

The workflow job itself runs against the trusted base context. The durable
`human-merge-control` check run is explicitly written to the candidate head SHA
so it can later become a native required check without changing its name. Its
stable external ID is scoped to the pull-request number and head SHA so repeated
body edits update the same logical control instead of producing ambiguous
lookalikes.

## Human operating procedure

The runbook separates two decisions:

1. **Before merge:** inspect the required PR evidence, record the exact head
   SHA and migration disposition, then edit `HOLD` to `MERGE`.
2. **After merge:** monitor `build`, `agent-tests`, full `e2e`,
   `migrations-applied` and `Vercel` on the exact merge SHA. A skipped
   `pr-production-smoke` is expected on push because that proof belongs to the
   PR head.

Missing, unexpected-skipped, stale or conflicting evidence means `HOLD`. A
successful no-migration step proves only that the diff added no migration; it
does not prove the whole production migration ledger is current.

Immediately before merging, the operator compares the attested base SHA with
the current `main` SHA. An advance of `main` after approval requires a refreshed
attestation. Without native protection there is no reliable repository event
for every later prerequisite re-run or base movement, so the final comparison
remains an explicit human duty.

## Native-enforcement path

When the repository plan supports private-repository protection, configure
`main` to require pull requests, dismiss stale approvals, block force pushes
and require these contexts:

- `build`
- `agent-tests`
- `pr-production-smoke`
- `migrations-applied`
- `Vercel`
- `human-merge-control`

The human runbook remains useful for release judgement, but GitHub then becomes
the authority that prevents a merge while a required context is absent or red.

For the GitHub Actions evidence, the evaluator also resolves the originating
Actions run and requires the expected workflow path: `build`, `agent-tests` and
`pr-production-smoke` come from `.github/workflows/ci.yml`, while
`migrations-applied` comes from
`.github/workflows/check-migrations-applied.yml`. A lookalike check name from a
different workflow does not satisfy the control.

## Testing

Focused tests cover valid approval, default hold, malformed or duplicated
blocks, stale SHA, actor mismatch, invalid timestamp and every non-success
check state. A workflow-contract test proves the trusted-base checkout,
permissions, event list and exact status-context name cannot drift silently.

An intentional failing fixture is the negative control: changing the approved
SHA or one required conclusion must make the evaluator reject the attestation.

## Explicit limitations

- This does not stop a repository administrator or writer from bypassing the
  status while `main` remains unprotected.
- A later advance of `main` or prerequisite re-run is not automatically able to
  invalidate an already completed check; the runbook therefore requires a
  final current-base and all-checks comparison immediately before merge.
- It does not make the current migration checker a bidirectional drift or SQL
  integrity check.
- It does not independently verify live application behaviour behind Vercel
  access controls.
- It does not authorise a production write, billing change, visibility change
  or customer-data access.
