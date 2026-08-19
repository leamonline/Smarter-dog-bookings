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

17 scenarios, stated once in `src/engine/capacityParityFixtures.ts` and answered
by both runtimes. Each scenario is a single candidate booking against a stated
day — the smallest unit both runtimes can answer identically.

- **TypeScript verdict:** computed by calling the real `canBookSlot()`. No
  expected answer is written by hand anywhere; hand-written expectations would
  encode one runtime's opinion and hide the disagreement being looked for.
- **PostgreSQL verdict:** observed by attempting the `INSERT` and recording
  whether the trigger permitted or rejected it, each scenario isolated in its own
  subtransaction.

Scenarios cover per-slot seats, the 2-2-1 window, large-dog seat cost, large-dog
adjacency, early close, and staff-blocked seats.

### Where it ran, and why

On the **staging** project, not production — capacity fixtures mean inserting
bookings, which must never touch real customer data. Staging runs without a JWT,
so `is_staff()` is false and the non-staff gates fire, exactly as
`035_capacity_behaviour.test.sql` relies on.

Staging's trigger was verified faithful first. Four of five capacity functions
are byte-identical to production. `validate_booking_capacity()` differs on
**7 of 354 lines, and the difference is character encoding only** — see the
separate finding below. The logic is identical, so staging is a sound oracle for
accept/reject.

The local route was unavailable: this environment has no Docker daemon, no
Supabase CLI and no local pgTAP, so `supabase start` could not rebuild a database
from the committed migrations.

## Result

**Eligibility: 17 of 17 scenarios agree. Zero divergence.**

| rule | scenarios | eligibility agreement |
|---|---|---|
| per-slot seats | 3 | 3/3 |
| 2-2-1 window | 3 | 3/3 |
| large-dog seat cost | 5 | 5/5 |
| large-dog adjacency | 2 | 2/2 |
| early close | 2 | 2/2 |
| blocked seats | 2 | 2/2 |

Nine scenarios were allowed by both runtimes and eight refused by both, so the
agreement is not an artefact of one runtime saying "yes" to everything.

### The one real difference: refusal wording

Three of the eight refusals agree on the decision but differ in the text:

| scenario | engine says | trigger says |
|---|---|---|
| `early-close-1300-after-1200-large` | `1:00pm closed — early close from 12:00 large dog` | `13:00 closed — early close from 12:00 large dog` |
| `large-1200-with-1300-occupied` | `12:00 large dog requires 1:00pm to be empty (early close)` | `12:00 large dog requires 13:00 to be empty (early close)` |
| `large-back-to-back-0830-0900` | `9:00am conditional: 8:30am must be empty` | `09:00 large dog conditional: 08:30 must be empty` |

The engine renders a 12-hour clock, the trigger a 24-hour one, and the third pair
is also phrased differently. This is presentation, not policy: the eligibility
decision is identical in all three.

## What this means for #623

The premise #623 was written on has weakened, and not only because of this
measurement:

1. **The engines agree on every decision tested.** The divergence the issue
   exists to remove was not observed.
2. **The AI preflight is already server-backed.** `whatsapp-agent/handler.ts`
   calls `get_small_medium_availability` and `get_large_dog_day_availability`, so
   #608's scope item 4 ("replace the simplified two-seat preflight") is
   substantially already done.
3. **Server capacity projections already exist** — `get_slot_occupancy`,
   `get_blocked_seats`, `get_occupancy_range`, plus the two above.

What remains genuinely unaddressed is the **structured reason contract**: the two
runtimes reach the same verdict and then describe it differently, so any UI
showing the database's message beside the engine's gets two vocabularies for one
rule. That is a real inconsistency — and a far smaller problem than the one
#623 was scoped to solve.

**No architecture recommendation is made here.** This document reports what was
measured; the next decision is the owner's.

## Scope and limits, stated plainly

- 17 scenarios is a probe, not a proof. It covers the rules listed above at their
  boundaries; it does **not** cover the daily dog cap, extra slots, immediate
  ("last minute") slots, multi-dog grouped allocation, or staff overrides.
  Grouped allocation in particular is where the engine does its most intricate
  work (`findGroupedSlots`), and it is only guarded browser-to-Deno today.
- Agreement on 17 scenarios is evidence that the implementations are close, not
  a guarantee they cannot diverge. The harness exists so that a future change
  which does diverge fails a test rather than reaching a customer.
- The measurement ran against staging's copy of the trigger, verified
  logic-identical to production but not byte-identical (encoding only).

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
