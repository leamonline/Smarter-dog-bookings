# Human merge control

**Status:** Active temporary operating control
**Applies to:** every pull request targeting `main`
**Authority:** the approved
[human merge-control design](../specs/2026-08-11-human-merge-control-design.md)
and [issue #606 plan](../../plans/active/2026-08-11-issue-606-human-merge-control.md)

## Purpose and boundary

`main` is unprotected because GitHub does not provide the required private-
repository enforcement on the current plan. The repository checks are useful
evidence, but GitHub does not presently stop a writer or administrator from
merging or pushing while that evidence is red, missing or stale.

This procedure makes the human decision explicit and publishes
`human-merge-control` on the exact pull-request head SHA. It is an auditable
operational control, not a technical merge lock. Missing, skipped, stale,
pending, ambiguous or conflicting evidence always means **HOLD**.

This procedure does not authorise a production migration, deployment,
customer-data access, account change or bypass of another release control.

## Before merge

### 1. Read the exact candidate

Keep the pull request in draft or on `HOLD` while evidence settles. Read the
current 40-character pull-request head SHA and the current 40-character base
SHA for `main`. Read these independently: a pull request's `base.sha` is a
historical base snapshot and is **not** authoritative for the current `main`
tip. The base SHA is also not GitHub's synthetic test-merge commit.

The GitHub UI shows the head commit. For an unambiguous API read, replace
`<PR>` with the pull-request number:

```bash
gh api repos/leamonline/Smarter-dog-bookings/pulls/<PR> --jq .head.sha
gh api repos/leamonline/Smarter-dog-bookings/commits/main --jq .sha
```

Any new head commit invalidates an earlier attestation. If `main` advances,
the recorded base is stale. Update the branch so its new head contains the
current `main` commit, wait for all head-bound evidence to run again, then make
a fresh attestation. Merely replacing the base field is insufficient: the
evaluator proves that current `main` is the merge base of the candidate head.

### 2. Inspect the pull-request evidence

Every prerequisite below must be successful for the current head SHA. Open
the details rather than relying on a summary badge when provenance or scope is
unclear.

| Pull-request context | Required evidence |
| --- | --- |
| `build` | The GitHub Actions job from `.github/workflows/ci.yml` completed successfully, covering lint, documentation links, type checking, migration-file validation, Vitest and the production build. |
| `agent-tests` | The GitHub Actions job from `.github/workflows/ci.yml` completed successfully, covering Edge Function type checks and Deno tests. |
| `pr-production-smoke` | The GitHub Actions job from `.github/workflows/ci.yml` completed successfully with the non-empty production-build Chromium and mobile WebKit smoke suite. |
| `migrations-applied` | The job from `.github/workflows/check-migrations-applied.yml` completed successfully. Apply the separate migration review below; the green conclusion alone is not enough. |
| `Vercel` | The exact `Vercel` commit status from `vercel[bot]` is successful on this head SHA. Open its target and confirm it identifies the candidate deployment; `Vercel Preview Comments` is not a substitute. |

Do **not** count the pull-request `e2e` job as browser evidence. On pull
requests it deliberately exits successfully after printing a skip message.
Full Chromium E2E is post-merge evidence on the resulting `main` SHA.

Also inspect any additional path-triggered check relevant to the change, such
as database tests. Additional checks do not replace the five named
prerequisites.

The evaluator proves each Actions job's name, App, run, SHA and workflow path;
it does not prove that a pull request left the workflow or every invoked test
harness unchanged. If the change touches `.github/workflows/ci.yml`,
`.github/workflows/check-migrations-applied.yml`, this publisher/evaluator, or
material test-runner configuration, do not use an ordinary `MERGE`
attestation. Keep `HOLD` and obtain a separately authorised control-change
review under the repository's stop-and-escalate rule.

### 3. Record the migration disposition

The evaluator compares GitHub's reported `changed_files` count with every file
returned by the paginated files API. A truncated or changing list is `HOLD`,
including a pull request beyond GitHub's 3,000-file listing limit.

Inspect the pull-request file list and the `migrations-applied` job log, then
replace `Migration review: HOLD` with exactly one of:

- `Migration review: NO_MIGRATIONS` — only when the pull request adds no
  `supabase/migrations/*.sql` file. The successful no-migration job proves only
  that this diff added no migration. It does not query production, prove the
  complete production ledger is current, detect historical drift or validate
  SQL content.
- `Migration review: APPLIED: <details-url>` — when the pull request adds one
  or more migrations. Replace `<details-url>` with the exact details URL of
  the successful `migrations-applied` job for this head SHA, after its log
  reports that every added migration identifier is present in the verified
  production project's ledger. This is not proof that the repository SQL is
  byte-for-byte the SQL previously executed in production.

Migration history is append-only. If an existing migration is modified,
deleted or renamed, remain on `HOLD` and replace the change with a new ordered
corrective migration. Applying a migration is a separately authorised
production action: use the explicit verified Supabase target procedure and
never infer a production link or run a bare `supabase migration up --linked`.

### 4. Submit the attestation

Only after the required evidence is green, edit the single marked block in the
pull-request body:

- change the decision from `HOLD` to exactly `MERGE`;
- paste the current full head SHA and current full base SHA;
- enter the allow-listed editor's GitHub login, for example `@leamonline`;
- enter a current ISO 8601 UTC timestamp ending in `Z`, after the newest
  prerequisite completed, for example `2026-08-11T12:05:00Z`; the evaluator
  permits at most 15 minutes of age and two minutes of clock skew into the
  future; and
- enter the exact migration disposition from step 3.

Do not change the markers, field names, field order or add text inside the
block. The person named in the block must be the allow-listed human who makes
this body edit. Opening, reopening, synchronising or re-running an old workflow
cannot approve the pull request; make a fresh body edit after the evidence is
ready. GitHub's authenticated `updated_at` for that body edit, as well as the
typed `Approved at (UTC)` value, must be strictly later than every required
check/status timestamp; equality is ambiguous and remains `HOLD`.

The trusted-base evaluator must then publish a successful
`human-merge-control` status on the exact head SHA. A failed, stale, missing or
pending result means `HOLD`; correct the cause and submit a new
body edit rather than re-running the old approval event.

The publisher's first executable step resets the head-bound context to
`pending` before checkout. If checkout, evaluation or a later API call fails,
the evaluator makes a best-effort `failure` write and exits non-zero. Network
responses are inherently ambiguous: GitHub might accept a status write even
when its response is lost, and the recovery write can also fail. If GitHub
never starts the hosted runner, it cannot write anything. The final review
below therefore treats the latest publisher run itself as mandatory evidence,
not merely the visible status.

### 5. Re-check immediately before clicking merge

This final comparison is mandatory because native protection cannot invalidate
every earlier result after a base movement or prerequisite re-run.

1. Re-read the pull request and confirm its head SHA still equals the approved
   head SHA.
2. Re-read the current `main` SHA and confirm it still equals the approved base
   SHA:

   ```bash
   gh api repos/leamonline/Smarter-dog-bookings/commits/main --jq .sha
   ```

3. Refresh the checks and confirm `build`, `agent-tests`,
   `pr-production-smoke`, `migrations-applied`, `Vercel` and
   `human-merge-control` remain successful for the approved head, with no
   newer pending or failed run.
4. Open the latest `Human Merge Control Publisher` workflow run for this pull
   request. Confirm GitHub started it for the final body edit, it completed,
   and its target URL is the one attached to the latest
   `human-merge-control` status. A missing, queued or failed publisher run is
   `HOLD`, even if an older status is still green.
5. If either SHA changed or any evidence changed, do not merge. Restore or keep
   `HOLD`, wait for current evidence, and submit a fresh exact-SHA attestation.
6. Merge only after all five comparisons remain current.

## After merge

Record the exact merge SHA from `main`; it is different evidence from the
pull-request head. Monitor the push/deployment matrix for that SHA:

| Push context | Expected result on the exact merge SHA |
| --- | --- |
| `build` | Successful. |
| `agent-tests` | Successful. |
| `e2e` | Successful full Chromium E2E run; unlike the pull-request job, this is not the deliberate no-op. |
| `migrations-applied` | Successful, with its log interpreted using the same migration limitations above. |
| `Vercel` | Successful production deployment status for the merge SHA; inspect the deployment evidence required by the change. |
| `pr-production-smoke` | Skipped or absent is expected on push because this proof belongs to the pull-request head. A failure is not an expected skip and must be investigated. |

Monitor any additional workflow triggered by the changed paths. Do not claim
release completion while a required push result is pending, failed or
ambiguous. Investigate a failure and use the change's documented roll-forward
or rollback route; a green pull-request attestation is not proof that the
post-merge deployment succeeded.

## Bypass limitation and native enforcement

Until `main` has a branch protection rule or ruleset, an administrator or
writer can bypass `human-merge-control`, use the GitHub merge button while it
is non-green, or push directly. Repository prose and release evidence must not
claim otherwise. GitHub also cannot publish the initial `pending` status if a
publisher run never starts. The human operator must refuse those bypasses and
apply the final publisher-run check above.

When the repository plan supports private-repository protection, separately
authorise and configure GitHub to:

- require pull requests, at least one GitHub-native approving review and
  dismissal of stale approvals;
- require the branch to be current before merge;
- block force pushes and direct bypasses as policy permits; and
- require `build`, `agent-tests`, `pr-production-smoke`,
  `migrations-applied`, `Vercel` and `human-merge-control`; and
- bind `human-merge-control` to the expected GitHub Actions source App rather
  than accepting that context from any source.

Those six contexts are necessary machine evidence, but status-only protection
is **not** a native human gate: an older green status can survive when a later
publisher never starts. Use a GitHub-native review/ruleset control as the human
authority, or redesign the publisher as a GitHub-required mechanism whose
absence GitHub itself invalidates. Prove the configured rule with a negative
test in which the latest publisher is missing before declaring GitHub the
prevention authority. Until then, retain the final publisher-run comparison in
this runbook as well as the exact-SHA and post-merge reviews.
