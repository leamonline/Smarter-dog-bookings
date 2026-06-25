# Database tests (pgTAP)

Executable tests for the Postgres schema — the booking BEFORE INSERT gates,
RLS, and the SECURITY DEFINER write-path RPCs that the Vitest suite can't
exercise (it never touches a real database).

## How they run

CI runs them via [`.github/workflows/db-tests.yml`](../../.github/workflows/db-tests.yml)
on any PR/push that touches `supabase/migrations/`, `supabase/tests/`, or
`supabase/config.toml`. The job:

1. boots the local Supabase stack with `supabase start`, which applies **every**
   migration in `supabase/migrations/` in order from an empty database — so a
   green run also proves the schema **rebuilds cleanly from scratch**;
2. runs `supabase test db`, which executes every `*.test.sql` here under pgTAP.

The migrations need the real Supabase environment (the `auth` schema, the
`anon`/`authenticated`/`service_role` roles, the `supabase_realtime`
publication, the standard extensions), which is why we use the CLI stack rather
than a bare Postgres container.

## Running locally

Needs Docker + the Supabase CLI:

```bash
supabase start      # one-time per session; applies all migrations
npm run test:db     # = supabase test db
```

Each test wraps itself in `begin … rollback`, so it is individually rolled back
and never persists data.

## Tests

- `000_schema_smoke.test.sql` — structural: core tables exist, RLS is enabled,
  the booking gates and write-path RPCs are present. Deterministic; also the
  canary that proves the migrations rebuild from scratch.

### Planned (behavioural — follow-up)

These need fixture setup (seed a customer human + dog, set the JWT role/claims,
pick an open future date) and are best iterated with a local stack:

- pregnancy gate raises `P0001` for a non-staff insert of a pregnant dog;
- daily-cap gate rejects the 15th dog (non-staff) but lets staff through;
- calendar gate rejects past dates / closed days / invalid slots;
- `create_customer_booking_group` rejects a dog the caller doesn't own;
- RLS isolation — customer A cannot read customer B's bookings/dogs/humans.
