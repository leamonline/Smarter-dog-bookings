# Governed measurement: existing-report quality

Status: Active
Issue: #612
Base: origin/main at a7bf56d41af39e447f5e74bc00b96ae96b925334
Last verified: 2026-09-08
Owners: funnel aggregation, telemetry report loaders, report copy and tests
Dependencies: None for this slice
Related requirements: measurement-catalogue.md MET-FUNNEL-001 and MET-CAP-001
Related ADRs: None

## Goal

Make the existing funnel and denial reports disclose measurement limitations and reject incomplete source loads. This is the first bounded implementation of #612, not completion of its ten-metric programme.

## Why

Current funnel aggregation infers a start for every observed session, hiding missing starts. The denial empty state claims every attempt succeeded despite best-effort logging. Both loaders accept a potentially capped response as complete, and neither catches rejected requests.

## Current behaviour

Verified against the base above: `src/engine/funnel.ts` counts furthest observed steps; `src/lib/funnelSession.ts` retains an attempt in tab sessionStorage until success/reset. `useFunnelData.ts` and `useDenialsData.ts` select restricted columns but do not paginate. No production data was queried.

## Desired behaviour

Use sessions with an observed start for the completion denominator; disclose orphan sessions, repeated steps and missing intermediate events. Inferred intermediate reach remains directional. Unfinished sessions are not asserted to be abandoned. Missing, failed or incomplete loads show unavailable rather than zero. Empty denial data makes no success claim.

## Scope and non-goals

Change the existing two reports, their pure calculations/loaders, focused tests and catalogue documentation. Do not create analytical storage, alter booking commands, activate policy, introduce notification linkage or change retention. The other eight metric contracts and complete operation identity remain later work under #612.

## Relevant code and architecture

- `src/engine/funnel.ts`: pure aggregation with aggregate-only quality counts.
- `src/hooks/useFunnelData.ts`, `src/hooks/useDenialsData.ts`: staff RLS reads; use a bounded, counted pagination helper and shared UTC window.
- `src/components/views/reports/FunnelReport.jsx`, `CapacityPreventedReport.jsx`: truthful owner-facing interpretation.
- `src/lib/funnelSession.ts`: unchanged attempt identity.

## Data/database and API changes

No migration or writes. Existing queries gain deterministic ordering, an upper timestamp bound and exact counts. Pagination rejects changing counts, missing pages and excessive volume rather than presenting a partial result. No new RPC or customer-facing API.

## UI changes

Keep existing cards and responsive structure. Show loading before prior-period values, observed attempts rather than customers, and quality caveats including when no qualifying sessions exist.

## Security/privacy

Select no human IDs, message text, denial detail or customer names. Aggregate outputs contain no session IDs. Read failures remain isolated to reports; customer telemetry writers are unchanged. No production query or new retention policy is authorised by this plan.

## Dependencies and risks

No dependency on the deferred architecture programme. Best-effort event loss cannot be measured fully; absence of quality warnings is not proof of completeness. Sessions crossing the window boundary are excluded without a start in the window. Concurrent deletes/inserts can change pagination: count/identity checks reject detectable inconsistencies, but no transactional snapshot is promised.

## Migration/rollout

Normal frontend PR with no schema dependency. Verify offline with fixtures; user controls merge. Roll back the frontend commit if necessary. No live metric baseline or numerical rollout threshold is established.

## Implementation sequence

1. Implement explicit reporting window and counted pagination with failure tests.
2. Add funnel quality counts and start-based cohort tests.
3. Update loaders and report language with component tests.
4. Update catalogue with session/window semantics and remaining gaps; validate and publish a draft PR.

## Testing

Run focused aggregation, pagination and component tests, then lint, typecheck, documentation/migration checks, full unit/component tests and offline build using Node 24. Test missing starts, duplicates, missing intermediate events, invalid timestamps/steps, boundaries, partial pages and request rejection. Review final diff manually.

## Observability and documentation

Quality counts remain visible in the funnel card. Existing logger captures source load failures. Update `docs/specifications/measurement-catalogue.md`; no invented owners, baselines or thresholds.

## Definition of done

First slice is complete when the stated behaviours are tested, checks pass and a reviewable PR exists. #612 remains open until its remaining instrumentation, linkage, ten-metric reporting and rollout criteria are implemented and verified.

## Open questions

Later slices require an assigned measurement owner and retention decision before new storage, and governed operation/notification identity before exact cross-channel rates. These do not block this read-only reporting improvement.

**Resolved 9 September 2026:** owner @leamonline; retention 90 days for row-level telemetry, enforced by `20260909150000_telemetry_retention_90_days.sql` (daily `prune_measurement_telemetry()` on `booking_funnel_events` and `booking_denials`). Recorded in the [measurement catalogue](../../specifications/measurement-catalogue.md#privacy-and-retention). Governed operation/notification identity remains open.

## Validation evidence — 8 September 2026

Node 24.20.0: focused tests passed (49 tests); full suite passed (343 files,
3,520 tests). Typecheck, lint (zero errors; 65 existing warnings), documentation
links (106 files), migration validation (217 files), offline build and
`git diff --check` passed. Manual diff review checked raw-field selection,
start-based denominators, cancellation and incomplete-page handling. No hosted
database or customer records were accessed. PR and release evidence pending.
