# Migration history

`supabase/migrations/` is a near-complete record of prod schema
history.

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

Everything else matches.

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
