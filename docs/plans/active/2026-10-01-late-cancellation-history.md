# Allow late cancellation and record customer history

Status: Active
Issue: [#930](https://github.com/leamonline/Smarter-dog-bookings/issues/930)
Base: origin/main, 924770f1d61f9b9b2156b6d41412de1ca14d854c
Last verified: 2026-10-01
Owners: cancellation/reschedule SQL commands, customer portal copy, customer-card booking rules and history, command/row/concurrency tests
Dependencies: Owner approved staff review after three late cancellations within 12 months on 1 October 2026. Production migration requires separate authorisation.
Related requirements: [PROJECT](../../../PROJECT.md) GOAL-01, GOAL-02 and GOAL-05; [booking policy baseline](../../archive/superpowers/specs/2026-07-22-booking-cancellation-rescheduling-policy-design.md)
Related ADRs: [ADR 001](../../architecture/decisions/001-postgresql-capacity-authority.md), [ADR 002](../../architecture/decisions/002-separate-visit-authority-from-policy-activation.md), [ADR 003](../../architecture/decisions/003-separate-operation-success-from-notification-delivery.md), [ADR 006](../../architecture/decisions/006-manual-target-verified-database-rollout.md), [ADR 013](../../architecture/decisions/013-allow-late-cancellations-with-customer-history.md)

## Goal

Customers can cancel their owned upcoming appointment even inside the notice window, releasing its capacity. Each late customer cancellation is recorded once on the customer file; the third within the agreed counting window triggers the agreed deposit response. Preserve existing booking identity, security and transaction guarantees.

## Why

Owner decision, 1 October 2026: a customer denied cancellation may simply not attend. An accepted cancellation gives staff a chance to refill the slot. This is the operational rationale, not a measured causal claim or a claim that a cancelled slot will be rebooked.

## Current behaviour

Confirmed at the discovery revision, without production reads:

- `cancel_customer_booking(uuid,text)` in migration `20260712115759_legal_risk_tranche1.sql` rejects notice shorter than `salon_config.settings.minCancellationHours`, default 24 hours, using SDC02. It verifies ownership, requires a reason, locks and cancels the group plus date atomically, and records an idempotent private receipt.
- The direct reschedule implementation introduced by `20260719182343_atomic_customer_reschedule.sql`, renamed by `20260728133020_customer_override_reschedule_approval.sql`, calls cancellation internally. Removing cancellation's check without separating this dependency would silently allow late rescheduling.
- `customer_change_deadline_preview` reads the enforcing legacy settings. `current_customer_booking_rules` describes the separate booking-policy settings. They must not imply the cancellation and rescheduling gates are identical after this change.
- `BookingCard.jsx` always offers the cancellation action for an upcoming card and shows a refusal when the server returns SDC02. Booking confirmation warns about online change/cancel closure.
- `BookingRulesPanel.jsx` exposes the existing staff-controlled deposit-required switch. New bookings for flagged owners use the existing deposit lifecycle. There is no verified live repeat-cancellation threshold in this investigation.
- `booking_events` emits cancellation events per booking row and feeds `HumanEventTimeline`; it is not a one-appointment-per-strike ledger. Its actor describes who performed the write, not necessarily who caused the cancellation.
- The richer visit policy/incidents substrate is implemented but dormant. This task does not activate it.

## Desired behaviour

Cancellation permission and lateness are separate server decisions. Retain the existing notice cutoff to label a cancellation late, rather than deny it. Allow an owned active appointment to be cancelled before its earliest start, including same-day cancellation; do not turn already-started/past appointments into retrospective cancellations instead of no-shows.

Record one attributable late-cancellation incident per customer appointment. Two dogs in one group/date count once; recurring dates count separately; retries and concurrent requests do not add strikes. A staff member recording a customer's cancellation must explicitly attribute it to the customer. Salon-caused cancellations, automated unpaid-deposit releases, rescheduling and no-shows do not count as customer late cancellations.

At three late cancellations in the agreed period, show the agreed deposit response. Owner-approved response: staff review at three unwaived late cancellations within the preceding 12 calendar months; no automatic deposit flag mutation. Never silently change existing booked appointments, paid deposits or refund/retention policy.

## Scope

Legacy active cancellation and its internal reschedule dependency; authoritative lateness history and staff read model; customer-file history/count and existing deposit control; portal confirmation/errors and authoritative policy preview; policy documentation and affected WhatsApp instructions; database, UI and concurrency verification.

## Non-goals

Activating `previous_day_1500_v1` or dormant visit commands; late-reschedule relaxation; deposit/refund price changes; automatic customer messaging; retrospective strike backfill; classifying salon cancellations or no-shows as late customer cancellations; production migration, merge or deployment without explicit approval.

## Relevant code

- `supabase/migrations/20260712115759_legal_risk_tranche1.sql`: cancellation authority and private receipts.
- `supabase/migrations/20260719182343_atomic_customer_reschedule.sql` and `20260728133020_customer_override_reschedule_approval.sql`: internal cancellation dependency and staff override review.
- `supabase/migrations/20260906100000_change_deadline_preview.sql` and `20260726144001_authoritative_booking_policy_rules.sql`: preview and customer-facing policy source.
- `src/components/customer/BookingCard.jsx`, `booking/BookingConfirmation.tsx`, `booking/BookingWizard.tsx`: customer actions and commitment wording.
- `src/components/modals/human-card/BookingRulesPanel.jsx`, `HumanEventTimeline.jsx`: staff history and deposit control.
- `src/supabase/repositories/humansRepo.ts`, `bookingsRepo.ts`, `rpc.ts` and associated hooks: API/read model boundary.
- `supabase/tests/110_customer_cancellation.test.sql`, `117_customer_reschedule.test.sql`, `221_change_deadline_preview.test.sql`: server enforcement and preview contracts.

## Architecture

PostgreSQL decides ownership, appointment membership, cancellation permission, lateness and deposit eligibility. The UI renders the server projection; AI cannot decide strikes or enable deposits. Separate a shared internal cancellation mutation from the notice policy so direct cancellation may be late while rescheduling retains its existing restriction. Preserve current group plus date boundaries and original request receipts. No raw-row fallback for ambiguous ownership or membership.

## Data/database changes

Append a migration; do not edit applied SQL. Store an immutable incident identity tied to the committed appointment/cancellation receipt, customer UUID, appointment/date/earliest-start snapshot, reason, requested/committed time, applicable cutoff and attribution. Staff-only read access and guarded correction/waiver with reason; no customer write grant. Store the threshold decision transactionally if automatic enforcement is chosen, with serialisation for concurrent third cancellations. History survives relevant booking edits; agree deletion/retention implications without inventing an expiry policy.

Use explicit provenance to distinguish customer-requested staff cancellations from salon or system cancellations. No free-text inference or blanket status trigger may turn every late cancellation into a customer strike. Regenerated database types follow the tested local schema. No backfill: historical actor/reason data alone cannot prove customer fault reliably.

## API changes

Keep the public cancellation receipt compatible. Preserve reschedule idempotency and destination validation while relocating its notice enforcement. Provide a guarded staff history/count projection and, if needed, a staff customer-cancellation command with explicit attribution and reason. Preserve cancellation-disabled and ownership refusal controls; cancellation after appointment start is unavailable independently of notice lateness.

Expose cancellation and reschedule semantics separately through preview/policy. Introduce additive capability fields where older clients need a truthful compatibility window; never publish new customer promises before the server migration is applied.

## UI changes

Customer cancellation remains available inside the notice window. Explain cancellation versus rescheduling truthfully before commitment. Customer file shows dated late-cancellation history, count period, threshold state, loading and unavailable states beside the deposit control; unreadable history is not zero strikes. Preserve staff decision authority if review is selected. Display multi-dog appointments as one incident; do not count dog-line events.

## Security/privacy considerations

No production customer data needed for development. Test synthetic UUIDs and fixtures. Customers cannot add, remove or reset incidents or alter their deposit flag. Verify staff scope and database grants. Do not store credentials or copy real cancellation reasons into test data. Record meaningful provenance without exposing staff-only incident details through customer policy responses.

## Dependencies

Owner decision recorded: staff-reviewed deposit requirement after three late cancellations in the preceding 12 calendar months. The existing deposit lifecycle remains the implementation path after the decision. Source work may prepare independent cancellation separation first, but threshold policy must not be guessed.

## Risks

Removing the shared gate can relax rescheduling accidentally; test that it remains blocked. Row-level events can overcount multi-dog visits; use one appointment identity. Duplicate/racing cancellations can add strikes; require receipt-bound uniqueness and real concurrency tests. Salon/system cancellation can unfairly penalise customers; require explicit cause. A customer can exploit past cancellation to disguise absence; preserve start-time boundary. Client copy can race database deployment; require migration-before-merge evidence. Staff attribution/correction must be auditable and cannot hide an original event.

## Migration/rollout

Prepare and review source on a feature branch. Run local synthetic database and concurrency tests, then owner-authorised staging migration and UI verification on an explicitly confirmed project. Production application is a separate approval: show SQL, exact target and staged evidence before applying it. Confirm schema before merging dependent client changes. Roll forward a corrective migration for database rollback; keep history rather than deleting evidence. Do not switch off classification merely to restore a refusal gate.

## Implementation sequence

1. Record the owner-approved staff-review/12-month threshold in issue #930 and this plan.
2. Add the tested append-only migration separating cancellation and reschedule policy, recording committed customer incidents and exposing staff projections. Cover attributed staff cancellations and recovery without recording salon/system changes as customer incidents.
3. Wire staff customer history/count and agreed deposit response through existing controls; update authoritative preview and portal copy. Add synthetic component/repository tests.
4. Align WhatsApp wording with the new authoritative cancellation contract without widening automation modes or doing another paid evaluation implicitly.
5. Run repository/DB/concurrency checks, open draft PR, collect staging evidence; production migration and merge remain separate owner approvals.

## Testing

Actual rows: successful late cancellation releases all appointment rows and inserts exactly one incident with frozen cutoff/time. On-time, exactly-at-cutoff, already-started, foreign customer, disabled cancellation, mixed ownership and failed writes. Multi-dog and recurring-date grouping, idempotent retry and concurrent cancellation. Late reschedule still refused with zero incident/write; normal reschedule must not become a cancellation strike. Third-strike threshold at agreed window boundary, concurrent third cancellations, correction/waiver and unaffected existing bookings/deposits. Staff attribution versus salon/system cancellation. Staff-only reads and unauthorised history/flag mutations. London/BST/GMT boundaries. UI loading/error/zero/multi-dog/third-strike states and new truthful commitment copy.

Checks: focused pgTAP and UI tests; `npm run test:db`, `npm run test:db:concurrency`, `npm run check:docs`, lint, typecheck, migration validation, unit tests and build; Edge checks if its code changes. Current local Supabase database is unavailable (`127.0.0.1:54322` has no response); runtime verification must be established before a database change is marked complete.

## Observability

Cancellation receipt and incident identity prove committed release and once-only counting. Staff projection names its period and count; no model-derived strikes. Review aggregate late-cancellation/rebooked-slot measures only after their definitions and authorised data scope exist. Attempted notifications are not proof of delivery or cancellation.

## Documentation updates

This plan, ADR 013 and its index; active booking/deposit and customer-interface contracts; portal/WhatsApp cancellation wording. Preserve archived policy history and link the new owner decision rather than rewriting old intent as though the block never existed.

## Definition of done

Owned future appointments can be cancelled late atomically; unrelated rescheduling policy remains unchanged. Attributed customer incidents are durable, once-only and visible on the customer file; salon/system cancellations are excluded. The third in the agreed window triggers the agreed future-deposit response. Ownership/security/idempotency/capacity controls and deposit balances remain intact. Required server/component/concurrency checks and staged acceptance evidence pass; target-verified production migration and schema-before-merge requirements are satisfied only under separate approval.

## Open questions

- Implementation verification: exact existing staff cancellation paths and attribution mechanism; independent RPC/history contract must cover customer-requested staff cancellations without counting salon-caused changes.
- Release: establish local database verification and later confirm staging target before any hosted command.

Implementation discovery: WhatsApp cancellation RPCs also cancel the old visit during rescheduling. Separate service-only reschedule entry points carry explicit provenance so these operations never create late-cancellation incidents. By-id WhatsApp cancellation is constrained to group plus date; a group-only request spanning multiple active dates fails as ambiguous rather than cancelling recurring appointments. Customer cancellations cannot cancel a visit that has already started.

Customer merges must transfer incident ownership transactionally, with an audit record. A conflicting same-appointment incident fails the merge for staff review rather than losing or double-counting history.

WhatsApp also enforces a fixed 24-hour cancellation cutoff in the agent manage-action handler and confirmation handler. Both must distinguish cancellation (allowed until start) from rescheduling (existing cutoff); old staged cancellation payloads must not retain the retired refusal. Autonomous single-row confirmation updates need explicit customer provenance and a server start-time guard.

## Implementation evidence (1 October 2026)

Source prepared on `feat/late-cancellation-history`; no hosted migration or deployment applied. The policy is accepted; rollout remains pending.

- Repository tests: 395 files / 4,136 tests pass. Lint passes with 66 existing warnings; typecheck, documentation links, migration validation and build pass.
- Edge entry-point types pass. Relevant confirmation and Flow Deno tests: 13 pass. New shared deadline tests distinguish late cancellation from late rescheduling and fail closed on unverified timestamps.
- A fresh isolated PostgreSQL 17 database accepts the migration. Actual-row assertions pass for multi-dog cancellation, receipts/retries, staff-only history, deposit review, waivers, partial/full undo and WhatsApp attribution. Two concurrent requests leave two cancelled rows, one incident and one receipt.
- `npm run test:db` cannot connect to local Supabase on port 54322. Full-schema pgTAP, existing concurrency suites, notification integration, merge integration and browser/staging acceptance are still release blockers. The isolated fixture is not a substitute.
- Database types were mirrored from the new SQL contract; regenerate and compare against the complete local schema before release.

Do not merge dependent client/Edge changes before target-verified migration approval and schema evidence. Keep the PR in draft until the missing release checks are satisfied.
