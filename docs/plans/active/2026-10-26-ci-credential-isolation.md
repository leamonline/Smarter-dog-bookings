Status: Active
Issue: #1125; Codex Security scan ef4423c4-54de-461e-b9c9-f2ce4ef2745a, finding ci-secret-exposure.pr-controlled-execution
Base: main 74d362c2ba532e250bebb45100bc3c8ea9843263; discovery base b38d7f5e24a3db3d5195fccbb8ef424312e779b8
Last verified: 2026-10-26
Owners: workflow, release-helper, regression-test and runbook paths in this patch; one implementation writer, read-only investigation/review
Dependencies: Owner-configured protected environments and separate staging credential
Related requirements: GOAL-04 in PROJECT.md
Related ADRs: ADR 006 release control; existing release contract retained

## Goal and why

Prevent unreviewed PR workflow/helper/configuration changes from using the
production Supabase credential, while retaining the exact-head required
`migrations-applied` check and schema-first release ordering.

## Current and desired behaviour

The current PR workflow executes `scripts/release/merge-gate.mjs` from the PR
tree with a repository secret. A helper-only substitution leaves editable
workflow code and arbitrary new PR workflows as alternate routes. The target
workflow must execute trusted main tools, treat PR Git blobs as inert data,
publish an exact-head result, and obtain credentials only from a main-only
environment. Local release preflight must validate this result's exact head,
trusted base, run attempt, workflow, event and outcome.

## Scope, relevant code and architecture

Own `check-migrations-applied.yml`, its three new release helpers, the narrow
preflight adapter, regression tests and the migration runbook. The other three
production automation consumers move to the same environment. Staging keeps
its existing approved workflow but uses a distinct credential with no
production authority. This is required so the repository secret can actually
be removed. No other scan findings, customer behaviour or release policy change.

## Data, API and UI changes

No database, application API or UI changes. GitHub Checks publishes the required
context on the event's exact PR head; the run name binds that head and PR to the
trusted target run. Existing ledger SQL/content/history/postcondition checks
remain unchanged and use extracted regular SQL blobs instead of a PR checkout.

## Security, dependencies and risks

No PR checkout or execution, dependency installation or artifact execution in
the privileged job. Symlinks, invalid paths and invalid UTF-8 fail closed.
Environment policy must allow exactly branch `main`, with no tags/wildcards;
the helper verifies that policy before production credential use. The owner
must remove/revoke the old repository token and ensure staging has no production
authority. Code changes alone cannot enforce secret placement or token scope.
GitHub target-event policy and hosted Checks metadata remain rollout gates.

## Implementation sequence and testing

1. Independently trace the boundary and compatibility; confirm baseline tests.
2. Extract data only, retain verification logic, publish exact-head results and
   narrowly adapt local release evidence validation.
3. Move credential consumers to protected environments; document setup and
   bootstrap requirements.
4. Run syntax checks, malicious PR and legitimate migration shell fixtures,
   release tests, existing workflow guards, docs/lint/type/migration/full tests
   and build. Use synthetic values only, with no hosted Supabase calls.
5. Obtain one fresh read-only bypass/regression review and address confirmed
   issues. Deliver a unified patch and local evidence; leave rollout separate.

## Migration, rollout, observability and documentation

Follow [the migration runbook](../../migrations.md#automation-credential-isolation).
Record local checks and unresolved hosted gates in the fix report. The owner
must coordinate any first-install required-check bootstrap explicitly; this
plan authorises no merge-control bypass. Verify one normal and one malicious
synthetic PR after trusted installation, without customer or schema mutations.
Do not roll back by restoring the repository credential or unsafe PR execution;
stop affected automation and correct forward instead.

## Definition of done and open questions

Local completion requires passing security/compatibility fixtures, applicable
checks and independent review. Operational completion additionally requires
verified environment policy, removed/revoked repository token, isolated staging
authority and an exact-head hosted check. Until those are proved, the finding
is not operationally remediated. Actual external settings remain unqueried and
unchanged by this preparation; retain this plan as active until rollout evidence.
