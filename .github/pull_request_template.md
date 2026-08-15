## What changed

Describe the observable change and the important implementation boundary.

## Why

Link the issue (`Closes #…` where accurate), active plan, requirements and ADRs. Explain the problem this resolves.

## Behaviour and evidence

State previous and new behaviour, including unavailable, error and edge states. List exact automated checks and manual journeys run with their results; do not write “tests pass” without naming them.

## Data, security and release

Identify migrations, RLS/grant changes, customer-data or privacy effects, secrets/configuration, external prerequisites, compatibility order, feature flags and rollback/roll-forward needs. Write `None` only after checking.

## Documentation and prompts

Link changed requirements, specifications, plans, ADRs, runbooks, prompt versions or changelog entries. Explain why no update is needed when behaviour changed but documentation did not.

## Follow-up

Link work deliberately left out, unresolved decisions and any evidence that must be collected after merge. Do not hide required completion work in an untracked TODO.

## Human merge control

This block starts fail closed. Leave it on `HOLD` until every prerequisite is
green for the exact pull-request head, then follow the
[human merge-control runbook](https://github.com/leamonline/Smarter-dog-bookings/blob/main/docs/superpowers/runbooks/2026-08-11-human-merge-control.md).

To approve: set `Decision: MERGE` and `Approved by: @your-login`, then save. The
head SHA, the current `main` SHA and the approval time are read from GitHub —
never typed. **Documentation-only pull requests need no approval at all**; they
go green on machine evidence alone.

If this pull request adds migration SQL, set `Migration review:` to
`APPLIED: <migrations-applied job URL>`. Otherwise leave it on `HOLD`.

Do not rename, reorder, format or duplicate the fields or markers. Only an
allow-listed human may submit the final `MERGE` body edit.

<!-- human-merge-control:start -->
Decision: HOLD
Approved by:
Migration review: HOLD
<!-- human-merge-control:end -->
