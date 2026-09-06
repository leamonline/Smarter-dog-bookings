# Scheduled holiday notices backed by operational closures

Status: Active
Issue: [#786](https://github.com/leamonline/Smarter-dog-bookings/issues/786)
Base: origin/main at fc470f63494413ad2aa2785541ad87361a2d0a86
Last verified: 2026-09-05
Owners: One serial implementer owns database contract, wrappers, staff UI and both customer surfaces
Dependencies: Coordinated website PR; repository import #784 remains separate
Related requirements: [PROJECT.md](../../../PROJECT.md), [booking capacity](../../capacity-engine.md)
Related ADRs: [PostgreSQL authority](../../architecture/decisions/001-postgresql-capacity-authority.md)

## Implementation discovery — 5 September 2026

The user authorised implementation and live release after this plan merged in PR #787. The website import is still outstanding and its original checkout contains unrelated edits. Deliver the website card in a separate clean worktree/PR in the existing website repository, preserving the hosting boundary; #784 will later import those commits. This replaces the original consolidation prerequisite without expanding this feature into a hosting migration.

Use first closed date and reopening date; the last closed date is derived as the day before reopening. This removes contradictory date inputs. Save/edit accepts a stable UUID and expected revision, rejects stale edits, and replays identical immediately preceding requests. Maximum closure length is 90 days. Both closed days and advertised reopening are guarded against direct changes, including NULL status and deletes. Retiring or editing a holiday never reopens old dates. The advertised reopening must already be explicitly open in the diary.

See [ADR 010](../../architecture/decisions/010-holiday-notices-operational-closures.md) for the implementation contract. The migration creates no holiday records. The user supplies actual holiday dates after release. The user retains merge control.

## Implementation evidence — 6 September 2026

Branch `codex/holiday-notices-implementation`, migration `20260905141035_scheduled_holiday_notices.sql` (idempotent; re-applied cleanly). Local results on a Homebrew PostgreSQL 15 replay of every migration: `supabase/tests/220_holiday_notices.test.sql` 26/26 assertions pass; `scripts/verify-holiday-concurrency.py` passes both real multi-session races (direct diary edit fails fast without waiting on its row lock; competing booking and holiday commits keep exactly one linked rearrangement task, and a later direct reopening is rejected). `npm run lint`, `check:docs`, `typecheck`, `check:migrations`, `test` (3375 tests) and `build` all pass. Production migration and the website card PR remain outstanding; record their evidence here before moving this plan to completed.

## Goal

Implement the selected prominent holiday card with automatic advance/away/hidden scheduling on the homepage and date-selection step. Publish only a holiday backed by operationally closed dates and a verified reopening date.

## Why

Customers should understand why dates cannot be selected and be encouraged to book for the salon's return. A marketing-only closure list can contradict actual availability and must not drive this feature alone.

## Current behaviour

Code inspected on 5 September 2026:

- src/components/views/settings/HoursSettings.jsx stores reference closures in salon_config and explicitly directs operational date changes to Bookings.
- src/components/customer/booking/DateSelection.tsx loads operational open-day data and caches page availability.
- src/supabase/hooks/useDaySettings.ts closes dates through closeDayWithRearrangementTasks; other settings writes use day_settings upsert.
- supabase/migrations/20260728214151_closure_integrity.sql establishes atomic closure and linked rearrangement-task safeguards. Later migrations must be reconciled before changing this contract.
- get_public_salon_facts returns reference closures; get_public_open_days exposes limited operational open-day data. These do not establish a typed holiday announcement or atomic holiday-range save.
- The website has src/hooks/useSalonFacts.js and src/components/SmarterDogHomepage.jsx; its source remains in the separate repository. No production data was inspected.

## Desired behaviour

Staff enter first closed date, last closed date, reopening date and advance-notice start date. A preview explains the exact public wording and closed dates. Saving an enabled holiday commits all required closures and notice metadata together, or saves nothing.

Before the notice start there is no card. Between notice start and closure start, show “Upcoming holiday” and the closure/reopening dates. During the closure interval, show “We're taking a little break” and “We reopen on [date]”. At the reopening date, remove the holiday card automatically. Use Europe/London calendar dates, including daylight-saving boundaries; this is a date-based notice, not a promise that the salon is open at midnight.

Homepage action: “Book for our return”. Date selection labels holiday dates as unavailable and offers “Find dates after our holiday”. Use “Next available date” only when actual capacity for the selected dogs/services has been verified. Reopening is not a promise of available appointments.

## Scope

Staff holiday management, atomic persistence, narrow public projection, scheduled presentation, booking-calendar integration, website homepage card, failure states and regression coverage.

## Non-goals

No real holiday activation, automatic cancellation, automatic messaging, booking-policy changes, arbitrary marketing campaigns, private customer-data reads or deployment in this planning change.

## Relevant code

HoursSettings.jsx, useDaySettings.ts, DateSelection.tsx, src/supabase/rpc.ts, src/supabase/database.types.ts and the closure-integrity migration above are the integration boundaries. Website useSalonFacts.js and SmarterDogHomepage.jsx are discovery entry points; recheck their current contents after import. Inventory all booking writers and direct day_settings writers before designing guards.

## Architecture

PostgreSQL retains booking authority. Holiday metadata identifies a reason and announcement schedule; day_settings retains operational availability. A server command must coordinate both in one transaction. Both customer surfaces use one minimal public projection validated against current operational settings. Do not independently reconstruct holiday ranges from arbitrary consecutive closed days or infer holidays from missing rows.

## Data/database changes

Authorised for implementation by the user request to implement and make live: a durable holiday record and staff-only atomic command, plus a narrow public read. The schema and ADR form the same reviewed implementation change. Validate ordered dates, bounded ranges and non-overlap. Require an explicitly open reopening day and closure coverage through the day before it; do not guess from reference hours. Use ordered locks compatible with existing booking/closure locks and an idempotent retry identity. Reuse the closure task semantics and preserve slot overrides. Prove rollback on any failed date.

Staff attempts to reopen a covered holiday day should be rejected with a route to edit the holiday. Editing or retiring an announcement must not silently reopen dates or erase existing rearrangement work. Changing operational dates requires an explicit preview of affected days, preserving unrelated closures. If a reopening day later closes, invalidate the public reopening claim and require staff correction. These guard decisions require review of all current writers to avoid breaking existing workflows.

## API changes

Propose a staff save/edit command and a bounded public holiday projection with only identifier, public dates and derived presentation state. Exclude internal labels, customers, occupancy and private settings. Retain existing open-day RPC grant boundaries. Projection failure or inconsistency must not fall back to stale reference closure copy. Current booking availability and final database validation continue independently.

## UI changes

Staff form includes preview, saving/error/success states and affected-appointment review through existing authorised staff workflows. Customer notices use semantic headings, readable contrast and keyboard-accessible buttons. Calendar labels distinguish holiday closure from full capacity. Website card sits prominently near the primary booking action without replacing the homepage layout.

Refresh on focus, calendar navigation and the next London date boundary; invalidate cached availability following schedule changes. On unavailable notice data, omit unverified dates and keep normal availability/error handling; never imply the salon is open merely because the notice is absent.

## Security/privacy considerations

Enforce staff authorisation server-side. Public read returns explicit safe fields, with direct-table reads denied. Do not widen existing RPC grants. Test anonymous and customer write denial and authorised staff operations. Use deterministic synthetic fixtures only. No messages are sent and no appointment is cancelled by saving a holiday.

## Dependencies

Website integration is delivered in its current repository; #784 imports it later. Booking/database design can proceed independently once its scope is authorised. No actual dates are needed to build the feature. Activation later requires the user's real dates. Production schema deployment requires separately verified target and authority.

## Risks

Reference hours diverging from diary; concurrent booking during closure; overlapping ranges; a closed reopening day; stale open tabs; long holidays beyond public read horizons; availability outside the booking window; duplicate rearrangement tasks; edited announcements reopening unrelated closures. Tests must cover these explicitly. Do not expand public availability horizons silently to support long holidays; expose only necessary notice dates and keep existing booking-window limits.

## Migration/rollout

First approve the database contract and record an ADR. Implement append-only migrations locally with pgTAP and concurrency proof. Prepare both apps against the new contract using safe absent-capability behaviour. Present exact migration target, checks and rollback plan before production authorisation. Apply compatible schema before dependent frontend releases. No enabled holiday is created during rollout. Prefer a forward fix; disabling notices must not reopen the diary. Retain database guards while consumers roll back.

## Implementation sequence

1. Reconcile current migrations, callers and website integration; write accepted contract/ADR and resolve locking details.
2. Implement local database contract and meaningful tests before UI consumers.
3. Add typed repository/wrapper layer and staff form, preserving operational task semantics.
4. Add shared public notice contract consumption and customer date-selection behaviour; then integrate website after #784.
5. Validate both builds, accessibility/responsiveness and stale/error scenarios; prepare a reviewable PR and target-specific release runbook.
6. Execute separately authorised deployment, record exact evidence and move this plan to completed only when all acceptance criteria pass.

## Testing

Run npm run check:docs, npm run lint, npm run typecheck, npm run check:migrations, npm run test and npm run build. Database work also requires npm run test:db and npm run test:db:concurrency. Website requires its lint, unit, build and Playwright scripts after import.

Test transaction rollback, idempotency, grants, direct reopening attempts, existing visits/tasks, overlapping holidays and booking/closure races. Test scheduled states before/on each boundary, British Summer Time transitions, multiple holidays, stale tabs, failed reads, missing capability, no slots after reopening and booking-window limits. Verify both surfaces on desktop, tablet and mobile with synthetic data. Confirm server rejects a direct booking on a holiday date regardless of UI state.

## Observability

Record exact code and migration revisions, local check results, public response shape and synthetic preview evidence. Staff need a clear mismatch/error state; log identifiers/error codes rather than customer data. Separate deployment success from public behaviour verification.

## Documentation updates

Update settings/booking user flows, public RPC documentation, capacity references where necessary, architecture ADR, website maintenance notes and changelog. Link the implementation PR and deployment evidence here. Do not mark #786 complete for planning alone.

## Definition of done

One authorised staff action atomically saves operational closures and the scheduled announcement; both surfaces agree; booking writes enforce closure; existing visits are preserved and flagged; edits cannot create inconsistent claims; all relevant tests/review pass; exact deployment and rollback evidence is recorded. No live holiday activation is implied.

## Open questions

Implementation and release authorisation were provided by the user; the user controls merges. Reconcile exact lock ordering and all day_settings writers from code, rather than asking the user to design them. Actual holiday dates are needed only for later activation. Automatic reopening of diary dates is intentionally excluded: the notice disappearing is not an instruction to change operational availability.
