# Legal-risk Tranche 1 — non-production rollout runbook

**Status:** Production migration applied; dependent frontend release remains pending review and merge

**Findings:** B-01, H-01, H-02 and H-06

**Approved design:** [2026-07-12-legal-risk-remediation-design.md](../specs/2026-07-12-legal-risk-remediation-design.md)

**Implementation plan:** [2026-07-12-legal-risk-tranche1.md](../plans/2026-07-12-legal-risk-tranche1.md)

**Single migration:** `supabase/migrations/20260712115759_legal_risk_tranche1.sql`

**Intended Supabase target:** organisation `igfmzgmalwntolwhavoa`, project
`nlzhllhkigmsvrzduefz` (`Smarter-dog-grooming`)

## Hard stop and scope

This runbook began as a non-production handoff. On 13 July 2026, separate
explicit production authority was recorded and the database migration below was
applied. It does not authorise the dependent frontend deployment or merge.

For this handoff:

- do not reapply the migration or alter migration history;
- do not run the historical queries below;
- do not inspect identifiable customer records;
- do not publish or alter substantive legal wording;
- do not change Supabase, Twilio, Meta or any other supplier console;
- use synthetic fixtures in local or separately authorised non-production
  environments only;
- do not describe the wider legal-risk audit as remediated. This tranche closes
  four code-addressable findings only.

## Production migration application — 13 July 2026

Production application was explicitly authorised in the task conversation after
the staging-only reconciliation and hosted pgTAP evidence were complete. At
commit `bdf7a0c05bff70660e139747c04a11da8dd7bb0c`, the exact committed migration
`20260712115759_legal_risk_tranche1.sql` was applied individually through the
Supabase MCP to `nlzhllhkigmsvrzduefz` (`Smarter-dog-grooming`). No reset,
migration-history repair or unrelated migration was run.

The production migration-history entry is version `20260713151950` with name
`legal_risk_tranche1`. Post-application checks confirmed:

- `merge_humans` has the committed `prosrc` hash
  `f5dbadd6912cb028ac6639e055b9bfd5`, all three opt-out guards, owner
  `postgres`, `SECURITY DEFINER`, `search_path=public, pg_temp`, anonymous
  execution denied and authenticated execution granted;
- the staff-only policies, `dogs.reported_size` column and private cancellation
  receipt table are present;
- the security adviser returned 30 `WARN` notices and no errors; and
- no synthetic writes or identifiable customer-record inspection were performed
  against production.

The dependent frontend has not been merged or deployed. Release and rollback
owners, any maintenance lock, and the frontend release decision remain open.

## Required deployment order after separate authorisation

The database boundary must exist before any frontend code that depends on its
new RPCs is served.

1. Record the release owner, target environment, approved commit and rollback
   owner.
2. Before changing the database, establish one separately reviewed release
   lock:
   - put the customer portal into an enforced maintenance/read-only state that
     prevents affected writes from both new and already-open/PWA sessions; or
   - first deploy a backwards-compatible, pre-migration frontend that works
     against the old schema and keeps cancellation visibly failed whenever its
     write returns an error.
3. Verify that no reachable legacy cancellation UI can ignore a failed write
   and close as if it succeeded. A cosmetic banner or client-only flag is not a
   sufficient maintenance control for an already-open PWA.
4. Apply only `20260712115759_legal_risk_tranche1.sql` to the authorised
   non-production database.
5. Run the static security suite, all five Tranche 1 pgTAP files and the
   synthetic smoke checks below.
6. Regenerate `src/supabase/database.types.ts` from the applied schema using the
   project's authorised Supabase type-generation workflow. Never hand-edit it.
7. Rerun lint, type-checking, migration validation, Vitest and the production
   build against that generated type surface.
8. Deploy the dependent Tranche 1 frontend to the same non-production
   environment.
9. Repeat the synthetic application journeys below.
10. Remove the release lock only after the new database and frontend have both
    passed smoke checks.
11. Stop. Production application requires a separate decision and authority.

The database must still precede the frontend that depends on its new columns
and RPCs. The release lock closes the dangerous migration-to-frontend interval:
without it, the old cancellation UI would ignore tightened-RLS failures and
report false success. Applying only part of the migration would leave the old
permission model in an unknown state; the migration must not be split.

## Staging revalidation after the 13 July amendment

