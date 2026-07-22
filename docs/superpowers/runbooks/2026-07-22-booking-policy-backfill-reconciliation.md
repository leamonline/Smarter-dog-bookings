# Booking visit backfill reconciliation runbook

**Scope:** resolving items in `booking_visit_backfill_review` after the visit
foundation migration (`20260722120000_booking_visit_foundation.sql`) has been
applied. These items are legacy rows whose visit structure or commercial
confirmation could not be inferred safely. Code never guesses; staff decide.

## Ground rules

1. **Record the target first.** Every change record starts with the exact
   Supabase project name and ref you are operating on. Never assume the
   default project.
2. **No direct table updates.** `update bookings …` or `update booking_visits …`
   as a substitute for the audited commands is forbidden. The only write path
   is `apply_booking_visit_backfill_reconciliation(...)`.
3. **Preview before apply, always.** Attach the full `preview_…` JSON output —
   including `expectedHash` — to the change record. Apply must receive that
   exact hash; a stale hash means the rows changed and you must re-preview.
4. **Separate production approval.** Applying to production requires its own
   explicit approval from the owner for each apply call (or an explicitly
   approved batch). Approval to run the migration is not approval to apply
   reconciliations.
5. Apply is **owner-only** (not granted to any application role) and is
   idempotent: supply a fresh `p_idempotency_key` uuid per decision; replaying
   the same key returns the recorded result without acting twice.
6. Structural commands never create, change or delete financial data, never
   delete or rewrite child booking history, and never erase a terminal
   status. If a repair seems to need any of those, stop and escalate to the
   owner — it is outside this runbook.

## Reading the review list

Staff call `get_booking_visit_backfill_review()` (staff-gated RPC). Each item
has a stable `review_key`, a `reason_code`, the affected visit/booking ids,
and the current `row_set_hash`. An item disappears once resolved and reopens
automatically if the underlying rows drift after resolution.

| reason_code | Meaning |
|---|---|
| `structural_possible_multi_dog` | Null-group singletons for one customer and date created within five seconds — possibly one multi-dog visit. |
| `structural_mixed_status` | One visit whose children mix open and terminal (cancelled/completed) work. |
| `commercial_mixed_money` | One visit whose children carry different payment or deposit flags. |
| `commercial_unconfirmed_deposit` | An active visit whose commercial confirmation could not be inferred (legacy unpaid-deposit anomaly). |

## Actions and payloads

All calls: `preview_booking_visit_backfill_reconciliation(p_review_key, p_action, p_payload)`
then `apply_booking_visit_backfill_reconciliation(p_review_key, p_expected_hash, p_action, p_payload, p_reason, p_idempotency_key)`.

### merge_singletons

Confirms that a cluster of singleton visits was really one multi-dog visit.

```json
{ "targetVisitId": "<one of the cluster's visit ids>" }
```

All other cluster rows move onto the target visit; the emptied source visits
settle to cancelled automatically. Only valid for
`structural_possible_multi_dog` items.

### split_visit

Moves the listed booking rows out of a shared visit into a fresh visit on the
same date for the same customer. At least one row must remain behind.

```json
{ "moveBookingIds": ["<booking id>", "…"] }
```

### exclude_terminal_children

Marks the listed terminal (Cancelled/Completed) rows as
`visit_membership_state = 'removed'` so they no longer count toward the
visit aggregate. History is untouched. Only terminal rows may be excluded.

```json
{ "bookingIds": ["<booking id>", "…"] }
```

### set_commercial_state

Records the staff decision about a visit's commercial confirmation.

```json
{ "confirmation": "confirmed" }   // or "unconfirmed"
```

Confirming stamps the legacy policy (`legacy_24h`) and its rolling deadline.
A completed visit can never be made unconfirmed. Only valid for commercial
items.

## After every apply

- The immutable audit row (actor, reason, before/after graphs, hash,
  idempotency key) is written automatically; quote its `id` in the change
  record together with the preview JSON.
- Re-run `get_booking_visit_backfill_review()` and confirm the item is gone.
- If the item reappears later, the rows drifted after resolution — treat it
  as a new decision with a new preview.
