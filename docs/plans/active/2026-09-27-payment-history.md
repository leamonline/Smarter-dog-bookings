# Payment change history and recovery

Status: Active
Issue: #879
Base: origin/main, ef2af497 (full SHA recorded by Git)
Last verified: 2026-09-27
Owners: payment history schema, recovery command, tests and documentation
Dependencies: None; #908 is merged into this base
Related requirements: GOAL-04 and GOAL-05 in [PROJECT](../../../PROJECT.md)
Related ADRs: Proposed payment-history decision below

## Goal and why

Preserve previous payment values when a write replaces them, and support an
explicit correction without deleting evidence of the original write. Issue
#879 describes the lack of history; this change does not reconstruct values
already lost before installation.

## Current behaviour and relevant code

`bookings` remains the payment and reporting authority. The trigger in
`20260704130000_payment_method_and_paid_at.sql` stamps or clears payment fields
when payment status changes. Deposits have separate amount and received-time
fields. `ServicesPaymentCard.jsx` contains the existing staff payment controls.
The existing visit ledger is a separate, inactive policy subsystem.

The 90-day telemetry migration prunes `booking_funnel_events` and
`booking_denials`, not `booking_events`; #879's suggested retention interaction
is not established by that migration. No production data was queried.

## Desired behaviour and architecture

Add a narrow database-owned history, separate from the financial ledger.
An AFTER trigger observes final persisted values after existing BEFORE triggers.
Capture payment status, amount, method, paid time, deposit amount and deposit
received time. Preserve nulls and numeric precision. Exclude names, contacts,
notes and banking references. Record insert, meaningful payment update and
delete; ignore unrelated edits and identical rewrites. Failed transactions
must roll back both the booking and its history.

History is evidence of stored values, not proof that money physically moved.
Do not alter reports, reinterpret historic amounts, or introduce a second
financial source of truth. Do not reject zero or missing historic payments
without an independently agreed payment-validity policy.

## Data/database and API changes

An additive migration introduces staff-readable history and a staff-only
recovery command. Clients cannot insert, change, delete or truncate history.
History retains booking UUIDs without a cascading foreign key so deleting the
booking cannot silently erase evidence. Actor UUIDs are likewise preserved;
automated/database actors must not be presented as identified staff.

Recovery locks the booking, checks the expected latest history event, and
restores the before-values of a selected update for that same booking. It
requires a reason. The correction itself creates another history event.
Concurrent or stale recovery fails without overwriting intervening changes.
Do not recreate deleted bookings. Existing triggers remain enabled; if they
prevent an exact restore, roll back and require operator investigation.

## UI changes

Staff-facing history and restore controls are proposed inside booking details.
History must show before/after values, time, actor attribution and correction
reason. Never show an unavailable history service as an empty history. Disable
recovery during unsaved edits; a successful restore must refresh current data,
not run an old client snapshot back through the normal save path.

## Security/privacy and open decisions

Only staff may read or restore. Non-staff and anonymous negative tests are
required. Privileged database administrators remain a trust boundary: this is
not a tamper-proof external archive. Recovery reasons must avoid customer or
banking details. Financial-history retention and authorised disposal require an
owner decision before production installation; no expiry or backfill is inferred.

## Scope, non-goals and dependencies

Cover current booking-row payment writes. Exclude ledger adoption, visit-policy
activation, historical repair, accounting reconciliation, customer messaging,
production access, schema installation and changes to amount semantics.
The existing dirty checkout is preserved; work is isolated on
`codex/payment-audit`. No concurrent migration writer is assigned.

## Risks and migration/rollout

Database history is atomic and therefore a history failure also fails its
payment write. Check schema, grants, trigger ordering, write overhead, staff
access and negative controls on a disposable database first. Apply the reviewed
migration to an explicitly authorised target before enabling any dependent UI.
Do not merge schema-dependent UI without that compatibility evidence. Roll back
the UI independently; preserve history on database rollback rather than dropping
it. No production installation or customer-data recovery is authorised here.

## Implementation sequence and testing

1. Review schema and existing trigger interactions; record the bounded decision.
2. Add history and recovery with pgTAP tests covering final written values,
   no-op writes, rollback, identity, isolation, immutable grants, stale restores,
   unrelated fields, deposit changes and deletion.
3. Run a two-session recovery/write race against a disposable PostgreSQL target.
4. Add the selected staff/operator recovery surface and failure-state coverage.
5. Run `npm run check:docs`, `npm run check:migrations`, relevant application
   checks, `npm run test:db` and `npm run test:db:concurrency` as applicable.
6. Record exact-head evidence and rollout dependencies before review.

## Observability and documentation updates

The history itself provides per-booking evidence and links corrections to
their source event. Document a synthetic walkthrough and recovery runbook,
update migrations documentation, types and changelog with the final contract.
Do not claim history completeness before deployment or after a privileged
trigger bypass.

## Definition of done

An incorrect write can be demonstrated, its previous values inspected, and
those values restored with an auditable reason. Permission failures and races
cannot modify a booking. Runtime database tests and appropriate UI tests pass.
Any missing tool, retention decision or deployment evidence stays explicit;
this plan remains active until its acceptance and release gates are verified.

## Evidence so far (27 September 2026)

- 33 pgTAP checks passed with the committed migration and real paid-at trigger
  on an isolated PGlite PostgreSQL runtime. Supporting schema/auth fixtures are
  reduced stand-ins; this is not the complete Supabase migration replay.
- Native PostgreSQL 17, disposable localhost port 55439: two independent
  sessions proved the loser actually waited on a row lock, then received
  `40001` for both restore/restore and ordinary-write/restore races. The latest
  stored amount was preserved in both scenarios. No hosted database was used.
- Migration structure and documentation link checks passed.
- Staff UI choice and financial-history retention decision remain pending.
  The implemented slice currently exposes the documented operator RPC only.
- Full Supabase DB workflow remains required. No production migration, merge,
  customer-data read or repair has been performed.
