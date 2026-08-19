# Edge Function data-exposure audit

**Date:** 2026-08-18
**Commit audited:** `main@10b716e`
**Issue:** [#605](https://github.com/leamonline/Smarter-dog-bookings/issues/605), acceptance criterion 12 —
*"The audit identifies and resolves any endpoint that exposes broader data than its caller requires."*
**Scope:** all 27 deployable Edge Functions, enumerated from `supabase/functions/*/index.ts`
rather than a hardcoded list.

## Result

**No endpoint was found exposing customer data beyond what its caller requires.**

Two things are worth recording anyway: one over-fetch that does not reach a caller, and one
non-PII abuse surface. Neither is a data-exposure defect. Details below.

## Method, and what it does not cover

For every function: the auth family from `_shared/authManifest.json`, every `.select(...)`
column list, and every response body returned to the caller. Functions reachable without a
credential, or by a customer rather than staff, were then read in full.

**Limits, stated so this is not over-read.** This is a static reading of response paths and
query shapes. It is not a runtime test, and the two largest functions
(`whatsapp-send` at 1100 lines, `apply-customer-confirm` at 733) were audited at the level of
their queries and response shapes rather than line by line. A response body assembled through
several layers of helper could still carry a field this pass did not attribute.

## The exposed surface, and why each is bounded

Only four functions are reachable without a staff credential.

| Function | Family | What a caller can obtain |
|---|---|---|
| `customer-phone-on-file` | `public-rate-limited` | Two booleans |
| `postcode-lookup` | `public-rate-limited` | Public Royal Mail PAF data |
| `whatsapp-webhook` | `meta-signature` | Nothing — no table reads |
| `whatsapp-flow-endpoint` | `meta-signature` | `{ ok: true }` |

**`customer-phone-on-file`** returns `{ on_file, has_password }` — two booleans, no name, no
email, no bookings. It is an existence oracle for phone numbers, which is inherent to phone
login, and it is defended by a two-tier rate limit: a per-IP bucket plus a global bucket whose
stated purpose is catching enumeration that rotates IPs to evade the per-IP cap. Minimal
disclosure by design.

**`calendar-feed`** was checked closely because a URL-token feed is a classic over-exposure
shape. It is correctly scoped: a `customer` token resolves `dogs` filtered by its own
`human_id` and then queries bookings only for those dog IDs, so it cannot reach another
customer's data. Owner names are attached **only** when `feedType === "staff"`.
`calendar-ics` selects the dog name and never the owner's.

**`broadcast-message`** sends per recipient in a loop (`to: human.phone`), so recipients are
never disclosed to one another, and it verifies `is_staff()` under the caller's own token.

The remaining functions are staff-authenticated, webhook-authenticated (called by Postgres
triggers via `pg_net`, whose responses Postgres discards), or internal service-to-service.
Where staff-facing functions return customer names, contact details or message content, that is
data staff already see in the dashboard.

## Finding 1 — `resend-booking-notification` uses `select("*")` (low)

The only wildcard select in the codebase.

```
.from("bookings").select("*").eq("id", bookingId).maybeSingle()
```

**It does not reach the caller.** The row is forwarded server-to-server to the target
`notify-booking-*` function; the caller receives only
`{ ok, status, trigger_type, result }`. So this is an over-fetch, not an over-exposure.

The residual concern is forward-looking: any column later added to `bookings` is automatically
forwarded to another function with no review. If a sensitive column is ever added, that
forwarding is silent.

### Why the obvious fix is unsafe, and must not be applied naively

Narrowing the select to the columns the notify functions visibly consume **would break live
notification behaviour.** Grepping the three record-consuming functions yields:

- `booking_date`, `confirmation_channel`, `dog_id`, `group_id`, `id`, `notify_human_ids`,
  `service`, `slot`, `status`, `cancel_reason`, `visit_id`

But the shared helper `_shared/recipients.ts` reads further columns off the same object that
appear nowhere in those functions' own source:

- `deposit_required`, `deposit_received_at`, `payment`

Those three drive deposit-gated suppression. A narrowing based on the functions alone would
leave them `undefined`, changing which customers get notified — plausibly sending a
confirmation for a booking whose deposit is unpaid. The failure would be silent: no error, just
different messages reaching real customers.

**Recommendation.** Narrow it only as a deliberate change that first enumerates every consumer
of the forwarded record, including shared helpers, and covers deposit-gated suppression with a
test. Until then `select("*")` is safer than a partial column list. This is a genuine case where
the wildcard is load-bearing by accident.

### Follow-up, 19 August 2026 — narrowing would not have helped

Revisiting this finding to act on it surfaced the fact that settles it: **the Postgres triggers
forward the identical row.** They post `'record', row_to_json(NEW)` — all 46 columns — on every
booking status change, which is the path every automatic confirmation, ready and cancellation
notification takes. `resend-booking-notification` is the rare manual replay of that same path,
and its `select("*")` exists to match the trigger's payload shape.

So narrowing the resend select would have reduced exposure by close to nothing, while
introducing a second hazard: the two payloads would diverge, and a future consumer change could
work on the trigger path and silently break on resend. The wildcard is not an oversight here —
it is the shape of the contract.

Enumerating the columns did produce something worth acting on, though. Of the 46 columns
forwarded, 14 are consumed and 32 are not, and the unused set includes free text and
customer-identifying snapshots — `notes`, `owner_name_snapshot`, `dog_name_snapshot`,
`breed_snapshot`, `deposit_reference`, `created_by_name`. None is rendered into a customer
message and all of it stays inside the project, so this is not a leak; but it travels, and the
audit's stated residual concern — that a newly added column joins the payload with no review —
applies to the trigger path just as much.

**Action taken.** `src/security/bookingNotificationPayloadColumns.test.ts` classifies all 46
columns and recomputes the consumed set from the consuming sources, so the classification cannot
drift from the code. Adding a column to `bookings` now fails the build until someone states what
it is and whether a notification payload should carry it, and narrowing either path alone fails
too. The forwarding is unchanged; the silence is what got fixed.

## Finding 2 — `postcode-lookup` is an unauthenticated proxy to a paid API (informational)

`public-rate-limited`, no table reads, returns Royal Mail PAF address data from APITier. The
data is public reference data, not customer data, so it is not a privacy exposure. The exposure
is commercial: anyone can spend the salon's APITier quota. The same two-tier rate limit applies.
Recorded so the cost surface is known, not as a defect.

## Criterion 12 disposition

Met, with the limits in **Method** stated. The audit found no endpoint exposing broader data
than its caller requires. Finding 1 is logged as a follow-up with an explicit warning against
the naive fix; Finding 2 is informational.