The candidate migration was amended before production application so
`merge_humans` preserves active SMS, WhatsApp and email opt-outs when deleting a
duplicate record. Staging already records migration version `20260712115759`,
so a normal `db push` will not re-execute the amended file. The earlier hosted
database evidence therefore applies to the pre-amendment candidate only.

Separate staging-database approval was granted on 13 July 2026. At exact commit
`a0cef60` and Supabase CLI `2.109.1`, the committed `merge_humans` definition,
comment and grants were applied to project `btjnxvgkpdbfrrqxvkfj` in one
transaction. This narrow reconciliation did not replay the other migration DDL,
reset staging, alter migration history, inspect customer records or touch
production.

Post-reconciliation evidence:

- the live function body MD5 is `f5dbadd6912cb028ac6639e055b9bfd5`, matching
  the committed function body, with all three opt-out assignments present;
- owner `postgres`, `SECURITY DEFINER` and `search_path=public, pg_temp` remained
  unchanged; anonymous execution stayed denied and authenticated execution
  stayed granted;
- all five canonical hosted pgTAP files passed: 84 assertions, including the
  two-session cancellation race and the duplicate-human opt-out merge;
- aggregate cleanup counts were zero for every reserved synthetic fixture,
  including Auth users, identities, sessions, app rows, receipts and the test
  Vault secret;
- the staging security adviser remained at the same 29 expected `WARN` notices
  for deliberately authenticated `SECURITY DEFINER` endpoints, with no errors.

The existing staging migration-history row remains unchanged and therefore
contains the pre-amendment statement text. This was an explicit scope boundary,
not evidence that the amended file was replayed. Fresh-application proof comes
from disposable GitHub run `29238760095`, which passed 15 pgTAP files / 151
assertions against the production schema-only baseline plus the committed
candidate migration. The production migration is now applied; the dependent
frontend release remains a separate decision.

## Local verification evidence

Evidence recorded on branch `fix/legal-risk-remediation` on 12 July 2026:

| Gate | Result |
|---|---|
| `fnm exec --using=22 npm run lint` | Passed: 0 errors; 122 warnings |
| `fnm exec --using=22 npm run typecheck` | Passed |
| `fnm exec --using=22 npm run check:migrations` | Passed: 174 migration files |
| `fnm exec --using=22 npm test` | Passed: 187 files, 1,845 tests |
| `fnm exec --using=22 npm run build` | Passed: 3,471 modules; PWA precached 104 entries |
| `fnm exec --using=22 npx --no-install supabase test db supabase/tests/115_customer_cancellation_concurrency.test.sql --local` | **Not executed successfully:** no local Postgres service was reachable (`LegacyDbConnectError`) |

## Authorised schema-baseline evidence

The evidence jobs used the intended project above as a schema-only baseline;
they did not dump or inspect customer data.

- GitHub Actions run `29202542430` passed 13 pgTAP files / 133 tests against
  the target schema baseline plus the candidate migration.
- Run `29202899252` found no security-adviser issues. The performance adviser
  reported 73 unused-index `INFO` notices expected on the fresh disposable
  stack; none was an error or warning.
- Exact-head run `29211218338` passed 14 pgTAP files / 148 tests at
  `f29565e`, including the two-session membership race, post-commit receipt
  replay and stale-lifecycle rejection.
- Amended-candidate run `29238760095` passed 15 pgTAP files / 151 assertions at
  `a0cef60`, including `125_merge_humans_opt_outs.test.sql`.
- The generated `src/supabase/database.types.ts` body has SHA-256
  `25febe3c7a58ae83a9e7c873c0fbce004e041868a93dcf4ee4e31d0bcf72d8f3`.
- A paid Supabase preview branch was unavailable on the Free plan. No preview
  branch was created and no cost was incurred.

The two-session cancellation-membership regression in
`115_customer_cancellation_concurrency.test.sql` is therefore recorded as
passing against the disposable schema-only target baseline plus candidate
migration. No production migration was applied.

## Synthetic database smoke checks

Use throwaway users, humans, dogs and bookings only. Wrap fixtures in a
transaction and roll them back. Exercise `anon`, customer and staff roles
explicitly. Record only pass/fail, aggregate counts and expected SQLSTATEs; do
not record raw tokens or personal fields. Supply throwaway Vault values if the
cancellation notification trigger requires them.

The canonical executable checks are:

