# Local production release implementation

Status: Dormant — contingency only (owner decision 20 October 2026, #1024)
Issue: #1024
Base: origin/main 1cbbce518fc4c8cd6e90649d724802e615b88534
Last verified: 2026-10-16
Owners: implementer owns release scripts, tests and related documentation; controller owns plan and ledger
Dependencies: None for implementation; operator credential validation and staging rehearsal gate production use
Related requirements: GOAL-04
Related ADRs: ADR 006

## Goal and why

Implement the [approved design](2026-10-15-local-production-release-design.md) as a reviewable alternative to a GitHub environment feature rejected by the current billing plan. Preserve exact-content human approval and database safety.

## Current and desired behaviour

The existing production workflow refuses to apply without required reviewers. Leave it fail-closed. Add a credential-free preparation command and a human-operated local execution path. The design is authoritative for the full contract. Production remains unapproved in this task.

## Scope, architecture and relevant code

scripts/apply-hosted-migrations.sh, scripts/production-ref-provenance.sh, scripts/lex-migration-sql.pl, scripts/check-migrations.mjs and the production workflow define existing invariants. New scripts should separate pure manifest validation, read-only GitHub/Git provenance, execution and credential handling. Preserve migration check provenance compatibility. Only trusted-main tooling executes; PR content supplies SQL only.

## Non-goals and global constraints

No production or customer-data operations, credential creation/read/update, live account changes, merges, push to main, or retirement/weakening of the current workflow. No automatic customer messages. Never claim that a TTY or typed approval is a human-only credential boundary. Changes must fail closed when required safety prerequisites cannot be proven. Hosted staging and real interactive credential acceptance are distinct operator acceptance gates, not tests to fake.

## Data/database, API and UI changes

No application migration, RPC, Edge API or product UI change. Discovery during implementation: cross-machine approval replay prevention requires a durable release-attempt record before the first migration. Supply separately reviewed bootstrap SQL under scripts/release; never auto-install it or add it to migration history in this task. Execution refuses a missing control table. Hosted installation requires separate approval. A session-held database lock serialises migration releases. CLI output is the operator UI and must distinguish partial, unknown and verified outcomes.

## Security and risks

Changed heads, SQL, checks, provenance, postcondition, target, ordering, reapply scope or expiry invalidate the package. Never leak secrets through process arguments, errors, receipts or tests. Database-wide locking must cover writes across processes; losing a lock holder must prevent additional writes. Existing scripts use several connections, which needs careful integration. A same-user agent can drive a terminal: do not present terminal prompts as a security control.

## Migration/rollout and dependencies

Disposable local DB tests first. Real staging rehearsal and verified operator credential isolation follow implementation review. Production apply and dependent #1016/#1023/#1017 releases are separate. Existing workflow controls remain active. Operator setup must not be silently performed.

## Implementation sequence

### Task 1: Implement the complete local release contract

Read the design at docs/plans/active/2026-10-15-local-production-release-design.md as the binding specification. Own scripts, associated tests, package commands, ADR 006, migration and hosted-target runbooks, CHANGELOG and docs routing. Do not edit this plan or controller ledger.

Build a strict, canonical hashed package with full SQL, exact sources, 60-minute expiry, staging evidence, current check identity and recovery data. Implement read-only preparation, validation and human-operated execution with trusted-main tooling and immediately refreshed GitHub state. Reuse or extract preflight checks from the workflow including merged-tree validation and append-only history. Preserve precise ledger provenance and merge-gate compatibility. Enforce database-wide release locking through the apply engine for all supported paths, tested with multiple real PostgreSQL processes. Preserve per-file atomic SQL plus ledger, postcondition enforcement and no blind retry of partial/unknown writes. Prevent approval replay, especially reapply.

Credential boundary: implement a supported secure interactive mechanism if demonstrable without provisioning secrets; otherwise implement a fail-closed acceptance boundary with honest operational instructions and report the exact prerequisite. Do not silently weaken the design or call an always-refusing stub a working release tool. Escalate design uncertainty to the controller.

Add negative tests for tampering, duplicate/unknown fields, symlinks, missing/stale/red checks, wrong target, changed reviews/head/main, expiry, altered postcondition, reapply, missing human unlock and concurrent release. Real disposable PostgreSQL tests must cover concurrency, interruption, partial apply, ledger mismatch and false postcondition. Tests cannot contact hosted production. Postgres binaries are installed under /opt/homebrew/opt/postgresql@17/bin (Docker is unavailable). Use the bundled Node 24 runtime at /Users/leamonline/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin. Preserve existing tests and add integration into CI where appropriate.

Run focused tests while iterating; finish with docs, lint, typecheck, migration validation, full test suite and build, plus relevant migration-engine regressions. Distinguish unavailable checks from failures. Update docs to clearly label implementation versus operator acceptance. Self-review and commit only your task files, then report results and remaining gates. Do not spawn agents. Do not push or create a PR; the controller handles that.

## Testing and observability

The task test matrix above is acceptance evidence. Receipts bind release digest, source/target, actor, timestamps, SQL identity and per-file/overall outcome, without secrets/customer rows. Record exact commands and results in the implementation report. Fresh GitHub CI must be checked before completion claims.

## Documentation updates and definition of done

A reviewed implementation PR, passing relevant checks, documented operator setup and candid remaining staging/credential gates. Keep this plan active until actual rollout acceptance is evidenced. Repository rules remain binding.

## Open questions

The human-only credential mechanism must be proven; the controller will resolve implementation questions within the approved design, and must not infer authority for account/credential changes.


## Implementation evidence, 16 October 2026

Implementation commits `cc6a14a5` and `55c81ace` implement the local tool, native helper, shared session-held lock, replay control and merge-gate integration. The independent task review identified one missing guarantee for new Actions releases: final postcondition failure could still leave matching ledger SQL. The fix binds new Actions evidence to the exact run attempt and requires successful terminal verification; historical records retain compatibility.

On `55c81ace`, release tests (10), real disposable PostgreSQL matrix, workflow tests (24), full Vitest suite (411 files / 4,395 tests), docs, lint, types, 239-file migration validation and production build pass. Lint reports 66 existing warnings. Native helper compilation and credential-free probe pass. These are local results, not hosted acceptance.

The plan remains active for independent final review, implementation PR checks and the explicit operator acceptance in the [runbook](../../local-production-release.md). No production/staging operation, credential enrolment/read, bootstrap installation, workflow retirement or dependent application merge occurred during implementation.


### Current upstream integration and adoption recommendation

Integrated `origin/main@fffda165` in `75cc4243`; only CHANGELOG required manual conflict resolution, preserving both sections. Fresh merged-tree verification passes 423 files / 4,765 Vitest tests, 10 release tests, the real isolated PostgreSQL matrix, 71 focused tests, docs, lint, types, 240-file migration validation and build.

A read-only check on 16 October confirms that Production now has its required reviewer and run `38805066741` succeeded. #1016 and #1023 are already merged. Retain the hosted route: this implementation is a draft alternative, not an adoption recommendation. Current staging's main-only policy/no overlay cannot satisfy exact-source evidence for an unmerged PR, so a separately reviewed route is an additional acceptance prerequisite. This active issue/plan retains adoption and operator gates; local code verification does not close them.
