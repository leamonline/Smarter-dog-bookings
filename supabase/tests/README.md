# Database tests (pgTAP)

Executable tests for the Postgres schema — the booking BEFORE INSERT gates,
RLS, and the SECURITY DEFINER write-path RPCs that the Vitest suite can't
exercise (it never touches a real database).

## How they run — against a prod **schema baseline**, not a migration replay

The committed migration history does **not** rebuild from scratch: it has drift
(timestamps that map to different migrations than prod) and by-design
prod-environment prerequisites (e.g. a migration that raises unless a Vault
secret was provisioned out-of-band). See `migration-history-drift` notes.

So [`.github/workflows/db-tests.yml`](../../.github/workflows/db-tests.yml)
instead:

1. dumps prod's **current public schema** with `supabase db dump --linked
   --schema public` — **schema-only**, so it carries no customer data (and the
   managed `auth`/`storage` schemas are excluded);
2. boots the local Supabase stack with that dump as the single baseline (which
   supplies the `auth` schema, the `anon`/`authenticated`/`service_role` roles
   and extensions the public objects reference);
3. runs `supabase test db`, executing every `*.test.sql` here under pgTAP.

Triggered on any PR/push touching `supabase/migrations/`, `supabase/tests/`, or
`supabase/config.toml`.

The guarded Tranche 1 staging smoke run uses
[`scripts/run-hosted-pgtap.sh`](../../scripts/run-hosted-pgtap.sh). It converts
the CLI's short-lived login into private temporary `psql` settings, assumes the
linked project's `postgres` role, ensures `pg_net` is enabled under
`extensions`, and removes the credential and TAP files on exit. It never needs
a stored database password.

### Required secrets

- `SUPABASE_ACCESS_TOKEN` — the only repository secret required. The CLI uses
  it to create a short-lived database login, so no database password is stored
  or passed to the workflow.

## Running locally

Needs Docker + the Supabase CLI. Dump the schema once, drop it in as the
baseline, then run:

```bash
supabase db dump --linked --schema public -f /tmp/baseline.sql
# (boot a stack with that schema, however you prefer) then:
npm run test:db     # = supabase test db
```

Each test wraps itself in `begin … rollback`, so it never persists data.

## Tests

- `000_schema_smoke.test.sql` — structural: core tables exist, RLS is enabled,
  the booking gates and write-path RPCs are present. Deterministic; also the
  canary that the baseline applied correctly.
- `010_booking_gates.test.sql` — behavioural: the non-staff BEFORE INSERT
  calendar gate rejects an out-of-range slot, a past date, and a closed weekday,
  and the pregnancy gate rejects a pregnant dog — all raising `P0001`. These are
  negative cases, so they raise before the AFTER-insert notify triggers run.
- `020_rls_isolation.test.sql` — behavioural: acting as the `authenticated` role
  with a JWT `sub` claim, a customer reads only their own humans/dogs/bookings;
  another customer's rows are invisible; `anon` sees nothing.

### Planned (behavioural — follow-up)

These need more fixture setup (a `salon_config` row, or taming the AFTER-insert
notify triggers on the success path) and are best iterated with a local stack:

- daily-cap / capacity gate rejects the over-cap dog (non-staff) but lets staff
  through;
- a valid booking succeeds (the happy path, past all three gates);
- `create_customer_booking_group` rejects a dog the caller doesn't own.
