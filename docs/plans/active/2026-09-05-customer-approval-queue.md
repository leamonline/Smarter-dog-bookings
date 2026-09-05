# Customer approval queue

Status: Active
Issue: [#782](https://github.com/leamonline/Smarter-dog-bookings/issues/782)
Base: main at 546e57aa
Last verified: 2026-09-05
Owners: approval repository, hook, queue/review components and staff route integration
Dependencies: None
Related requirements: [Product user flows](../../product/user-flows.md)
Related ADRs: None; existing repository, hook and drawer patterns

## Goal

Staff can discover waiting signups on Humans, review every active dog, save sizes and approve from one panel.

## Why

The accepted option 2 combines decisions currently split across directory filters, human approval actions and individual dog editors.

## Current behaviour

Verified in the checkout, not through production data: `HumansView` has a New customers filter; `HumanHeader` exposes approval; `DogDetailsSection` edits size. The latest approval definition in `20260712115759_legal_risk_tranche1.sql` locks the human and rejects unconfirmed active dogs. `useHumanLifecycle` requests a welcome after approval but does not return its outcome. Canonical breed sizing is server-owned; customer-reported sizes are not authoritative.

## Desired behaviour

An independent oldest-first queue with exact count opens a responsive drawer. Every dog has labelled size choices. Staff can save partial sizing for later or save complete sizing and approve. Failures retain the review and explain recovery.

## Scope

New staff-only approval repository, focused hook, queue and review panel, route props, focused tests and documentation. Reuse existing drawer accessibility and lifecycle approval callback.

## Non-goals

No policy, notification delivery, signup, schema, account, production or customer-data changes. Existing reject/merge/profile workflows remain available.

## Relevant code

- `src/components/views/HumansView.jsx`: queue placement.
- `src/components/layout/StaffRoutes.jsx`: existing approval callback wiring.
- `src/components/shared/DrawerShell.tsx`: accessible responsive shell.
- `src/supabase/hooks/humans/useHumanLifecycle.ts`: approval and welcome outcome.
- `src/supabase/repositories/signupApprovalRepo.ts`: new narrow reads and guarded sizing writes.

## Architecture

The repository owns raw column names and row conversion; the hook owns loading and refresh; components own presentation and draft selection. Reads are independent of directory pagination. Size updates use staff RLS with expected owner, breed and size checks. Approval uses the unchanged staff RPC after successful saves. A failed later size write may leave earlier sizes saved; recovery refreshes canonical state and never claims atomicity.

## Data/database changes

None. No migration, grants, backfill or generated-type changes. PostgreSQL retains approval and sizing authority.

## API changes

Expose a welcome outcome on successful lifecycle approval while preserving `ok`. No Edge or RPC changes. Treat provider acceptance separately from delivery; ambiguous responses remain unconfirmed and are not automatically retried.

## UI changes

Queue: loading, retry, zero count, exact count and pagination. Drawer: loading/error, customer details, every active dog, existing selected sizes, reported-size help, missing-size guidance, save for later, save-and-approve and separate welcome outcome. Use focus trapping/restoration, labelled native radio inputs and large targets. Disable dismissal during writes; warn before discarding unsaved draft choices.

## Security/privacy considerations

Only mounted in staff Humans routes. Existing RLS guards all reads/writes. No credentials or real customer records used for testing, no new logs containing personal data. Sample/offline mode disables database actions.

## Dependencies

Existing deployed signup and size contracts; no new prerequisite identified. Follow [ROADMAP](../../../ROADMAP.md) boundaries.

## Risks

Partial saves, concurrent breed/size edits and disconnected clients: conditional writes, canonical reload and server final check. Realtime updates refresh the queue without overwriting a draft. Count/read errors must not appear as zero. Multiple dogs must not be truncated by a directory cache.

## Migration/rollout

Frontend-only normal PR release; no hosted commands. Manual user merge. Roll back by reverting the frontend change; persisted sizes remain ordinary staff edits. Production verification requires separate authority if it involves real records.

## Implementation sequence

1. Add narrow paginated queue and complete review reads plus guarded size persistence.
2. Add hook, accessible queue/drawer and route integration.
3. Expose truthful welcome outcome, test save/approval failure and stale state.
4. Run focused tests, repository checks and sample browser checks; record evidence.

## Testing

Repository tests for filters, page boundaries, conversion and guarded writes. Component tests for missing sizes, multi-dog saves, save-for-later, failure, retry, draft retention and approval outcomes. Run `npm run check:docs`, `npm run lint`, `npm run typecheck`, `npm run check:migrations`, `npm run test`, `npm run build`. Browser checks use deterministic sample fixtures only.

## Observability

Inline errors and success receipts distinguish saved sizes, approved customer and welcome request outcome. Existing notification logs remain the source for message reconciliation.

## Documentation updates

Update [user flows](../../product/user-flows.md), CHANGELOG and this plan with evidence and limitations.

## Definition of done

Accepted flow implemented; focused and repository checks recorded; responsive and keyboard behaviour verified with synthetic data; reviewable branch/PR with no production changes. Move plan to completed only when release evidence is available.

## Open questions

None blocking the approved frontend scope.

## Verification evidence — 5 September 2026

- Installed dependencies with `npm ci` under Node 24.20.0. The initial shell
  used Node 20; the engine guard rejected that install before changes.
- Full Vitest suite: 326 files, 3,365 tests passed. Final focused rerun after
  queue copy/accessibility changes: 6 files, 110 tests passed.
- Typecheck, lint (65 pre-existing warnings, zero errors), documentation links,
  migration validation (212 unchanged migrations), and sample-mode production
  build passed.
- Independent code review found and rechecked fixes for dismissing during a
  save and classifying uncertain welcome results. No remaining important
  findings in the reviewed scope.
- Chromium exercised the actual queue and drawer with synthetic repository
  fixtures: keyboard size selection, save for later, approval receipt, return
  to queue and count refresh. Reviewed screenshots at 390×844, 768×1024 and
  1440×1000; the mobile drawer fills the screen and actions remain visible.
- Local screenshots and the temporary browser harness live under
  `output/playwright/approval/` and are not production assets or PR source.
- No hosted database, customer-data or message-sending verification performed.
  Existing RLS/RPC behaviour is relied upon; no migration was introduced.
- Plan stays active pending PR/release evidence. Deployment and merge remain
  separate from these local checks.
