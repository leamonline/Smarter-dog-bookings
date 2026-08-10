# Issue #614 shared PostgreSQL concurrency driver follow-up

**Status:** Active
**Issue:** [#614](https://github.com/leamonline/Smarter-dog-bookings/issues/614) (closed; corrective follow-up to merged PR #626)
**Base:** `origin/main@ceeebdea26702727469928e32d7af21434924b0b`
**Last verified:** 10 August 2026
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
- The WhatsApp script no longer depends on GNU `timeout`; its already bounded
  database polling and cleanup remain the authority for session completion.
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
  completion; named-session polling, termination and the scenario cleanup trap
  remain mandatory.
- **Capacity false green:** preserve distinct backends, exact production-lock
  observation, governed loser errors and final invariant assertions.
- **Policy drift:** any SQL/approved-rule divergence is a stop condition, not a
  reason to edit an expectation.

## Implementation sequence

1. Add the shared driver and static tests for guard ordering and portable
   helpers.
2. Route the WhatsApp harness through it while preserving both race scenarios.
3. Route the capacity harness through it while preserving its dblink-backed
   transactions and evidence lines.
4. Update CI path filters and database-test guidance.
5. Run focused shell/static checks, pgTAP, both concurrency gates, the complete
   requested repository bar, and review the exact diff before publication.

## Testing

```bash
npm ci
npm run test:logic -- src/security/whatsappRescheduleConcurrencyGuard.test.ts
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
- All 19 focused pgTAP assertions and the complete database suite pass.
- Both capacity races still show two available preflights, one legal commit,
  one exact `P0001` rejection and a legal final state.
- Both existing WhatsApp concurrency scenarios still pass.
- No migration or governed capacity behaviour changes.
- The draft pull request records the exact clean head SHA and all four capacity
  participant outcomes.

## Open questions

None. A capacity-policy discrepancy would stop this follow-up and require a
separate issue.
