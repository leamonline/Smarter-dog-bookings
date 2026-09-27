# Payment history and correction

Status: Prepared for review; not installed in production
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

## Inspect and recover

Use an authenticated staff session against an explicitly approved environment.
These calls are for an operator tool or a future staff interface; no command
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

Owner approval of retention/disposal is required before production installation.
Use the [hosted target guard](hosted-supabase-target-guard.md) and separate
production authority. Rehearse the complete migration/test suite on a disposable
stack, then the authorised staging target. Verify staff read/recovery and
non-staff denial with synthetic records. Verify permissions after any type/API
schema refresh. No application deployment is needed for trigger coverage.

Do not drop history on rollback. If a trigger must be disabled as an authorised
incident response, record the gap explicitly; writes during the gap have no
complete history. Never represent retained history as complete across a gap.

## Verification limits

Focused pgTAP tests can run in an embedded PostgreSQL runtime with a reduced
schema, but that does not prove integration with all Supabase migrations,
notification triggers or multi-session locking. The full DB workflow and a
real concurrent-write test remain required release evidence.
