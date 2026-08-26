# Reason contract: production evidence, 25 August 2026

**Status:** Addendum to the [rejection-reason contract brief](2026-08-20-rejection-reason-contract-brief.md)
for [#665](https://github.com/leamonline/Smarter-dog-bookings/issues/665).
**Still not authorised to implement.** This adds measurement against the *live* database
to decisions the brief left open; it does not reopen any the brief settled.

The brief was written from the repository and the parity measurement. Everything below
was read from production (`nlzhllhkigmsvrzduefz`) today, which matters here more than
usual: migrations are applied to this project by hand, so the deployed
`validate_booking_capacity()` is the authority on what it emits, not the newest file in
`supabase/migrations/`.

## 1. #665's closing note is now stale — strike it

#665 ends with "Worth knowing before starting": production's function contains
mis-encoded `â` sequences that any work touching these messages should repair.

That was true when written. It is not true now:

```
mojibake_emdash: 0    mojibake_arrow: 0    (pg_proc.prosrc, 25 Aug 2026)
```

Migration `20260820090000_repair_capacity_message_encoding.sql` fixed it on 20 August,
the day the brief was written. **The reason contract no longer carries an encoding
repair with it**, which removes the one piece of incidental work the issue attached to
it. Someone should delete that section from #665 so the next reader doesn't plan for it.

## 2. Decision 3 (code vocabulary) — the existing 13 codes are provably sufficient

The brief calls adopting `mapDenialReason`'s existing codes "the cheapest credible
option". That can now be stated more strongly for the capacity gate.

Production's `validate_booking_capacity()` contains **19 `raise exception` statements,
15 distinct messages**. Running the real `mapDenialReason` over all 15 — not reading the
regexes, running them — every one maps, and **none falls through to `unknown`**:

| # | production message | code |
|---|---|---|
| 1 | `Day is fully booked: … already has … dog(s) (maximum … per day)` | `daily_cap` |
| 2 | `Invalid slot: %` | `unavailable` |
| 3 | `Large dogs need approval for this slot (%)` | `large_dog_ineligible` |
| 4 | `09:00 large dog conditional: 08:30 must be empty` | `large_dog_ineligible` |
| 5 | `09:00 large dog conditional: 10:00 must have 0-1 seats used` | `large_dog_ineligible` |
| 6 | `12:00 large dog requires 13:00 to be empty (early close)` | `large_dog_ineligible` |
| 7 | `13:00 is closed — large dog at 12:00 triggered early close` | `large_dog_ineligible` |
| 8 | `Back-to-back large dogs only allowed at 12:30 + 13:00` | `large_dog_ineligible` |
| 9 | `Only a small/medium dog can share this slot with a large dog` | `large_dog_ineligible` |
| 10 | `Large dog fills this slot — already has bookings` | `large_dog_ineligible` |
| 11 | `Not enough capacity (2-2-1 rule)` | `capacity_2_2_1` |
| 12 | `13:00 closed — early close from 12:00 large dog` | `large_dog_ineligible` |
| 13 | `Slot is full` | `slot_full` |
| 14 | `Capped at 1 (2-2-1 rule)` | `capacity_2_2_1` |
| 15 | `Large dog fills this slot` | `large_dog_ineligible` |

Two consequences for the decision:

- **The vocabulary needs no new codes for this gate.** Fifteen messages collapse to five
  existing codes. Whatever granularity is chosen, it is a *subset* question, not an
  extension one. Note in particular that ten distinct large-dog refusals, across eleven
  raise sites, share `large_dog_ineligible` — if report 2F is ever expected to separate
  "early close" from "back-to-back", that is a deliberate widening to decide now, not a
  gap to discover later.
- **The regex fallback is currently correct**, so the migration path the brief describes
  (emit `DETAIL`, keep prose inference as documented fallback) starts from a fallback
  that agrees everywhere. Any disagreement introduced later is a real regression rather
  than pre-existing drift, which makes the parity assertion worth writing.

This also sharpens the urgency the brief already stated honestly. Nothing is *wrong*
today — the codes reaching `booking_denials` are accurate. The defect is that they are
accurate *by coincidence of wording*, and one UX edit to a message silently
re-categorises the log. Fragility, not breakage.

## 3. Decision 1 (carrier) — Option B's plumbing claim verified

The brief recommends carrying the code in `DETAIL` and notes this is "a one-line type
addition, not plumbing". Confirmed, and slightly better than claimed:

- `src/supabase/repositories/bookingPolicyRepo.ts` **already reads both**
  `error.details` and `error.hint`, narrowing each to `string | null`. The pattern exists
  in this codebase and is in use.
- The live function uses `using errcode` exactly **once** (`SDC03`, for
  `booking_visit_already_cancelled`) and `using hint` **zero** times, so neither field is
  contended. `DETAIL` remains the better choice regardless — `HINT` is conventionally
  advice for a human reader, and Postgres tooling surfaces it that way.

## 4. What any implementation migration must be written against

Not the repository's newest capacity migration. Production's deployed `prosrc`.

Sixteen migrations define or redefine `validate_booking_capacity()`. The repository's
own guidance is to search every migration before editing because a later one can replace
an earlier definition — and the hand-apply history means production can differ from all
of them. The safe sequence is to read `pg_proc.prosrc` from the live project, add
`using detail = …` to each `raise` in *that* text, and change nothing else.

The property that makes this reviewable: **if the message strings are byte-identical
before and after, the existing tests already prove the decisions did not move.**
`supabase/tests/036_capacity_parity.test.sql` asserts exact message text against `P0001`
19 times, and roughly 20 assertions across the pgTAP suite do the same. They should all
pass unchanged. A migration that needs any of them edited has changed behaviour and
should be rejected on that basis alone.

## Related

- [Rejection-reason contract brief](2026-08-20-rejection-reason-contract-brief.md) — the design decisions this measures against
- [Capacity parity measurement](2026-08-19-capacity-parity-measurement.md) — § Refusal wording
- [ADR 008](../architecture/decisions/008-customer-facing-refusal-wording.md) — customer-facing refusal wording, which settled the product half of #665
