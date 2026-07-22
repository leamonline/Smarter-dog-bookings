# Booking policy foundation — migration rollout runbook

**This runbook deploys schema only. It does NOT activate the new policy and
must never be presented as a customer-visible policy change.**

`previous_day_1500_v1.effective_at` stays null throughout. Customers and staff
see exactly today's behaviour before, during and after these migrations. The
new tables dual-write a `legacy_compat` aggregate alongside the live legacy
paths; the legacy status, deposit and notification behaviour remains
authoritative until a separately approved activation.

Deploying the foundation alone is safe. Deploying it and *then* letting anyone
set an effective instant without the rest of the programme (portal, staff,
WhatsApp, notifications, Terms, Meta templates) is not — the activation gate
lives in the rollout plan, not here.

## Migration order

Apply in filename order, each in its own transaction, and stop on the first
failure:

| # | Migration | What it adds |
|---|---|---|
| 1 | `20260722120000_booking_visit_foundation.sql` | Visit aggregate, lineages, inactive policy registry, backfill, reconciliation commands |
| 2 | `20260722130000_authoritative_booking_policy_rules.sql` | Typed settings singleton, runtime seam, deadline helpers, runtime-aware availability RPCs |
| 3 | `20260722140000_visit_deposits_incidents_credits.sql` | Deposits, financial ledger, incidents, overrides, credits, refund calendar, guarded legacy compatibility |
| 4 | `20260722150000_customer_visit_commands.sql` | Customer visit commands and the private dispatch seam |
| 5 | `20260722160000_staff_visit_policy_commands.sql` | Staff approval, deposit reconciliation, incidents, waivers, overrides |
| 6 | `20260722170000_visit_policy_events.sql` | Visit events, trusted request instants, aggregate completion |

Rollback boundary: migrations 1–6 are additive. Nothing deletes a booking,
drops a column or cancels a visit. Rolling back means dropping the new objects,
not restoring booking data — but take the backup anyway.

## Pre-flight gates

1. **Backup / PITR confirmed** for the target project, with the restore point
   recorded in the change record. Note the exact Supabase project name and ref
   first; never assume the default project.
2. `npm run check:migrations` passes.
3. The full local bar passes (see "Verification evidence" below).
4. No other migration is mid-apply and prod migration history matches
   `supabase/migrations/` for everything earlier than 20260722.

## Post-migration verification queries

Run every one of these. Each must return the stated result before the
deployment is called done.

### The policy is inactive

```sql
select code, effective_at from public.booking_policy_versions order by code;
```

Expected exactly: `legacy_24h` → `-infinity`, `previous_day_1500_v1` → null.
**Any non-null v1 instant means someone activated the policy — stop and
escalate.**

### Every booking has a visit, and no visit was invented

```sql
select count(*) as orphan_bookings from public.bookings where visit_id is null;
select count(*) as visits, count(distinct human_id) as customers
  from public.booking_visits;
```

`orphan_bookings` must be 0.

### Backfill review, split by reason and without customer detail

```sql
select reason_code, kind, count(*)
from public.booking_visit_backfill_review
group by reason_code, kind
order by reason_code;
```

Every row is a staff decision to make through
`preview_booking_visit_backfill_reconciliation` /
`apply_booking_visit_backfill_reconciliation` (see the reconciliation
runbook). None blocks *this* deployment; all of them block activation.

### Legacy deposit tags all migrated to audited overrides

```sql
select
  (select count(*) from public.humans where coalesce(deposit_required,false)) as legacy_tags,
  (select count(*) from public.customer_booking_rule_overrides
    where idempotency_key like 'legacy-deposit-tag:%') as migrated_overrides;
```

The two counts must be equal. The legacy boolean is deliberately **not**
cleared yet.

### One-per-visit opening money reconciles against legacy rows

```sql
select
  (select count(*) from public.booking_visit_deposits) as visit_deposits,
  (select count(distinct visit_id) from public.bookings
    where deposit_required and visit_id is not null) as legacy_deposit_visits,
  (select coalesce(sum(amount_pence),0) from public.booking_financial_ledger
    where event_kind = 'deposit_received') as opening_deposit_pence;
```

Investigate any visit that carries a legacy deposit flag but no deposit record;
resolve it through `record_legacy_visit_opening_money`, never by direct SQL.

### Zero unresolved legacy holds — an ACTIVATION blocker

```sql
select count(*)
from public.booking_visit_deposits
where origin = 'legacy_import'
  and state in ('awaiting_terms','awaiting_payment',
                'received_liability','reconciliation_required');
```

Must be 0 **before activation**. A non-zero count is acceptable immediately
after this deployment, but each one must be resolved while the legacy runtime
is still authoritative: these holds have no accepted immutable v1 Terms
publication and cannot confirm after cutover.

### Refund calendar coverage reaches the horizon plus five working days

```sql
select
  (select booking_horizon_days from public.booking_policy_settings where singleton) as horizon_days,
  public.refund_calendar_coverage_for(
    now() + make_interval(days =>
      (select booking_horizon_days from public.booking_policy_settings where singleton))
  ) as coverage_at_horizon;
```

`coverage_at_horizon` must be non-null. A null means the England-and-Wales bank
holiday calendar needs extending before any refund promise is made at the far
end of the horizon.

### The guarded legacy sweep still behaves exactly as deployed

```sql
select jobname, schedule, command from cron.job where jobname = 'deposit-auto-release';
```

Expected: exactly one job, `20 * * * *`, calling
`public.run_legacy_deposit_auto_release()`. That function preserves the
characterised legacy behaviour for `legacy_compat` visits only, never touches a
`visit_v1` aggregate, and becomes a no-op once the policy is active.

### No new deposit timer exists

```sql
select count(*) from cron.job
where command ilike '%booking_visit_deposits%'
   or jobname ilike '%visit%deposit%';
```

Must be 0. Overdue deposit attention is **derived** (`state in
('awaiting_terms','awaiting_payment') and due_at <= now()`), never a
timer-driven mutation. If a future change adds such a job, that is a
regression against the signed non-goals.

## Smoke tests after deployment

Existing behaviour must be untouched:

- Staff: create a multi-dog booking through the New Booking modal; cancel a
  booking; complete a booking; check the Today queues render.
- Customer portal: sign in, view upcoming bookings, cancel one, reschedule one.
- WhatsApp: send a booking enquiry and confirm the agent still replies.
- Confirm the new RPCs are correctly gated: a customer session calling
  `current_booking_rules()` or `approve_booking_visit(...)` must get
  `42501`, and calling `cancel_customer_booking_visit(...)` must return a
  `policy_not_active` blocked receipt without mutating anything.

## Verification evidence from the implementation branch

| Command | Result |
|---|---|
| `npm run lint` | PASS (0 errors, 124 pre-existing warnings) |
| `npm run typecheck` | PASS |
| `npm run check:migrations` | PASS (184 files) |
| `npm run test` | PASS (2145 tests) |
| `npm run build` | PASS |
| pgTAP suites 140/145/150/155/160/165 | PASS (234 assertions) |
| `npm run test:db` | **NOT RUN** — no Docker on the implementation machine |
| `deno test supabase/functions/` | **NOT RUN** — Deno not installed |

See `2026-07-22-booking-policy-deferred-steps.md` for the full environment
limitations and the still-stale `src/supabase/database.types.ts`.
