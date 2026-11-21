Status: Active
Issue: #1243
Base: main@16597bcb
Last verified: 2026-11-21
Owners: Marketing entry point and customer booking UI
Dependencies: None
Related requirements: REQ-A11Y-001, REQ-OPS-001
Related ADRs: None

## Goal
Keep booking reachable on mobile and preserve intent through authentication,
with an identifiable, accessible receipt.

## Why
The supplied mobile audit found cookie controls covering booking, an off-screen
Continue action, duplicate date/time references, and lost receipt focus.

## Current behaviour
The marketing URL opens login without booking intent. Cookie and quick-action
panels both anchor at the viewport bottom. The wizard synthesises a reference
from the date and time despite receiving server booking IDs. Decorative list
items override list semantics with a progressbar role.

## Desired behaviour
Cookie controls and booking occupy separate space. Time actions remain visible.
Sign-in resumes the wizard. Dashboard suggestions are rechecked for the selected
dogs and owner rules. Receipts show the full server-issued booking ID and use
the review's channel wording; terminal headings receive focus.

## Scope
Marketing quick actions, booking URL, dashboard suggested-slot action, wizard,
slot/date selection, receipt copy and focused regression coverage.

## Non-goals
Policy activation, notification delivery changes, production writes and deployment.

## Relevant code
`website/src/components/MobileQuickActions.jsx` measures the booking bar;
`CookieConsent.jsx` reserves that space. `routeGuards.js` already preserves
wizard destinations through authentication. `BookingWizard.tsx` consumes
server IDs; `SlotSelection.tsx` rechecks suggested times using availability.

## Architecture
Retain the existing authenticated RPC write boundary and PostgreSQL capacity
authority. Query parameters are advisory date/time hints, never allocations.
Existing drafts take precedence over dashboard suggestions.

## Data/database changes
None. Use the complete first booking ID returned by the authorised write as the
receipt reference, including grouped appointments. Do not truncate or invent IDs.

## API changes
None.

## UI changes
Measured cookie offset, fixed mobile time actions with reserved space, an explicit
Choose this time action, shared channel copy, heading focus and decorative paws.

## Security/privacy considerations
No customer data accessed. Tests use synthetic records. Suggested times never
bypass owner rules, date eligibility or final server validation.

## Dependencies
No schema or provider dependencies. Tracking issue: #1243.

## Risks
Stale suggestions: recheck availability and leave Continue disabled when absent.
Long IDs: wrap the full reference. Mobile overlays: check a short viewport before
cookie dismissal. Existing drafts remain authoritative over new suggestions.

## Migration/rollout
Frontend-only deployment through the ordinary review/release process. Rollback
is a frontend revert. No deployment is performed by this task.

## Implementation sequence
1. Separate cookie and booking controls; target the wizard route.
2. Correct receipt identity, messaging and focus; hide decorative progress.
3. Fix time actions and add revalidated dashboard suggestions.
4. Run focused tests, static checks, builds and mobile geometry checks.

## Testing
Run wizard/date/slot component tests, dashboard slot-action and auth-route tests,
marketing tests, typecheck, lint, documentation and migration checks, builds, and
the mobile cookie-entry Playwright regression. Record actual results below.

## Observability
Existing funnel and denial logging remain unchanged. Regression tests cover
receipt focus, server identity, suggestion rejection and sign-in continuation.

## Documentation updates
Update customer user flows and this plan with validation evidence.

## Definition of done
All five audit items implemented with focused checks; full validation limitations
recorded, changes ready for review, no production action taken.

## Open questions
No product-policy decision is needed. GitHub access was restored on 21 November.

## Validation evidence

- Application suite: 509 files, 5,748 tests passed. Focused booking/auth/slot
  coverage: 24 files, 135 tests passed.
- Marketing suite: 237 tests passed; marketing lint and production build passed,
  including prerendering 15 routes and the 404 page.
- Application typecheck, lint (66 existing warnings, zero errors), documentation
  links, migration naming and production build passed.
- System Chromium: the committed mobile entry regression passed at 360 × 640
  with consent undismissed. Browser download was unavailable (HTTP 403), so a
  temporary configuration selected `/usr/bin/chromium` instead.
- Real SlotSelection rendered with synthetic availability in an isolated local
  fixture: selecting 9:00am enabled Continue within the 360 × 640 viewport and
  clicking it invoked the next action. Temporary fixtures were removed.
- No live customer records, production writes or deployments. GitHub issue/PR
  linkage and review remain outstanding because issue lookup returned HTTP 403.
