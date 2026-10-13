# Operations

**Status:** Active
**Authority:** Operational record for the production database's backup posture
**Issue:** [#986](https://github.com/leamonline/Smarter-dog-bookings/issues/986)
**Last verified:** 13 October 2026 (workflow and procedure; the posture checklist
below is unanswered until the owner fills it in)

Everything else operational lives where it already was: migrations in
[`migrations.md`](migrations.md), hosted-target control in
[`hosted-supabase-target-guard.md`](hosted-supabase-target-guard.md), dated
procedures under [`superpowers/runbooks/`](superpowers/runbooks/). This page
holds only what had no home: whether the customer database has a backup, and
how to get it back.

## Database backup posture

Nothing in the repository can read the Supabase plan or its backup settings;
the owner checks them in the dashboard (Project → Settings → Database →
Backups, and the organisation's Billing page) and records the answer here.
Until this table is filled in, assume **no automated backup exists**: the
README and the advisor notes describe the project as on the Free plan, which
has none.

| Question | Answer |
|---|---|
| Plan tier (Free / Pro / Team) | _unanswered_ |
| Automated daily backups (Supabase-managed) | _unanswered_ (yes / no) |
| Point-in-time recovery (PITR) add-on | _unanswered_ (yes / no) |
| Retention of those backups | _unanswered_ |
| Date checked | _unanswered_ |
| Checked by | _unanswered_ |
| `DATABASE_BACKUP_ENABLED` set to `true`? | _no_ (set it once the rows above are answered, whatever the answer: a copy outside Supabase is cheap) |

When the answer changes (plan upgrade, PITR purchase), update the row and the
date; do not delete the old answer from history.

## The scheduled encrypted dump

[`.github/workflows/database-backup.yml`](../.github/workflows/database-backup.yml)
takes a weekly `pg_dump` of production, **Sundays 03:23 UTC**, and can be run
by hand from Actions → **Encrypted database backup** → *Run workflow* (from
`main` only). Sunday night is as far as the week allows from the Mon–Wed
08:00–14:00 London booking window, and the salon is closed Thursday to Sunday.

**It is off until enabled.** The job is skipped entirely unless the repository
variable `DATABASE_BACKUP_ENABLED` is `true`; merging the workflow changed
nothing.

**How it proves its target.** It is the read-only twin of
*Apply named migrations to production*: it runs under the `production` GitHub
environment, so the same required reviewer approves every run (a scheduled run
waits for that approval and sends the usual notification); its first step
checks the environment really has required reviewers and a deployment branch
policy, that the secrets below reached the job, and that the age recipient is
well-formed, all before checkout; it links production with the explicit ref and
asserts `supabase/.temp/project-ref` immediately before every linked command,
as [`hosted-supabase-target-guard.md`](hosted-supabase-target-guard.md)
requires. It runs no write against production.

**What a backup contains.** One file, `<artifact>.tar.gz.age`, which decrypts
to a tarball of:

| File | Contents |
|---|---|
| `schema.sql` | `supabase db dump` of the `public` and `smarter_dog_private` schemas: tables, functions, triggers, RLS policies, grants, as the CLI emits them (`CREATE … IF NOT EXISTS`) |
| `data.sql` | `supabase db dump --data-only --use-copy` of `public`, `smarter_dog_private`, `auth` and `storage`: every row, including `auth.users` and identities (the CLI excludes `auth.schema_migrations` and `storage.migrations` itself) |
| `manifest.txt` | Project ref, UTC time, run URL, repository commit, CLI version, the schema lists and the SHA-256 of each `.sql` |
| `migration-list.txt` | `supabase migration list --linked` at dump time, so a restore knows which migrations the schema corresponds to |

**What it does not contain.** Cluster roles and their passwords (no
`--role-only`; a new Supabase project already has the standard roles), the
`supabase_migrations` ledger (recreate with `supabase migration repair` after a
real restore), Supabase-managed schemas other than `auth` and `storage`
(`realtime`, `vault`, `extensions`, `supabase_functions`), the **files** behind
`storage.objects` (only their metadata rows), Edge Function code and secrets
(code is in git; secrets are listed by name in `CLAUDE.md`), auth provider
configuration and the dashboard settings in the README's "Manual Supabase
dashboard settings". The workflow refuses to keep a dump whose `schema.sql`
lacks `public.bookings` or whose `data.sql` lacks `public.bookings` or
`auth.users` rows, so a CLI change that silently dropped a schema fails loudly
instead of producing empty backups.

**Where it goes.** A GitHub Actions artifact named
`database-backup-production-<YYYY-MM-DD>-run<id>` on the workflow run, with the
maximum retention GitHub allows (**90 days**). Plaintext exists only in a
private temporary directory on the runner and is removed even when the run
fails. The step summary records sizes and digests, never row content.

**The key.** The dump is encrypted with [`age`](https://age-encryption.org) to
the recipient in `BACKUP_AGE_PUBLIC_KEY`. Make the key pair once, offline:

```bash
age-keygen -o smarter-dog-backup-key.txt     # prints the public key (age1…) to stderr
```

Put the **public** line (`age1…`) in the `production` environment secret. Keep
`smarter-dog-backup-key.txt` (the `AGE-SECRET-KEY-…` line) **offline, held by
the owner**: a password manager entry plus a printed copy in the same place as
the business's other critical papers. It must never be stored in GitHub, in
the repository, in `.env*`, or on a shared drive. **Losing the private key makes
every backup unreadable**; rotate by generating a new pair, replacing the
secret, and keeping the old private key until its last 90-day artifact has
expired. Anyone who obtains the private key and a downloaded artifact has the
whole customer database, so an artifact download is a customer-data access and
needs the authority `AGENTS.md` describes.

### Secrets and variables (names only)

| Where | Name | Purpose |
|---|---|---|
| `production` environment secret | `PRODUCTION_SUPABASE_ACCESS_TOKEN` | Supabase Management API token; already required by the production migration workflow |
| `production` environment secret | `BACKUP_AGE_PUBLIC_KEY` | The `age1…` recipient the dump is encrypted to |
| Repository variable | `DATABASE_BACKUP_ENABLED` | `true` to run; anything else skips the job |

Both secrets belong on the environment only, never at repository level, for
the reason `migrations.md` gives: an unconfigured environment must fail closed.

## Restoring into a scratch project

A restore is **always** into a fresh, disposable Supabase project first, never
into production. The scratch project holds real customer data from the moment
`data.sql` loads, so it is customer-data access: it needs the owner's
authority, and the project is deleted when the drill is written up. Commands,
on a machine with `age`, `tar` and `psql` (the `age` apt package on Ubuntu;
`brew install age` on macOS):

```bash
# 1. Download the artifact from the workflow run (Actions → the run → Artifacts),
#    then decrypt and unpack it. age asks nothing if the identity file is given.
age --decrypt --identity smarter-dog-backup-key.txt \
  --output backup.tar.gz database-backup-production-<date>-run<id>.tar.gz.age
mkdir restore && tar -xzf backup.tar.gz -C restore
cat restore/manifest.txt
sha256sum restore/schema.sql restore/data.sql   # must match the manifest

# 2. Create a scratch project in the dashboard (any region; Free plan is fine)
#    and copy its direct connection string from Connect → Session pooler or
#    Direct. Export it for this shell only; never write it to a file.
export SCRATCH_DB_URL='postgresql://postgres.<scratch-ref>:<password>@<host>:5432/postgres'

# 3. Restore. The two REVOKEs are what Supabase documents for restoring a dump
#    into a new project (and what staging-tranche1-smoke.yml does): without
#    them every restored table would inherit anon/authenticated privileges that
#    production never granted. session_replication_role=replica lets the data
#    load without firing the booking gates and audit triggers.
psql --single-transaction --variable ON_ERROR_STOP=1 --dbname "$SCRATCH_DB_URL" \
  --command 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;' \
  --command 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;' \
  --file restore/schema.sql
psql --single-transaction --variable ON_ERROR_STOP=1 --dbname "$SCRATCH_DB_URL" \
  --command 'SET session_replication_role = replica;' \
  --file restore/data.sql

# 4. Prove it is a database, not a file: counts should match the sizes staff
#    recognise, and the capacity trigger should still refuse an overbooking.
psql --dbname "$SCRATCH_DB_URL" --command \
  "select (select count(*) from public.bookings) as bookings,
          (select count(*) from public.dogs) as dogs,
          (select count(*) from public.humans) as humans,
          (select count(*) from auth.users) as auth_users;"

# 5. Delete the scratch project in the dashboard, then the local plaintext.
rm -rf restore backup.tar.gz
```

If `data.sql` fails on an `auth` table, the scratch project's Auth service is
on a newer schema than the dump; restore `schema.sql` plus `data.sql` with
`auth` filtered out (`grep -v '^COPY "auth"\.'` is not enough: cut from the
`COPY "auth".` line to its `\.` terminator), note it in the drill log, and raise
an issue, because account recovery then needs a hand-written step.

A restore **into production** is not a procedure this page grants: it is a
production write under [ADR 006](architecture/decisions/006-manual-target-verified-database-rollout.md)
and needs its own authorised, reviewed plan at the time, built from a passed
drill.

## Restore drill log

One drill before the workflow is trusted, then at least one a year and after
any change to the workflow or the dump's contents. Record the wall-clock time
from artifact download to the counts query. No customer values in this table.

| Date | Artifact | Scratch project ref | Duration | Result | Notes |
|---|---|---|---|---|---|
| _none yet_ | | | | | First drill is acceptance criterion 2 of #986 |