- `supabase/tests/100_customer_write_permissions.test.sql` for B-01 and H-01;
- `supabase/tests/120_trusted_contact_lock.test.sql` for H-02;
- `supabase/tests/110_customer_cancellation.test.sql` for H-06;
- `supabase/tests/115_customer_cancellation_concurrency.test.sql` for the H-06
  cancellation-membership race;
- `supabase/tests/125_merge_humans_opt_outs.test.sql` for preservation of active
  communication suppressions during duplicate-customer merges.

### B-01 — protected human fields

- A synthetic pending customer cannot directly change `approved_at`,
  `approved_by`, `source`, `signup_submitted_at` or `archived_at`.
- A forged approval attempt does not allow the pending customer to book.
- `update_customer_contact_details` and `complete_customer_profile` derive the
  subject from `auth.uid()` and change only their declared fields.
- `anon` cannot execute either customer profile RPC.
- A synthetic staff role retains the existing staff-only human write path.

### H-01 — authoritative dog size

- A customer cannot insert directly into `dogs`.
- `create_customer_dog` stores the declared estimate in `reported_size` while
  authoritative `size` remains `NULL`.
- Customer edits cannot set authoritative `size`; a changed breed or reported
  size requires staff verification again.
- Signup approval and customer booking fail while an owned dog has no verified
  authoritative size.
- A size supplied in booking JSON cannot act as a fallback.
- Equivalent textual forms of one dog UUID cannot bypass duplicate-dog
  detection, and invalid UUID text returns the public input SQLSTATE.
- Customer dog creation/editing and signup approval share the same owner-row
  lock; booking creation holds every requested dog through validation and
  insertion.

### H-02 — trusted-contact creation lock

- `add_customer_trusted_human(text,text,text,text)` is absent and not
  executable.
- A customer cannot insert a relationship directly into
  `human_trusted_contacts`.
- An existing synthetic trusted link remains readable by its owner.
- The portal remains display-only and shows the neutral unavailable state for
  creation. Existing links are deliberately retained.

### H-06 — server-authoritative cancellation

- A raw customer multi-column cancellation update affects zero rows.
- A non-owned, missing, mixed-owner, mixed-status or concurrently regrouped
  target fails closed with non-disclosing `SDC03` and no partial mutation.
- Disabled online cancellation returns `SDC01`.
- London wall time is authoritative: exact deadlines are allowed and a request
  one microsecond beyond the deadline returns `SDC02`.
- Missing or malformed settings use `allowCancellations=true` and exactly the
  24-hour default without leaking a JSON cast error.
- A valid group cancellation changes every scoped row atomically, preserves all
  unrelated fields and returns the complete deterministic receipt.
- A same-date multi-dog visit cancels together, while later recurring
  appointments that share its `group_id` stay Booked.
- Scoped dog ownership remains locked and revalidated through the cancellation
  write.
- `anon` cannot execute `cancel_customer_booking(uuid,text)`.

## Synthetic application journeys

Run these against the authorised non-production database after the migration
and frontend are both present:

- A cancellation RPC failure keeps the form, entered reason and booking visible
  and announces the error.
- A successful cancellation closes only after a valid receipt and awaited
  bookings-only refresh.
- If cancellation commits but refresh fails, the UI says the cancellation was
  saved and directs the customer to refresh.
- If a reschedule creates the replacement but cannot cancel the original, the
  terminal recovery state names the partial success, retains the new booking
  IDs and prevents a second replacement click.
- Trusted contacts remain readable but creation stays unavailable.
- A dog with only `reported_size` cannot enter the customer booking flow.

## Deferred count-only historical review

**PRODUCTION-ONLY — NOT RUN OR AUTHORISED BY THIS TASK.**

These queries return candidate counts, not proof of misuse. Before any later
execution, name an incident owner, record separate production authority and set
the actual migration application timestamp in the same SQL session. Do not add
IDs, names, phones, addresses, notes or free text to the output. Any row-level
follow-up is a separate decision requiring new authority.

```sql
-- Replace the timestamp only after production review is authorised.
select set_config(
  'audit.tranche1_applied_at',
  'REPLACE_WITH_AUTHORISED_MIGRATION_TIMESTAMP',
  false
);
```

### B-01 approval-state candidates

