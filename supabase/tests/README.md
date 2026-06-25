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

### Required secrets

- `SUPABASE_ACCESS_TOKEN` — already set (used by the edge-deploy workflow).
- `SUPABASE_DB_PASSWORD` — the prod database password. Add it under **Repo
  Settings → Secrets and variables → Actions**; find/reset it in the Supabase
  dashboard → **Project Settings → Database**.

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

### Planned (behavioural — follow-up)

These need fixture setup (seed a customer human + dog, set the JWT role/claims,
pick an open future date) and are best iterated with a local stack:

- pregnancy gate raises `P0001` for a non-staff insert of a pregnant dog
  (staff bypass);
- daily-cap gate rejects the 15th dog (non-staff) but lets staff through;
- calendar gate rejects past dates / closed days / invalid slots;
- `create_customer_booking_group` rejects a dog the caller doesn't own;
- RLS isolation — customer A cannot read customer B's bookings/dogs/humans.
