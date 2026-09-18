# Contributing

Smarter Dog Bookings is a live operational system. Small changes should remain lightweight; changes that affect bookings, customer data, capacity, authentication, notifications or deployment need stronger evidence.

## Before starting

- Read [PROJECT.md](PROJECT.md), [AGENTS.md](AGENTS.md) and the relevant section of [docs/README.md](docs/README.md).
- Work from an issue with an observable outcome. Check dependencies and current implementation before choosing a design.
- Use an [implementation plan](.agent/PLANS.md) for substantial, cross-cutting, risky or migration-bearing work.
- Record a new architectural decision in an ADR when the change introduces or replaces a significant pattern.

## Make the change

- Branch from current `main`; do not push unverified work directly to it.
- Preserve existing conventions and unrelated worktree changes.
- Add or update automated tests for changed behaviour and failure cases.
- Use a new ordered migration for database changes. Never rewrite applied migration history.
- Keep product policy in requirements/specifications, implementation choices in plans/ADRs and live task state in GitHub.
- Update relevant documentation and prompt metadata in the same change.
- Use the canonical vocabulary in [docs/product/terminology.md](docs/product/terminology.md).
  It matters most where the words diverge: **appointment** is the user-facing
  whole visit and belongs in customer and staff copy, while **visit**, **booking
  line** and **booking row** are technical terms for schemas, RPCs and storage.
  Sample-data mode is **sample data** or **demo**, never "offline" — that word is
  reserved for a genuinely lost connection.

## Two standing rules

Both of these came out of one incident (#878): a rebuilt `/today` shipped with a
green suite and destroyed a payment on every checkout of an already-paid dog. It
corrupted no rows only because the salon happened to be closed for a fortnight's
holiday when it shipped — the last booking completed before it was 11 September,
and the next was not until the 21st. Nothing in the codebase knows or checks
that. Neither rule is a style preference. Ignore either and the suite will go
green over a bug that costs the salon money.

### 1. A test on a write path asserts the row that was written

Not the arguments handed to the writer. Not the payload a component passed down.
The row.

The check-out chain reports "no method chosen, nothing handed over" for a dog
that paid in advance, and that report is perfectly true. Its test asserted that
`{ method: null, amountTaken: 0 }` reached the hook, and passed. What the hook
then *wrote* was `paidAmount: 0, paymentMethod: null` over a settled £42 card
payment — so the assertion was pinned to the exact value that caused the
corruption, and was green the entire time the bug was live.

In practice:

- Assert the object handed to `onUpdateBooking` / the repository, with its
  resolved fields on it — `status`, `payment`, `paymentMethod`, `paidAmount`.
- Cover the undo or reversal in the same way. Undo writes a row too, and in this
  case it had the mirror-image bug: reverting a handover where no money changed
  hands nulled a payment taken hours earlier by another route. No review spotted
  that. The row-level test did, immediately.
- Where the effect is a figure staff act on (a takings total, a balance), assert
  it end to end in `e2e/` against sample data, where the write, the store and
  the figure on screen are the same objects.
- A mock that returns its own input is enough. The point is not a real database;
  the point is asserting the far end of the call rather than the near end.

### 2. Replacing a screen requires a written inventory of what the old one showed

Before the replacement counts as complete, list every state, field and signal
the old screen displayed, and tick each one off against the new screen — present,
deliberately dropped, or moved somewhere named. A screen is not its happy path,
and "it looks right" only ever tests the states you thought to look at.

**The worked example: collected but unpaid.**

The four-zone board rendered every collected dog, paid or not, and
`tokenActions` still carries a "collected but owing" branch because the state
matters. The day stack that replaced it dropped collected bookings from the
stack — correct, they are finished — and derived its collected list from
`buildTakingsByMethod`, which by definition contains only `Paid in Full` rows.

So a dog handed back without paying was in neither place. It appeared **nowhere
on the screen at all.** The single state that actually costs the salon money was
the one state the new screen was silent about, and it shipped that way because
nobody wrote down what the old screen showed.

Two details worth carrying forward:

- The test covering that list had been named *"lists every collected dog"* since
  the day it was written, and did not. A test name is not an inventory.
- There was no fixture for the state anywhere in `src/data/sample.js`, so no
  amount of clicking around the demo would have surfaced it. **If the inventory
  turns up a state with no fixture, add the fixture** — that absence is usually
  the reason the state got missed rather than a coincidence.

## Verify

Run focused tests while developing, then the checks relevant to the completed change. The normal repository bar is:

```bash
npm run check:docs
npm run lint
npm run typecheck
npm run check:migrations
npm run test
npm run build
```

Edge Function and database work have additional checks described in [AGENTS.md](AGENTS.md). If a required check cannot run, state exactly why, what substitute evidence exists and who or what must close the gap.

## Pull requests

Use the pull request template. A reviewable PR should:

- link its issue and implementation plan;
- explain the observable behaviour change and governing requirements;
- include exact validation evidence;
- identify migrations, security/privacy effects and rollout or rollback needs;
- update durable documentation;
- leave independently useful follow-ups as linked issues rather than hidden TODOs.

Code written is not the same as work completed. Completion means acceptance criteria are met, checks pass, release dependencies are satisfied and the change can be traced to its decision and intent.