```sql
select
  count(*) filter (
    where h.source = 'self_signup'
      and h.approved_at is not null
      and h.signup_submitted_at is null
  ) as approved_before_submission_count,
  count(*) filter (
    where h.source = 'self_signup'
      and h.approved_at is not null
      and (
        h.approved_by is null
        or not exists (
          select 1 from public.staff_profiles sp
          where sp.user_id = h.approved_by
        )
      )
  ) as approval_without_current_staff_actor_count,
  count(*) filter (
    where h.source = 'self_signup'
      and h.approved_at < h.signup_submitted_at
  ) as approval_timestamp_order_candidate_count
from public.humans h;
```

### H-01 dog-field candidates

```sql
select
  count(*) filter (
    where h.source = 'self_signup'
      and d.size is not null
      and d.reported_size is null
  ) as self_signup_verified_size_without_report_count,
  count(*) filter (
    where h.source = 'self_signup'
      and (
        d.custom_price is not null
        or cardinality(coalesce(d.alerts, '{}'::text[])) > 0
        or nullif(btrim(coalesce(d.groom_notes, '')), '') is not null
        or d.archived_at is not null
      )
  ) as self_signup_staff_field_review_candidate_count
from public.dogs d
join public.humans h on h.id = d.human_id;
```

These are intentionally broad review candidates: legitimate staff verification
can produce either count.

### H-02 retained and later trusted links

```sql
with boundary as (
  select current_setting('audit.tranche1_applied_at')::timestamptz as applied_at
)
select
  count(*) as total_retained_link_count,
  count(*) filter (where link.created_at < boundary.applied_at)
    as retained_before_lock_count,
  count(*) filter (where link.created_at >= boundary.applied_at)
    as created_after_lock_review_count
from public.human_trusted_contacts link
cross join boundary;
```

Post-lock links may be legitimate staff changes; the count is a monitoring
prompt, not an attribution.

### H-06 legacy cancellation candidates

```sql
with boundary as (
  select current_setting('audit.tranche1_applied_at')::timestamptz as applied_at
)
select
  count(*) filter (
    where event_type = 'cancelled'
      and occurred_at < boundary.applied_at
      and actor_role = 'customer'
  ) as legacy_customer_cancel_event_count,
  count(*) filter (
    where event_type = 'cancelled'
      and occurred_at < boundary.applied_at
      and actor_role is null
  ) as legacy_unattributed_cancel_event_count
from public.booking_events
cross join boundary;

select count(*) as cancelled_booking_without_event_count
from public.bookings b
where b.status = 'Cancelled'
  and not exists (
    select 1
    from public.booking_events e
    where e.booking_id = b.id
      and e.event_type = 'cancelled'
  );
```

## Rollback by disabling, not reopening permissions

Keep the migration's tightened database boundary in place during rollback.

- If cancellation is unsafe or unavailable, set the authoritative portal
  cancellation setting to disabled and hide the customer control. Keep staff
  handling available.
- If a profile or dog RPC fails, disable the affected customer action and show
  a neutral unavailable state while the narrow RPC is forward-fixed.
- Keep trusted-contact creation disabled. Existing links remain readable.
- If frontend/database versions are mismatched, first activate the same
  enforced maintenance/read-only release lock required above. Only then
  withdraw the dependent frontend version, and retain the lock until a
  compatible fail-visible frontend is active; do not undo the migration.
- Never recreate broad customer human or booking update policies, raw customer
  dog insertion, the unsafe phone-lookup relationship function or a client-side
  size fallback.
- Preserve staff-only RLS and the shared `authenticated` table privileges that
  staff workflows still need.

## Known limitations and required follow-ups

- Rescheduling is not yet atomic end to end. Replacement creation and original
  cancellation are separate transactions. The terminal partial-success state
  is the current fail-visible safeguard; a later server command must make the
  complete reschedule one transaction.
- Existing trusted-contact links are retained. A verified invitation and
  acceptance lifecycle belongs to a later tranche.
- The current-head two-session database regression and authorised
  schema-derived type generation are complete and recorded above. The
  count-only historical review remains outstanding.
- Dependent frontend deployment/merge, legal wording, supplier configuration,
  incident assessment and any identifiable-record review remain outside this
  handoff.

## Final production stop

- [x] Separate production authority recorded in the task conversation
- [ ] Authorised non-production pgTAP and synthetic smoke evidence attached
- [x] Schema-derived types regenerated and verified against the intended target
- [ ] Release and rollback owners named
- [x] Production migration application decision recorded and migration applied
- [ ] Dependent frontend release merged and deployed

Stop here for the current task. This document records the migration authority
above and grants no further frontend or deployment authority.
