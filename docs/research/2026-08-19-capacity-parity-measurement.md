# Capacity parity: TypeScript engine versus PostgreSQL

**Status:** Measurement, and the fix it produced (issue #664). Answers the question [#608](https://github.com/leamonline/Smarter-dog-bookings/issues/608)
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

54 scenarios, stated once in `src/engine/capacityParityFixtures.ts` and answered
by both runtimes. No expected answer is written by hand anywhere; hand-written
expectations would encode one runtime's opinion and hide the disagreement being
looked for.

Two kinds of scenario, asking different questions:

- **single (33)** — one candidate booking. The engine answers yes/no through
  `canBookSlot()`; PostgreSQL through an `INSERT` its trigger permits or
  rejects. The verdicts must match.
- **group (21, yielding 129 cases)** — a multi-dog booking. Here the engine does
  not answer yes/no: it **offers** allocations through `findGroupedSlots()` and
  the customer picks one. The parity question is therefore directional and
  stronger — *every allocation the engine offers must be one the database
  accepts*, inserted as a whole group. Where the engine offers nothing, a plain
  placement is attempted anyway to see whether the database would have taken it.

**162 cases in total**, each isolated in its own subtransaction.

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

**All 162 cases agree. Zero divergence — after one real defect was found and fixed.**

| rule | cases | agreement |
|---|---|---|
| per-slot seats | 4 | 4/4 |
| 2-2-1 window | 4 | 4/4 |
| large-dog seat cost | 6 | 6/6 |
| large-dog adjacency | 3 | 3/3 |
| early close | 2 | 2/2 |
| blocked seats | 4 | 4/4 |
| extra slots | 3 | 3/3 |
| blocked seats x large dogs | 7 | 7/7 |
| **grouped allocation (offers)** | **126** | **126/126** |
| grouped allocation (no offer) | 3 | 3/3 |

The first pass, at 17 scenarios, found nothing. Widening to 130 cases with the
weight on grouped allocation found one genuine defect and one apparent one that
turned out to be policy. A third pass on 20 August took it to 162 (below).

### The defect: an offer PostgreSQL refuses — issue #664, now fixed

`findGroupedSlots()` offered two large dogs at **08:30 + 09:00**, and the
trigger refused it: *"09:00 large dog conditional: 08:30 must be empty"*.

The cause was not a missing rule. `searchAllocationsForSlots()` already calls
`canBookSlot()` for every placement. The defect was **order-dependence**:
placements are validated incrementally against a partial day, while the
large-dog conditional is **directional** — booking 09:00 inspects 08:30, but
booking 08:30 does not inspect 09:00.

| placement order | step 1 | step 2 | outcome |
|---|---|---|---|
| 08:30 → 09:00 | allowed | **refused** | correctly rejected |
| 09:00 → 08:30 | allowed | allowed | **allocation offered** |

Every step was legal; the finished allocation was not. PostgreSQL never had the
problem, because its trigger evaluates the whole day on each insert.

**Fix.** Re-check each completed allocation as a whole: every dog must still be
placeable given all the others. It reuses `canBookSlot()` and adds no rule, so
it can only remove offers the database would have rejected. Applied to the
browser engine and the Deno mirror; the trigger was already correct and is
untouched.

Proven closed by this harness: `group-two-larges` now offers two allocations
(12:00 + 12:30 and 12:30 + 13:00), both accepted, and group offers went from
101/102 to **101/101**. A focused regression test asserts the general property —
every offered allocation must hold together — so a future rule with the same
directional shape is caught by the same assertion, not just this slot pair.

### The non-defect: a fixture asking a forbidden question

The same run appeared to show the engine being over-conservative — five small
dogs on an empty day got no offer while the database would accept 2+2+1.

That reading was wrong, and the correction matters more than the original
claim. Grouped booking is a **1–4 dog journey**: `docs/whatsapp-flows.md`
documents the Flow as *"1–4 dogs in one"*, and the wizard enforces it
(`BookingWizard.tsx`, `DogSelection.tsx`). **A customer cannot select a fifth
dog.** The engine's `count > 4` guard implements that policy correctly.

The comparison was also unsound in principle: the database has no concept of a
booking group at all, so "would PostgreSQL accept five rows" is not the same
question as "should the wizard offer a five-dog booking". The fixture was
replaced with the real boundary — four large dogs, which genuinely yields no
offer, and where the database agrees.

Two lessons worth keeping: a parity harness can only compare things that mean
the same thing in both runtimes, and an asymmetry is not automatically a defect.

### Refusal wording

Unchanged: three refusals agree on the decision and describe it differently,
the engine rendering a 12-hour clock and the trigger a 24-hour one
(`1:00pm closed` versus `13:00 closed`). Presentation, not policy — and the
remaining substance behind a structured reason contract.

## What this means for #623 — accepted and rescoped

The owner accepted the rescope on 19 August 2026. #623 is now **"B3: Guard
capacity parity across runtimes"**, and rejection-reason alignment moved out
entirely to its own issue (#665, specified but not started).

The original scope — a canonical PostgreSQL evaluator, a versioned reason
contract and a booking-spine migration — is superseded by this evidence:

1. **The database was right in all 129 cases**, including the one the engine got
   wrong: it caught the bad allocation the preflight offered. A new
   authoritative evaluator would have replaced the component that was never
   wrong, while the actual defect — a preflight deciding what to *offer* —
   would have survived it.
2. **The defect was fixed in one function**, reusing existing rules, with no
   migration, no RPC and no policy change.
3. **The harness is the durable deliverable.** It found the defect and is what
   prevents the next one, so it is what B3 delivers rather than a step toward
   something larger.

Out of scope and recorded as such on the issue: the authoritative evaluator, any
booking-spine migration, any change to `validate_booking_capacity()` or the
database capacity architecture, moving authority into shared TypeScript, and any
capacity-policy change including the 1–4 dog group limit.

**Dependencies.** B3 was serialised behind B1 and B2 because, as the ROADMAP put
it, "the migration spine is serial". With no migration in the rescoped B3 that
reason no longer holds, and the decoupling was verified rather than assumed: the
deliverable imports only `src/types`, `src/constants/salon`,
`src/engine/slotGrid` and `src/engine/capacity`, and its database half touches
only `bookings`, `day_settings`, `dogs`, `humans` and `salon_config` — all
pre-existing, none from B1's capability projection or B2's notification intents.
**B4 remains stopped behind the `RA-001` STOP**, untouched.

[ADR 001](../architecture/decisions/001-postgresql-capacity-authority.md) is
**reaffirmed, not superseded**: PostgreSQL stays the authority. This work guards
agreement with it rather than replacing it.

## Third pass, 20 August 2026: the named coverage gaps

The rescoped [#623](https://github.com/leamonline/Smarter-dog-bookings/issues/623)
listed three places coverage was still thin. All three are now covered, taking
the harness from 129 cases to **162**. **Every one agreed.**

| added | cases | agreement |
|---|---|---|
| blocked seats against large dogs (singles) | 7 | 7/7 |
| grouped allocation onto blocked-seat days | 11 | 11/11 |
| grouped allocation onto extra-slot days | 10 | 10/10 |
| grouped allocation across all three sizes | 5 | 5/5 |

A hypothesis went in and came out wrong, which is worth recording. The two
runtimes reach the blocked-seat answer by **different routes**: PostgreSQL
subtracts blocked seats generically —
`v_max_seats := greatest(v_max_seats - v_blocked_seats, 0)` — *before* the
large-dog branch, while the engine floors a slot at two seats in
`computeSlotCapacities` and handles the large-dog rules in a separate pass.
Different order, and #664 was exactly an ordering defect, so a 12:30 large dog
(2 seats, no sharing) against one blocked seat looked like a strong candidate
for divergence. It is not: the arithmetic agrees in all seven singles and all
26 new grouped allocations.

One asymmetry did surface, and it belongs to
[#665](https://github.com/leamonline/Smarter-dog-bookings/issues/665) rather
than here. When **both** seats of a slot are blocked, PostgreSQL refuses from
`validate_booking_calendar()` — *"That time slot is closed on this date"* — not
from the capacity trigger, while the engine refuses with *"Not enough capacity
(2-2-1 rule)"*. The verdicts agree; the **gate** does not. So the reason space
spans all three `BEFORE INSERT` gates, which a reason contract scoped to
capacity alone would miss.

### Generated, not hand-written

These cases come from `scripts/generate-capacity-parity-cases.ts`, added with
them. It takes the engine's answer from `src/engine/capacity.ts` and **observes**
PostgreSQL's by attempting the insert inside a rolled-back transaction, so a
`throws_ok` records what the database actually did rather than what anyone
assumed. It reports a divergence rather than quietly encoding it, and the file
it produces is still checked by the TypeScript guard, which recomputes every
verdict independently. Before this the SQL half was produced by hand, which is
why the file's own comments said "regenerate the SQL" with nothing to do it.

## Scope and limits, stated plainly

- 162 cases is a substantial probe, not a proof. Grouped allocation is now
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
