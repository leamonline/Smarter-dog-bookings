# Migration history

## Drop unused humans columns — applied 5 October 2026

`20261005190000_drop_unused_humans_columns.sql` removes `humans.customer_notes`
and `humans.phone_normalised` (and, with the generated column, its partial
index `humans_phone_normalised_idx`). Both reached prod through the uncommitted
May 2026 migration `customer_self_register_phone` for the phone-lookup RPC
`link_or_create_customer_human`, which `20260618144000` dropped; nothing has
referenced either since. `humans_phone_unique` is kept.

Pre-apply evidence, read from the prod catalog on 5 October 2026: 948 humans
rows, every `customer_notes` value is the empty string, `phone_normalised` is a
STORED generated column (no data of its own), no function, view, policy or
trigger references either name, and the only dependents are the generated
column's own expression and `humans_phone_normalised_idx`. In the repository
only the generated types, `supabase/tests/237_humans_prod_shape.test.sql` and a
comment in `website/src/utils/phone.js` mentioned them; all three are updated
in the same pull request.

**Applied to prod by hand on 5 October 2026** (project `Smarter-dog-grooming`,
ref `nlzhllhkigmsvrzduefz`) in the Supabase Dashboard SQL editor, as one
transaction together with its ledger row. The Supabase MCP tool could not apply
it: its destructive-statement confirmation also covers `drop column`, and that
confirmation cannot be answered from an agent session, so `apply_migration` and
`execute_sql` both hang until their timeout (three attempts in total, nothing
executed each time: columns, index and ledger unchanged afterwards). The script
that was run:

```sql
alter table public.humans drop column if exists phone_normalised;
alter table public.humans drop column if exists customer_notes;
insert into supabase_migrations.schema_migrations (version, name, statements)
select '20261005190000', 'drop_unused_humans_columns',
       array['alter table public.humans drop column if exists phone_normalised;',
             'alter table public.humans drop column if exists customer_notes;']
where not exists (select 1 from supabase_migrations.schema_migrations
                  where name = 'drop_unused_humans_columns');
```

Post-apply evidence, read from the prod catalog at 20:41 UTC on 5 October 2026
through the MCP (read-only): `information_schema.columns` lists neither
`customer_notes` nor `phone_normalised` for `public.humans` (44 columns before,
42 after); `pg_indexes` lists `humans_phone_unique` and no longer
`humans_phone_normalised_idx`; `pg_depend` shows no remaining dependents on
either attribute; the ledger holds exactly one row for the name, version
`20261005190000`, name `drop_unused_humans_columns`, two statements, which is
now the latest ledger version; `public.humans` has 948 rows before and after.
The ledger row is what CI's `migrations-applied` check reads. Staging follows
after merge through **Apply named migrations to staging** with
`20261005190000_drop_unused_humans_columns.sql`.

## WhatsApp agent-state revision (#938) — applied 4 October 2026

`20261002140000_whatsapp_agent_state_revision.sql` was applied to **prod**
(`nlzhllhkigmsvrzduefz`) through the Supabase MCP on 4 October 2026 as
`whatsapp_agent_state_revision` (ledger version `20261004125800`; ledger
238 → 239 rows), ahead of the dependent Edge deployment, as the file's own
header requires.

Post-apply evidence from the prod catalog: `whatsapp_conversations.agent_state_rev`
is `bigint not null default 0` with its range check and comment; the
`whatsapp_agent_state_revision` BEFORE UPDATE trigger is enabled;
`bump_whatsapp_agent_state_revision()` is not executable by `anon` or
`authenticated`; `compare_and_set_whatsapp_agent_state(uuid,bigint,jsonb)`
is SECURITY DEFINER and executable by `service_role` only. All 399
conversations sit at revision 0. The legacy write path in the deployed
Edge function keeps working: the trigger advances the revision for it.

## Humans reconciliation and signup-claim fix (#939) — applied 4 October 2026

