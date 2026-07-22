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

## ⚠️ Don't blindly re-run old migrations

Some early migrations are not idempotent. If you are setting up a
fresh local Supabase and the file says `create table` without an
`if not exists`, you'll get a duplicate-object error if it was
already applied. Use the `supabase_migrations.schema_migrations`
table to check what's already in place before running anything
against an existing project.

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

Six additive migrations introduce the visit-level booking policy model. They
change **no** customer-visible behaviour: `previous_day_1500_v1` is seeded with
a null `effective_at` and the legacy paths remain authoritative until a
separately approved activation.

| File | What it does |
|---|---|
| `20260722120000_booking_visit_foundation.sql` | `booking_visits`, `booking_lineages`, the immutable policy registry, nullable `bookings.visit_id` with a `legacy_compat` dual-write trigger, an idempotent backfill and the audited staff backfill-reconciliation commands. |
| `20260722130000_authoritative_booking_policy_rules.sql` | Typed `booking_policy_settings` singleton with an audited owner-only write path, immutable Terms-publication and bank-instruction ledgers, the inactive/scheduled/active runtime seam, `change_deadline_for` and runtime-aware availability RPCs. |
| `20260722140000_visit_deposits_incidents_credits.sql` | One deposit record per visit, the immutable financial ledger, incidents with audit, staff overrides, credit reservations, the working-day refund calendar, the deposit-requirement resolver and the guarded legacy deposit compatibility paths. |
| `20260722150000_customer_visit_commands.sql` | Idempotent customer visit commands returning typed receipts, single-use review tokens and the revoked private dispatch seam. |
| `20260722160000_staff_visit_policy_commands.sql` | Staff approval, decline, manual deposit reconciliation, liability resolution, refund settlement, incidents, waivers and overrides. |
| `20260722170000_visit_policy_events.sql` | Visit identity and the v1 vocabulary on `booking_events`, trusted `requested_at` for deadline classification, and aggregate completion synchronisation. |

Deployment gates, verification queries and the activation blockers are in
[docs/superpowers/runbooks/2026-07-22-booking-policy-foundation-rollout.md](superpowers/runbooks/2026-07-22-booking-policy-foundation-rollout.md).
Backfill reconciliation is in
[docs/superpowers/runbooks/2026-07-22-booking-policy-backfill-reconciliation.md](superpowers/runbooks/2026-07-22-booking-policy-backfill-reconciliation.md).

Every new function ends with an explicit revoke block, per the convention
above. The private `smarter_dog_private` schema — the runtime/time dispatch
seam, the confirmation core and the review tokens — is revoked from `public`,
`anon`, `authenticated` **and** `service_role`, so no application or Edge
caller can inject a decision instant or claim the policy is active.
