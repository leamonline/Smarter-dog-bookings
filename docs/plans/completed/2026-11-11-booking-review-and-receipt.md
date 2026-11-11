Status: Completed
Issue: #1201
Pull request: https://github.com/leamonline/Smarter-dog-bookings/pull/1202
Base: feat/inline-booking-confirmation, cb7e653050852ced09782e5dc742de51764a343e plus current local changes
Last verified: 2026-11-11
Owners: booking drawer, confirmation read model and tests
Dependencies: None
Related requirements: REQ-NOT-001, REQ-A11Y-001
Related ADRs: None

## Goal
Make the staff booking review reachable on small screens and show truthful,
separate booking and customer-message outcomes.

## Why
The fixed dog section occupies most of a phone landscape viewport. Expanded
date/time pickers push review below the fold. Staff also need to see the saved
contact preference and confirmation status without repeating the booking.

## Current behaviour at discovery
NewBookingModal owns draft state and sends its method into the existing booking
insert path. commitBookingList currently discards saved row identities; draft
IDs are replaced by useBookings. notification_log.sent records provider
acceptance; matching whatsapp_messages receipts prove delivery for SMS/WhatsApp.
humans.preferred_channel exists but is not available in the drawer's owner map.
These are code observations, not fresh production evidence.

## Desired behaviour
Only header/footer stay fixed. Chosen date/time collapses into an editable
summary without losing state. The preferred-method label uses the saved value,
with honest unset/loading/error states. Saved dog prices take precedence over
guide prices, extras stay included, and variable prices are qualified. A success
receipt keeps created IDs separate from draft IDs, displays message status and
offers only message recovery after a known failure.

## Scope
Drawer components, contact/delivery repository reads and hooks, the additive
saved-bookings return from commitBookingList, focused and responsive tests.

## Non-goals
Schema changes, provider configuration, production reads/writes, new sending
infrastructure, dormant visit activation, notification-policy changes.

## Relevant code
NewBookingModal, BookingFormFields, BookingConfirmationSection, useStaffAppData,
useStaffMessaging, notification_log and whatsapp_messages read contracts.

## Architecture
Components consume camelCase repository models. Existing staff JWT, RLS and
resend-booking-notification remain authoritative. Preferred selection records an
explicit supported channel; the server still enforces eligibility and opt-outs.
No notification is sent by the booking UI itself on initial creation.

## Data/database changes
None. Read existing preference, logs and provider-message receipts.

## API changes
Add saved bookings to the existing commit result. Preserve ok/error consumers.

## UI changes
Scrollable dog selection; collapsed chosen slot with Change; preferred-method
label; agreed/guide price distinction; persistent success receipt with Done and
Book another actions. Failed, partial, pending, unknown, suppressed and sample
states have distinct copy. No retry for unknown delivery or missing evidence.

## Security/privacy considerations
No credentials or customer records used for verification. Read only the current
owner and newly saved booking IDs. Do not log contact details or raw errors.

## Dependencies
Existing preferred_channel, notification_log and inbox receipt columns.

## Risks
Draft IDs cannot identify saved records. Missing logs are pending/unavailable,
never delivery proof. Provider acceptance is not delivery. Unknown outcomes
must not offer retry. Refresh status before retry; existing server idempotency
still owns the send. Grouped and recurring rows need independent status coverage.

## Migration/rollout
Frontend-only; existing server contracts retained. The implementation requires no
manual production operation. Merging to main follows the normal frontend
deployment workflow. Rollback by reverting the frontend changes; no data backfill.

## Implementation sequence
1. Add contact and delivery read models, focused tests and saved-row return.
2. Restructure scrolling/collapsed selection and pricing/preference review.
3. Render success receipt with refresh and guarded message-only retry.
4. Verify failure paths, sample-data browser layouts and repository checks.

## Testing
Focused component, model, repository and hook tests; raw-control ratchet;
responsive booking and continuity Playwright specs; check:docs, lint, typecheck,
check:migrations, test and sample-data build.

## Observability
Receipt reads existing persisted logs and matching provider receipts. No new
telemetry or sensitive logging. Retry refreshes the same receipt, never inserts
another booking.

## Documentation updates
Update docs/product/user-flows.md with the review and receipt contracts.

## Definition of done
All five approved behaviours are implemented, observable outcomes are covered,
responsive screenshots inspected, required checks recorded, and no production
data operation performed. Publication and merge were authorised after local
verification; hosted checks and the pull-request reference complete the record.

## Open questions
None blocking. When preference is absent, show [not set] rather than invent one.

## Verification evidence — 11 November 2026

- Final full Vitest run: 483 files and 5,384 tests passed.
- Final Playwright run: all seven desktop booking, search and continuity checks
  passed. The confirmation spec also exercises six phone/tablet/desktop sizes.
- Lint passed with 66 existing warnings and no errors; typecheck, build,
  documentation links and migration validation passed.
- Sample screenshots of the review at six sizes, plus desktop/mobile receipts,
  were inspected and retained with the task.
- No schema, provider, production or deployment operation was performed.
- Implementation is locally verified. Publication and merge were authorised on
  11 November 2026. Pull request #1202 carries hosted checks and the merge/release
  outcome; no manual database or provider operation is needed.