Both migrations were applied to **prod** (`nlzhllhkigmsvrzduefz`) through the
Supabase MCP on 4 October 2026, in file order, with the names the checks
expect: `reconcile_humans_with_prod` (ledger version `20261004124020`) and
`signup_claim_detects_existing_name` (`20261004124106`). Ledger: 236 → 238
rows.

Post-apply evidence, read from the prod catalog: `submit_customer_signup`
no longer contains `unique_violation` and carries the explicit
`(name, surname)` lookup; it is still SECURITY DEFINER, executable by
`authenticated` only (not `anon`, not `public`); the `claims_human_id`
column comment is the new text; `public.humans` is unchanged (44 columns,
8 indexes, 948 rows, `surname` nullable, no `humans_name_surname_key`),
which is what a no-op reconciliation should look like.

**Staging (`btjnxvgkpdbfrrqxvkfj`) caught up on 5 October 2026.** Thirteen of the
twenty-five repository migrations missing from its ledger were applied through
the Supabase MCP on 4–5 October; the twelve the MCP tool refuses (any file
containing `drop function`/`drop trigger`/`delete from`) went through
**Apply named migrations to staging** run #4
(<https://github.com/leamonline/Smarter-dog-bookings/actions/runs/37355624432>),
which also re-applied `20260919130000_reconfirmed_from_customer_confirmation`
after the older `staff_booking_confirmation` so staging keeps the newer
`reset_reminder_on_reschedule()`. `expand_booking_statuses` is deliberately
skipped: staging already carries the contracted status check. Post-apply
evidence: every repository migration name is in the staging ledger, and the 16
functions, 2 triggers, 4 tables and 5 cron jobs those files touch fingerprint
identically on staging and prod, except that `mark_reminder_confirmed` and
`reset_reminder_on_reschedule` differ in SQL comments only (prod was applied
from a revision of that file without them; with comments and whitespace
normalised the two bodies hash identically). Staging-only ledger names
(`prod_baseline`, `canonical_booking_statuses`, `contract_booking_statuses_v2`,
`preserve_reconfirmed_booking_event`, `reconfirmed_from_customer_confirmation_v2`)
remain from earlier rehearsals.

`supabase/migrations/` is a near-complete record of prod schema
history.

## Payment history migration (#879) — applied 27 September 2026

`20260927160000_booking_payment_history.sql` adds atomic payment snapshots and
guarded staff recovery; see [payment history](payment-history.md). It was applied
to the explicitly verified production project as migration
`20260927145955 booking_payment_history`. No backfill or report-authority change
was included. Records have no automatic expiry; retention and authorised
disposal remain an owner-policy follow-up.

## Gaps in `supabase_migrations.schema_migrations` on prod

Two small differences between the repo and the prod tracking table:

- `20260330095121_initial_schema.sql`,
  `20260330095135_auth_staff_profiles.sql`, and
  `20260330095217_phase5_schema.sql` were applied before Supabase's
  migration-tracking table was in use. They are present in this
  repo but not in `supabase_migrations.schema_migrations` on prod.
- `20260422004157_reminder_preferences.sql` was applied via the
  Supabase dashboard rather than as a tracked migration. The
  columns (`humans.reminder_hours`, `humans.reminder_channels`)
  exist on prod, but the file isn't in the migration history table.

### Prod-only migrations found 4 October 2026

A name-by-name comparison of the prod ledger against the repo (versions
cannot be compared: a migration applied through the MCP is recorded under
the MCP's own timestamp, and some repo filenames reuse a timestamp the
ledger holds under a different name) found more than the two cases above.
Five ledger rows have no committed file and no renamed equivalent:
`relax_human_uniqueness` (30 April), `customer_self_register_phone`
(5 May), `fix_link_customer_to_human_phone_ambiguity` (13 May, later
superseded by `20260618144000_drop_link_or_create_customer_human`),
`notification_log_idempotency` and `update_customer_dog_rpc_v2`.

The first two left `public.humans` in a shape no committed migration
describes: a nullable `surname`, no `unique (name, surname)`, a
`customer_notes` column, a generated `phone_normalised` column with its
partial index, and the `humans_phone_unique` partial unique index. A
database rebuilt from committed history therefore differed from prod on
all five, and `src/supabase/database.types.ts` could not be regenerated
from migrations without losing them.
`20261004120000_reconcile_humans_with_prod.sql` restates that shape
idempotently (a no-op on prod and staging, which must still record it in
the ledger), and `supabase/tests/237_humans_prod_shape.test.sql` pins it.
The remaining three ledger-only rows are function-level and have not been
diffed against their committed successors.

Reconciling exposed a live bug. `submit_customer_signup` (September's
signup-claims feature) detected "this name belongs to an existing
customer" by catching the `unique_violation` from `unique (name, surname)`,
a constraint prod no longer had, so on prod the claim path never fired and
such signups became silent duplicates. pgTAP 184 failed the moment the local
schema matched prod. `20261004121000_signup_claim_detects_existing_name.sql`
replaces the catch with an explicit lookup; unlike the reconciliation it is
a real change on prod (the feature starts working as reviewed) and
`src/security/signupClaimsMigration.test.ts` forbids the constraint catch
from returning.

## Letter-suffixed filenames

Files with letter suffixes (e.g. `012a_…`, `017a_…`) are backfills
of migrations that were originally applied via the dashboard. They
slot in alphabetically between the main-numbered files so `ls`-order
still reflects apply-order.

## Fresh-project setup

Run the files in filename order:

```bash
ls supabase/migrations/*.sql | sort
```

For each file, paste into the Supabase SQL editor and run.

## Checklist: every new function needs an explicit revoke block

Supabase's default privileges grant EXECUTE on new `public` functions
to `anon` and `authenticated`. RPC migrations already follow the
revoke-then-grant pattern; **trigger-function migrations keep missing
it** — the class was fixed in `20260625120000`, regressed within 48
hours (`20260625140000`, `20260627150000`, `20260627160000`), and was
re-fixed in `20260701213000`. When a migration creates *any* function —
trigger functions included — end it with:

```sql
revoke execute on function public.<fn>(<args>) from public, anon, authenticated;
-- then grant back only the roles that must call it directly
```

Trigger functions still fire after the revoke — triggers don't check
EXECUTE privilege — so there is never a reason to skip this.

The class regressed again across the booking-policy visit batch
(`20260726144000` .. `20260726144013`), which created 21 trigger
functions with no revoke block. A wider audit then found something
worse: several older trigger functions (`fire_whatsapp_agent`,
`notify_on_booking_*`, `bump_conversation_unread` and others) were
hardened **directly against production and never in a migration**, so a
database rebuilt from committed history alone came out *less* locked
down than production. `20260731100000_revoke_anon_trigger_function_grants.sql`
closes both gaps and makes the committed history the whole truth.

`supabase/tests/179_trigger_function_grants.test.sql` now fails the
moment any `public` trigger function is executable by `anon` or
`authenticated`, so this cannot regress silently again. If that suite
fails, the fix is always the missing revoke block — never a grant.

## Checklist: every outbound trigger must guard its POST

A trigger function that calls `net.http_post` needs the call wrapped:

```sql
begin
  perform net.http_post(...);
exception when others then
  raise warning '<fn>: outbound notification failed (%) — the write is unaffected', sqlerrm;
end;
```

An AFTER trigger still runs **inside the originating transaction**, so
anything it raises aborts that transaction. Without the guard, a Vault
hiccup or a pg_net problem stops being "the confirmation message failed"
and becomes "the customer could not book".

Five functions shipped without it — `notify_on_booking_insert`,
`notify_on_booking_cancelled`, `notify_on_booking_ready`,
`notify_waitlist_joined_trigger` and `fire_whatsapp_agent` — two of them
directly on `bookings`. `20260916120000_guard_outbound_notification_triggers.sql`
closes them. `supabase/tests/224_outbound_trigger_guards.test.sql` fails the
moment a new one appears, and also proves the behaviour end to end by
sabotaging `get_supabase_url()` and asserting the writes still commit.

Prefer `raise warning` over a bare `null` on customer-facing notification
paths: it changes no transaction semantics but leaves a trail, so a broken
path is discoverable from the logs rather than from a customer complaint.

## ⚠️ Don't blindly re-run old migrations

Some early migrations are not idempotent. If you are setting up a
fresh local Supabase and the file says `create table` without an
`if not exists`, you'll get a duplicate-object error if it was
already applied. Use the `supabase_migrations.schema_migrations`
table to check what's already in place before running anything
against an existing project.

## Applying via the Supabase MCP: what to pass as `name`

`apply_migration` records its **own** timestamp as the `version`, so the
14-digit prefix in the filename never matches prod's ledger. What matches is
the `name`, and both checks (`check-migrations-applied.yml` on every PR,
`check-migrations-drift.yml` daily) expect it to be **the part of the
filename after the timestamp**:

| file | pass as `name` |
|---|---|
| `20260906120000_late_reminder_pass.sql` | `late_reminder_pass` |
| `20260906100000_change_deadline_preview.sql` | `change_deadline_preview` |

Don't type it — derive it:

```bash
npm run migration:name -- supabase/migrations/20260906120000_late_reminder_pass.sql
# late_reminder_pass
```

`scripts/migration-name.mjs` applies the same rule the two checks use
(`base=${base%%_*}` / `name=${base#*_}`), refuses anything that is not a
valid migration filename rather than guessing, and is held to the workflows'
own bash by `src/security/migrationName.test.ts`. When either check reports
a migration PENDING it now prints the name to apply it under. `npm run
check:migrations` also refuses two files that share a name, because the
checks match on name and a shared one would let a single applied row vouch
for both.

Since 7 September 2026 both checks also accept the full basename
(`20260906120000_late_reminder_pass`), because #790 was applied that way and
reported PENDING for a migration whose cron jobs were already live — which
also made the daily drift audit alarm every day until the ledger was
corrected. Timestamps are unique per file, so the basename form cannot
produce a false positive. The suffix remains the convention; the basename is
tolerance, not an invitation.

Anything else — a description, a ticket number, the filename with `.sql` —
reads as PENDING on every run until fixed. The fix is to re-apply the same
(idempotent) migration under the right name, which adds a second ledger row
rather than editing history.

## May 2026 review additions

The review pass adds these migrations (all idempotent and
additive):

| File | What it does |
|---|---|
| `20260513120000_booking_breed_owner_snapshots.sql` | Adds `bookings.breed_snapshot` + `owner_name_snapshot`, a BEFORE INSERT trigger that populates them, and a one-time backfill from the linked dog / human rows. |
| `20260513130000_whatsapp_auto_send_default_off.sql` | Re-asserts the `auto_send_enabled = false` default and resets any seed/dev rows that had it on. |
| `20260513140000_link_bookings_to_whatsapp.sql` | Adds `bookings.whatsapp_conversation_id` + `whatsapp_message_id` and re-issues `apply_whatsapp_booking_action` to populate them. |
| `20260513150000_fix_null_surnames.sql` | Resets `humans.surname` rows that are the literal string "Null" and adds a CHECK constraint to prevent reintroduction. |

## July 2026 — booking policy foundation

Fourteen additive migrations introduce the inactive visit-level booking policy
model and its read projections. GitHub Actions, Vercel and the Edge Function
deployment do **not** apply database migrations: apply these manually, one file
at a time, in the exact order below. They change **no** customer-visible
behaviour: `previous_day_1500_v1` is seeded with a null `effective_at` and the
legacy paths remain authoritative until a separately approved activation.
Schema deployment does not authorise activation, Terms or Meta publication, or
customer contact.

| File | What it does |
|---|---|
| `20260726144000_booking_visit_foundation.sql` | `booking_visits`, `booking_lineages`, the immutable policy registry, nullable `bookings.visit_id` with a `legacy_compat` dual-write trigger, an idempotent backfill and the audited staff backfill-reconciliation commands. |
| `20260726144001_authoritative_booking_policy_rules.sql` | Typed `booking_policy_settings` singleton with an audited owner-only write path, immutable Terms-publication and bank-instruction ledgers, the inactive/scheduled/active runtime seam, `change_deadline_for` and runtime-aware availability RPCs. |
| `20260726144002_visit_deposits_incidents_credits.sql` | One deposit record per visit, the immutable financial ledger, incidents with audit, staff overrides, credit reservations, the working-day refund calendar, the deposit-requirement resolver and the guarded legacy deposit compatibility paths. |
| `20260726144003_refund_calendar_coverage_warnings.sql` | Verified refund-calendar coverage, fail-loud due-date calculation, owner-only extensions and advance maintenance warnings. |
| `20260726144004_customer_visit_commands.sql` | Idempotent customer visit commands returning typed receipts, single-use review tokens and the revoked private dispatch seam. |
| `20260726144005_staff_visit_policy_commands.sql` | Staff approval, decline, manual deposit reconciliation, liability resolution, refund settlement, incidents, waivers and overrides. |
| `20260726144006_visit_policy_events.sql` | Visit identity and the v1 vocabulary on `booking_events`, trusted `requested_at` for deadline classification, and aggregate completion synchronisation. |
| `20260726144007_staff_visit_write_commands.sql` | Atomic staff visit create, update, cancel and reschedule commands with revision checks, idempotency and audit. |
| `20260726144008_staff_prepayment_and_terms_notice.sql` | Complete staff prepayment dispositions and an explicit Terms-acknowledgement basis without fabricating customer acceptance. |
| `20260726144009_staff_terms_notice_and_transfer_legs.sql` | Declared staff Terms-notice evidence and balanced two-legged prepayment transfers. |
| `20260726144010_booking_visit_data_quality.sql` | Read-only visit authority classification and the supporting operational indexes. |
| `20260726144011_customer_visit_projection.sql` | Owner-scoped customer visit projection with nested dogs, server actionability and safe unresolved history. |
| `20260726144012_data_quality_local_only.sql` | Per-visit classifier correction so projection cost does not grow with a whole-table review scan. |
| `20260726144013_staff_booking_policy_projections.sql` | Staff attention and visit-detail projections with all-open queues, revisions and exact due-time boundaries. |

Deployment gates, verification queries and the activation blockers are in
[docs/superpowers/runbooks/2026-07-22-booking-policy-foundation-rollout.md](superpowers/runbooks/2026-07-22-booking-policy-foundation-rollout.md).
Backfill reconciliation is in
[docs/superpowers/runbooks/2026-07-22-booking-policy-backfill-reconciliation.md](superpowers/runbooks/2026-07-22-booking-policy-backfill-reconciliation.md).

Every RPC in this batch ends with an explicit revoke block, per the convention
above. The **trigger** functions did not — that gap was closed retrospectively
by `20260731100000_revoke_anon_trigger_function_grants.sql` and is now held by
`supabase/tests/179_trigger_function_grants.test.sql`. The private
`smarter_dog_private` schema — the runtime/time dispatch seam, the confirmation
core and the review tokens — is revoked from `public`, `anon`, `authenticated`
**and** `service_role`, so no application or Edge caller can inject a decision
instant or claim the policy is active.

Two functions here are deliberately reachable by `anon` and must stay that way:
`booking_policy_runtime()` and `booking_policy_runtime_status()` are revoked and
then intentionally re-granted in `20260726144001`, returning only
`{ state, scheduledEffectiveAt }` so the portal knows when to refetch.

## Scheduled holiday notices — 5 September 2026

`20260905141035_scheduled_holiday_notices.sql` adds staff-managed holiday ranges, atomic closure saves, diary guards and a minimal public notice projection. It seeds no holidays. See [ADR 010](architecture/decisions/010-holiday-notices-operational-closures.md) and the [implementation plan](plans/completed/2026-09-05-scheduled-holiday-notices.md).

`20260906080000_holiday_reopening_default_open.sql` (follow-up, same day of release): a reopening day with no `day_settings` row now counts as open when the weekly default (Mon–Wed) says so, matching `validate_booking_calendar()`. The first cut required an explicit `is_open = true` row and refused every ordinary Monday reopening. One shared rule, `smarter_dog_private.holiday_day_is_open(date, boolean)`, is used by the save command, the diary guard and the public projection.

## Measurement telemetry retention — 9 September 2026

`20260909150000_telemetry_retention_90_days.sql` adds `prune_measurement_telemetry()` and a daily pg_cron job (03:25 UTC) that deletes `booking_funnel_events` and `booking_denials` rows older than 90 days — the retention period the measurement owner set for #612 (see the [catalogue](specifications/measurement-catalogue.md#privacy-and-retention)). Idempotent; touches neither logging RPC nor the booking write path. Guarded by `supabase/tests/222_telemetry_retention.test.sql`.

## Applying migrations to staging that the MCP tool refuses

The Supabase MCP `apply_migration` / `execute_sql` tools ask for a confirmation
whenever the SQL text contains `drop function`, `drop trigger`, `drop table`,
`drop policy` or `delete from`, even inside a function body or behind
`if exists`. An agent session cannot answer that confirmation, so the call
hangs until the MCP timeout. Several committed migrations need exactly those
statements (signature-changing `drop function if exists`, trigger re-creation,
retention `delete from`), which is how staging fell behind the repository.

Use the manual workflow **Apply named migrations to staging**
(`.github/workflows/staging-apply-migrations.yml`) instead. It runs under the
`staging` GitHub environment, demands the exact staging ref as confirmation,
links staging only, and hands the space-separated list of migration file names
to `scripts/apply-hosted-migrations.sh`, which:

- accepts only basenames under `supabase/migrations/` matching
  `<14-digit version>_<snake_case_name>.sql`;
- obtains the CLI's short-lived database login (as `scripts/run-hosted-pgtap.sh`
  does; no stored database password);
