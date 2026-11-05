# Operations

**Status:** Active
**Authority:** Operational record for the production database's backup posture
**Issue:** [#986](https://github.com/leamonline/Smarter-dog-bookings/issues/986)
**Last verified:** 27 October 2026 (scheduled backup repaired and verified;
full hosted database/account/Storage drill passed; see the dated evidence below)

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
As answered below, the project is on the Free plan, so **Supabase keeps no
backup of its own**: the encrypted dump in the next section is the only copy
outside the live database.

| Question | Answer |
|---|---|
| Plan tier (Free / Pro / Team) | **Free** (organisation `igfmzgmalwntolwhavoa`, read from the Supabase Management API) |
| Automated daily backups (Supabase-managed) | **No**: the Free plan has none |
| Point-in-time recovery (PITR) add-on | **No** (not available on Free) |
| Retention of those backups | n/a: the only copy outside the live database is the encrypted dump below (90-day artifact retention) |
| Date checked | 19 October 2026 |
| Checked by | Claude Code, for the owner (#986) |
| `DATABASE_BACKUP_ENABLED` set to `true`? | **Yes**, 19 October 2026. The first run, [39190407921](https://github.com/leamonline/Smarter-dog-bookings/actions/runs/39190407921), was owner-approved and succeeded |

When the answer changes (plan upgrade, PITR purchase), update the row and the
date; do not delete the old answer from history.

## The scheduled encrypted dump

[`.github/workflows/database-backup.yml`](../.github/workflows/database-backup.yml)
takes a weekly `pg_dump` of production, **Sundays 03:23 UTC**, and can be run
by hand from Actions → **Encrypted database backup** → *Run workflow* (from
`main` only). Sunday night is as far as the week allows from the Mon–Wed
08:00–14:00 London booking window, and the salon is closed Thursday to Sunday.

**It is enabled (19 October 2026).** The job is skipped entirely unless the
repository variable `DATABASE_BACKUP_ENABLED` is `true`, and that variable is now
set. Manual runs wait for the `production` reviewer; scheduled runs use the
separate environment described below and need no reviewer approval. Enabled
scheduling is not evidence of a successful scheduled backup.

**27 October evidence.** The [25 October scheduled run](https://github.com/leamonline/Smarter-dog-bookings/actions/runs/40177159579)
failed in the target/precondition step: no `PRODUCTION_SUPABASE_ACCESS_TOKEN`
reached the job. The environment's secret-name inventory contained only
`BACKUP_AGE_PUBLIC_KEY`; no secret value was read. Production linking, dumping
and artifact upload were skipped. The [19 October manual run](https://github.com/leamonline/Smarter-dog-bookings/actions/runs/39190407921)
was the only successful run before the repair described below. Its
2,821,176-byte artifact is unexpired, with expiry on 17 January 2027. This proves
retention of an encrypted artifact, not a fresh restore or a successful schedule.
**Repair:** the existing authenticated CLI credential was supplied directly to
the scheduled environment's missing secret, without printing it or writing it
to a local file. [Run 40177159579, attempt 2](https://github.com/leamonline/Smarter-dog-bookings/actions/runs/40177159579/attempts/2)
then succeeded on 27 October with `event=schedule`. Its new encrypted artifact
`database-backup-production-2026-10-27-run40177159579` is retained until
25 January 2027; it decrypted with the owner's existing identity and both SQL
digests matched its manifest. This is a successful rerun of a scheduled event;
the next newly scheduled Sunday execution remains an observation gate.

**How it proves its target.** It is the read-only twin of
*Apply named migrations to production*. A run started **by hand** still looks
for a required reviewer on the `production` environment. That check was left
in place here when the migration workflow dropped it on 3 November 2026, so a
backup you start by hand will still refuse while the repository is private.
The migration steps are in [migrations.md](migrations.md#how-to-apply-a-migration).
A run started **by hand** runs under the `production` GitHub environment.
The **scheduled** Sunday run runs under `production-scheduled-backup`, which
has no reviewers (see "Scheduled runs need no approval" below). Either way its
first step checks, before checkout, that the environment for this trigger
exists; that `production` has required reviewers (manual runs) or that
`production-scheduled-backup` can deploy only from `main` (scheduled runs);
that the secrets below reached the job; and that the age recipient is
well-formed; it links production with the explicit ref and
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

**File backup route.** [PR #1144](https://github.com/leamonline/Smarter-dog-bookings/pull/1144)
adds [the Storage archive utility](../scripts/operations/storage_archive.py)
and a separate weekly file archive. The SQL artifact is uploaded first, so a
file-backup failure cannot discard it; file failure still fails the job. The
separate `storage-backup-production-<date>-run<id>` artifact has the same
90-day retention. Its encrypted manifest includes bucket configuration, object
paths, content types, lengths and SHA-256 values; object bytes are included.
The utility rejects a changed source inventory, failed/missing downloads,
size/digest mismatches and replacement of an existing backup file. Restore
rejects production and persistent staging, validates the archive before remote
writes, restores buckets privately, and re-downloads every object for comparison.
Until that PR is merged and exercised, the scheduled workflow on `main` remains
**database-only**. The tested one-off file archive is recorded below.

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

Put the **public** line (`age1…`) in the `BACKUP_AGE_PUBLIC_KEY` secret of
**both** environments, `production` and `production-scheduled-backup`. Keep
`smarter-dog-backup-key.txt` (the `AGE-SECRET-KEY-…` line) **offline, held by
the owner**: a password manager entry plus a printed copy in the same place as
the business's other critical papers. It must never be stored in GitHub, in
the repository, in `.env*`, or on a shared drive. **Losing the private key makes
every backup unreadable**; rotate by generating a new pair, replacing the
secret **in both environments at once** (a missed copy keeps encrypting Sunday
backups to the old key), and keeping the old private key until the last
artifact encrypted to it, manual or scheduled, has passed its 90-day expiry. Anyone who obtains the private key and a downloaded artifact has the
whole customer database, so an artifact download is a customer-data access and
needs the authority `AGENTS.md` describes.

### Secrets and variables (names only)

| Where | Name | Purpose |
|---|---|---|
| `production` environment secret | `PRODUCTION_SUPABASE_ACCESS_TOKEN` | Supabase Management API token; already required by the production migration workflow |
| `production` environment secret | `BACKUP_AGE_PUBLIC_KEY` | The `age1…` recipient the dump is encrypted to |
| `production-scheduled-backup` environment secret | `PRODUCTION_SUPABASE_ACCESS_TOKEN` | Its own copy, for the Sunday scheduled run |
| `production-scheduled-backup` environment secret | `BACKUP_AGE_PUBLIC_KEY` | Its own copy of the same `age1…` recipient |
| Repository variable | `DATABASE_BACKUP_ENABLED` | `true` to run; anything else skips the job |

**Scheduled runs need no approval** (owner decision, 19 October 2026). The
Sunday run uses `production-scheduled-backup`, an environment with no required
reviewers, so a week's backup is not lost because nobody approved it. It stays
safe because that environment can deploy only from `main`, only the `schedule`
event may use it (the workflow's first step refuses anything else), and a
schedule runs the copy of the workflow already merged to `main`. A run started
by hand still goes through `production` and its reviewer. Reverting this means
pointing the job back at `production` alone and deleting the extra environment.

Both secrets belong on the environment only, never at repository level, for
the reason `migrations.md` gives: an unconfigured environment must fail closed.

## Restoring into a scratch project

A restore is **always** into a fresh, disposable Supabase project first.
The [database recovery drill runbook](runbooks/database-recovery-drill.md)
sets out target checks, outbound isolation, protected artifact handling,
full-schema restoration, synthetic account and permissions checks, file recovery
and cleanup. The [execution plan](plans/active/2026-10-27-database-recovery.md)
records the sequence and remaining external inputs.

The scratch project holds real customer data once the dump is loaded. Confirm
owner authority and the exact disposable target before accessing the artifact.
Production (`nlzhllhkigmsvrzduefz`) and existing staging
(`btjnxvgkpdbfrrqxvkfj`) are excluded targets. The project list checked on
27 October contained only these two projects; no disposable target was present.
Keep credentials out of chat, shell arguments, history and committed files.

A schema mismatch in `auth` or nonempty `storage` data fails the full drill. Investigate it and
retry on a fresh isolated target with a reviewed compatibility step. Removing
those COPY blocks can support a separately labelled partial diagnostic restore;
it cannot satisfy account or storage recovery. Compare restored aggregates with
the **artifact snapshot**, rather than later live counts that may have changed.

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
| 19 Oct 2026 | `database-backup-production-2026-10-19-run39190407921` | none: local PostgreSQL 17.11 scratch cluster (see below) | about 2 minutes, download to counts | **Partial**: `public` and `smarter_dog_private` restored and verified; `auth` and `storage` not loaded | First drill (#986). Owner-authorised; run by Claude Code |

**19 October 2026 drill, in detail.** The artifact decrypted with the offline
key, and both SHA-256 digests matched `manifest.txt`. `schema.sql` restored with
no errors on PostgreSQL 17 (production's major version: PostgreSQL 15 rejects
the dump's `MAINTAIN` grants). `data.sql` restored once the `auth` and
`storage` `COPY` blocks and their sequence resets were cut out, because a plain
PostgreSQL has neither Supabase service's tables. Restored counts matched live
production exactly: 783 bookings, 1,160 dogs, 952 humans, 1,561 booking
events, 2,985 WhatsApp messages, 66 public tables. The `auth` and `storage`
rows were counted in the dump instead of loaded, and also matched production:
271 `auth.users` with 271 identities, and 19 `storage.objects`. With triggers
on, in a rolled-back transaction, two dogs were accepted into one slot and a
third was refused with `Slot is full`, so the capacity gate survives a
restore. Every plaintext file and the scratch cluster were deleted afterwards.

**Historical limitation.** The 19 October operator did not perform a hosted
Supabase restore. **This drill does not satisfy "one drill before the workflow
is trusted"**: loading `auth` and `storage` into a disposable Supabase project,
and proving account access, remain outstanding. The current route is the
[completion runbook](runbooks/database-recovery-drill.md); credentials require
an authorised secure hand-off. The historical counts show data in the dump,
not that the full account and file recovery paths work.


### 27 October 2026: full hosted drill

Owner authorised temporary staging pause, one disposable project, customer-data
restore/testing, disposable-project deletion and staging resumption. Target
`kbhbprffdorhbmklzaro` was checked empty before use; production was never a
restore target. The PostgreSQL 17 Supabase target received the 19 October
artifact above. Approximately **12 minutes** elapsed from local decryption/schema
preparation (17:59 UTC) to the final hosted permission check (18:11 UTC), including
compatibility diagnosis and retries. This excludes the earlier artifact download,
project provisioning and later cleanup; it is not a promised recovery time.

| Check | Verified result |
|---|---|
| Integrity | Existing key decrypts old and newly scheduled artifacts; SQL digests match both manifests |
| Full snapshot comparison | All 105 COPY-table totals match before deliberate isolation/fixture changes; no snapshot rows omitted |
| Application rows | 783 bookings, 1,160 dogs, 952 humans; 66 public and 6 private tables |
| Accounts | 271 users and 271 identities restored; copied sessions revoked and copied accounts banned in scratch |
| Relationships | 165 restored foreign keys checked explicitly; zero orphan rows |
| Capacity | Normal trigger mode: two legal rows persisted, third rejected with `Slot is full`; transaction rolled back and fixture dogs absent |
| Account access | Synthetic Auth user and identity exported, deleted and reimported; original password signs in and `/auth/v1/user` returns its expected identity; no email/SMS requested |
| Permissions | Anonymous human access denied; actual customer JWT sees only its own synthetic human; staff profile permits both synthetic humans; private Storage denies anonymous and never-staff customer, while staff file bytes match |
| Managed-schema customisations | Four Storage policies reconstructed from migrations at artifact commit `ab23036ae55fc54125a947babd85bbea259ab0f0` |
| Outbound isolation | Nine outbound trigger paths disabled; no cron or pg_net extension, deployed application functions or copied provider credentials; restored WhatsApp message count remains 2,985 |
| File bytes | Independent encrypted archive: 2 buckets, 19 objects, 13,363,551 bytes; decrypted archive restored to scratch with every object re-downloaded and SHA-256 matched |

**Two restore corrections were necessary.** Supabase owns
`storage.buckets_vectors` and `storage.vector_indexes` and rejects their COPY
under the standard restore role. Both blocks were empty; removing only those
empty blocks loses zero rows and matches current Supabase restore guidance.
The target's empty vector-table counts were still compared. Also,
`trg_log_booking_capacity_event` is an **ALWAYS** trigger: replica mode alone
created 783 extra audit rows on the initial import. The clean repeat explicitly
disabled all application triggers during COPY, then restored their saved modes
(except intentionally isolated outbound triggers). All 105 table totals then
matched. Do not treat `SET session_replication_role=replica` alone as sufficient.

**Synthetic account evidence** used a fixture export/delete/reimport within the
isolated target. It does not claim that a real customer's password was tested.
Generated Auth columns were omitted from the fixture INSERT and regenerated by
PostgreSQL. Customer and staff permission checks used user JWTs, not service-role
requests. A separate never-staff account supplied the Storage customer-negative
check; the test does not claim instant revocation of previously granted file
access on an existing staff session.

**File archive custody.** The encrypted one-off archive is at
`~/.local/share/smarter-dog/backups/storage-production-2026-10-27-986.tar.gz.age`
(owner-only directory/file permissions, outside iCloud), SHA-256
`cd4aff344c511bd175fce08cb13edbbb06f7ea1825914080cf96abf41ef13a13`.
The reusable command was also tested read-only against production and produced
another complete encrypted archive. These file archives are from 27 October;
they are not falsely presented as a 19 October historical file snapshot. The
SQL backup contains no historical object bytes. No file loss was accepted.

The scratch project was deleted and absent from a fresh project listing;
staging was resumed and freshly verified **ACTIVE_HEALTHY**. All temporary local
plaintext, raw logs and temporary credentials were removed. The
[aggregate evidence record](research/2026-10-27-recovery-drill-evidence.json)
contains no customer identifiers or credential values. The original offline
identity and retained encrypted archives are preserved.
