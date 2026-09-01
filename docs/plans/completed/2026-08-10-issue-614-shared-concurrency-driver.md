# Issue #614 shared PostgreSQL concurrency driver follow-up

**Status:** Completed
**Issue:** [#614](https://github.com/leamonline/Smarter-dog-bookings/issues/614) (closed; corrective follow-up to merged PR #626)
**Implementation pull request:**
[#629](https://github.com/leamonline/Smarter-dog-bookings/pull/629)
**Corrective hotfix pull request:**
[#632](https://github.com/leamonline/Smarter-dog-bookings/pull/632)
**Base:** `origin/main@9c7285ef6b30fd341707e501d0ee82a029ea86fe`
**Last verified:** 31 August 2026 against
`main@94a249659ad2eed94dc4a7e787e7ab028b5e4cd1`
**Owners:** `scripts/postgres-concurrency-driver.sh`, the two existing
concurrency scenario scripts, their static guard test, database CI path filters,
and bounded database-test documentation
**Dependencies:** None
**Related requirements:** [`REQ-CAP-001` and `REQ-CAP-002`](../../product/requirements.md)
**Related ADRs:** [ADR 001: PostgreSQL is the final capacity authority](../../architecture/decisions/001-postgresql-capacity-authority.md)

## Goal

Retain the already accepted issue #614 pgTAP and real-session outcomes while
removing the duplicated harness infrastructure introduced by PR #626. Both the
WhatsApp-reschedule and capacity scenarios must use one reusable local
PostgreSQL concurrency driver.

## Why

Current `main` contains the requested behaviour assertions and genuine races,
but `scripts/verify-capacity-concurrency.sh` was added as a second 1,264-line
harness beside the 1,172-line WhatsApp harness. The task explicitly requires
generalising the working harness rather than maintaining two independent
copies of connection safety, process control and cleanup mechanics.

## Current behaviour

- `supabase/tests/035_capacity_behaviour.test.sql` already contains 19 focused
  assertions for 2-2-1, large-dog adjacency and early close, blocked seats,
  daily cap and atomic multi-dog rollback.
- `scripts/verify-capacity-concurrency.sh` already proves same-slot and
  different-slot daily-cap races with four real `READ COMMITTED` backends.
- `scripts/verify-whatsapp-reschedule-concurrency.sh` remains the older working
  host-session harness and must not lose either of its existing race proofs.
- Both scripts independently validate the local connection identity, find
  Supabase and `psql`, construct client arguments, terminate named backends and
  supervise bounded execution.
- Review of draft PR #629 found that named-backend polling could return after a
  backend disappeared while its host `psql` process remained alive. The later
  raw shell `wait` was therefore not bounded, and cleanup had no TERM-to-KILL
  escalation. A fake-client negative control reproduced the hang path.
- CI at `41b58b91db515d9b9c2e7b089890c54fbd0cdc81` then exposed a second
  lifecycle edge: cancelling the Bash watchdog left its internal `sleep`
  process orphaned. The watchdog must clear inherited traps and explicitly
  terminate and reap its own timer as well as the tracked `psql` client.
- The post-merge database runs at `807de0e335f24f4f3608d06c0a47512180a7797a`
  and `9c7285ef6b30fd341707e501d0ee82a029ea86fe` both passed all 874 pgTAP
  assertions, then failed in the WhatsApp concurrency scenario with Bash
  `wait_for: No record of process` diagnostics and output files removed before
  the parent could read them. Watchdog creation cleared `EXIT` only after the
  child began running, leaving a scheduling window where the scenario cleanup
  trap could be inherited and run by that child.
- The latest `public.validate_booking_capacity()` definition remains
  `20260712115759_legal_risk_tranche1.sql`; no approved-rule discrepancy was
  found during discovery.

## Desired behaviour

- One sourceable driver owns the destructive-test opt-in, libpq-indirection
  rejection, exact local identity, local-stack proof, client discovery,
  consistent `psql` invocation, named-backend termination and portable
  watchdog lifecycle.
- Both existing scenario scripts source that driver and contain only their
  fixture, transaction and domain assertions.
- The WhatsApp script no longer depends on GNU `timeout`; the shared driver
  tracks every spawned `psql` PID, bounds the host process independently of
  `pg_stat_activity`, escalates from TERM to KILL and reaps the genuine exit
  status.
- Watchdog creation clears the caller's `EXIT` trap before forking and restores
  it immediately afterwards, so a child stopped before its first instruction
  cannot run scenario cleanup.
- Capacity output continues to identify both participants in each race, exact
  `P0001` loser outcomes, final legal counts, isolation level and exact SHA.

## Scope

- Shared shell driver and static guard coverage.
- Refactor of the existing two scenario scripts without changing their SQL
  policy assertions.
- CI path-filter and database-test documentation updates needed to make the
  shared driver visible.

## Non-goals

- Any migration, trigger, RPC, grant, RLS, capacity-policy or TypeScript/Deno
  fixture change.
- Changes to Tranche B issues #621–#624.
- Hosted or production Supabase access.

## Architecture

PostgreSQL remains the final authority. The shared shell driver establishes and
supervises genuine local clients; scenario scripts still define the domain
transactions and prove exact production advisory-lock contention. Sharing
orchestration does not make the shell layer an authority for booking policy.

## Data/database changes

None. All fixtures remain synthetic and cleanup remains collision-aware and
bounded against the disposable local stack.

## Security/privacy considerations

The driver must fail before invoking Supabase or `psql` unless the caller opts
in and the connection is exactly `127.0.0.1:54322/postgres` as local
`postgres` with the default disposable password. It must reject libpq service
or host-address indirection. No environment file or customer record is read.

## Risks

- **False reuse:** merely renaming a helper would leave two orchestration
  implementations. The driver must own substantive connection and lifecycle
  behaviour used by both scenarios.
- **WhatsApp regression:** removing GNU `timeout` must not remove bounded
  completion. Named-session polling remains diagnostic evidence, while the
  driver must independently bound and reap every host client, including one
  that outlives its database backend or ignores TERM.
- **Watchdog cleanup:** stopping a completed client's watchdog must not run a
  caller trap or leave its timer process orphaned. A fast-exit fake client
  asserts that cancellation returns before the original timeout.
- **Watchdog creation race:** clearing `EXIT` inside the child is too late when
  cancellation wins the scheduling race. A forced pre-initialisation negative
  control must fail unless the parent clears the trap before forking.
- **Capacity false green:** preserve distinct backends, exact production-lock
  observation, governed loser errors and final invariant assertions.
- **Policy drift:** any SQL/approved-rule divergence is a stop condition, not a
  reason to edit an expectation.

## Implementation sequence

1. Add the shared driver and behavioural tests for guard ordering, tracked
   clients, portable deadlines, TERM-to-KILL escalation and exit-status
   preservation.
2. Route the WhatsApp harness through it while preserving both race scenarios.
3. Route the capacity harness through it while preserving its dblink-backed
   transactions and evidence lines.
4. Update CI path filters and database-test guidance.
5. Run focused shell/static checks, pgTAP, both concurrency gates, the complete
   requested repository bar, and review the exact diff before publication.
6. Publish the corrective hotfix from the latest `main` and require the exact
   hotfix SHA to pass GitHub checks before merge.

## Testing

```bash
npm ci
npm run test:logic -- src/security/whatsappRescheduleConcurrencyGuard.test.ts
# Repeat the focused driver test to exercise process scheduling.
npm run test:db
CONCURRENCY_LOCAL_STACK_CONFIRMED=1 npm run test:db:concurrency
npm run lint
npm run check:docs
npm run typecheck
npm run check:migrations
npm run test
npm run build
bash -n scripts/postgres-concurrency-driver.sh \
  scripts/verify-whatsapp-reschedule-concurrency.sh \
  scripts/verify-capacity-concurrency.sh \
  scripts/verify-db-concurrency.sh
git diff --check
```

## Definition of done

- Both established scenario scripts use the shared driver for local identity,
  client/session lifecycle and bounded process cleanup.
- A fake `psql` that outlives its reported backend and ignores TERM is killed,
  reaped and reported with its genuine signal-derived exit status within a
  portable deadline.
- A watchdog stopped before its first production instruction begins without
  the caller's `EXIT` cleanup trap.
- All 19 focused pgTAP assertions and the complete database suite pass.
- Both capacity races still show two available preflights, one legal commit,
  one exact `P0001` rejection and a legal final state.
- Both existing WhatsApp concurrency scenarios still pass.
- No migration or governed capacity behaviour changes.
- The draft pull request records the exact clean head SHA and all four capacity
  participant outcomes.
- The corrective pull request's exact head SHA passes the GitHub database gate
  that failed on both post-merge `main` runs.

## Completion

Pull request [#629](https://github.com/leamonline/Smarter-dog-bookings/pull/629) routed both established scenario scripts
through the shared `scripts/postgres-concurrency-driver.sh` and merged as
`807de0e335f24f4f3608d06c0a47512180a7797a`. The post-merge database gate then
failed twice on `main` in the WhatsApp concurrency scenario — run
[31430269666](https://github.com/leamonline/Smarter-dog-bookings/actions/runs/31430269666) at
`807de0e335f24f4f3608d06c0a47512180a7797a` and run
[31430597128](https://github.com/leamonline/Smarter-dog-bookings/actions/runs/31430597128) at
`9c7285ef6b30fd341707e501d0ee82a029ea86fe` — the watchdog `EXIT`-trap
inheritance window recorded under current behaviour above.

Corrective pull request [#632](https://github.com/leamonline/Smarter-dog-bookings/pull/632) closed that window at exact
head `09937e3743e4cf077343ecf1691d0c97c76a6e23` and merged as
`7c589e20afb8f764e474116926b337c2e139e999`. The previously failing GitHub
database gate passed on that exact `main` commit
([run 31438584819](https://github.com/leamonline/Smarter-dog-bookings/actions/runs/31438584819), 10 August 2026),
satisfying the final definition-of-done criterion.

Re-verified 31 August 2026 against
`main@94a249659ad2eed94dc4a7e787e7ab028b5e4cd1`: both scenario scripts still
`source` the shared driver, the static guard
`src/security/whatsappRescheduleConcurrencyGuard.test.ts` remains in the logic
suite, and the database gate's most recent `main` run passed on 30 August 2026
([run 33337830396](https://github.com/leamonline/Smarter-dog-bookings/actions/runs/33337830396) at
`53a4e266d03a6ded13ac0fda901841f32ecb3dd9`). The driver has since received one
further lifecycle fix — pull request [#645](https://github.com/leamonline/Smarter-dog-bookings/pull/645), a lost-watchdog
TERM stall — made in one place precisely because both scenarios now share it.

## Open questions

None. A capacity-policy discrepancy would stop this follow-up and require a
separate issue.
