# Task 2 projection performance evidence

Measured on the local PostgreSQL 15 verification cluster at **9,600 visits /
9,600 bookings / 800 customers** (roughly three years of salon history), with
`ANALYZE` run first. Seed data removed afterwards.

The aim was not a benchmark score. It was to catch sequential scans and
repeated per-visit work before they become latency — and it found one.

## The finding: a per-visit whole-table scan

The first `booking_visit_data_quality()` consulted
`booking_visit_backfill_review`, a view that aggregates across **every** visit
and booking. The customer projection calls the classifier **once per visit**,
so a twelve-visit customer paid for twelve whole-table scans.

| | Execution time |
|---|---|
| `list_customer_booking_visits()` before | **2,133 ms** |
| after making the classifier local to one visit | **10.2 ms** |

That is a 208× improvement, and the cost now grows with the customer's own
visit count rather than with the size of the table — so it will not silently
degrade as the salon accumulates history.

`booking_visit_backfill_review` is unchanged and still the staff
reconciliation worklist, where a whole-table scan is appropriate and
infrequent.

## Query evidence after the fix

| Query | Plan | Time |
|---|---|---|
| One customer: upcoming + history projection | index paths throughout | **10.2 ms** |
| Staff day view | `Bitmap Index Scan on booking_visits_date_lifecycle_idx` | **0.17 ms** |
| Staff attention queue | partial-index scans on both open-reconciliation indexes | **1.85 ms** |
| One customer's history by owner + date | `Bitmap Index Scan on booking_visits_human_lifecycle_date_idx` | **0.02 ms** |

## Indexes added for these paths

| Index | Serves |
|---|---|
| `booking_visits_human_lifecycle_date_idx (human_id, lifecycle_state, booking_date desc)` | the customer list and history |
| `booking_visits_date_lifecycle_idx (booking_date, lifecycle_state)` | the staff day view |
| `booking_deposit_money_recon_open_idx` *(partial: state='open')* | attention queue |
| `booking_service_prepay_recon_open_idx` *(partial: state='open')* | attention queue |
| `booking_financial_ledger_settles_idx` *(partial: settles_event_id not null)* | unsettled-refund detection |
| `booking_financial_ledger_refund_due_idx` *(partial: refund_due)* | outstanding obligations |
| `booking_visit_deposits_awaiting_idx` *(partial: awaiting states)* | deposit checks due |

The partial indexes stay small because the open sets are small, which is the
point: the queue query should cost what the queue contains, not what the table
contains.

## Caveats

Measured on the stub cluster described in
`2026-07-22-booking-policy-deferred-steps.md`, not on Supabase. Plan **shapes**
should carry over — the same indexes and statistics apply — but absolute times
will differ. Re-measure on the supported environment before merge.

## Note for whoever runs the suites against a shared database

Two suites assume a clean database and failed while the perf seed was
present: `140` deletes `legacy_24h` to exercise a table CHECK (blocked by a
foreign key once seeded visits reference it), and `165` asserts no pre-existing
v1-kind event rows. Both pass on a fresh database, which is what
`supabase test db` provides. Worth knowing before debugging a phantom failure.
