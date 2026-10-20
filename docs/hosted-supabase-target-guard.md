# Hosted Supabase target guard

**Status:** Active
**Authority:** Executable repository target-control contract
**Issue:** [#618](https://github.com/leamonline/Smarter-dog-bookings/issues/618)
**Last verified:** 6 October 2026

## Rule

Every hosted Supabase command must have an unambiguous target before it can
touch that target. Commands supporting `--project-ref` receive it explicitly.
The linked-only database commands below first assert the value stored in
`supabase/.temp/project-ref`; that assertion is read-only and immediately
precedes the hosted command.

`npm run lint` runs `scripts/check-hosted-supabase-targets.mjs`. It scans all
tracked repository files apart from private and archived history, including
runbook code blocks, and fails if it finds a hosted `--linked` command without
that adjacent assertion. A command cannot inherit a check intended for a
previous operation.

This guard does not grant authority for a production operation. Production
migrations, data access, function deployment and secret changes still require
the separate human authority defined in [ADR 006](architecture/decisions/006-manual-target-verified-database-rollout.md).

## Current inventory

| Location | Command | Target control | Capability | Authority boundary |
|---|---|---|---|---|
| `scripts/run-hosted-pgtap.sh` | `supabase db dump --linked --schema public --dry-run` | Caller ref must equal the hard-coded staging ref and differ from production; adjacent link-state assertion | Retrieves ephemeral connection details for staging pgTAP | Script accepts staging only |
| `.github/workflows/staging-apply-migrations.yml` | `supabase link --project-ref "$STAGING_PROJECT_REF"` | Explicit staging ref; staging ref must differ from production | Sets local link state | Named `staging` GitHub environment and manual exact-ref confirmation |
| `.github/workflows/staging-apply-migrations.yml` | `supabase migration list --linked` | Adjacent assertion of `STAGING_PROJECT_REF` | Hosted migration-state read | Named `staging` environment |
| `scripts/apply-hosted-migrations.sh` | `supabase db dump --linked --schema public --dry-run` | Caller ref must equal the hard-coded ref of the declared target: staging by default, production only with `HOSTED_MIGRATION_TARGET=production` and a matching `CONFIRM_PRODUCTION_REF`; the two refs must differ; adjacent link-state assertion | Retrieves ephemeral connection details, then applies the named committed migration files with `psql`, one transaction per file including its ledger row, and fails unless every requested name is recorded afterwards | Staging by default; production only through the manual-only workflow under the `production` environment |
| `.github/workflows/production-apply-migrations.yml` | `supabase link --project-ref "$PRODUCTION_PROJECT_REF"` | Explicit production ref, typed again by the operator as the first step before checkout | Sets local link state | Named `production` GitHub environment with required reviewers and the environment-only `PRODUCTION_SUPABASE_ACCESS_TOKEN` secret (the first step fails closed without it); manual-only dispatch |
| `.github/workflows/production-apply-migrations.yml` | `supabase migration list --linked` (before and after the apply) | Adjacent assertion of `PRODUCTION_PROJECT_REF` | Hosted migration-state read | Named `production` environment |
| `.github/workflows/database-backup.yml` | `supabase link --project-ref "$PRODUCTION_PROJECT_REF"` | Explicit production ref; staging ref must differ; the environment's reviewers (manual runs), its main-only branch policy and both environment secrets checked before checkout | Sets local link state | Manual runs: named `production` environment with required reviewers. Scheduled runs: `production-scheduled-backup`, no reviewers, deployable only from `main` and only by the `schedule` event. Each holds its own environment-only `PRODUCTION_SUPABASE_ACCESS_TOKEN`; skipped unless repository variable `DATABASE_BACKUP_ENABLED` is `true` |
| `.github/workflows/database-backup.yml` | `supabase migration list --linked` | Adjacent assertion of `PRODUCTION_PROJECT_REF` | Hosted migration-state read, recorded inside the encrypted bundle | `production` (manual) or `production-scheduled-backup` (scheduled) |
| `.github/workflows/database-backup.yml` | `supabase db dump --linked` (schema, then `--data-only`) | Adjacent assertion of `PRODUCTION_PROJECT_REF` before each | Production schema and data read, encrypted on the runner with `age` before upload ([`operations.md`](operations.md)) | Read-only; no production write; the artifact is customer data and its download needs separate authority |
| `.github/workflows/deploy-edge-functions.yml` | `supabase functions deploy "$fn" --project-ref "$SUPABASE_PROJECT_REF"` | Explicit ref | Production Edge Function deployment after a merge to `main` | Existing main-merge release policy; not a database migration authority |
| `scripts/generate-flow-keys.mjs`, `scripts/generate-vapid-keys.mjs` and operational runbooks | `supabase secrets set --project-ref "<project-ref>" …` | Explicit placeholder ref that the operator must replace and record | Hosted secret write | Separate human authority and no secret values in evidence |
| Operational runbooks and Edge Function source comments | `supabase functions deploy … --project-ref "<project-ref>"` | Explicit placeholder ref that the operator must replace and record | Hosted function deployment | Separate release authority |

The repository's `supabase test db`, `supabase start`, `supabase status`,
`supabase db reset`, and `supabase gen types … --local` commands are explicitly
local-only. Historical material under `docs/archive/` records past actions and
is not an executable instruction surface.

## Required evidence record

For any authorised hosted operation, record the following without credentials,
SQL containing customer data, or secret values:

```text
environment=<named environment>
expected_project_ref=<exact project ref>
observed_project_ref=<exact linked ref, where linked mode is used>
operation=<exact CLI command class>
head_sha=<reviewed commit>
authorisation=<human approval reference>
result=<pass or failure before write>
```

For linked-only migration operations, fail before the command unless the named
environment is approved, the expected ref is known for that environment, the
link-state file exists and is non-empty, and its value equals that expected
ref. The staging and production workflows and the hosted pgTAP adapter are the
executable examples; do not substitute a local link or a ref from another
environment.

## Draft local release wrapper (adoption and operator acceptance pending)

The working hosted production reviewer gate remains the current route; this
draft alternative does not adopt or recommend replacing it.

The [local release runbook](local-production-release.md) governs
`scripts/release/local-release.mjs`. Preparation and validation use only Git/GitHub.
Execution fixes the target to `nlzhllhkigmsvrzduefz`, requires a signed interactive
Keychain helper, links a clean temporary Supabase project and asserts its ref
immediately before obtaining a short-lived database login. The Node wrapper passes
argument arrays rather than shell fragments; its target assertion is exercised by
release tests rather than the shell-line scanner. It refuses transaction-pooling
ports and uses certificate verification for PostgreSQL. Its shared engine is also
used by the existing staging and production workflows and holds one database-wide
advisory lock across their complete apply sequences.

`scripts/release/merge-gate.mjs` is a read-only Management API consumer. It refuses
any project other than the explicit production ref and checks local attempt status
before the migration gate can pass. Old workflow provenance requires no new table;
local provenance with an absent or unknown attempt fails closed. The proposed
bootstrap SQL is never automatically applied. Human unlock, installation, bootstrap
and staging acceptance remain separate requirements, not grants from this guard.
