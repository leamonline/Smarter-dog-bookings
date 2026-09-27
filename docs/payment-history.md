# Payment history and correction

Status: Active in production from 27 September 2026
Issue: [#879](https://github.com/leamonline/Smarter-dog-bookings/issues/879)
Decision: [ADR 011](architecture/decisions/011-booking-payment-history.md)

## What the history means

`booking_payment_history` records successful persisted payment changes, with
before/after values, actor UUID, claimed database/API role and recording time.
It does not prove cash was received. A missing actor UUID means a database or
service action, not an identified member of staff. Values before installation
are unknown except for the state captured by the first subsequent edit.

The six captured fields are `payment`, `paid_amount`, `payment_method`,
`paid_at`, `deposit_amount` and `deposit_received_at`. Amounts retain their
existing pound units and precision. Price overrides, services, notes, names,
contacts and bank references are excluded. Reports keep reading bookings.

## Inspect and recover in booking details

Authenticated staff can open a booking, expand **Payment history** under
Services & payment, and review saved changes newest first. Each entry shows the
changed values, recording time, staff display name where one is available, and
any correction reason. The panel states clearly when history cannot be loaded;
it does not present an unavailable service as an empty history.

Choose **Restore** on the incorrect update, review the before-state, and enter a
short correction reason without customer or banking details. Recovery restores
all six captured payment fields together. It does not charge or refund anyone.
The interface sends the latest event id the staff member reviewed, so an
intervening write stops the restore and asks them to reload and review again.
After success, both the history and current booking data refresh.

## Operator fallback

Use an authenticated staff session against an explicitly approved environment.
These calls are the operator fallback; no command
below is authority to access or change production customer data.

1. Query history for the booking, descending by `id`. Read all relevant events;
   timestamps alone are not a safe ordering or concurrency token.
2. Identify the incorrect UPDATE. Inspect its `before_values` and the latest
   `after_values`. Verify the intended correction against real payment evidence.
3. Call `restore_booking_payment` with the booking UUID, the incorrect event's
   id, the latest event's id and a short reason without personal/banking data.
4. Re-read the booking and history. The returned bigint is the new correction
   event. Check its `restored_from`, reason and resulting values.

Example contract with synthetic placeholders (not executable customer repair):

```text
restore_booking_payment(
  p_booking_id: booking UUID,
  p_event_id: incorrect UPDATE event id,
  p_expected_latest_id: latest event id seen during review,
  p_reason: "Correct payment amount entered in error"
) -> new history event id
```

A restore replaces all six captured fields with the chosen before-state; it
leaves appointment status, dates, services and notes alone. If restoring an
older event, review intervening payment changes first: they will remain in
history, but their values may be replaced. This is a correction of records,
not a refund or a request to charge a customer.

Errors:

- `40001`: history/current values changed. Reload and review; never blindly
  retry with a fresh latest id.
- `42501`: staff access is required; do not fall back to a direct booking update.
- `22023`: invalid reason/event, already-current values, or existing triggers
  prevented an exact restore. The transaction is rolled back.
- `P0002`: the booking was deleted. Recovery does not recreate it.
- Lost network response: inspect the latest history before trying again. The
  original expected id prevents a retry from overwriting its successful result.

## Rollout and rollback

The migration was applied to the explicitly verified production project on
27 September 2026 after the full local database suite passed. The table, RLS,
grants, recovery function and enabled trigger were then verified in production.
History began accruing immediately. No application deployment is needed for
trigger coverage.

There is currently no automatic expiry. An owner decision is still required
before adding retention or authorised disposal; until then, preserve the audit
record.

Do not drop history on rollback. If a trigger must be disabled as an authorised
incident response, record the gap explicitly; writes during the gap have no
complete history. Never represent retained history as complete across a gap.

## Verification limits

Focused pgTAP tests can run in an embedded PostgreSQL runtime with a reduced
schema, but that does not prove integration with all Supabase migrations,
notification triggers or multi-session locking. The full DB workflow and a
real concurrent-write test remain required release evidence.
