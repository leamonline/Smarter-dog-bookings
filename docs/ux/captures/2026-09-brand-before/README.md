# Brand reskin — before captures

Baseline for the brand reskin plan (`docs/plans/active/2026-09-20-brand-reskin.md`).
Captured 2026-09-20 against `main@87c6fe47` (plan base `8816f06` plus two
e2e-test-only commits).

- `today`, `dogs`, `inbox`, `modal-new-booking`: local dev server in offline
  sample-data mode (`VITE_FORCE_OFFLINE=1`) — deterministic fixture data, no
  customer data. `today` shows Monday 21 September (an open day with the
  sample day plan); the modal is "New booking" opened from Daily Brief.
- `staff-sign-in`, `customer-sign-in`: production (`www.smarterdog.co.uk`),
  no login performed. The offline dev server cannot render the staff login
  (the offline route guard admits the app directly), and its test Turnstile
  key prints a "for testing only" banner, so the real pages were captured
  instead. Production deploys from `main`.
- `portal-home` and `booking-wizard` from the plan's list are **absent**: the
  customer portal has no offline/sample-data path (`CustomerDashboard` fetches
  internally; the route guard has no offline allow), so an authenticated
  customer session is required. To be added separately once a safe route is
  agreed (see the reskin issue).

Viewports: `mobile` = 390×844, `desktop` = 1440×900.
