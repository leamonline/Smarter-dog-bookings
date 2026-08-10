# Hosted Supabase target guard

**Status:** Active
**Authority:** Executable repository target-control contract
**Issue:** [#618](https://github.com/leamonline/Smarter-dog-bookings/issues/618)
**Last verified:** 10 August 2026

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
| `.github/workflows/staging-tranche1-smoke.yml` | `supabase link --project-ref "$PRODUCTION_PROJECT_REF"` | Explicit production ref | Reads the production schema only after linking | Workflow remains staging-only; no production write |
| `.github/workflows/staging-tranche1-smoke.yml` | `supabase db dump --linked` | Adjacent assertion of `PRODUCTION_PROJECT_REF` | Schema-only production read | No customer data, migration or write |
| `.github/workflows/staging-tranche1-smoke.yml` | `supabase link --project-ref "$STAGING_PROJECT_REF"` | Explicit staging ref; staging ref must differ from production | Sets local link state | Named `staging` GitHub environment and manual exact-ref confirmation |
| `.github/workflows/staging-tranche1-smoke.yml` | `supabase migration list --linked` | Adjacent assertion of `STAGING_PROJECT_REF` | Hosted migration-state read | Named `staging` environment |
| `.github/workflows/staging-tranche1-smoke.yml` | `supabase db push --linked --include-all --dry-run` | Adjacent assertion of `STAGING_PROJECT_REF` | Hosted migration preview | Named `staging` environment |
| `.github/workflows/staging-tranche1-smoke.yml` | `supabase db push --linked --include-all --yes` | Adjacent assertion of `STAGING_PROJECT_REF` | Hosted staging migration write | Named `staging` environment; never production |
| `scripts/run-hosted-pgtap.sh` | `supabase db dump --linked --schema public --dry-run` | Caller ref must equal the hard-coded staging ref and differ from production; adjacent link-state assertion | Retrieves ephemeral connection details for staging pgTAP | Script accepts staging only |
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
ref. The staging workflow and hosted pgTAP adapter are the executable examples;
do not substitute a local link or a ref from another environment.
