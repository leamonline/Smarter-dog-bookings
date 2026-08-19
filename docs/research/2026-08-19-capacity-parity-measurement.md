# Capacity parity: TypeScript engine versus PostgreSQL

**Status:** Measurement. Answers the question [#608](https://github.com/leamonline/Smarter-dog-bookings/issues/608)
was opened on, and informs — but does not authorise — the
[#623](https://github.com/leamonline/Smarter-dog-bookings/issues/623) architecture.
**Measured:** 19 August 2026
**Authorised by:** @leamonline, 19 August 2026 — capacity convergence decoupled from
the `RA-001` STOP, scoped to *measure first*.
**Reschedule automation:** unchanged and still stopped. Nothing here touches it.

## Why this measurement exists

The capacity rules are implemented three times: the browser engine
(`src/engine/capacity.ts`, 638 lines), a hand-mirrored Deno copy
(`supabase/functions/_shared/capacity.ts`, 632 lines), and the authoritative
PostgreSQL trigger `validate_booking_capacity()`.

Before spending a migration on the booking spine — the highest-risk subsystem in
this repository — to converge them, it was worth knowing how far apart they
actually are. Two of the three legs were already guarded:

| leg | guarded by | status before this work |
|---|---|---|
| browser ↔ Deno mirror | `src/lib/whatsapp/capacityParity.test.ts` (12 tests) | guarded |
| PostgreSQL on its own terms | `supabase/tests/035_capacity_behaviour.test.sql` (13 assertions) + the two-session race proof | evidenced |
| **browser ↔ PostgreSQL** | **nothing** | **unmeasured** |

The third leg is the one a customer would feel: a slot the interface offers that
the database then refuses.

## Method

43 scenarios, stated once in `src/engine/capacityParityFixtures.ts` and answered
by both runtimes. No expected answer is written by hand anywhere; hand-written
expectations would encode one runtime's opinion and hide the disagreement being
looked for.

Two kinds of scenario, asking different questions:

- **single (26)** — one candidate booking. The engine answers yes/no through
  `canBookSlot()`; PostgreSQL through an `INSERT` its trigger permits or
  rejects. The verdicts must match.
- **group (15, yielding 104 cases)** — a multi-dog booking. Here the engine does
  not answer yes/no: it **offers** allocations through `findGroupedSlots()` and
  the customer picks one. The parity question is therefore directional and
  stronger — *every allocation the engine offers must be one the database
  accepts*, inserted as a whole group. Where the engine offers nothing, a plain
  placement is attempted anyway to see whether the database would have taken it.

**130 cases in total**, each isolated in its own subtransaction.

Coverage: per-slot seats, the 2-2-1 window, large-dog seat cost, large-dog
adjacency, early close, staff-blocked seats, per-date extra slots, the daily
dog cap, and grouped multi-dog allocation across small, medium and large dogs,
onto empty, partly-full, cap-constrained, block-constrained and
extra-slot-extended days.

### Where it ran

On a **local database rebuilt from the committed migrations** via the Supabase
CLI — the same path CI's `DB Tests (pgTAP)` uses. The first pass of this
measurement had to use the staging project because the environment lacked
Docker, the CLI and pgTAP; a `SessionStart` hook now provisions all three, so
the measurement is reproducible locally and in CI.

Sessions run without a JWT, so `is_staff()` is false and the non-staff gates
fire, as `035_capacity_behaviour.test.sql` relies on.

### One scenario class deliberately excluded

**Immediate ("last minute") slots.** They are enforced by
`validate_booking_calendar()`, not by the capacity trigger, and the TypeScript
side mirrors `IMMEDIATE_CUTOFF_MINUTES` for UI gating only — the engine reaches
no verdict to compare. There is no TS↔PostgreSQL capacity parity question here,
and inventing one would mean testing the harness rather than the product.
Same-day behaviour also depends on wall-clock time, which would make fixtures
non-deterministic.

**Staff capacity overrides** are excluded for a related reason: the trigger
applies `staff_capacity_override` only when `is_staff()` is true
(`v_override := coalesce(new.staff_capacity_override, false) and v_is_staff`),
so exercising it means authenticating a staff session, which is a different
test from capacity parity.

## Result

**Singles: 26 of 26 agree. Group offers: 101 of 102 accepted.**

| rule | cases | agreement |
|---|---|---|
| per-slot seats | 4 | 4/4 |
| 2-2-1 window | 4 | 4/4 |
| large-dog seat cost | 6 | 6/6 |
| large-dog adjacency | 3 | 3/3 |
| early close | 2 | 2/2 |
| blocked seats | 4 | 4/4 |
| extra slots | 3 | 3/3 |
| **grouped allocation (offers)** | **102** | **101/102** |
| grouped allocation (no offer) | 2 | 1 agreement, 1 asymmetry |

Widening coverage from 17 scenarios to 130 cases changed the answer. The first
pass found zero divergence; the deeper grouped coverage found two, and one of
them is a customer-facing defect.

### Divergence 1 — the engine offers a booking the database refuses

**`findGroupedSlots()` offers two large dogs at 08:30 + 09:00. The trigger
refuses it.**

```
engine offer  : dropOff 08:30, slots [08:30, 09:00]
database      : P0001 — "09:00 large dog conditional: 08:30 must be empty"
```

The revealing part is that the engine already disagrees with *itself*.
`canBookSlot()`, in the same file, refuses that exact placement — the single
scenario `large-back-to-back-0830-0900` has the engine and the database
agreeing on a refusal. So `findGroupedSlots()` does not apply the large-dog
adjacency conditionals that `canBookSlot()` does; a search of the function
finds no adjacency logic at all.

The other two allocations for the same pair (12:00 + 12:30, and 12:30 + 13:00)
are accepted, so the failure is specific to the morning conditional slots.

**Reachability.** `findGroupedSlots()` is what the customer booking wizard
(`SlotSelection.tsx`, `DateSelection.tsx`, `BookingWizard.tsx`), the staff
booking workspace (`BookingPane.jsx`) and the WhatsApp Flow
(`_shared/flowBooking.ts`) all call. A customer booking two large dogs together
can therefore be shown the 08:30 drop-off, complete the wizard, and have the
write refused. The database is doing its job — this is a preflight that offers
what the authority will not accept, which is exactly the failure this harness
was built to find.

### Divergence 2 — the engine is stricter than the database

**Five small dogs on an empty day: `findGroupedSlots()` offers nothing, while
the database accepts 2+2+1 across three consecutive slots** — precisely what
the 2-2-1 rule permits, and precisely what `MAX_DOGS_PER_SLOT = 5` describes.

Nothing unsafe is offered, so no booking fails. The cost is availability: a
five-dog household is told there is no room on a day that has room.

### Refusal wording

Unchanged from the first pass: three of the refusals agree on the decision and
describe it differently, the engine rendering a 12-hour clock and the trigger a
24-hour one (`1:00pm closed` versus `13:00 closed`). Presentation, not policy.

## What this means for #623

The first pass suggested the divergent-eligibility premise had evaporated. The
deeper grouped coverage restores it — but relocates it. The problem is not that
three runtimes disagree about capacity semantics. It is that **the browser
engine's two entry points disagree with each other**, and the grouped one, which
is what customers actually meet, is the one that is wrong.

That reframes the work substantially:

1. **A canonical server evaluator would not have prevented this.** The trigger
   was already right. What failed is a preflight that never consulted the same
   rules its own sibling applies.
2. **The cheapest correct fix is inside the engine**: make `findGroupedSlots()`
   validate each candidate placement through `canBookSlot()` before offering it.
   That is a change to one function, guarded by this harness, with no migration
   and no new server surface.
3. **The structured reason contract remains genuinely unaddressed** — two
   runtimes describing the same decision in two vocabularies — but it is a
   presentation concern, not the correctness problem #623 was scoped around.

**No architecture change is recommended in this document.** The recommendation
is recorded on issue #608 for the owner's decision.

## Scope and limits, stated plainly

- 130 cases is a substantial probe, not a proof. Grouped allocation is now
  covered across sizes, day states, blocks, extra slots and the cap, but the
  space of possible day states is far larger than any fixture list.
- Immediate slots and staff overrides are excluded for the reasons given above.
- Concurrency is out of scope here and covered separately by A1's two-session
  race proof; this harness compares single-session verdicts.
- The harness compares the browser engine with PostgreSQL. The Deno mirror is
  covered against the browser engine by `capacityParity.test.ts`, so all three
  runtimes are now transitively compared — but the Deno mirror inherits any
  defect the browser engine has, including divergence 1.

## Separate finding: mojibake in production's capacity messages

Comparing the trigger across environments surfaced something unrelated to parity
and worth fixing on its own terms.

**Production's `validate_booking_capacity()` contains mis-encoded characters.**
Where staging has an em-dash or arrow, production has `â` — a UTF-8 character
decoded as Latin-1 at some point in that function's history. It affects 7 lines:
4 comments, and **3 `raise exception` messages that reach callers**:

```
'13:00 is closed â large dog at 12:00 triggered early close'
'Large dog fills this slot â already has bookings'
'13:00 closed â early close from 12:00 large dog'
```

Staging has the correct `—` in all three. The logic is unaffected, and the
booking wizard maps on `error.code` rather than message text, but any surface
that shows the raw database message shows the garbled character to staff.

Not fixed here: this measurement was authorised to change nothing, and correcting
it means replacing the function definition in production — a migration that
should be reviewed on its own, not folded into a research document.

## Reproducing this

- Scenarios: `src/engine/capacityParityFixtures.ts`
- TypeScript half: `src/engine/capacityParityFixtures.test.ts` — recomputes every
  verdict from the real engine and fails if the pgTAP file drifts from it
- PostgreSQL half: `supabase/tests/036_capacity_parity.test.sql` — runs in the
  `DB Tests (pgTAP)` workflow, which has the Docker-backed local stack this
  environment lacks

The two halves are deliberately coupled: change a capacity rule without
regenerating the SQL and the TypeScript test fails, naming the scenario.
