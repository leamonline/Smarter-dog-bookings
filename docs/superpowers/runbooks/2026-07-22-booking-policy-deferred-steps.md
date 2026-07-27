# Booking policy programme — deferred steps and environment limitations

Recorded honestly as work that has **not** been done, so nothing downstream
mistakes an unavailable check for a passing one.

## Environment limitations on the implementation machine

No container runtime (Docker or podman) is available, which removes two checks:

| Check | Status | Why | How to close it |
|---|---|---|---|
| `npm run test:db` (`supabase test db`) | **Not run** | Needs Docker to start the local Supabase stack | Run on a machine with Docker, or in CI |
| `npx supabase gen types typescript` | **Not run** | Shells out to `podman run … postgres-meta` | Same; or use the Supabase MCP `generate_typescript_types` tool against a project with these migrations applied |
| `deno test supabase/functions/` | **Not run** | Deno not installed | Install Deno, or run in CI |

**What was run instead.** A throwaway Homebrew PostgreSQL 15 cluster with
hand-written Supabase stubs (auth/cron/net/vault/storage schemas, the three
application roles, pgTAP built from source). All migrations apply in filename
order and every new pgTAP suite passes against it:

| Suite | Assertions |
|---|---|
| `140_booking_visit_foundation` | 46 |
| `145_booking_policy_rules` | 56 |
| `150_visit_deposits_incidents_credits` | 48 |
| `155_customer_visit_commands` | 29 |
| `160_staff_visit_policy_commands` | 33 |

Eight pre-existing suites (`010`, `020`, `030`, `040`, `060`, `080`, `090`,
`115`) fail in that stub environment for reasons unrelated to this programme —
fixtures omitting `humans.surname`, pgTAP signature differences. This was
verified by building a second database **without** the programme's migrations
and observing identical failures.

## Deferred implementation steps

### `src/supabase/database.types.ts` is stale

The generated Supabase types do **not** yet include `booking_visits`,
`booking_lineages`, `booking_policy_versions`, `booking_policy_settings`,
`booking_visit_deposits`, `booking_financial_ledger`,
`booking_policy_incidents`, `customer_credit_reservations`,
`booking_change_requests` or any of the new RPCs.

This is safe today because the new RPC wrappers in `src/supabase/rpc.ts` do not
depend on the generated table types, and `npm run typecheck` passes. It must be
regenerated before the programme's pull request is merged:

```bash
npx supabase gen types typescript --local > /tmp/smarter-dog-database.types.ts
diff -u src/supabase/database.types.ts /tmp/smarter-dog-database.types.ts
```

Review the diff, copy it in, then re-run `npm run typecheck` and generate a
second time; a non-zero `cmp` between the two generations means the file is
stale or was edited by hand. **Never hand-edit it** — the file header says so.

### Foundation plan Task 4 partial scope

Task 4's full signature list includes booking creation, rescheduling, proposal
acceptance and deposit-Terms acceptance. What is implemented and tested so far:

- `preview_customer_cancel_visit` / `cancel_customer_booking_visit`
- `withdraw_customer_booking_visit`
- `withdraw_customer_booking_change_request`
- `request_customer_credit_refund` / `cancel_customer_credit_refund`
- the private `confirm_booking_visit_core`, `record_late_booking_change_core`,
  `close_open_change_requests` and both dispatchers

Still to add: `preview_customer_booking_visit`,
`create_customer_booking_visit`, `accept_customer_booking_deposit_terms`,
`accept_customer_booking_visit_proposal`,
`accept_customer_booking_change_proposal`,
`preview_customer_reschedule_visit` and `reschedule_customer_booking_visit`,
including the recent-cancellation lineage-continuity rule and the
`auto_confirm_disabled_staff_review` / `destination_last_minute_staff_review`
held-destination branches.

### Foundation plan Task 5 partial scope

Implemented: approve, decline, deposit outcome, liability resolution, refund
settlement, incidents, waivers, overrides, contact evidence and late-change
decisions.

Still to add: `create_staff_booking_visit`, `update_staff_booking_visit`,
`cancel_staff_booking_visit`, `reschedule_staff_booking_visit`,
`propose_booking_visit_slot`, `propose_booking_change_destination`, both
proposal withdrawals, `decide_late_visit_deposit`,
`record_released_visit_payment`, `resolve_withdrawn_visit_deposit`,
`resolve_service_prepayment_reconciliation`, `record_visit_final_payment` and
`record_unserviceable_late_arrival`.

### Not started

- Foundation Task 7 (visit events and reporting inputs) and Task 8
  (foundation verification gate).
- The whole portal/staff plan (10 tasks).
- The whole WhatsApp/notifications plan (Tasks 1–8), plus its Tasks 9–11 which
  are owner-approval gated.

## Activation state

`previous_day_1500_v1.effective_at` is **null** and nothing in the branch can
set it: the only writer is a future audited latch that must also present a
transaction-local latch key. Verify with:

```sql
select code, effective_at from public.booking_policy_versions;
```
