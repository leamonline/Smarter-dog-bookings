# Database tests (pgTAP)

Executable tests for the Postgres schema — the booking BEFORE INSERT gates,
RLS, and the SECURITY DEFINER write-path RPCs that the Vitest suite can't
exercise (it never touches a real database).

## How they run — complete local migration replay

The [DB workflow](../../.github/workflows/db-tests.yml) has no hosted Supabase
credentials and never reads or dumps production. It:

1. copies the committed `supabase/` project into the CI runner's temporary
   directory;
2. inserts a CI-only prerequisite that reproduces the legacy Data API grants
   this pre-May-2026 Supabase project received before its first migration;
3. inserts a second CI-only prerequisite containing an inert loopback
   `supabase_url` Vault secret immediately before the historical migration that
   deliberately requires this project-specific value;
4. switches the disposable project's default privileges back to
   closed-by-default immediately after the migration history present when this
   workflow was adopted, so later migrations must state their Data API grants;
5. boots a local Supabase stack from every committed migration; and
6. runs every `*.test.sql` file here through pgTAP.

The injected prerequisites exist only in the disposable copy. They are never
added to production migration history and the source checkout remains
unchanged. Later committed RLS policies and explicit `REVOKE` statements still
run normally, so the resulting access model is exercised rather than bypassed.
New migrations cannot inherit the emulated legacy grants.

Triggered on any PR/push touching `supabase/migrations/`, `supabase/tests/`, or
`supabase/config.toml`.

The guarded Tranche 1 staging smoke run uses
[`scripts/run-hosted-pgtap.sh`](../../scripts/run-hosted-pgtap.sh). It converts
the CLI's short-lived database login into private temporary `psql` settings,
assumes the linked project's `postgres` role, ensures `pg_net` is enabled under
`extensions`, and removes the credential and TAP files on exit. It never needs
a stored database password. That separate, manual-only staging workflow uses
`SUPABASE_ACCESS_TOKEN`; the automatic DB workflow does not.

## Running locally

Needs Docker, Node 22 and Supabase CLI 2.109.1. The separate multi-session gate
also needs host `psql` and GNU `timeout` (the latter is required by the existing
WhatsApp reschedule proof). Prepare the same disposable project used by CI,
then run:

```bash
db_test_project_root="$(mktemp -d)/project"
node scripts/prepare-db-test-project.mjs "$db_test_project_root"
supabase --workdir "$db_test_project_root" start
supabase --workdir "$db_test_project_root" test db
CONCURRENCY_LOCAL_STACK_CONFIRMED=1 npm run test:db:concurrency
supabase --workdir "$db_test_project_root" stop --no-backup
```

Each test wraps itself in `begin … rollback`, so it never persists data.
The concurrency command is explicitly local-only and refuses any connection
other than the disposable `127.0.0.1:54322/postgres` stack. It runs both the
WhatsApp reschedule gate and the capacity gate; use
`npm run test:db:capacity-concurrency` to run only the latter while developing.

## Tests

- `000_schema_smoke.test.sql` — structural: core tables exist, RLS is enabled,
  the booking gates and write-path RPCs are present. Deterministic; also the
  canary that migration replay completed correctly.
- `010_booking_gates.test.sql` — behavioural: the non-staff BEFORE INSERT
  calendar gate rejects an out-of-range slot, a past date, and a closed weekday,
  and the pregnancy gate rejects a pregnant dog — all raising `P0001`. These are
  negative cases, so they raise before the AFTER-insert notify triggers run.
- `020_rls_isolation.test.sql` — behavioural: acting as the `authenticated` role
  with a JWT `sub` claim, a customer reads only their own humans/dogs/bookings;
  another customer's rows are invisible; `anon` sees nothing.
- `035_capacity_behaviour.test.sql` — behavioural: the real booking trigger
  enforces canonical 2-2-1 allocation, approved/conditional large-dog
  adjacency and early close, the non-staff daily cap and one blocked seat; the
  customer group command rolls back both dogs when its second row crosses the
  cap. `verify-capacity-concurrency.sh` separately proves the same-slot and
  different-slot stale-write races with independent PostgreSQL sessions.
- `125_merge_humans_opt_outs.test.sql` — behavioural: a staff duplicate merge
  keeps active SMS, WhatsApp and email suppressions, including their timestamp
  and reason evidence, when the losing human record is deleted.
- `135_humans_directory_visibility.test.sql` — behavioural: the Humans
  directory includes genuine customers and submitted self-signups while
  excluding unfinished onboarding shells.

### Planned (behavioural — follow-up)

These need more fixture setup and are best iterated with a local stack:

- a valid booking succeeds (the happy path, past all three gates);
- `create_customer_booking_group` rejects a dog the caller doesn't own.