- skips any migration whose **name** is already in
  `supabase_migrations.schema_migrations` (names are the identity CI's
  `migrations-applied` check reads; the MCP tool records its own timestamp as
  the version), but only when the SQL stored on that row equals the committed
  file: a file edited after it was applied stops the run instead, and the
  message says whether to drop it from the list or re-apply it;
- applies each file with `psql` under `ON_ERROR_STOP`, recording its ledger row
  under the file's own version immediately afterwards in the same session: a
  file without its own transaction is atomic with its ledger row; a file that
  carries its own `begin`/`commit` commits itself first, so a failure between
  the two (never seen) would need the ledger row added by hand before a re-run.

The optional `reapply` input names files to run again even though they are
already in the ledger. Staging has received migrations out of repository
order, so an older file that redefines a function a newer, already-applied
file also defines (for example `20260825100000_staff_booking_confirmation.sql`
and `20260919130000_reconfirmed_from_customer_confirmation.sql`, which both
define `reset_reminder_on_reschedule()`) must be followed by the newer file
again. Before a run, check the files in the list against every later file
already on staging for shared function, trigger and grant names, and add the
later ones to both inputs, after the older ones. The ledger never gains a
second row for a name; a re-apply refreshes the SQL stored on the existing row
so the next run can verify it against the committed file.

