# Booking policy foundation — migration rollout runbook

**This runbook manually deploys inactive schema only. It does NOT activate the
new policy and must never be presented as a customer-visible policy change.
It authorises no Terms or Meta publication, backfill-reconciliation decision,
or customer contact.**

`previous_day_1500_v1.effective_at` stays null throughout. Customers and staff
see exactly today's behaviour before, during and after these migrations. The
new tables dual-write a `legacy_compat` aggregate alongside the live legacy
paths; the legacy status, deposit and notification behaviour remains
authoritative until a separately approved activation.

Deploying the inactive schema alone is compatible with today's behaviour.
Letting anyone set an effective instant without the rest of the programme
(portal, staff, WhatsApp, notifications, Terms, Meta templates) is not — the
activation gate lives in the rollout plan, not here.

## Change record

For each staging or production run, record the exact Supabase project name and
ref, backup/PITR restore point, operator, UTC start and finish, one outcome per
migration, and every verification result. Approval covers only the schema
migrations listed here.

## Migration order

No GitHub Actions, Vercel or Edge Function deployment applies these database
migrations. Apply them manually to the recorded target, one file per
migration call and transaction, in exact filename order. Stop on the first
failure and inspect migration history before retrying.

| # | Migration | What it adds |
|---|---|---|
| 1 | `20260726144000_booking_visit_foundation.sql` | Visit aggregate, lineages, inactive policy registry, backfill, reconciliation commands |
| 2 | `20260726144001_authoritative_booking_policy_rules.sql` | Typed settings singleton, runtime seam, deadline helpers, runtime-aware availability RPCs |
| 3 | `20260726144002_visit_deposits_incidents_credits.sql` | Deposits, financial ledger, incidents, overrides, credits, refund calendar, guarded legacy compatibility |
| 4 | `20260726144003_refund_calendar_coverage_warnings.sql` | Verified refund coverage, fail-loud due dates and maintenance warnings |
| 5 | `20260726144004_customer_visit_commands.sql` | Customer visit commands and the private dispatch seam |
| 6 | `20260726144005_staff_visit_policy_commands.sql` | Staff approval, deposit reconciliation, incidents, waivers, overrides |
| 7 | `20260726144006_visit_policy_events.sql` | Visit events, trusted request instants, aggregate completion |
| 8 | `20260726144007_staff_visit_write_commands.sql` | Atomic staff create, update, cancellation and rescheduling with revision checks |
| 9 | `20260726144008_staff_prepayment_and_terms_notice.sql` | Complete prepayment dispositions and Terms-acknowledgement basis |
| 10 | `20260726144009_staff_terms_notice_and_transfer_legs.sql` | Declared staff Terms notice and balanced prepayment-transfer legs |
| 11 | `20260726144010_booking_visit_data_quality.sql` | Read-only visit authority classifier and supporting indexes |
| 12 | `20260726144011_customer_visit_projection.sql` | Owner-scoped customer visit projection and server actionability |
| 13 | `20260726144012_data_quality_local_only.sql` | Per-visit data-quality performance correction |
| 14 | `20260726144013_staff_booking_policy_projections.sql` | Staff all-open attention and visit-detail projections |

Apply and verify the complete sequence on staging before a separately recorded
production run.

Rollback boundary: migrations 1–14 form one inactive-schema tranche. Nothing
deletes a booking, drops a column or cancels a visit. Rolling back means
dropping the new objects, not restoring booking data — but take the backup
anyway.

## Pre-flight gates

1. **Backup / PITR confirmed** for the target project, with the restore point
   recorded in the change record. Note the exact Supabase project name and ref
   first; never assume the default project.
2. `npm run check:migrations` passes.
3. The full local bar passes (see "Verification evidence" below).
4. No other migration is mid-apply and prod migration history matches
   `supabase/migrations/` for every migration before
   `20260726144000_booking_visit_foundation.sql`.
5. The draft PR's disposable `DB Tests (pgTAP)` run has applied all fourteen
   candidates in order and passed.

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

Run mutation and messaging smoke tests on staging with controlled salon test
records and identities only. Production verification under this approval is
read-only: do not alter a live booking or message a customer.

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
| `npm run check:migrations` | PASS (193 files) |
| `npm run test` | PASS (2145 tests) |
| `npm run build` | PASS |
| pgTAP suites 140/145/150/155/160/165/168/170/172/173 | **PENDING** — run in supported disposable database CI |
| `npm run test:db` | **NOT RUN** — no Docker on the implementation machine |
| `deno test supabase/functions/` | **NOT RUN** — Deno not installed |

See `2026-07-22-booking-policy-deferred-steps.md` for the full environment
limitations and the still-stale `src/supabase/database.types.ts`.
