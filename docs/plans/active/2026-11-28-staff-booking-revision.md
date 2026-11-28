# Staff booking revision checks

**Status:** Active
**Issue:** [#1194](https://github.com/leamonline/Smarter-dog-bookings/issues/1194)
**Dependency:** [iOS checkout #1329](https://github.com/leamonline/Smarter-dog-bookings/issues/1329)
**Authority:** Owner approval for work within the issue, 28 November 2026.

## Goal and current behaviour

Keep field-scoped staff updates and reject a write based on an older saved row.
Today, two devices can each write the same field successfully. The existing
`updated_at` trigger uses transaction time, so its value is unsuitable as a
strict version when a transaction writes repeatedly or waits.

## Scope and contract

Add a database-owned integer revision initialised to zero. PostgreSQL advances
it on every update, regardless of writer, and overwrites any caller-supplied
value. Staff web updates use the revision from the row the user edited. On a
conflict, read the current row and reject the old intent. Existing explicit
confirmation and capacity guards still apply. Unconfirm maintains the separate
confirmation-only fallback, guarded by the actual saved staff confirmation
stamp. Native checkout must compare the observed version on checkout and the
persisted version on Undo.

## Verification and rollout

Check schema replay and a two-session race, persisted status and payment,
timestamps, optimistic refresh, and stale action refusal. The server migration
needs separate production approval and verified installation before a client
that requires this column can merge. Keep web and native checkout on their
existing routes until the revision and S2 gates are satisfied.
