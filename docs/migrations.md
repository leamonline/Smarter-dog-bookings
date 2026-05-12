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