A bare call to the script reaches staging only: production is refused unless
the caller sets `HOSTED_MIGRATION_TARGET=production` **and** repeats the
production ref in `CONFIRM_PRODUCTION_REF`, which only the production workflow
below does.

## Applying migrations to production: the production workflow

**Apply named migrations to production**
(`.github/workflows/production-apply-migrations.yml`) is the executable form of
the manual gate in [ADR 006](architecture/decisions/006-manual-target-verified-database-rollout.md).
It runs the same `scripts/apply-hosted-migrations.sh` as the staging workflow,
so there is one apply path to review, but production is deliberately harder to
reach:

| | Staging workflow | Production workflow |
|---|---|---|
| Trigger | Manual dispatch only | Manual dispatch only; never push, pull request or schedule |
| Environment | `staging`, required reviewer | `production`, required reviewer: a person approves the run before it links anything |
| Confirmation | Type the staging ref | Type the production ref; the script demands it again as `CONFIRM_PRODUCTION_REF` |
| Target | Links staging; refuses production | Links production only after the exact-ref check; fails closed on any other ref |
| Concurrency | One staging run at a time | One production run at a time; a second dispatch queues and never cancels the first |

**When to use which.** Staging first, always: the staging workflow (or the MCP
tool for files it accepts), then the pgTAP checks. Use the production workflow
once the same files have run on staging and the pull request that needs them
is reviewed, and run it **before** that pull request merges: the
`migrations-applied` check refuses a merge whose migration is not in the
production ledger.

