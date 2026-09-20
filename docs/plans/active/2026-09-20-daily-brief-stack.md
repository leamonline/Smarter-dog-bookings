# Daily Brief appointment interaction

Status: Active
Issue: #891
Base: origin/main at 2379ab57
Last verified: 2026-09-20
Owners: Daily Brief stack, shared refresh interaction and their tests
Dependencies: None
Related requirements: [Daily Brief contract](../../today-command-centre.md)
Related ADRs: None

## Goal

A genuinely overlapping, responsive appointment stack with fixed headers,
selection motion and pull-distance-driven separation, retaining all actions.

## Why

The owner supplied Wallet/Monzo references and requested physical card overlap
rather than the existing list. Screenshots are visual references only.

## Current behaviour

`DayStack.jsx` renders a flex list, with one expandable `StackCard.jsx` per row.
Welfare chips currently add height. `PullToRefresh.jsx` is used by the calendar
but not Daily Brief. `AppFrame` owns the real main scroll area and navigation.
These are repository observations, not production verification.

## Desired behaviour

The first appointment is the initial focus, without automatically opening its
information. Selecting a card brings its details forward. Earlier cards remain
in chronological order; future cards overlap with uniform exposed strips.
Time, dog, status/balance and welfare warnings stay exposed. Overflow scrolls
instead of shrinking hit targets. Reduced motion removes settling transitions.

## Scope

DayStack, StackCard, a pure layout function, shared pull progress and Daily Brief
integration. Focused logic/component/browser coverage and domain documentation.

## Non-goals

Other page sections, data models, legal action rules, dependencies, production
access, deployment and architecture-programme activation.

## Relevant code

- `src/components/views/today/stack/DayStack.jsx`: selection and positioning.
- `src/components/views/today/stack/StackCard.jsx`: existing information/actions.
- `src/components/shared/PullToRefresh.jsx`: gesture/refresh state.
- `src/components/views/TodayView.jsx`: composition and refetch callback.
- `e2e/day-stack.spec.ts`: existing full action journeys.

## Architecture

Keep stable booking keys, original DOM order and original action callbacks.
Derive translateY offsets from index, selected id, measured detail height,
main's available viewport and refresh progress. Keep full opaque card surfaces;
future cards cover lower portions of previous future cards so top strips remain
visible. The selected card has the highest layer. No new animation dependency.

## Data/database changes

None.

## API changes

Expose optional read-only refresh context to descendants. Existing calendar
usage remains compatible. No RPC or backend changes.

## UI changes

Fixed header dimensions reserve welfare space. Full safety notes are available
in the drawer without altering header height. Exposed controls stay at least
44px. Selection and refresh do not activate appointment actions accidentally.
Empty/loading/error, unknown status recovery, collected summary, financial
states, notes, payment chain and modals remain on their existing paths.

## Security/privacy considerations

Only deterministic offline data for verification. No screenshot personal data
is copied into fixtures or documentation. No credentials or hosted DB access.

## Dependencies

None. Existing dirty checkout is isolated from this worktree.

## Risks

Overlapping hit areas, hidden keyboard focus, clipped long warnings, changing
viewport heights, gesture conflicts, refresh cancellation/re-entry. Mitigate
with exposed header controls, full notes in the drawer, measured geometry,
native scrolling outside eligible downward gestures and browser tests.

## Migration/rollout

Frontend-only review branch. No deployment or merge is implied. Revert the
frontend change to roll back; there is no schema compatibility window.

## Implementation sequence

1. Implement layout and consistent card header; preserve existing actions.
2. Connect refresh progress with proper scroll and cancellation guards.
3. Verify geometry, selection, reduced motion and existing action journeys.
4. Update domain contract and record exact validation evidence.

## Testing

Run layout and component tests, `e2e/day-stack.spec.ts` plus new gesture/geometry
coverage on mobile, tablet and desktop, then docs, lint, typecheck, migration
check, full unit/component tests and offline build. Use Node 24.

## Observability

Sample-data screenshots, DOM geometry, touch hit-testing and browser console.
No new production telemetry or customer logging.

## Documentation updates

Update this plan, `docs/today-command-centre.md` and `CHANGELOG.md`.

## Definition of done

Equal card/header heights, real overlap, drag-linked separation, reachable
warnings/actions, smooth selection, cancellation and error recovery, reduced
motion, responsive scroll and passing relevant checks. Record review and any
untested device limitations. Production release is separate.

## Open questions

None blocking implementation. Physical iPhone feel needs owner review even
with passing emulated mobile checks.

## Implementation discoveries and validation — 20 September 2026

- Selection scrolling must wait one animation frame for measured expanded height
  to reach the DOM. Otherwise the browser clamps the scroll target to the old
  collapsed scroll range. Explicitly disable scroll anchoring for this view.
- The production sample banner changes available space. Browser tests measure
  the main scrollport instead of assuming a fixed navigation height. Floating
  transformed rectangles on high-DPI tablets are compared within 0.001px.
- Fixed headers are 144px; exposed strips are 96px, including a reserved 44px
  welfare row. This deliberately keeps warnings visible instead of reproducing
  the reference's narrower strips. Full warning text opens in the drawer.
- Self-review covered stable booking identity/order, opaque stacking, inert
  closed controls, cancellation/re-entry, responsive overflow, observer cleanup
  and the unchanged action/write paths. No parallel agent review was used.

Validation used Node 24.20.0 and deterministic sample data:

- `npm test`: 381 files, 4,010 tests passed.
- `npm run lint`: passed (66 existing warnings outside this change).
- `npm run typecheck`, `npm run check:docs`, `npm run check:migrations`: passed.
- `CI=1 VITE_FORCE_OFFLINE=1 npm run build`: passed.
- Existing `e2e/day-stack.spec.ts`: all 23 tests passed on each of desktop,
  tablet, mobile Chromium and mobile WebKit against the production build.
- New `e2e/day-stack-wallet.spec.ts`: all 5 tests passed on the same four
  environments after correcting fixture assumptions about production chrome.
  Together these are 112 passing browser scenarios.
- Chromium native touch dispatch exercised threshold/release without an
  accidental appointment click, and native vertical scrolling without refresh.
- Local preview at `http://127.0.0.1:4188/today?date=2026-07-14` renders meaningful
  content, has no framework overlay or JavaScript exceptions, and selection
  updates the rendered card. The local Vercel analytics script returns 404
  because that endpoint exists on Vercel rather than the local preview server.
  Earlier cold-load font-preload warnings were unrelated to stack behaviour.
- Mobile/desktop screenshots were inspected and saved outside the repository.
  Browser plugin was unavailable; validation used the existing Playwright setup.

Physical iPhone feel remains for owner review. No hosted data access, merge,
production deployment or customer messages were performed.
