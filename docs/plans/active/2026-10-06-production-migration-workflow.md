# Production migration workflow and the Supabase MCP permission guard

**Status:** Active
**Authority:** Implementation plan for the production apply path (ADR 006's manual gate, made executable)
**Issue:** [#957](https://github.com/leamonline/Smarter-dog-bookings/issues/957) (opened retrospectively on 6 October 2026; delivered by [PR #956](https://github.com/leamonline/Smarter-dog-bookings/pull/956))
**Base:** `main@a45d298` (6 October 2026)
**Last verified:** 6 October 2026
**Owners:** `.github/workflows/production-apply-migrations.yml`, `scripts/apply-hosted-migrations.sh`, `.claude/settings.json`, `.claude/hooks/guard-supabase-apply-migration.sh`, `src/security/productionApplyMigrationsWorkflow.test.ts`
**Dependencies:** None (the `production` GitHub environment is external configuration, listed under Migration/rollout)
**Related requirements:** [Product requirements](../../product/requirements.md) (release integrity)
**Related ADRs:** [ADR 006](../../architecture/decisions/006-manual-target-verified-database-rollout.md)

## Goal

A production migration is applied only by a manual, approval-gated workflow
that proves its target, its files, its ledger effect and a behavioural
postcondition, with the run as the evidence record; and an agent session can
apply migrations to staging without a prompt while production still needs a
person per call.

## Why

Production migrations were applied in the Supabase SQL editor by hand. On
5 October 2026 one "applied" claim had not landed and had to be redone and
re-verified by hand ([migrations.md](../../migrations.md), "Drop unused humans
columns"). Staging already had a transaction-with-ledger-row apply path with
its own environment gate; production did not.

## Current behaviour

Confirmed on `main@a45d298`:

- `scripts/apply-hosted-migrations.sh` hard-coded the staging ref and refused
  anything else; `staging-apply-migrations.yml` ran it under the `staging`
  environment.
- No workflow applied migrations to production. `check-migrations-applied.yml`
  gates merges by matching a ledger row by version, stripped name or full
  basename.
- `.claude/settings.json` held only a SessionStart hook; every
  `mcp__Supabase__apply_migration` call prompted.

## Desired behaviour

- **Apply named migrations to production** runs only on manual dispatch from
  `main` under the `production` environment, with the exact production ref
  typed, a reviewed commit SHA for the migration files, the file list, and a
  read-only postcondition; it fails closed at every step that does not hold.
- The shared script applies each file in one transaction with its ledger row,
  recognises a recorded migration by any of the three ledger identities, skips
  it only when the SQL last recorded equals the committed file, appends
  re-applied SQL as evidence, verifies every requested migration afterwards
  and runs the postcondition inside a read-only transaction and a scalar
  subquery.
- `mcp__Supabase__apply_migration` is allowed for staging only; a PreToolUse
  hook sends any other project ref back to the permission prompt.

## Scope

The workflow, the shared script, the hook and permission, their pinning tests,
and the operator documentation in [migrations.md](../../migrations.md).

## Non-goals

- Changing how staging is applied (its workflow YAML is byte-identical).
- Tightening `check-migrations-applied.yml` to compare content as well as
  names.
- Any automatic production migration on push, merge or schedule (ADR 006).
- Creating or configuring the GitHub environment from a workflow.

## Relevant code

- [`production-apply-migrations.yml`](../../../.github/workflows/production-apply-migrations.yml): the gate.
- [`apply-hosted-migrations.sh`](../../../scripts/apply-hosted-migrations.sh): the one apply path for both environments.
- [`guard-supabase-apply-migration.sh`](../../../.claude/hooks/guard-supabase-apply-migration.sh) and `.claude/settings.json`: the permission and its guard.
- `src/security/productionApplyMigrationsWorkflow.test.ts` and `stagingApplyMigrationsWorkflow.test.ts`: pin every safety property above.
- `scripts/check-hosted-supabase-targets.mjs` (run by `npm run lint`): the adjacent link-state assertion before every linked command.

## Architecture

Trust boundary: the `production` GitHub environment (required reviewer, `main`
only branch policy, environment-only `PRODUCTION_SUPABASE_ACCESS_TOKEN`). The
workflow file and script run from `main`; only `supabase/migrations/` is taken
from the named commit, so a branch cannot carry a weakened workflow into
production. PostgreSQL's ledger (`supabase_migrations.schema_migrations`) is
the source of truth for what was applied; the run log and step summary are the
evidence record ADR 006 requires.

## Data/database changes

None to schema. Ledger rows gain an appended `statements` element on a
re-apply (append-only; no row is rewritten or duplicated).

## API changes

None.

## UI changes

None.

## Security/privacy considerations

- No repository-level token can run the workflow: an auto-created, unprotected
  environment has no environment secret, so the first step refuses.
- Inputs reach the shell only through `env`; the postcondition is refused if it
  contains a semicolon or backslash or does not start with `SELECT`, and runs
  inside `select (…)` in a read-only transaction.
- No customer data or secret value is printed; the SQL printed is committed
  code.
- The MCP allow rule never covers production without a human prompt.

## Dependencies

External: the `production` environment with a required reviewer, deployment
branch policy `main`, and the `PRODUCTION_SUPABASE_ACCESS_TOKEN` environment
secret. None of these can be created from this repository.

## Risks

- A migration whose ledger row was recorded by another tool with different
  `statements` text stops the run as a mismatch; the message tells the
  operator to drop it or re-apply it. Detection: the run fails before writing.
- A ledger row sharing only a file's version under another name (a known
  production condition) stops the run as a conflict; nothing is written to it.
- A file carrying its own `begin;`/`commit;` has those lines removed so the
  apply's transaction, with the ledger row, is the only one; any other
  top-level transaction control, psql meta-command or variable interpolation
  is refused.
- The postcondition runs as `anon`: it reads the catalogs in full, sees
  tables only as an anonymous API client would (grants and row-level
  security apply), and cannot use privileged functions, so an operator's
  check cannot signal other sessions and reaches no more data than the
  public API does.
- The CLI's temporary login on production is assumed to behave as on staging
  (`set role postgres`); only the first real dispatch proves it. Detection: the
  before-state listing fails before any apply.
- Hook precedence: the PreToolUse `ask` decision is relied upon to override
  the allow rule; confirm once in a live session after merge. The hook path
  is quoted with a working-directory fallback so a path with spaces or an
  unset variable cannot stop it launching (a launch failure is non-blocking).
- A superseded pull request head: the overlay step confirms through the
  GitHub API that the commit is on `main` or the current head of an open
  pull request into `main` before any file is taken from it.

## Migration/rollout

1. Merge PR #956 (no schema change; CI green).
2. Configure the `production` environment (reviewer, branch policy, secret).
3. Smoke test: dispatch with a wrong `confirm_production_ref`; expect failure
   at the first step before checkout, with the environment approval recorded.
4. First real use: staging first, then production with the pull request head
   SHA and a postcondition, before that pull request merges.

Rollback: the workflow is additive; disabling it is deleting the file or the
environment. A migration applied by it rolls back per migration, as ADR 006
states.

## Implementation sequence

Delivered in PR #956 (commits 249b6f3, f1d49c7, 4260d69 and the Codex
round-three fixes): workflow, script, hook, tests, docs. No further steps
before merge.

## Testing

- `npx vitest run src/security/` (workflow and script pins, runner pin, Node
  pin, migration-name parity); `npm run lint` (hosted-target guard),
  `npm run check:docs`, `npm run typecheck`, `npm run test`.
- Offline: eleven target-gate cases plus postcondition and re-apply refusals,
  all failing closed before any hosted command.
- Throwaway local database with a stub `supabase` binary: first apply, skip
  with matching content, mismatch after an edit, re-apply appending evidence,
  basename- and version-keyed legacy rows, failing file rolled back, false
  postcondition, read-only postcondition, production opt-in.

## Observability

The run's step summary (who, which commit, which files, verified ref,
postcondition, per-migration lines, each step's outcome) and the before/after
`supabase migration list --linked` output. The weekly migration-drift and
advisor audits remain the alarms.

## Documentation updates

[migrations.md](../../migrations.md) (production section, MCP permission
section), [hosted-supabase-target-guard.md](../../hosted-supabase-target-guard.md)
inventory, README, CLAUDE.md, ADR 006 implementation-state note. All in PR #956.

## Definition of done

- PR #956 merged with CI green and every Codex thread resolved.
- `production` environment configured as above and the wrong-ref smoke test
  recorded in [migrations.md](../../migrations.md).
- First real production apply through the workflow recorded with its run URL.
- Then move this plan to `completed/` with that evidence.

## Open questions

- Whether `check-migrations-applied.yml` should also compare content, now
  that the ledger stores it for script-applied rows.
- Whether a dispatched pull request head must carry an *approving* review.
  The workflow requires a non-draft pull request with no outstanding
  changes-requested review and records the approvals it finds in the step
  summary for the environment approver; it does not demand an approval,
  because GitHub does not let an author approve their own pull request and a
  hard requirement would lock out a sole maintainer. That is a product-policy
  choice for the repository owner (6 October 2026, Codex review round six).
