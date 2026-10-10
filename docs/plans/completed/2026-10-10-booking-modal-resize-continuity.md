# Booking and modal resize continuity

Status: Active
Issue: [#964](https://github.com/leamonline/Smarter-dog-bookings/issues/964)
Base: `main@69be16c961d1f1c2e1262da058d15dc2d68cefc4`
Last verified: 2026-10-10
Owners: customer booking wizard, staff new-booking drawer, shared modal shells and browser coverage
Dependencies: first resize-continuity slice merged in #837
Related requirements: preserve booking state, focus and navigation across layout changes
Related ADRs: None; this keeps the existing mounted-state and shared-shell boundaries

## Goal

Customers and staff can resize, rotate or unfold the viewport during a booking
without losing work or being moved to another route. Dialogs can change between
sheet, drawer and centred presentations without remounting, resetting their
scrolling body or corrupting focus and background isolation.

## Current design

- `BookingWizard.tsx` owns customer selections and renders the responsive shell
  continuously; CSS adds the summary column from 1024px.
- `NewBookingModal.jsx` owns the staff draft and stays mounted in `DrawerShell`;
  the drawer becomes full-width below 640px.
- `ModalShell.jsx` changes entity dialogs between full-screen and centred
  presentations with CSS at 640px.
- `AccessibleModal.tsx` owns focus containment, Escape, restoration, sibling
  isolation and reference-counted body scroll locking.
- `adaptive-layout.spec.ts` covers the general staff shell and folding-phone
  shapes, but does not exercise booking state or live modal transitions.

## Implementation

1. Add focused tests that drive a booking draft and modal state through width
   changes. Record the pre-change failures before modifying production code.
2. Keep state above presentation decisions. If a failure requires a fix, change
   the shared shell or state owner rather than maintaining separate mobile and
   desktop copies.
3. Add one real-browser continuity spec covering repeated transitions at
   639/640 and 1023/1024, then sweep 767/768, 1279/1280, 1439/1440, 360px cover
   and 700px unfolded widths for overflow and reachable actions.
4. Run the changed spec on desktop Chromium, tablet/mobile Chromium and mobile
   WebKit. Keep deterministic offline data and avoid authenticated customer or
   production reads.
5. Run the repository validation bar, open a draft pull request linked to #964,
   and leave merging to the owner.

## Acceptance evidence

- [x] Customer wizard values and focused control survive the 1023/1024 change.
- [x] Staff new-booking selections, scroll and focus survive 639/640 repeatedly.
- [x] Entity modal identity, scroll and modal semantics survive 639/640.
- [x] Route and browser-history length do not change during any resize.
- [x] The breakpoint matrix has no horizontal overflow or clipped primary action.
- [x] Focused tests, full test suite, lint, types, docs, migrations and build pass.
- [x] Pull request and exact verification revision are recorded here.

## Verification evidence

- `booking-modal-continuity.spec.ts`: 9/9 on desktop, tablet and mobile
  Chromium; 3/3 on mobile WebKit.
- Vitest: 406 files and 4,281 tests passed.
- `check:docs`, lint, typecheck, migration validation and production build
  passed on Node 24.20.0. Lint retained 66 pre-existing warnings and added no
  errors.
- Verified implementation revision: `bb3bad6aca24329dea5cb351ede8a056846a880c`.
- Draft pull request: [#965](https://github.com/leamonline/Smarter-dog-bookings/pull/965).

## Recovery

The slice is frontend-only. Revert the pull request to remove the new continuity
behaviour and tests; there is no database or hosted configuration rollback.
