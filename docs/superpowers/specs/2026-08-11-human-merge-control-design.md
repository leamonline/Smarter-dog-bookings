# Human merge control — design

> **RETIRED 18 August 2026.** The control this document designs was removed and
> not replaced. Kept as a design record only.

**Date:** 2026-08-11
**Status:** retired 2026-08-18; formerly approved for implementation, attestation contract amended 2026-08-14
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

Add a fail-closed `human-merge-control` commit status for pull requests. A
named human may turn it green only by editing a structured attestation in the
pull-request body after the required evidence is green for the exact pull-
request head SHA.

The check is operational evidence, not native merge prevention. Until GitHub
protection is available, the operator must still refuse a direct merge or push
that bypasses the control.

## Attestation contract

> **Amendment, 14 August 2026.** The original contract asked the approver to
> transcribe the head SHA, the current `main` SHA and an approval timestamp.
> Each is now read from GitHub directly, which is strictly stronger — a
> transcribed value can be mistyped or back-dated; a machine read cannot — and
> the ritual was the single largest source of operator friction. Documentation-
> only pull requests were additionally exempted from human attestation. No
> property below was weakened; three typed inputs were replaced by the machine
> reads that already proved them. The amended contract is recorded here; the
> superseded wording is preserved in the sections that follow it.

The pull-request template contains one machine-readable block that begins in a
safe state:

```text
Decision: HOLD
Approved by:
Migration review:
```

Approval requires all of the following:

- `Decision` is exactly `MERGE`;
- `Approved by` names the GitHub actor who submitted the body edit and that
  actor is in the base-controlled merge-approver allow-list;
- every required pull-request check is successful for the current head SHA, and
  each is bound to that head, to the `github-actions` app, to a `pull_request`
  run and to its expected workflow path;
- the head contains the independently and freshly read current `main` tip, not
  the pull request's historical `base.sha`;
- the GitHub-authenticated body-edit `updated_at` is strictly after every
  evidence timestamp; equality fails closed;
- that body edit is no more than one hour old and no more than two minutes
  ahead of the evaluator clock;
- migration history is append-only, and a pull request adding migration SQL
  carries the exact successful `migrations-applied` job URL. A pull request
  adding none needs no typed disposition: GitHub's reported changed-file count
  must equal the complete fetched list, so the absence is proven, not asserted;
  and
- a documentation-only change — every path under `docs/**` or a Markdown file
  outside `.github/`, with no migration SQL — requires the machine evidence
  above but no human attestation. `.github/**`, `scripts/`, `src/`, `supabase/`
  and `e2e/` are never exempt, and a mixed change is never exempt.

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

- execute repository code from the trusted `github.sha` target-branch commit,
  never the pull-request head or the PR's historical `base.sha`;
- receive no repository secrets;
- request only repository read, pull-request read, check read, Actions read and
  commit-status write permissions;
- treat the pull-request body and API responses as untrusted data;
- publish `pending` from the validated GitHub event before checkout or remote
  evidence reads, then `success` or `failure` on that exact pull-request head
  SHA; and
- fail closed if the event, API response, attestation or required context is
  missing, duplicated, stale, skipped, neutral, cancelled or otherwise
  ambiguous.

The workflow job itself runs against the trusted base context. The durable
`human-merge-control` status is explicitly written to the candidate head SHA so
it can later become a native required status without changing its name. GitHub's
latest-per-context semantics make each new `pending`, `success` or `failure`
authoritative without discovering or updating an older check run.

An internal or final-publication error triggers a best-effort non-green status
write before the job exits non-zero. A lost API response can make the remote
outcome unknowable, so the operator must also require the latest publisher run
to have completed successfully; a status alone is insufficient.

The evaluator reads the current `main` commit independently before and after
collecting evidence. It also compares that commit with the candidate head and
requires `main` to be the merge base, proving that the tested head contains the
attested base. The PR object is used only to confirm `base.ref` remains `main`.

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
branch head, fresh head-bound evidence and attestation. Without native
protection there is no reliable repository event for every later prerequisite
re-run or base movement, so the final comparison remains an explicit human
duty. The operator also confirms that GitHub actually started and completed
the latest publisher run; a run that never starts cannot supersede an older
green status.

## Native-enforcement path

When the repository plan supports private-repository protection, configure
`main` to require pull requests, GitHub-native approving review, dismissal of
stale approvals, a current branch, blocked force/direct pushes and these
contexts:

- `build`
- `agent-tests`
- `pr-production-smoke`
- `migrations-applied`
- `Vercel`
- `human-merge-control`

These contexts are necessary but not sufficient for native human enforcement.
An older green `human-merge-control` status can survive if a later publisher
never starts, so GitHub-native review/ruleset state—not this status alone—must
be the human prevention authority. Alternatively, redesign it as a required
GitHub mechanism whose absence GitHub itself invalidates. Bind the status to
the expected GitHub Actions source App, but do not mistake source identity for
liveness. A dedicated GitHub App improves identity isolation, not dispatch
guarantees. Keep the manual publisher-run comparison until a live negative
test proves GitHub blocks a missing latest publisher.

For the GitHub Actions evidence, the evaluator also resolves the originating
Actions run and requires the expected workflow path: `build`, `agent-tests` and
`pr-production-smoke` come from `.github/workflows/ci.yml`, while
`migrations-applied` comes from
`.github/workflows/check-migrations-applied.yml`. A lookalike check name from a
different workflow does not satisfy the control.

## Testing

Focused tests cover valid approval, default hold, malformed or duplicated
blocks, stale SHA, actor mismatch, invalid timestamp and every non-success
check state. They also reject GitHub's 3,000-file API truncation by comparing
the PR's changed-file count with the fetched list. A workflow-contract test proves the trusted-base checkout,
permissions, event list and exact status-context name cannot drift silently.

An intentional failing fixture is the negative control: changing the approved
SHA or one required conclusion must make the evaluator reject the attestation.

## Explicit limitations

- This does not stop a repository administrator or writer from bypassing the
  status while `main` remains unprotected.
- A later advance of `main` or prerequisite re-run is not automatically able to
  invalidate an already completed check; the runbook therefore requires a
  final current-base and all-checks comparison immediately before merge.
- A hosted runner that never starts cannot publish the initial pending status;
  the runbook therefore requires the latest publisher run itself to exist and
  complete for the final body edit.
- A status request can be committed remotely while its response is lost. The
  publisher attempts a non-green recovery, and the mandatory successful-run
  check remains the final authority if that recovery is also ambiguous.
- It does not make the current migration checker a bidirectional drift or SQL
  integrity check.
- Actions name/App/path provenance does not prove that candidate changes left
  the evidence-producing workflow or invoked test harness intact. The runbook
  keeps such control changes on `HOLD` for separately authorised review.
- It does not independently verify live application behaviour behind Vercel
  access controls.
- It does not authorise a production write, billing change, visibility change
  or customer-data access.
