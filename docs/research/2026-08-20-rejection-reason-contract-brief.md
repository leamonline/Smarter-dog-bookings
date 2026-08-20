# Booking rejection reasons: a structured contract

**Status:** Design brief for [#665](https://github.com/leamonline/Smarter-dog-bookings/issues/665).
**Not authorised to implement.** No code, migration or wording change is proposed for
merge here — this exists so the decisions below can be made before anyone writes any.
**Written:** 20 August 2026, on the evidence of the
[capacity parity measurement](2026-08-19-capacity-parity-measurement.md).

## The reframe that should shape this work

The obvious reading of #665 is "build a structured reason contract". That reading is
wrong, and acting on it would rebuild things that already work.

**All three audience layers already exist**, in `src/engine/denials.ts`:

| layer | today | example |
|---|---|---|
| internal code | `mapDenialReason(message)` | `large_dog_ineligible` |
| staff label | `DENIAL_REASON_LABELS[code]` | `Large-dog rule` |
| customer copy | `friendlyDenialMessage(message)` | *"That day's now fully booked…"* |

They are wired up: `BookingWizard.tsx` logs `reasonCode` plus verbatim `reasonDetail`
to `booking_denials`, and shows the customer the friendly string. Report 2F aggregates
by code. A customer already never sees `Capped at 1 (2-2-1 rule)`.

**Exactly one joint is defective.** The code is not *emitted* by the component that made
the decision — it is *re-derived* by regex over the prose that component happened to
produce:

```ts
if (m.includes("2-2-1")) return "capacity_2_2_1";
if (/large dog|back-to-back|early close/.test(m)) return "large_dog_ineligible";
```

So #665 is not "design a contract". It is **"move the code from inferred to emitted"**,
and most of the consuming side is already built. That makes it materially smaller than
the issue currently implies.

## What the measurement actually showed

Across 129 parity cases plus 32 further probe cases, **the decisions never disagreed**.
What differs is presentation:

| scenario | engine says | trigger says |
|---|---|---|
| 13:00 after a 12:00 large dog | `1:00pm closed — …` | `13:00 closed — …` |
| 12:00 large with 13:00 occupied | `…requires 1:00pm to be empty` | `…requires 13:00 to be empty` |
| large at 09:00 after 08:30 | `9:00am conditional: 8:30am must be empty` | `09:00 large dog conditional: 08:30 must be empty` |

Two differences: a **12-hour vs 24-hour clock**, and one pair phrased differently.

A third, found while probing on 20 August and worth recording because it widens the
scope: when **both** seats of a slot are blocked, PostgreSQL refuses from
`validate_booking_calendar()` (*"That time slot is closed on this date"*), not from the
capacity trigger, while the engine refuses with *"Not enough capacity (2-2-1 rule)"*.
Same verdict, **different gate**. So the reason space spans all three `BEFORE INSERT`
gates — calendar, capacity, pregnancy — not the capacity trigger alone. A contract
scoped to capacity would be incomplete on day one.

## The central technical decision: what carries the code

The repository already has a precedent, and it is being used successfully today.
Custom SQLSTATEs `SCL01–SCL05`, `SDC01–SDC04` and `SDR01–SDR04` are raised by
PostgreSQL and switched on directly in the client:

```ts
cause?.code === "SDC02" ? "This appointment is within 24 hours…"
cause?.code === "SDR01" ? "This appointment needs staff approval…"
```

That is exactly the shape #665 wants. The question is how to extend it to the booking
gates, which today all raise the undifferentiated `P0001`.

### Option A — give each reason its own SQLSTATE. **Reject.**

`P0001` is load-bearing. `BookingWizard.tsx` gates on `cause?.code === "P0001"` to
decide a rejection is a capacity denial at all; `CLAUDE.md` states the three gates "all
raise **P0001**; the wizard maps on `error.code` / message, so preserve it"; and the
pgTAP suite asserts `throws_ok(…, 'P0001', …)` in many places. Changing the SQLSTATE is
a breaking change across the client, the Edge Functions and the test suite, in exchange
for no capability that Option B does not also provide.

### Option B — carry the code in `DETAIL`, keep `P0001`. **Recommended.**

```sql
raise exception '13:00 closed — early close from 12:00 large dog'
  using errcode = 'P0001',
        detail  = 'capacity.early_close';
```

- **Purely additive.** Every existing consumer, every `throws_ok`, and the `P0001` gate
  in the wizard keep working untouched. Nothing has to move in lockstep.
- **Already on the wire.** PostgREST surfaces `details` alongside `message`, `hint` and
  `code`; supabase-js exposes it on the error object. The app's local `RepoErrorShape`
  declares only `{ message, code }`, so this is a one-line type addition, not plumbing.
- **Degrades safely.** While a gate has no `detail` yet, `mapDenialReason` keeps
  inferring from prose exactly as now. Gates can be converted one at a time, and the
  regex mapper becomes the documented fallback rather than the mechanism.

### Option C — keep parsing prose. **Reject**, but note it is not urgent.

It works today and has not caused an incident. It is fragile in a specific way worth
naming: a wording change made for UX reasons silently re-categorises the denial log and
the 2F report. That is the coupling #665 exists to break.

## Where the wording should live

**Client-side, per audience, keyed by code.** The database should stop being a source of
customer-visible prose. This is already three-quarters true (`friendlyDenialMessage`);
the contract makes it fully true.

| audience | source | shape |
|---|---|---|
| customer (portal) | `friendlyDenialMessage(code)` | warm, actionable, no rule jargon |
| staff (calendar, 2F) | `DENIAL_REASON_LABELS[code]` | precise rule name |
| AI / WhatsApp | code + a safe explanation string | never the raw trigger message |
| logs (`reason_detail`) | raw message, verbatim | unchanged, for diagnosis |

The trigger's own message stays engineer-facing and stays in the log. **Under this model
the 12h/24h difference disappears entirely** — the customer string is rendered from the
code, so the trigger's clock format stops being customer-visible.

### Should customer wording be configurable?

**Recommend no, not initially.** Configurable copy implies an editing surface, a
validation story and a migration for the storage — significant work whose benefit is
unclear while there is one salon and the copy changes rarely. Keep the strings in the
front end where they are reviewable in a pull request, and revisit if a second salon or
a non-English audience ever appears. Worth an explicit decision rather than drift.

## How to test the contract

The parity harness is the natural home — it already runs both runtimes over the same
scenarios and would need no new machinery:

1. **Code parity.** For every fixture where both runtimes refuse, assert they emit the
   **same code**. This is the assertion that would have caught the wording drift, and it
   is strictly stronger than comparing prose.
2. **Total coverage.** Assert every reason code has a customer string, a staff label and
   a test — so adding a gate without wording fails the build.
3. **No leakage.** Assert `friendlyDenialMessage` never returns raw trigger text, and
   that an unrecognised code yields the safe generic rather than passing prose through.
4. **Fallback integrity.** While conversion is partial, assert `mapDenialReason` still
   yields the same code for a gate that has no `detail` yet — so migrating a gate cannot
   silently change its categorisation.

## Decisions needed before any code is written

1. **Carrier** — confirm `DETAIL` (Option B) over a new SQLSTATE. This is the one that
   determines everything else.
2. **Scope of gates** — capacity only, or all three `BEFORE INSERT` gates? The
   both-seats-blocked finding argues for all three; capacity alone leaves a known hole.
3. **Code vocabulary** — the granularity of the codes themselves. `mapDenialReason`'s
   existing 13 codes are a reasonable starting vocabulary and already have staff labels
   and customer copy, so adopting them wholesale is the cheapest credible option.
4. **Configurable copy** — accept the recommendation to keep wording in the front end,
   or commission the editing surface.
5. **Sequencing** — whether the codes are added to all gates in one migration or gate by
   gate. Additive design permits either; gate by gate is lower risk.

## Explicitly out of scope

- ❌ any change to capacity **policy** or to which bookings are allowed
- ❌ a canonical PostgreSQL evaluator, a booking-spine migration, or any change to what
  `validate_booking_capacity()` **decides** — the same boundary
  [#623](https://github.com/leamonline/Smarter-dog-bookings/issues/623) now holds
- ❌ anything touching reschedule automation, stopped behind the `RA-001` STOP

Adding a code to a `raise` is a change to what a gate **emits**, never to what it
**decides**. That distinction should stay explicit in any implementation, and the parity
harness should be run before and after to prove the decisions did not move.

## Related

- [#623](https://github.com/leamonline/Smarter-dog-bookings/issues/623) — capacity parity (correctness), where this was split from
- [#664](https://github.com/leamonline/Smarter-dog-bookings/issues/664) — the ordering defect the harness found, fixed
- [Parity measurement](2026-08-19-capacity-parity-measurement.md) — § Refusal wording
