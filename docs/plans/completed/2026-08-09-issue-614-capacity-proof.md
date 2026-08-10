# Issue #614 PostgreSQL capacity proof

**Status:** Complete
**Issue:** [#614](https://github.com/leamonline/Smarter-dog-bookings/issues/614)
**Pull request:** [#626](https://github.com/leamonline/Smarter-dog-bookings/pull/626)
**Base:** `main@4c88c3623ee0060428e48cb2fca946ba36c199e9`
**Last verified:** 10 August 2026
**Owners:** `supabase/tests/035_capacity_behaviour.test.sql` for focused
behaviour; `scripts/verify-capacity-concurrency.sh` and
`scripts/verify-db-concurrency.sh` for local race evidence; `package.json` and
`.github/workflows/db-tests.yml` for runner integration; bounded capacity test
documentation and traceability
**Dependencies:** None. A0 defines later reporting but does not block this test
package.
**Related requirements:** [`REQ-CAP-001` and `REQ-CAP-002`](../../product/requirements.md)
**Related ADRs:** [ADR 001: PostgreSQL is the final capacity authority](../../architecture/decisions/001-postgresql-capacity-authority.md)

## Goal

Prove the approved PostgreSQL capacity behaviour with focused runtime tests and
prove, using genuine independent local database sessions, that stale same-slot
and cross-slot daily-cap observations cannot produce an invalid committed day.

## Why

Browser and Deno preflight evidence cannot close a stale-write window. The
database already uses transaction-scoped advisory locks, but issue #614 needs
executable evidence that the current guard re-evaluates after a competing
commit, rejects the loser with its governed PostgreSQL error and preserves a
legal final state.

## Current behaviour at discovery

Verified at the base SHA during discovery:

- `validate_booking_capacity()` in
  `supabase/migrations/20260712115759_legal_risk_tranche1.sql` is the latest
  trigger body. It takes the target `(date, slot)` advisory lock, takes a
  non-staff date-wide daily-cap lock, then enforces the 2-2-1, large-dog,
  early-close, daily-cap and blocked-seat rules.
- `create_customer_booking_group(jsonb, date)` inserts every requested dog in
  one PostgreSQL statement. A later-row trigger rejection aborts the complete
  call, but no focused test currently crosses the daily cap on its second dog.
- `supabase/tests/030_extra_slots.test.sql` proves 2-2-1 across the
  canonical/extra-slot boundary. It does not prove the requested canonical
  allocation or the other issue #614 rules.
- `scripts/verify-whatsapp-reschedule-concurrency.sh` is a genuine local
  multi-session gate, while `npm run test:db:concurrency` currently runs only
  that unrelated reschedule proof.
- `get_small_medium_availability()` remains a simplified advisory projection;
  its broader convergence is B3 work and is not an authority for this package.
- The discovery shell has Supabase CLI 2.111.0 and host `psql` under Homebrew.
  Docker became available during implementation, allowing a complete isolated
  migration replay and local database proof. Those development runs initially
  used an uncommitted working tree; the exact clean-commit and CI evidence is
  recorded below.

## Implementation discoveries — 9 August 2026

- The focused capacity file passes all 19 assertions. The complete pgTAP suite
  passes 37 files and 874 assertions after a full migration replay.
- The same-slot and different-slot capacity races both pass with four distinct
  `READ COMMITTED` backends, exact governed loser errors, legal final state and
  verified cleanup. Disabling the capacity trigger makes the behaviour suite
  fail 10 of 19 assertions and makes the race fail at the exact capacity-lock
  wait; restoring the trigger returns both proofs to green.
- A `dblink` connection originates inside PostgreSQL's container, so its target
  must be derived from `inet_server_addr()` and the server's internal `port`,
  not the host-published `127.0.0.1:54322` address used by the controller. For
  Docker-only verification, the controller's containerised `psql` must likewise
  use the database container's network address: loopback selects a trusted local
  route, while `dblink` requires a password-authenticated connection for the
  local non-superuser `postgres` role.
- PostgreSQL caches statistics reads for a transaction. The long-lived
  controller must call `pg_stat_clear_snapshot()` while polling or backends
  opened for the second race are invisible in `pg_stat_activity`.
- The later closure-integrity trigger also takes an advisory date lock. A wait
  assertion based only on `wait_event = 'advisory'` can therefore pass for the
  wrong reason; the race proof now matches the waiting and held `pg_locks` rows
  to the exact hashed slot or daily-cap key.
- The combined `npm run test:db:concurrency` command passes locally. This Mac
  has Docker but neither `psql` nor GNU `timeout` on `PATH`, so the proof used
  the running database container's `psql` plus a temporary bounded shell
  adapter for the subset of GNU `timeout` arguments used by the pre-existing
  WhatsApp gate. No global dependency or repository runtime was installed.
- The local harness is bounded by connection, statement, lock and overall
  controller timeouts. `INT`/`TERM` cleanup was exercised after committed
  fixture setup: the named backends stopped, fixtures were removed and all
  outbound triggers returned to origin mode. A foreign run marker and an orphan
  capacity-audit collision were both preserved and rejected without mutation.
- `check:docs`, lint (zero errors; 122 pre-existing warnings), typecheck,
  migration validation, 2,711 Vitest assertions and the production build pass.
  The focused capacity parity run passes 20 assertions.

## Desired behaviour

- Focused pgTAP assertions exercise canonical 2-2-1 allocation, approved and
  conditional large-dog adjacency, 12:00 early close, the non-staff daily cap
  while a physical slot remains, a blocked seat plus an existing booking, and
  atomic rollback of a two-dog group that crosses the daily cap.
- In each race, two independent `READ COMMITTED` transactions both record an
  apparently available committed state before either contender writes.
- The first contender inserts and keeps the real production advisory lock until
  the second contender is observed waiting on it through `pg_stat_activity`.
- After the first commits, the second returns the current governed `P0001`
  rejection and commits no booking. The final slot/day contains exactly the
  seed plus one contender and never exceeds its relevant limit.

## Scope

- One focused pgTAP behaviour file using synthetic, rolled-back fixtures.
- One guarded, local-only capacity concurrency harness with synthetic committed
  fixtures, bounded waits and verified cleanup.
- A small aggregate concurrency runner that preserves the existing WhatsApp
  reschedule gate and adds the capacity gate.
- Package, database CI, database-test documentation, traceability and changelog
  updates needed to make the proof discoverable and mandatory.

## Non-goals

- Any migration or change to `validate_booking_capacity()` or an approved
  capacity rule.
- A new structured reason contract, shared fixture language or duplicated
  browser/Deno parity matrix.
- Changing `get_small_medium_availability()`, AI preflight or public calendar
  semantics; those converge under B3.
- Hosted or production database execution, customer-data access, release work
  or policy activation.

## Relevant code

- `supabase/migrations/20260712115759_legal_risk_tranche1.sql` — current
  customer group command and final capacity trigger.
- `supabase/tests/010_booking_gates.test.sql` — non-staff trigger-test pattern.
- `supabase/tests/030_extra_slots.test.sql` — successful booking fixtures,
  local Vault setup and exact capacity rejection assertions.
- `supabase/tests/115_customer_cancellation_concurrency.test.sql` — repository
  precedent for independent PostgreSQL backends, blocking proof and exact
  SQLSTATE capture.
- `scripts/verify-whatsapp-reschedule-concurrency.sh` — local identity guard,
  bounded wait, outbound-trigger preservation and cleanup precedent.
- `.github/workflows/db-tests.yml` and `scripts/prepare-db-test-project.mjs` —
  disposable full-migration replay and CI runtime.

## Architecture

PostgreSQL remains the final authority. pgTAP exercises the real trigger and
customer group command after a complete migration replay. The concurrency gate
uses two independent transactions against the same disposable local database;
it does not mock a race or acquire the capacity locks on behalf of the code
under test. Browser/Deno checks remain advisory prior evidence.

## Data/database changes

None. No migration, schema, grant, RLS or generated-type change is authorised.
pgTAP fixtures roll back. The local race must use a reserved synthetic UUID
namespace, refuse ambiguous pre-existing configuration, disable only outbound
notification triggers after requiring their normal origin mode, and remove
every committed fixture while restoring and verifying that origin mode.

## API changes

None. The tests assert the current `P0001` messages; they do not promote those
messages into a new public reason-code contract.

## UI changes

None.

## Security/privacy considerations

The concurrency script must require explicit opt-in and the exact local
`127.0.0.1:54322/postgres` identity with the default disposable password. It
must reject libpq indirection variables, hosted credentials and any ambiguous
`salon_config` state before mutation. All people, dogs and bookings are fixed
synthetic fixtures; no environment file, production target or customer record
is read.

## Dependencies

A1 is unblocked. The capacity trigger and shared database-test runner are the
only shared writers in this package. B3 must not edit those surfaces until this
evidence lands and its exact SHA is recorded.

## Risks

- **Rule drift disguised as a test correction:** stop and report any runtime
  result that conflicts with the approved capacity reference.
- **Mocked or sequential-only race:** require distinct backend PIDs and prove
  the loser waits on an advisory lock held by the winner.
- **False green through staff bypass:** assert both contenders are non-staff;
  otherwise the daily-cap branch is skipped by design.
- **Local fixture contamination:** fail closed on collisions, bound every wait,
  terminate named backends on failure, and verify cleanup and trigger modes.
- **Outbound side effects:** disable only the known notification/push triggers
  while keeping every calendar, pregnancy, capacity and lifecycle guard real.
- **Scope creep into B3:** document simplified preflight gaps without changing
  them here.

## Migration/rollout

There is no database rollout. CI prepares a disposable copy, replays every
committed migration, runs pgTAP, runs both local concurrency gates and destroys
the stack without backup. Merging test evidence does not apply a production
migration or change production behaviour.

## Implementation sequence

1. Add `035_capacity_behaviour.test.sql` and verify each literal expectation
   against the real trigger/customer group command.
2. Add the guarded capacity race harness. Record both preflight observations,
   backend identities, production-lock wait, transaction outcomes and final
   invariant for same-slot and different-slot daily-cap races.
3. Compose both concurrency gates behind `npm run test:db:concurrency` and make
   database CI watch and execute the complete command.
4. Update database-test instructions, traceability and changelog evidence.
5. Run focused tests, deliberate negative controls, the complete database gates
   and the proportionate repository bar at the exact head SHA.

## Testing

Focused development and proof:

```bash
npm run test:db -- supabase/tests/035_capacity_behaviour.test.sql
CONCURRENCY_LOCAL_STACK_CONFIRMED=1 npm run test:db:capacity-concurrency
CONCURRENCY_LOCAL_STACK_CONFIRMED=1 npm run test:db:concurrency
npm run test:logic -- src/engine/capacityTrigger.test.ts src/lib/whatsapp/capacityParity.test.ts
```

Completion bar:

```bash
npm run check:docs
npm run lint
npm run typecheck
npm run check:migrations
npm run test
npm run build
npm run test:db
CONCURRENCY_LOCAL_STACK_CONFIRMED=1 npm run test:db:concurrency
```

The pgTAP negative control must mutate or temporarily replace only the
disposable test database's relevant guard and demonstrate the new assertion
fails, then restore the full migration replay. The concurrency negative control
must show the gate fails if the expected production advisory wait is absent;
neither negative control is committed.

## Observability

The concurrency output names the exact git SHA and, for both participants in
both races, the committed preflight values, backend PID, inserted/rejected
outcome, SQLSTATE/message and final slot/day counts. CI logs are sufficient;
the harness must not persist customer-like data or emit provider requests.

## Documentation updates

- Replace the database README's planned capacity item with the focused test and
  local concurrency commands.
- Update `docs/traceability.md` so A1 points to the executable SQL and race
  evidence.
- Add an Unreleased testing entry to `CHANGELOG.md`.
- Move this plan to `docs/plans/completed/` after recording verified
  pull-request-head evidence.

## Definition of done

- Every issue #614 behaviour and both races pass against a complete local
  migration replay.
- Both race sessions record availability before competing, have distinct
  backend PIDs, and the loser is observed waiting on the production lock.
- Exactly one contender commits in each race, the exact governed rejection is
  returned by the loser, and the final database state is legal.
- No production SQL, capacity policy, grant, RLS or runtime API changes.
- Focused, full database and proportionate repository checks pass at the exact
  head SHA; any omitted check is recorded with its consequence.
- The diff is reviewed, documentation is current and the pull request links the
  issue, this plan, requirements and ADR.

## Completion evidence — 10 August 2026

Pull request [#626](https://github.com/leamonline/Smarter-dog-bookings/pull/626)
was verified at head
`05c6f5af2fc2498ec127b5e5b8ea4253b55aa358`:

- The clean local concurrency run emitted
  `EVIDENCE|sha=05c6f5af2fc2498ec127b5e5b8ea4253b55aa358|worktree=clean|isolation=read committed|sessions=4`.
- The [database workflow](https://github.com/leamonline/Smarter-dog-bookings/actions/runs/31369766669)
  rebuilt all 202 migrations, passed 37 pgTAP files and 874 assertions, proved
  the WhatsApp and capacity concurrency gates, and removed its disposable
  database.
- The [main CI workflow](https://github.com/leamonline/Smarter-dog-bookings/actions/runs/31369766595)
  passed lint, documentation, typecheck, migration validation, 275 Vitest files
  and 2,711 assertions, the production build and Edge Function tests. Its PR
  E2E guard passed with the browser journey intentionally skipped on pull
  requests.
- The [migration-parity workflow](https://github.com/leamonline/Smarter-dog-bookings/actions/runs/31369766644)
  passed, and the Vercel preview completed successfully.
- No required check was omitted, no migration or capacity policy changed, and
  no hosted database or customer data was used during local verification.

## Open questions

None at discovery. Any runtime divergence from the approved rule is a stop
condition and a separately scoped defect, not a test expectation to revise.