**Before the first run (one-off GitHub setup).** Create the `production`
environment (Settings → Environments) with a required reviewer and a
deployment branch policy allowing `main`, the same shape as `staging`, and add
`PRODUCTION_SUPABASE_ACCESS_TOKEN` (a Supabase Management API token) as an
**environment** secret there, never as a repository secret. GitHub creates a
referenced environment with no protection rules if it does not exist, so the
environment-only secret is what makes an unconfigured environment fail closed:
the workflow's first step refuses to continue without it.

**How to run it.** Actions → **Apply named migrations to production** → *Run
workflow*. `confirm_production_ref` is `nlzhllhkigmsvrzduefz`, `migrations` is
the space-separated list of file basenames in the order they must run, and
`reapply` is only for the out-of-order repair case described above. The run
then waits for the `production` environment's required reviewer; nothing is
checked out or linked until that approval is given.

**What the run proves**, in order, each step failing the run if it does not
hold:

1. the typed ref equals the production ref and differs from staging, and the
   environment-only token is present, before checkout, so a wrong ref or an
   unconfigured environment never reaches the repository or the CLI;
2. every requested name matches `<14-digit version>_<snake_case_name>.sql`
   and exists under `supabase/migrations/` at the dispatched commit; the full
   SQL of each file is printed in the log;
