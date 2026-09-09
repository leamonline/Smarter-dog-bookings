# Supabase advisors: the accepted baseline

**Status:** Active (assessment item 2.6, 2 September 2026)

The hosted project's [security](https://supabase.com/docs/guides/database/database-advisors)
and performance advisors report roughly two hundred findings. Every one has
been read and either fixed or accepted with a reason. That judgement is
recorded as a file, [`supabase/advisors/baseline.json`](../supabase/advisors/baseline.json),
so a new finding shows up as a diff rather than being lost among the known ones.

## Running the check

```bash
SUPABASE_ACCESS_TOKEN=… npm run check:advisors             # diff live vs baseline
SUPABASE_ACCESS_TOKEN=… npm run check:advisors -- --update  # rewrite the baseline
```

The token is a Supabase Management API token (the same secret the migration
workflows use). The project ref comes from the baseline file; set
`SUPABASE_PROJECT_REF` to point somewhere else.

| Outcome | Exit code | What to do |
|---|---|---|
| Live matches the baseline | 0 | Nothing |
| A baseline finding is no longer reported | 0, with a note | Run `--update` and commit the smaller baseline |
| A finding is live that the baseline does not know, or its level rose | 1 | Fix it, or accept it below with a reason, then `--update` |

`--update` rewrites the file from the live advisors. Review the diff before
committing: the point of the check is that every accepted finding was
accepted by someone, so never refresh just to make it pass.

The [Advisor Drift Audit](../.github/workflows/check-advisors-drift.yml)
workflow runs the same check every Monday and on demand; like the migration
drift audit it is an alarm, not a merge gate.

## What the baseline accepts, and why

Counts as recorded on 9 September 2026 (first baseline 2 September 2026; refreshed after the 7 September drift audit flagged the eight findings noted below). The linter names link to Supabase's
explanation of each rule.

| Rule | Count | Level | Why it is accepted |
|---|---|---|---|
| [`authenticated_security_definer_function_executable`](https://supabase.com/docs/guides/database/database-linter?lint=0021_authenticated_security_definer_function_executable) | 83 | WARN | The customer and staff write paths are `SECURITY DEFINER` RPCs by design: customers cannot `INSERT` bookings directly, only through `create_customer_booking_group` and its siblings, which validate ownership and take the authoritative dog size (see CLAUDE.md, "Customers cannot raw-INSERT bookings"). Each function's authorisation is inside its body; the linter cannot see that, so it flags the grant. Any *new* entry here needs the same review before it is accepted. Accepted 9 September 2026 after that review: `save_salon_holiday`, `get_staff_holidays` and `get_public_holiday_notices` (holiday notices, ADR 010; staff-only bodies check `is_staff()`), `customer_change_deadline_preview` (read-only preview of the caller's own change deadline) and `link_pending_signup` (staff-only, #774). |
| [`anon_security_definer_function_executable`](https://supabase.com/docs/guides/database/database-linter?lint=0021_authenticated_security_definer_function_executable) | 5 | WARN | Five read-only public facts the portal and website show before login: `get_public_open_days()`, `get_public_salon_facts()`, `booking_policy_runtime()`, `booking_policy_runtime_status()` and, since 9 September 2026, `get_public_holiday_notices()` (the website holiday card; returns only verified closure and reopening dates, never customer rows). They return salon-wide configuration (open days, published policy), never customer rows. A new entry here is the one to look at hardest. |
| [`rls_enabled_no_policy`](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) | 29 | INFO | RLS enabled with no policy means no direct access for `anon`/`authenticated` at all. These are the booking-policy, deposit, ledger and audit tables (`booking_visits`, `booking_financial_ledger`, `booking_policy_*`, `booking_deposit_*`, `customer_credit_reservations`, …): they are read through the `SECURITY DEFINER` projections and written by RPCs, triggers and the service role, so a direct client policy would only widen the surface. That is the intended lock, not an oversight. `salon_holidays` (9 September 2026) follows the same pattern: written only by `save_salon_holiday`, read through `get_staff_holidays` and `get_public_holiday_notices`. |
| [`auth_leaked_password_protection`](https://supabase.com/docs/guides/database/database-linter?lint=auth_leaked_password_protection) | 1 | WARN | Needs the Pro plan; the in-app HaveIBeenPwned check at password-set time is the compensating control (README, "Manual Supabase dashboard settings"). Revisit on upgrade. |
| [`unindexed_foreign_keys`](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys) | 61 | INFO | Scoped database work, not one blanket migration — assessment item 2.4 prioritises the keys on tables that are read or cascaded through at volume. `humans_claims_human_id_fkey` (9 September 2026) is a one-row-per-claim link on a small table; it joins the batch rather than getting its own migration. |
| [`unused_index`](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index) | 46 | INFO | Reviewed after a further month of statistics before any drop — assessment item 2.5. Some cover dark-launched or seasonal features. |

The two `function_search_path_mutable` findings that used to sit alongside
these were fixed rather than accepted (the changelog's "111 rather than 113").

## When a new finding appears

1. Read the linter's explanation and the object it names.
2. If it is a mistake — a new table without RLS, a helper that should be
   `SECURITY INVOKER` — fix it with a migration, applied to production
   before the code that depends on it (see [migrations.md](migrations.md)).
3. If it is deliberate, add the reason to the table above (or extend an
   existing row's rationale if it is another instance of the same design),
   then `--update` and commit the baseline and this page together.
