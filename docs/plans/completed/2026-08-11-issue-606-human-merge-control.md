# Issue #606 human merge control

> **The control this plan delivered was removed on 18 August 2026.** Every file
> named below (`.github/workflows/human-merge-control.yml`,
> `scripts/human-merge-control.mjs`, the `src/security/humanMergeControl*.test.ts`
> suites) no longer exists. Kept as a record of work done, not as instructions.

**Status:** Completed; delivered control since removed
**Issue:** enforcement follow-up to
[#606](https://github.com/leamonline/Smarter-dog-bookings/issues/606),
[#619](https://github.com/leamonline/Smarter-dog-bookings/issues/619) and parent
[#603](https://github.com/leamonline/Smarter-dog-bookings/issues/603); the user
explicitly approved the repository-wide control on 11 August 2026
**Implementation pull request:**
[#634](https://github.com/leamonline/Smarter-dog-bookings/pull/634)
**Live proof pull request:**
[#635](https://github.com/leamonline/Smarter-dog-bookings/pull/635)
**Close-out pull request:**
[#636](https://github.com/leamonline/Smarter-dog-bookings/pull/636)
**Base:** `main@e01823e8d4b79504a1454b6349ca61e6631fe094`
**Last verified:** 11 August 2026
**Owners:** `.github/pull_request_template.md`,
`.github/workflows/human-merge-control.yml`,
`scripts/human-merge-control.mjs`, `src/security/humanMergeControl.test.ts`,
`src/security/humanMergeControlApi.test.ts`,
`src/security/humanMergeControlCi.test.ts`,
release-control documentation and changelog
**Dependencies:** A4a implementation from #619; no Tranche B work
**Related requirements:** [REQ-CI-001](../../product/requirements.md)
**Related ADRs:** None; this implements the temporary control already described
in [project management](../../project-management.md#branch-controls-and-merge-gate)

## Goal

Make the temporary human merge control for unprotected `main` visible,
auditable and fail closed when its evidence belongs to a stale SHA, while
preserving a direct path to GitHub-native review/ruleset enforcement.

## Why

Live inspection on 11 August 2026 found no branch protection rule, ruleset or
required status on `main`. GitHub rejected protection for this private
repository on its current plan. The CI checks are evidence, but GitHub does not
currently stop a writer merging or pushing when they are red or absent.

The approved design is
[the human merge-control design](../../superpowers/specs/2026-08-11-human-merge-control-design.md).
It chooses an explicit human attestation because changing billing or repository
visibility is outside repository authority.

## Current behaviour

- `.github/pull_request_template.md` asks for validation and release detail but
  has no named merge decision, exact SHA or dated approver field.
- `docs/project-management.md` records that protection is unavailable but does
  not give the operator an executable merge procedure.
- `CLAUDE.md` says `check-migrations-applied` “gates this”, although no GitHub
  rule enforces that status.
- On pull requests, `build`, `agent-tests`, `pr-production-smoke`,
  `migrations-applied` and `Vercel` perform useful work. The `e2e` job reports
  success after an intentional skip and is not PR browser evidence.
- On push to `main`, full `e2e` runs and `pr-production-smoke` is expected to be
  absent or skipped because its job is PR-only.
- The migration check self-skips when the diff adds no migration. That result
  does not query production and does not prove bidirectional ledger integrity.

## Desired behaviour

A pull request begins in `HOLD`. After all named evidence succeeds, a human
edits a structured block to record `MERGE`, the exact head and base SHAs, their
GitHub identity, a current UTC time and the migration disposition. Trusted
base-branch code validates the record and publishes `human-merge-control` to
that exact head SHA.

Any new commit, malformed field, non-body-edit event, draft state, actor
mismatch, migration-history edit, missing check or non-success conclusion
leaves the status non-green. The documentation states plainly that this is an
operational control rather than native merge prevention.

## Scope

- Structured, default-`HOLD` attestation in the pull-request template.
- A base-controlled allow-list of authorised merge approvers; initially the
  current repository owner, `leamonline`.
- Pure parser/evaluator plus a small GitHub REST client with no third-party
  runtime dependency.
- A narrowly permissioned `pull_request_target` workflow that checks out only
  the trusted event-time `github.sha` from `main` and never runs pull-request
  code or the PR's historical `base.sha`.
- Exact-source validation: GitHub Actions for four CI jobs and `vercel[bot]`
  for the `Vercel` commit status. Each Actions job is also bound to its expected
  workflow path through the Actions run API.
- Explicit migration disposition and rejection of modified, removed or renamed
  SQL files under `supabase/migrations/`.
- Focused unit, API-boundary and workflow-contract tests.
- A human pre-merge/post-merge runbook and truthful links/copy in contributor
  documentation.

## Non-goals

- Changing the GitHub plan, billing, repository visibility or account policy.
- Claiming this status technically prevents a merge while `main` is
  unprotected.
- Applying migrations, reading customer data, deploying or changing Vercel.
- Repairing the wider migration-ledger, secret-boundary, retry, action-pinning,
  Node-version or CI-flake findings from the broader audit.
- Making the PR `e2e` no-op count as browser evidence.

## Relevant code

- `.github/workflows/ci.yml` — source of `build`, `agent-tests`, PR `e2e` no-op
  and `pr-production-smoke` semantics.
- `.github/workflows/check-migrations-applied.yml` — source of the
  `migrations-applied` check and no-migration self-skip.
- `.github/pull_request_template.md` — human record edited after evidence is
  ready.
- `src/security/edgeFunctionTypeCheckCi.test.ts` and
  `src/security/stagingTranche1Workflow.test.ts` — existing workflow-contract
  test style.
- `scripts/assert-playwright-pr-smoke-results.mjs` — existing dependency-free
  fail-closed CI parser style.

## Architecture

```text
pull-request checks at head SHA
        +
human edits PR attestation
        |
        v
pull_request_target workflow (trusted current-main SHA, no PR checkout, no secrets)
        |
        +-- read PR body/files, check runs and commit statuses
        +-- publish pending, then success/failure
        v
human-merge-control status on the exact PR head SHA
```

`pull_request_target` is used only because the evaluator must remain
base-controlled while observing an untrusted PR. The workflow never checks out
or executes the head or merge commit. Untrusted body text is read from
`GITHUB_EVENT_PATH`, not interpolated into shell source.

The evaluator requires these GitHub Actions check runs:

- `build`
- `agent-tests`
- `pr-production-smoke`
- `migrations-applied`

It separately requires the latest `Vercel` commit status from `vercel[bot]`.
The newest matching record must be completed successfully and tied to the
candidate SHA. Its originating Actions run must also be a completed successful
`pull_request` run for the same SHA from the expected workflow path. Skipped,
neutral, cancelled, timed-out, stale or in-progress results fail.

The attestation time must not precede the newest required evidence completion
time, must be no more than 15 minutes old and may be no more than two minutes
ahead of the evaluator clock. `Approved by` must match the actor who caused the `edited`
event, the workflow actor and triggering actor, and that login must be in the
base-controlled allow-list. The edited payload must contain a real body change,
and GitHub's authenticated body-edit `updated_at` must be strictly later than
all evidence. Workflow re-runs are rejected. This does not assert that the approver is
independent of the author; the remaining human-authority limitation is
documented rather than invented away.

The evaluator reads the PR and the independent `commits/main` endpoint at the
beginning and again immediately before success. Both PR reads must remain
open, non-draft and targeted at `main`; both main reads must match the attested
base SHA. A compare-API read must also prove that the candidate head contains
that current main commit. The PR's `base.sha` is deliberately ignored because
GitHub retains it as a historical PR base snapshot. A later base advance is
handled by updating the branch, waiting for fresh head-bound evidence, and the
runbook's mandatory final comparison.

## Data/database changes

None. The evaluator reads pull-request file metadata only. It performs no
Supabase command, database query or production write.

## API changes

No product API changes. The workflow uses GitHub's REST API to:

- list check runs for the exact head SHA;
- list commit statuses for that SHA;
- read the originating Actions runs to bind job names to workflow paths;
- list pull-request files; and
- read the current `main` commit twice and compare it with the candidate head;
- write only the `human-merge-control` commit-status context on the candidate
  head SHA.

Every response is schema-checked and ambiguity fails closed. Pagination is
handled for file, check-run and status lists. The fetched file count must equal
the PR's `changed_files` total, so GitHub's 3,000-file listing cap cannot hide
a migration-history edit.

## UI changes

No product UI changes. GitHub pull requests gain a visible structured
attestation and commit status.

## Security/privacy considerations

- Workflow permissions are limited to `contents: read`, `pull-requests: read`,
  `checks: read`, `actions: read` and `statuses: write`.
- No repository secret is referenced; only the ephemeral `github.token` is
  passed to the evaluator.
- The workflow-contract test rejects commit-status write permission in any
  other current repository workflow, reducing same-repository spoofing paths.
- Checkout uses the trusted `pull_request_target` `github.sha` with credential
  persistence disabled; it never uses PR head code or the historical
  `pull_request.base.sha`.
- No pull-request code, dependency installation or shell interpolation of PR
  text occurs in the trusted workflow.
- Logs contain repository metadata and check names only, with no customer data
  or credentials.
- A pending status is written from the locally validated GitHub event before
  remote evidence reads, so an evaluator crash or API failure cannot leave the
  newly evaluated SHA falsely green.

## Dependencies

- Existing #619 PR smoke job and its exact name.
- Existing `migrations-applied` workflow and Vercel integration.
- Current GitHub token policy must permit commit-status write for this one
  explicitly permissioned workflow.
- Native protection remains unavailable until a separately authorised account
  or visibility change.

## Risks

| Failure mode | Detection and mitigation |
| --- | --- |
| New commit retains old approval | exact SHA mismatch and `synchronize` evaluation fail the new head |
| Old edit-event run is manually re-run later | require run attempt 1 and matching actor/triggering actor |
| Base moves during evaluation | read current `main` twice and require both reads to equal the attested base SHA |
| PR head omits current `main` | compare base to head and require current `main` to be the merge base |
| PR text reaches shell execution | read JSON from `GITHUB_EVENT_PATH`; never interpolate body/title/ref in YAML `run` source |
| PR changes the evaluator | checkout only trusted `github.sha` under `pull_request_target` |
| A lookalike check supplies success | require exact context and expected GitHub App/bot identity |
| PR weakens an evidence workflow or test harness | runbook forbids ordinary approval and requires separately authorised control-change review |
| Human approves before evidence settles | require all checks successful and approval time after the latest completion |
| Migration no-op is mistaken for production proof | require `NO_MIGRATIONS` or the exact successful migration-check run URL |
| Applied migration history is edited | reject modified, removed or renamed migration SQL files |
| GitHub truncates a very large PR file list | compare the fetched length with the PR's changed-file count and hold on mismatch |
| Workflow/API outage after start | pre-checkout pending plus best-effort failure recovery; failed publisher run is `HOLD` |
| Hosted runner never starts | final operator check requires the latest publisher run to exist and complete |
| Final status commits but its response is lost | best-effort non-green recovery plus mandatory successful publisher-run review |
| Base or prerequisite changes after approval | final human comparison immediately before merge; native strict protection is the long-term fix |
| Writer bypasses the status | explicit limitation and human procedure; native branch rules remain the required long-term fix |

## Migration/rollout

1. Merge the implementation through the existing manual review route; the new
   base-controlled workflow cannot govern the PR that first introduces it.
2. Open or update a later test PR and confirm the default `HOLD` status.
3. Allow all required checks to complete, submit a valid attestation and confirm
   `human-merge-control` turns green on the exact head SHA.
4. Add a harmless commit or use a fixture-based negative control and confirm
   the previous approval no longer makes the new SHA green.
5. If native private-repository enforcement becomes available, require the six
   contexts named in the approved design and bind the human-control context to
   the expected GitHub Actions source App, but use GitHub-native review/ruleset
   state as the human authority. Prove a missing latest publisher blocks merge
   before retiring the runbook comparison.

Rollback is deletion of the workflow plus removal of the template field and
documentation links. Because no native rule currently requires the new status,
rollback cannot strand a protected branch.

## Implementation sequence

1. **Write failing parser/evaluator tests.** Add
   `src/security/humanMergeControl.test.ts` with fixtures for default hold,
   valid exact-SHA approval, duplicate/malformed blocks, stale head/base SHA,
   actor/event/re-run mismatch, draft PR, time ordering, check provenance/state
   and migration disposition. Run the focused test and record the expected
   initial failure.
2. **Implement the pure control.** Add `scripts/human-merge-control.mjs` with
   exported parser, evidence selector and evaluator functions. Run the focused
   test until green without adding network authority to the pure functions.
3. **Test the API and workflow contracts first.** Add
   `src/security/humanMergeControlApi.test.ts` to prove pending-before-reads,
   successful final publication, fail-closed API errors and event-type
   rejection. Add
   `src/security/humanMergeControlCi.test.ts` with expected workflow triggers,
   permissions, trusted `github.sha` checkout, disabled credential persistence, absence of
   PR checkout/secrets and the exact context name. Confirm it fails before the
   workflow exists.
4. **Add the trusted workflow and API adapter.** Create
   `.github/workflows/human-merge-control.yml`; implement paginated reads, two
   fresh PR/current-main comparisons and pending/final status writes in the script. Use a
   full-length immutable SHA for the checkout action, a five-minute job timeout
   and per-PR concurrency without in-progress cancellation.
5. **Add the human surface.** Update `.github/pull_request_template.md`; add
   `docs/superpowers/runbooks/2026-08-11-human-merge-control.md`; link it from
   `CONTRIBUTING.md`, `docs/README.md` and `docs/project-management.md`; correct
   the overclaim in `CLAUDE.md`; add a changelog entry.
6. **Run negative and positive controls.** Focused fixtures must show a stale
   SHA and failed check are rejected, while an exact current record is accepted.
   Do not create a live PR or publish a commit without separate user direction.
7. **Run repository verification.** Execute documentation links, lint,
   typecheck, migration-file validation, full Vitest and production build. No
   hosted database or deployment command is part of this change.

Steps 1–4 are serial because they share the evaluator contract. Documentation
can be drafted after the contract is fixed, but only one writer owns the PR
template and workflow.

## Testing

Focused:

```bash
npx vitest run --project=logic \
  src/security/humanMergeControl.test.ts \
  src/security/humanMergeControlApi.test.ts \
  src/security/humanMergeControlCi.test.ts
node scripts/human-merge-control.mjs --help
```

Repository bar:

```bash
npm run check:docs
npm run lint
npm run typecheck
npm run check:migrations
npm run test
npm run build
```

No Edge Function, pgTAP, concurrency or browser runtime is changed, so those
runtimes are not required locally. GitHub integration behaviour remains to be
observed on the first later PR after this workflow reaches `main`.

## Observability

- `human-merge-control` is attached to the exact candidate SHA with a target URL
  to the evaluator run, using GitHub's latest-per-context status semantics.
- Its description gives the first fail-closed reason without exposing body
  contents.
- The PR body retains the named approver, decision, head/base SHAs, time and
  migration disposition as durable review evidence.
- The post-merge runbook records the exact merge SHA rather than treating a PR
  or deployment alias as equivalent evidence.

## Documentation updates

- Approved design: already added.
- New human merge-control runbook.
- Pull-request template.
- `CONTRIBUTING.md`, `docs/README.md`, `docs/project-management.md` and
  `CLAUDE.md`.
- `CHANGELOG.md`.

## Definition of done

- Default PR text is visibly `HOLD` and incomplete or stale attestations fail.
- A valid body edit can pass only after the exact required evidence succeeds.
- The evaluator runs trusted base code, no PR code, and receives no repository
  secret.
- Migration disposition is explicit and applied-history edits are rejected.
- The human and native-enforcement boundaries are stated without claiming a
  merge block that does not exist.
- Focused negative controls and the repository bar pass.
- The final evidence names the branch and commit; live GitHub behaviour is left
  as a clearly labelled post-merge observation, not claimed from local tests.

## Completion evidence — 11 August 2026

Bootstrap pull request
[#634](https://github.com/leamonline/Smarter-dog-bookings/pull/634) was
manually reviewed as the one-off introduction exception at exact head
`80c3f0f60e1d3106becb32d260bdc2418702ace9` against
`main@e01823e8d4b79504a1454b6349ca61e6631fe094`. The
[final bootstrap decision](https://github.com/leamonline/Smarter-dog-bookings/pull/634#issuecomment-5255770459)
records successful exact-head `build`, `agent-tests`,
`pr-production-smoke` (18 of 18 production-build journeys),
`migrations-applied` with `NO_MIGRATIONS`, and the `Vercel` status from
`vercel[bot]`. The deliberately empty pull-request `e2e` job was not counted.

GitHub merged #634 as
`822416b8ce2da8b41981d6d13fd64546979e0bad`. On that exact `main` SHA,
[CI run 31511505200](https://github.com/leamonline/Smarter-dog-bookings/actions/runs/31511505200)
completed `build`, the full push `e2e` suite and `agent-tests` successfully;
`pr-production-smoke` skipped as expected on push.
[Migration run 31511505152](https://github.com/leamonline/Smarter-dog-bookings/actions/runs/31511505152)
completed successfully, and the
[Vercel production deployment](https://vercel.com/smarterdog/smarter-dogs-smart-humans/DogNHdnKLBsfNHMTZkV3ruhy74h6)
reported success for the merge SHA.

Temporary live-probe pull request
[#635](https://github.com/leamonline/Smarter-dog-bookings/pull/635) proved the
base-controlled workflow after it existed on `main`. The consolidated
[live-proof record](https://github.com/leamonline/Smarter-dog-bookings/pull/635#issuecomment-5256208758)
shows that a pull request begins on `HOLD`, non-body events cannot approve it,
stale ancestry or base evidence remains `HOLD`, a valid exact-SHA attestation
can publish success, a new commit invalidates the old approval, a failed
prerequisite remains `HOLD`, and a missing latest publisher run is an
operational `HOLD`. The successful live approval was bound to head
`838d9c30e2db0162ff1d0477c22bc81e08c4bc36` and
`main@822416b8ce2da8b41981d6d13fd64546979e0bad`. The probe ended at
`5894bfdbbd56fd6d6028e4f9b9152a019e8cfa2e` with an explicit non-green
control status and was closed unmerged after its body returned to blank
`HOLD`.

Native prevention remains unavailable on the current private-repository plan.
Fresh GitHub reads still report `main` as unprotected, and the repository
ruleset endpoint returns HTTP 403 with GitHub's instruction to upgrade to Pro
or make the repository public. `human-merge-control` therefore remains the
active auditable operating control plus mandatory final human comparison; it
is not GitHub-native merge prevention.

## Open questions

None for repository implementation. Enabling native branch protection remains
a separate account/billing or visibility decision.
