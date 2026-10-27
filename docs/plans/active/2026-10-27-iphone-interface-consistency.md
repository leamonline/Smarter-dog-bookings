# iPhone interface consistency implementation plan

Status: Active
Issue: #1142
Base: origin/main at a5f356fa
Last verified: 2026-10-27
Owners: Shared UI controls, directory integration, Daily Brief header, auth feedback and design documentation
Dependencies: None
Related requirements: GOAL-03 and GOAL-04 preservation; approved owner critique follow-up
Related ADRs: ADR 009 (preserve independent application boundaries)

## Goal and why

Make the existing interface easier to use on the staff's main device, an iPhone:
full-width directory search; specific recovery; consistent controls; accurate
rules; and less header overhead before the first dog in Daily Brief. Investigate
the captured sign-in security failure before any cosmetic sign-in changes.
The owner explicitly approved this set in the critique conversation on 27 October.

## Current behaviour

At the base above, PageHeaderSearch owns a raw input and clear button, and shares
a mobile row with Add and directory-key controls. PageHeaderAction duplicates
Button styling. ErrorBanner uses a 28px retry button and vague defaults.
TodayHeader wraps its date, open/closed pill and two-line availability action,
then mixes actionable attention segments with quieter day totals.
CustomerLoginPage clears the token on widget error but still says no clicks are
needed; no app-level error explains the widget failure. The supplied screenshot
says incorrect device time. Its original capture script is unavailable.

## Desired behaviour and scope

1. Dogs/Humans search gets its own full-width mobile row, retains query state,
   uses Input and a 44px clear target, and restores focus after clearing.
2. Header actions delegate to Button; use yellow for directory leads and portal
   booking CTA/confirmation, charcoal for strong secondary actions. Shared focus
   is charcoal; disabled controls retain readable text.
3. ErrorBanner uses shared controls and wrapping layout. Recovery labels name the
   operation. No automatic message retry or claim of non-delivery is introduced.
4. Daily Brief keeps date/open state, actionable warnings, availability access,
   and all totals; groups quieter totals and compacts the availability label on
   phones. Unknown-status/deposit warnings remain ahead of the stack.
5. Document code/visual discrepancies and investigate Turnstile with source,
   official provider guidance, callback tests and synthetic browser evidence.

## Architecture, data/database and API changes

Use existing React/Tailwind primitives. No database, RPC, capacity, booking,
notification, retention, provider-key or deployment changes. PageHeaderAction
adds an optional variant with strong default; existing native button props and
icon API remain. PageHeaderSearch public props/ref remain compatible.

## Relevant code and owned paths

- src/components/ui/{PageHeader,ErrorBanner,Card}.jsx and focused tests.
- src/components/views/{DogsView,HumansView}.jsx and directory controls.
- src/components/views/today/TodayHeader.jsx and tests; TodayView only if needed.
- src/components/auth/CustomerLoginPage.jsx and captcha feedback tests.
- src/lib/turnstile.ts and tests for public provider error interpretation.
- src/customer-portal.css and booking/booking-wizard.css for action recipes.
- docs/modal-standard.md, docs/ux/, .design-sync/conventions.md and usage docs.

## Non-goals and security/privacy

No new decoration or loading effects. Do not alter DayCard, dayCard.css,
DayStack, stackLayout, useStackGeometry or dayStack.css. Frozen operational
colours and 12px floor remain. Use deterministic sample data, no production
customer access or auth submissions. Inspect only public sign-in presentation
if useful. Keep missing/invalid CAPTCHA fail-closed and existing OTP verification
availability. Never replace a live challenge with a passing stub in production.

## Implementation sequence

- [x] Baseline focused tests; add failing behavioural tests for clear focus,
  disabled/loading action forwarding and explicit error recovery.
- [x] Implement shared controls and mobile directory layout; verify filtering,
  target sizes and focus at 390px and desktop.
- [x] Add checks for separate attention/day-totals groups; compact TodayHeader
  only; compare first-card position and preserve stack geometry.
- [x] Investigate provider time-error mapping, test error/recovery callbacks,
  give truthful guidance without auth bypass or speculative configuration fixes.
- [x] Reconcile active design guidance, usage examples and preview copy with
  actual implementation; record unresolved historical export provenance.
- [x] Run focused and full tests, lint, typecheck, docs, migrations and build;
  browser smoke on phone/desktop and WebKit where available; review diff.

## Testing and observability

Run npm test for UI/header/auth/directory coverage, then npm test in full.
Run npm run check:docs, npm run lint, npm run typecheck,
npm run check:migrations, npm run check:design-system and npm run build.
Browser plugin is not available; use repository Playwright, sample-data mode.
Test full-width input and query/clear focus; retry and dismiss actions;
compact date/availability, attention highlights and unchanged card heights;
CAPTCHA error/success/expiry without any auth request. Record screenshots
outside the repository. No customer free-text logging.

## Risks, migration/rollout and dependencies

Header actions may have call-site overrides; inventory before delegating.
Long date/attention text must wrap without hiding controls. Exact capture-clock
cause may remain unproved: distinguish provider classification, reproducible
sample behaviour and production health. No migration required. A reviewed PR
is the release boundary; merging/deploying needs separate authority. Revert
frontend commits to roll back.

## Documentation and definition of done

Update shared component usage, button/form/voice/modal rules and Daily Brief
reference. All checks and reviewed browser evidence must agree; record any
unavailable evidence instead of claiming it passed. Link issue and PR when
created. Preserve original design decisions and deferred safety-card work.

## Open questions

No owner decision blocks the approved scope. Production CAPTCHA health and the
original screenshot's browser clock remain evidence questions, not permission
to inspect secrets or change provider settings.

## Local verification — 27 October 2026

- Full Vitest: 464 files, 5,166 tests passed after final behaviour changes.
- Chromium: 99 interface/day-stack cases passed across desktop, tablet and phone.
- Production sample build: 9 interface cases passed across the same viewports;
  standalone mobile Chromium and WebKit checks also verified clear/focus,
  availability opening, no page exceptions and unchanged 144px stack headers.
- Existing WebKit smoke: 11 cases passed. Portal/wizard action CSS was exercised
  in an explicitly synthetic style harness, not an authenticated booking journey.
- Header-to-first-dog distance in the checked 390px sample fell from 319px to
  271px (48px). The production sample banner adds 64px above the app; the check
  deliberately excludes that unrelated banner rather than hiding it.
- Docs, typecheck, lint, migrations, design-system health and sample build passed.
  Lint reports 66 existing warnings, no errors. Raw-button ceiling fell 451 to 449.
- Independent code review: no actionable findings after retaining visible online
  availability status. No protected day-stack source file changed.
- Public widget mounts, but automated challenge completion was not established;
  exact original clock/cache cause and normal-iPhone login remain unverified.

The plan remains active for PR review/release. No merge or deployment performed.
