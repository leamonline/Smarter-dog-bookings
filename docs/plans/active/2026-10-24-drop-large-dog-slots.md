# Retire the large-dog settings column

Status: Active
Issue: [#1000](https://github.com/leamonline/Smarter-dog-bookings/issues/1000)
Base: origin/main at 072600e6e6df0f3395038da446e35534c4dba704
Last verified: 2026-10-24
Owners: This change owns the migration, database contract, fixtures and release evidence.
Dependencies: #1060 deployed
Related requirements: GOAL-04 in [PROJECT.md](../../../PROJECT.md)
Related ADRs: [ADR 006](../../architecture/decisions/006-manual-target-verified-database-rollout.md)

## Goal and why

Remove the unused `salon_config.large_dog_slots` column without changing capacity
or settings behaviour. #1060 already removed its consumers; retaining the column
misrepresents which settings control capacity.

## Current behaviour

At the base SHA, the column appears only in generated types, fixtures, historical
schema and explanatory text. Browser and Edge capacity use `LARGE_DOG_SLOTS`.
`get_public_salon_facts()` mentions it only in a comment, not its query.
GitHub deployment 7296935373 reports Production success at 2026-10-24 09:43:41 UTC
for the base SHA; #1060 merge 1c3488b7891002b2438f4147b60231819f1aaac5 is an
ancestor. This proves a successful compatible deployment, not that every old
browser session has refreshed. A read-only catalogue check on the verified production project on 24 October
confirmed the column still exists, with zero public function-body mentions, zero
public view mentions and zero registered non-default dependencies. This does not
prove the absence of external clients or old browser sessions.

## Desired behaviour, scope and non-goals

Settings inserts and saves and the anonymous website RPC work with the column
absent. Included: one append-only migration, row/insert/update types, ordinary
fixtures, pgTAP regression coverage and current documentation. Historical
migrations remain unchanged. No capacity-policy, other settings, customer-data,
RLS, grant, RPC-signature or UI changes are authorised here.

## Relevant code and architecture

- `src/supabase/hooks/useSalonConfig.ts` and `src/supabase/transforms.ts`: current
  settings read/write shapes, already compatible after #1060.
- `src/supabase/database.types.ts`: schema contract, serial ownership here.
- `supabase/migrations/20260803120000_get_public_salon_facts_rpc.sql`: named public
  settings extraction; no dependency on the dropped column.
- `supabase/tests/258_drop_large_dog_slots.test.sql`: absent-column, insert, save,
  anonymous public read and repeat-drop proof.

PostgreSQL remains the capacity authority. This contract phase follows the
separate-deployment rule in [CLAUDE.md](../../../CLAUDE.md).

## Data/database changes

`20261024110000_drop_large_dog_slots.sql` drops one column with `IF EXISTS` and
without `CASCADE`. A five-second lock timeout bounds waiting for its exclusive
DDL lock. The release engine supplies the transaction. Unexpected dependencies
fail the release. No backfill; stored values are discarded. Recreating a column
would not restore its values. Generated types must be compared with CI's migrated
database artifact, because Docker is unavailable on the authoring Mac.

## API and UI changes

The database row contract omits the retired field. RPC contracts and visible UI
are unchanged. Pre-#1060 clients that still submit the old field are incompatible.

## Security/privacy considerations

Tests use synthetic rows in a disposable database and roll them back. No customer
records, credentials or settings values are needed for the release evidence.
Production execution requires separate explicit authority and the existing gate.

## Dependencies and risks

The deployment prerequisite is confirmed above. Refresh staff browser sessions
before applying, and exclude pre-#1060 frontend versions from rollback choices.
An external consumer outside this repository is not ruled out by source search.
Reconfirm catalogue dependencies and any available aggregate query evidence
before release. Lock contention fails quickly; retry only through the normal workflow.

## Migration/rollout

1. Review this exact migration and validate the PR head in isolated database CI.
2. Verify the staging target through the runbook and apply there, then run pgTAP.
   If staging remains unavailable, record that fact and obtain a decision on the
   alternative; an earlier exception does not itself approve this release.
3. Confirm compatible production deployment and refreshed staff sessions.
4. Use the approval-gated production workflow against the reviewed full PR SHA
   and verified production ref, following [migrations.md](../../migrations.md).
5. Record apply receipt, ledger and independent catalogue evidence, then require
   `migrations-applied` to pass before merge. Do not bypass the gate.

Production postcondition (one read-only boolean query):

```sql
select exists (select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'salon_config') and not exists (select 1 from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid = a.attrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'salon_config' and a.attname = 'large_dog_slots' and not a.attisdropped)
```

## Implementation sequence and testing

Add the migration and contract changes; update fixtures and documentation; run
`npm run lint`, `npm run check:docs`, `npm run typecheck`,
`npm run check:migrations`, `npm test`, and `npm run build`.
CI replays all migrations, runs `npm run test:db` and existing concurrency tests,
and generates the migrated database types. Review those types before release.
No new concurrency mechanism is introduced.

## Observability and documentation updates

Use deployment status, CI results, generated type artifact, migration receipt and
catalogue postcondition as evidence. Update `docs/migrations.md`, README capacity
routing and `docs/capacity-engine.md`. Preserve historical audit findings.

## Definition of done and open questions

Code and database checks pass at the reviewed head; types match the migrated
schema; staging and production evidence are recorded; migration gate passes;
merge is explicitly authorised. Until then this plan remains active. Outstanding
release evidence: staging availability, live dependencies, refreshed sessions,
production application and rollback-floor acknowledgement.

## Preparation evidence

[Draft PR #1077](https://github.com/leamonline/Smarter-dog-bookings/pull/1077).
Local documentation, migration validation, typecheck, lint, build and all 435
test files (4,920 tests) passed. Lint reports warnings but no errors.
The Supabase project API confirmed staging `btjnxvgkpdbfrrqxvkfj` is `INACTIVE`
and production `nlzhllhkigmsvrzduefz` is `ACTIVE_HEALTHY` on 24 October.
No hosted database writes were performed. Staging validation remains blocked
until staging is available or an explicit alternative is approved. The expected
`migrations-applied` failure is retained until authorised production application.
