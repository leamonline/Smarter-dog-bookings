# ADR 007: What the customer capacity-read RPCs may disclose

**Status:** Accepted — current disclosure surface, one gap found and fixed
**Date:** 23 August 2026
**Related issues/PRs:** Issue #667 (re-homed from #623); migration
`20260823080000_cap_get_occupancy_range.sql`
**Applies to:** `get_slot_occupancy`, `get_occupancy_range`, `get_blocked_seats`,
`get_immediate_slots`

## Context

The customer booking wizard cannot read `bookings` or `day_settings`
directly — RLS shows a customer only their own booking rows, and
`day_settings` is staff-only. The client capacity engine still needs full-day
occupancy to avoid offering a slot the database will then refuse, so it reads
through four `SECURITY DEFINER` functions that deliberately bypass RLS. Each
has always carried a comment claiming minimal disclosure. Comments are not
tests: nothing failed the build if a later column addition or widened
`select` started disclosing more than intended.

Issue #667 asked for that claim to be verified against the live definitions
rather than assumed, and for the range-based reads' inference risk — knowing
how busy the salon is on a given day — to be an explicit decision rather than
an unexamined one.

## What each function discloses

| RPC | returns | never returns |
|---|---|---|
| `get_slot_occupancy(p_date)` | `(slot, size)` for one date | any id, name, status or price |
| `get_occupancy_range(p_from, p_to)` | `(booking_date, slot, size)` over a range | as above |
| `get_blocked_seats(p_start, p_end)` | `(setting_date, slot, seat_index)` | the `day_settings` "open" overrides, `extra_slots`, or any other staff field |
| `get_immediate_slots()` | `(setting_date, slot)` for the server's today | any parameter — the function decides "today" itself, so a client can't ask about any other date |

Verified against the deployed function bodies on both hosted projects
(`nlzhllhkigmsvrzduefz` production, `btjnxvgkpdbfrrqxvkfj` staging), 23 August
2026: all four are `SECURITY DEFINER`, `STABLE`, pin `search_path`, and
`has_function_privilege('anon', …, 'EXECUTE')` is false for every one — the
grant chain is `revoke all` then `grant … to authenticated` alone, so only a
logged-in customer session can call any of them.
`src/security/customerCapacityReadDisclosure.test.ts` recomputes this from
the migration source on every run and fails if a column, a grant, or the
`SECURITY DEFINER`/`search_path` posture drifts.

None of the four returns anything that identifies a person, a dog, a specific
booking row, or money. The shape is occupancy geometry only: which slot,
which size category, which seat position, which day.

## Options considered, for the range-based inference risk

`get_occupancy_range` and `get_blocked_seats` both let a caller choose how
wide a window to read, which is a different question from *what columns* come
back: even with zero PII, an unbounded window turns "what the booking UI must
show" into "the whole history of how busy the salon has ever been," in one
call, from one authenticated account.

1. Leave both as found and record the risk as accepted.
2. Narrow what either function returns (fewer columns, or remove one).
3. Cap the width of the window every caller can request in a single call.

## Decision

**Option 3, applied only where it was missing.**

`get_blocked_seats` already capped a request at 92 days — "28-day wizard
window + headroom for grouped multi-dog flows. Anything bigger smells like
scraping the calendar," per its own migration comment — as an `else` fallback
that holds regardless of `booking_policy_runtime()`. Writing the pinning test
for this ADR found that `get_occupancy_range` never had the equivalent: not in
its original definition, and not in `20260726144001`, which added a
policy-horizon check (`assert_customer_range`) only inside
`if booking_policy_runtime() = 'active'`, with no matching `else`. With
`booking_policy_runtime()` inactive — the live state on both hosted projects —
that left **no bound at all**: `get_occupancy_range('0001-01-01',
'9999-12-31')` returned the entire booking history's `(date, slot, size)` to
any authenticated customer, in one call.

Option 2 was rejected: the wizard's date step genuinely needs `(booking_date,
slot, size)` over a range to dim fully-booked days (E9/E10-equivalent
reasoning to `get_slot_occupancy`'s single-day case), and issue #667
explicitly ruled out narrowing what the booking journey needs. Option 1 was
rejected once the fix was seen to cost nothing: the wizard's `DateSelection`
component only ever requests one 28-day page at a time (`PAGE_SIZE = 28`), no
Edge Function calls this RPC, and mirroring `get_blocked_seats`' exact 92-day
shape leaves 3× headroom with zero behavioural change for any real caller.

Fixed in `20260823080000_cap_get_occupancy_range.sql`: the same always-on
92-day `else` fallback `get_blocked_seats` already had, added to
`get_occupancy_range`. Returned columns and grants are unchanged. Applied to
both `nlzhllhkigmsvrzduefz` and `btjnxvgkpdbfrrqxvkfj` on 23 August 2026 and
verified live on each: a request wider than 92 days now raises
`get_occupancy_range: range too wide (max 92 days)`; a normal 28-day request
is unaffected (40 rows returned against production's real data).

`get_immediate_slots` takes no parameters at all — the function decides
"today" itself — so it has no width to cap. `get_slot_occupancy` takes one
date, not a range.

## Rationale

Occupancy shape without identity is the disclosure the booking UI cannot
function without, and issue #667 accepted that much going in. What was not
yet true was that reading it was *bounded* to what the UI needs. A 92-day cap
on `get_occupancy_range`, identical to its sibling, closes that gap for the
cost of a four-line `else` branch and no product-visible change.

## Consequences

- `get_occupancy_range` now behaves symmetrically with `get_blocked_seats`:
  both are unbounded-in-principle only while `booking_policy_runtime()` is
  `'active'` (where `assert_customer_range` governs instead), and capped at
  92 days otherwise.
- A future caller that genuinely needs a wider single-call range — none exists
  today — must extend the cap deliberately and explain why, the same as any
  other change to this file.
- The pinning test recomputes every column, grant and posture claim in this
  ADR from the migration source. A drift in any of them fails the build
  rather than this document going stale.

## Revisit when

- A new column is added to any of the four `returns table(...)` clauses —
  the pinning test will already fail and point here.
- `booking_policy_runtime()` moves to `'active'` in production — at that
  point `assert_customer_range`'s horizon check becomes the operative bound
  for `get_occupancy_range` and `get_blocked_seats` alike, and this document
  should confirm the fallback branches are still correct as a safety net
  rather than the primary guard.
- A legitimate caller needs more than 92 days in one call.

## Evidence and implementation state

- **Verified against live definitions**, both hosted projects, 23 August
  2026 — not against migration text alone.
- **Fixed, not merely recorded:** the one gap found
  (`get_occupancy_range` unbounded) was closed the same day, before this ADR
  was written up, so the ADR describes the current state rather than a
  pending one.
- **Guarded going forward:**
  `src/security/customerCapacityReadDisclosure.test.ts`.

Related: [capacity engine reference](../../capacity-engine.md), issue #667,
the `#661` `bookings`-column classification guard
(`src/security/bookingNotificationPayloadColumns.test.ts`) this test's
recompute-from-source pattern follows.
