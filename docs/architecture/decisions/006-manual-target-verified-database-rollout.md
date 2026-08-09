# ADR 006: Keep production database rollout manual and target verified

**Status:** Accepted — current release model
**Date:** 9 August 2026
**Related issues/PRs:** Issues #603 and #607; no implementation PR recorded
**Applies to:** Every hosted Supabase schema or data migration

## Context

Vercel and Edge Functions deploy automatically from `main`; database
migrations do not. The repository has a per-change applied-migration check and
a scheduled full drift audit, but applying schema remains an explicit hosted
operation. Historical migration tracking also includes name/version
differences, so blindly replaying all local files is unsafe.

Automatic production migration would increase the effect of a mistaken target,
ordering error or incompatible application release. The current operational
scale benefits more from a small explicit gate than from a new deployment
orchestrator.

## Options considered

1. Apply every committed production migration automatically on merge.
2. Let runtime code deploy first and repair schema drift when detected.
3. Keep exact migration application manual, prove the target before writing
   and verify postconditions before dependent code merges.

## Decision

Production database rollout remains manual. Every operation must prove both
the target and the exact change before it writes.

- Name the intended environment and project reference.
- Confirm the authenticated/linked project reference matches that target.
- Identify the exact migration filename and reviewed content; apply only that
  named migration unless a separately reviewed sequence is explicitly
  authorised.
- Preview migration state where the tool supports it.
- Do not treat a frontend/Edge deploy, local migration replay or green PR test
  as evidence that production schema changed.
- After applying, verify migration-history evidence and the migration's
  behavioural postconditions against the same target.
- Re-run the repository migration gate before merging dependent runtime code.
- Record the target, change, actor/approval, time and verification evidence in
  the release record without copying secrets or customer data.

Commands that can accept an explicit project reference should receive it
directly. Commands that rely on link state require a read-only assertion before
the write. A reusable repository-wide assertion is desirable but is not
claimed as implemented by this ADR.

## Rationale

Option 3 matches the repository's existing deployment split and limits the
blast radius of target or ordering mistakes. It also keeps production writes
behind an explicit authority boundary while runtime capabilities address the
remaining compatibility risk.

## Consequences

- Schema-first releases involve a deliberate operational step and cannot be
  inferred from Git history.
- Human target confirmation remains part of the safety boundary.
- Runtime capability checks are still needed because manual rollout and
  application deployment can be individually correct but jointly
  incompatible.
- Rollback must be planned per migration. Additive compatibility and an
  application rollback/forward fix are generally safer than an unreviewed
  destructive down migration.
- The applied/drift workflows are evidence and alarms; account limitations may
  mean a human merge gate is still required.

## Revisit when

Revisit if a deployment system can prove exact target, reviewed migration,
ordering, approval, postconditions and rollback at least as strongly as the
manual gate. Faster execution alone is not sufficient.

## Evidence and implementation state

- **Explicit repository fact:** the README and workflows say migrations are
  manual and do not run on merge.
- **Explicit repository fact:** `migrations-applied` and migration-drift jobs
  compare repository files with the named production project.
- **Explicit repository precedent:** the manual staging workflow requires an
  exact project-ref confirmation before a linked write.
- **Current gap:** the same general target assertion is not yet enforced for
  every possible hosted CLI invocation.

Related: [migration history](../../migrations.md),
[ADR 004](004-serial-schema-convergence-and-runtime-capabilities.md).
