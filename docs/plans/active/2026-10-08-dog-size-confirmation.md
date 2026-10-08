# Dog size confirmation: staff to-do and one-tap confirm

Status: Active
Issue: None. Item 9 of the October 2026 WhatsApp friction review, built as
[PR #962](https://github.com/leamonline/Smarter-dog-bookings/pull/962)
Base: `main@69be16c961d1f1c2e1262da058d15dc2d68cefc4`
Last verified: 2026-10-08
Owners: `supabase/migrations/20261008120000_dog_size_check_todo.sql`,
`src/components/customer/booking/DogSelection.tsx`,
`src/components/modals/dog-card/ConfirmReportedSize.jsx`,
`src/supabase/hooks/dogs/useDogMutations.ts` (guarded write),
`src/supabase/repositories/dogsRepo.ts` (`requestSizeCheck`)
Dependencies: the production migration workflow
([plan](2026-10-06-production-migration-workflow.md)), whose `production`
environment must be configured before this migration can be applied
Related requirements: None recorded
Related ADRs: None

## Goal

A customer whose dog cannot be booked online because it has no size is told
the salon has been asked, and staff get a to-do they can clear in one tap.
`dogs.size` stays staff-only.

## Why

The WhatsApp friction review found customers told "message us first" by the
booking wizard and then chasing. Production on 8 October 2026:

| | Dogs | Owner has a portal login |
|---|---|---|
| No size | 127 | 9 |
| Added in the last 4 months | 143 | 126 |
| …of those, still no size | 2 | – |

New dogs get sizes quickly, so the blocker now hits few customers. What was
missing was any signal to staff that someone was waiting.

## Current behaviour (before this change)

- `create_customer_booking_group` raises `dog_size_unconfirmed` for a dog with
  a null `size` (migration `20260712115759_legal_risk_tranche1`).
- `create_customer_dog` derives `size` from the breed
  (`derive_canonical_dog_size`, migration `20260727120000`) and stores the
  customer's guess in `reported_size`.
- The wizard greys out an unsized dog with "Size not confirmed — message us
  first" and a WhatsApp link. Nothing reaches staff.
- `createForHuman` hard-coded `size: null`, so a dog whose size the server had
  derived stayed greyed out until the page was reloaded.

## Desired behaviour

See [`docs/dog-size-confirmation.md`](../../dog-size-confirmation.md), the
authoritative description. In short:

- A customer write that leaves a dog unsized, or the wizard showing such a dog,
  writes or refreshes one open "Confirm size" to-do per dog.
- The wizard says "We're confirming their size" only when the server reports a
  to-do is open, and never promises online booking for a pregnant dog.
- Staff confirm the owner's estimate in one tap, guarded against a dog that
  changed or was archived meanwhile; setting a size or archiving ticks the
  to-do off, and a finished check cannot be reopened.

## Scope

The migration, the wizard wording and request, the staff confirm button, the
`createForHuman` size fix, generated types for the new column and functions,
the advisor baseline entry and documentation.

## Non-goals

- Letting customers set or influence `dogs.size`. Rejected in favour of this
  design: "book as large until confirmed" would need a provisional marker on
  bookings and a booking rewrite on confirmation, on the booking write path,
  for about 9 customers.
- The WhatsApp booking Flow, which still raises no to-do.
- Backfilling to-dos for existing unsized dogs; each is raised when its owner
  next opens the wizard.

## Relevant code

- `supabase/migrations/20261008120000_dog_size_check_todo.sql`: the column,
  writer, triggers and customer RPC.
- `supabase/migrations/20261001160000_late_cancellation_history.sql`:
  `merge_humans`, whose owner-then-dog lock order this follows.
- `src/components/customer/booking/DogSelection.tsx`, `BookingWizard.tsx`: the
  request and wording.
- `src/components/modals/dog-card/ConfirmReportedSize.jsx`, `DogCardModal.jsx`,
  `src/supabase/hooks/dogs/useDogMutations.ts`: the guarded confirm.

## Architecture

PostgreSQL stays the authority. The customer RPC is `SECURITY DEFINER`, checks
ownership and returns only a boolean. The internal writer is revoked from every
API role. The staff confirm goes through the existing staff `UPDATE` path under
RLS, with PostgREST filters as the guard.

## Data/database changes

Expand-only:

- `salon_todos.dog_id` (FK, `on delete cascade`), with a partial unique index of
  one open to-do per dog.
- `raise_dog_size_check_todo(dog, expected_owner)`: internal; locks the dog
  row.
- AFTER triggers on `dogs` (raise, refresh, close, follow an owner move) and on
  `humans` (owner rename).
- A BEFORE trigger on `salon_todos` that keeps a finished check done; it
  share-locks the dog.
- `request_dog_size_check(dog)`: customer RPC; locks the caller's owner row
  first.

No backfill. Rollback: drop the triggers and functions; the column and index
are harmless left behind. Generated types are updated by hand to match.

## API changes

New RPC `request_dog_size_check(p_dog_id uuid) returns boolean`, granted to
`authenticated`. Error `42704` for a dog that isn't the caller's, `28000` when
not signed in. No existing contract changes.

## UI changes

The wizard row and note wording, and the staff dog card's one-tap button with a
truthful failure toast. Both fall back to the previous wording or behaviour
when the request fails.

## Security/privacy considerations

The to-do text holds the customer's name and dog details, in the same
staff-only list as signup-review and WhatsApp follow-up to-dos. It includes no
message content. The RPC reveals only a boolean. The new grant is recorded in
the advisor baseline with its rationale (`docs/supabase-advisors.md`).

## Dependencies

The migration must be applied to production through the approval-gated
workflow before merge (`migrations-applied` is a required check).

## Risks

| Risk | Mitigation |
|---|---|
| A to-do left open on a dog that no longer needs it | Locks on the dog row in the writer and the reopen guard. Two-session tests in `240`. |
| A deadlock against `merge_humans` | Owner-then-dog order in the customer RPC. A two-session test reproduces the deadlock on the earlier code. |
| A staff confirm overwriting a newer size | Guarded write. A pgTAP assertion runs the exact filtered `UPDATE`. |
| The trigger path (a plain staff `UPDATE dogs`) meets the owner row after the dog | Same order as any dog write with a referencing insert. Accepted. |

## Migration/rollout

1. Apply `20261008120000_dog_size_check_todo.sql` through *Apply named
   migrations to production*, with `ref` set to the PR head and a
   postcondition that the trigger and RPC exist.
2. Re-run `migrations-applied` on the PR, then merge. Vercel deploys the
   frontend.
3. The old frontend is compatible with the new schema: it never calls the RPC,
   and the triggers only add to-dos.

## Implementation sequence

A single pull request, #962: the migration, tests, frontend and docs together.
The migration lands first in production by the workflow.

## Testing

- `supabase/tests/239_dog_size_check_todo.test.sql`: the lifecycle, the
  wording, archived, rename, merge, owner rename, staff refresh, the reopen
  guard, and the guarded confirm against persisted rows.
- `supabase/tests/240_dog_size_check_race.test.sql`: two-session races
  (size-edit race, lock order against a merge, owner move, reopen race). Each
  was checked to fail on the code it guards against.
- Component and unit tests for `DogSelection`, `ConfirmReportedSize`, the
  guarded `updateDog` and `dogsRepo`.
- The full CI bar: lint, docs, typecheck, migrations, test and build.

## Observability

Open "Confirm size:" to-dos on the staff dashboard are the signal. In
production, `salon_todos where dog_id is not null` shows how many were raised
and how quickly they were cleared.

## Documentation updates

`docs/dog-size-confirmation.md` (new), `docs/README.md`,
`docs/supabase-advisors.md` and `supabase/advisors/baseline.json`.

## Definition of done

- The migration is applied to production and recorded under
  `dog_size_check_todo`.
- PR #962 is merged with all checks green, and the frontend is deployed.
- In production, opening the wizard as a customer with an unsized dog shows
  "We're confirming their size", and a "Confirm size" to-do appears for staff.
- This plan is moved to `docs/plans/completed/`.

## Open questions

- Whether the WhatsApp Flow should raise the same request (decision: the
  owner).
- Whether the one-tap confirm should also guard the breed shown, which was
  declined in review as costing more than it buys (decision: the owner).