3. the linked project-ref file equals the production ref, immediately before
   `supabase migration list --linked` records the before-state;
4. the script re-checks the target (opt-in, confirmation and link state),
   prints each file's digest and length and the ledger before the run, applies
   each file in one transaction with its ledger row, skipping a name already
   recorded only when its stored SQL equals the committed file (a mismatch
   stops the run: drop the file, or re-apply it to install the committed
   content and refresh the stored SQL), then fails unless every requested name
   is in the ledger with the committed content;
5. `supabase migration list --linked` records the after-state.

The run's step summary names who dispatched it, the migrations requested, the
verified ref and each step's outcome. Keep the run URL as the evidence record
ADR 006 asks for, and add the usual dated note at the top of this file.

**If a run fails part-way.** Each file is its own transaction with its ledger
row, so files before the failure are applied and recorded, the failing file is
rolled back, and later files were not started. Read the failing statement in
the log and the after-state listing (it still runs whenever the link
succeeded). Fix the cause in a reviewed change if the SQL is wrong, then
dispatch again with the same list: recorded names are skipped by name, so only
the remaining files run. Never recreate a migration under a new name to get
past the ledger, and never add a ledger row by hand unless you have confirmed
the schema change it stands for is present; the one case where the two can
part is a file carrying its own `begin`/`commit`, which commits itself before
its ledger row is written.

## The Supabase MCP tool and the Claude permission

`.claude/settings.json` allows `mcp__Supabase__apply_migration` so an agent
session can apply a migration to **staging** without a per-call prompt. The
allow rule cannot tell projects apart, so the PreToolUse hook
`.claude/hooks/guard-supabase-apply-migration.sh` reads the call's project ref
and sends anything other than the staging ref back to the permission prompt:
production is still confirmed by a person, per call, and the MCP server's own
destructive-statement confirmation is unchanged. Production migrations go
through the workflow above, not through the MCP tool.
