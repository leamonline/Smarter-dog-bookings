# Booking Policy Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce one authoritative visit-level policy model and atomic database commands for approval, cancellation, rescheduling, deposits, credits and incidents without activating the new customer policy.

**Architecture:** Add `booking_visits` as the aggregate above the existing one-row-per-dog `bookings` table, plus a durable reschedule lineage, late change requests, incident audit, one-per-visit deposit record, immutable financial ledger and idempotent command receipts. PostgreSQL owns deadlines, state transitions and thresholds; TypeScript consumes typed receipts and never re-implements enforcement. The new policy remains inactive until the final rollout plan deliberately sets its effective instant.

**Tech Stack:** PostgreSQL 15/Supabase migrations and pgTAP, TypeScript 6, Supabase JS 2, Vitest 4, Node 20.

## Global Constraints

- Source of truth: `docs/superpowers/specs/2026-07-22-booking-cancellation-rescheduling-policy-design.md`.
- Start execution in an isolated worktree from current `origin/main`; this planning checkout is one local commit ahead and eight dependency-only commits behind.
- Never apply a production migration, set the policy effective instant, publish Terms, deploy an Edge Function or message a customer without explicit approval.
- Keep `bookings.status` as the grooming lifecycle. Commercial lifecycle, approval and confirmation are separate axes on `booking_visits`; deposit state belongs to the one-per-visit deposit record.
- A visit is the atomic unit. Never update only one dog row for a visit-level action.
- Use `Europe/London` inside authoritative SQL. Exactly 15:00 is on time.
- Store money as integer pence. The deposit is exactly `1000` pence per visit.
- No `visit_v1` unpaid-deposit or unapproved-request path may automatically cancel a visit or release capacity. Until the exact activation instant, the guarded `legacy_compat` cron deliberately preserves the characterised live legacy behaviour.
- SQL functions use `security definer`, `set search_path = public, pg_temp`, explicit role grants and non-disclosing ownership errors.
- Enable RLS on every new public table. Default to no direct customer access: customer reads/writes go through owned projections/commands; staff detail reads require `is_staff()` and ledger/audit writes remain command-only. Revoke all private-schema/table/view access from `public`, `anon` and `authenticated` unless a task names a narrower grant.
- Keep the new policy inactive (`effective_at is null`) throughout this plan. Existing application paths must continue to work until later plans migrate them.
- Gate the complete v1 runtime on `booking_policy_runtime() = 'active'`. Before the effective instant, new tables may dual-write/audit only; horizon, approval, manual deposit, incident consequences, customer actions, reminders and messaging must preserve legacy behaviour.
- New v1 mutation RPCs return `policy_not_active` before that state unless a named compatibility wrapper is deliberately dual-writing legacy behaviour. Legacy public RPCs remain runtime-aware through activation so an old browser cannot bypass v1 after midnight.
- Make runtime/time injection an internal seam, not a customer input: every public command delegates to a revoked private dispatcher that accepts the trusted decision instant and an optional test-only runtime override. Public wrappers always supply `statement_timestamp()` and a null override; service wrappers later supply only authenticated provider evidence and a null override. The dispatcher derives `booking_policy_runtime_at(...)` unless the override is non-null, and only the migration/database owner can execute that signature directly. pgTAP, inside a rolled-back owner fixture, may pass `active` to exercise v1 branches while the real v1 row remains null. Revoke it from `public`, `anon`, `authenticated` and `service_role`; add grant/forged-parameter tests proving no application or Edge caller can inject time/runtime. The real persisted-latch active paths still rerun in the disposable post-Task-8 fixture.
- UK English in comments, errors and fixtures.

---

### Task 1: Add the visit aggregate, lineage and inactive policy version

**Files:**
- Create: `supabase/migrations/20260722120000_booking_visit_foundation.sql`
- Create: `supabase/tests/140_booking_visit_foundation.test.sql`
- Create: `src/security/bookingVisitFoundationMigration.test.ts`
- Create: `docs/superpowers/runbooks/2026-07-22-booking-policy-backfill-reconciliation.md`

**Interfaces:**
- Produces tables `booking_policy_versions`, `booking_lineages`, `booking_visits`.
- Produces nullable `bookings.visit_id` during compatibility rollout.
- Produces `bookings.visit_membership_state` (`included|removed`) so audited partial changes do not corrupt whole-visit completion.
- Produces `visit_rows(uuid)` and `visit_start_at(uuid)` helpers.
- Produces a no-op-on-populated-row `ensure_legacy_booking_visit()` insert trigger so every legacy writer dual-writes a safe `legacy_compat` visit during the expand phase.
- Replaces the current `create_staff_booking_group(jsonb,date)` body so one invocation creates one visit and supplies that `visit_id` to every dog row even though the legacy rows deliberately have no `group_id`.
- Produces staff-readable `preview_booking_visit_backfill_reconciliation(...)` and owner-only `apply_booking_visit_backfill_reconciliation(...)`; no operator repairs structural backfill exceptions with ad hoc SQL.
- `booking_visits.lifecycle_state` is one of `active`, `superseded`, `cancelled`, `withdrawn`, `declined`, `completed`.
- `booking_visits.approval_state` is one of `not_required`, `waiting_staff`, `approved`, `alternative_pending`.
- `booking_visits.confirmation_state` is one of `unconfirmed`, `confirmed`.

- [ ] **Step 1: Write a failing static migration contract**

```ts
// src/security/bookingVisitFoundationMigration.test.ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20260722120000_booking_visit_foundation.sql",
  "utf8",
);

describe("booking visit foundation migration", () => {
  it("creates a visit aggregate without activating the new policy", () => {
    expect(sql).toContain("create table public.booking_visits");
    expect(sql).toContain("add column if not exists visit_id uuid");
    expect(sql).toMatch(/previous_day_1500_v1[\s\S]+null/);
    expect(sql).not.toContain("alter column visit_id set not null");
  });

  it("keeps visit helpers private", () => {
    expect(sql).toContain(
      "revoke all on function public.visit_rows(uuid) from public, anon, authenticated",
    );
  });

  it("enables RLS and revokes aggregate tables from customer roles", () => {
    expect(sql).toContain("alter table public.booking_visits enable row level security");
    expect(sql).toContain("revoke all on public.booking_visits from anon, authenticated");
  });
});
```

- [ ] **Step 2: Run the test and verify the missing migration fails**

Run: `npm run test:logic -- src/security/bookingVisitFoundationMigration.test.ts`

Expected: FAIL because `20260722120000_booking_visit_foundation.sql` does not exist.

- [ ] **Step 3: Create the additive schema and safe backfill**

Use these exact public contracts in the migration:

```sql
create table public.booking_policy_versions (
  code text primary key,
  change_rule text not null check (change_rule in ('rolling_24h','previous_day_1500')),
  effective_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    case when code = 'legacy_24h'
      then effective_at is not null and effective_at = '-infinity'::timestamptz
      else true
    end
  )
);

insert into public.booking_policy_versions(code, change_rule, effective_at)
values
  ('legacy_24h', 'rolling_24h', '-infinity'::timestamptz),
  ('previous_day_1500_v1', 'previous_day_1500', null)
on conflict (code) do nothing;

create table public.booking_lineages (
  id uuid primary key default gen_random_uuid(),
  human_id uuid not null references public.humans(id),
  self_service_reschedule_count smallint not null default 0 check (self_service_reschedule_count between 0 and 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, human_id)
);

create table public.booking_visits (
  id uuid primary key default gen_random_uuid(),
  lineage_id uuid not null,
  human_id uuid not null references public.humans(id),
  revision smallint not null default 1 check (revision > 0),
  booking_date date not null,
  lifecycle_state text not null default 'active',
  approval_state text not null default 'not_required',
  confirmation_state text not null default 'unconfirmed',
  policy_code text references public.booking_policy_versions(code),
  source text not null default 'staff',
  requested_at timestamptz not null default now(),
  commercial_eligibility_at timestamptz,
  eligibility_policy_code text references public.booking_policy_versions(code),
  runtime_generation text not null default 'legacy_compat'
    check (runtime_generation in ('legacy_compat','visit_v1')),
  legacy_compat_key text,
  confirmed_at timestamptz,
  customer_change_deadline_at timestamptz,
  is_last_minute boolean not null default false,
  supersedes_visit_id uuid references public.booking_visits(id),
  continues_cancelled_visit_id uuid references public.booking_visits(id),
  cancelled_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_visits_lifecycle_check check (lifecycle_state in (
    'active','superseded','cancelled','withdrawn','declined','completed'
  )),
  constraint booking_visits_approval_check check (approval_state in (
    'not_required','waiting_staff','approved','alternative_pending'
  )),
  constraint booking_visits_confirmation_state_check check (
    confirmation_state in ('unconfirmed','confirmed')
  ),
  constraint booking_visits_eligibility_snapshot_check check (
    (commercial_eligibility_at is null) = (eligibility_policy_code is null)
  ),
  constraint booking_visits_legacy_key_check check (
    runtime_generation <> 'legacy_compat' or nullif(trim(legacy_compat_key),'') is not null
  ),
  constraint booking_visits_confirmation_check check (
    (confirmation_state = 'confirmed' and confirmed_at is not null and policy_code is not null)
    or (confirmation_state = 'unconfirmed' and confirmed_at is null and policy_code is null)
  ),
  constraint booking_visits_one_predecessor_kind check (
    num_nonnulls(supersedes_visit_id, continues_cancelled_visit_id) <= 1
  ),
  unique (id, human_id),
  foreign key (lineage_id, human_id)
    references public.booking_lineages(id, human_id)
);

alter table public.bookings
  add column if not exists visit_id uuid references public.booking_visits(id),
  add column if not exists visit_membership_state text not null default 'included'
    check (visit_membership_state in ('included','removed'));

create unique index booking_visits_one_replacement
  on public.booking_visits(supersedes_visit_id)
  where supersedes_visit_id is not null;
create unique index booking_visits_one_cancellation_continuation
  on public.booking_visits(continues_cancelled_visit_id)
  where continues_cancelled_visit_id is not null;
create unique index booking_visits_lineage_revision
  on public.booking_visits(lineage_id, revision);
create unique index booking_visits_one_active_lineage
  on public.booking_visits(lineage_id)
  where lifecycle_state = 'active';
create index bookings_visit_id_idx on public.bookings(visit_id);
create index booking_visits_human_date_idx on public.booking_visits(human_id, booking_date);
create unique index booking_visits_legacy_compat_identity
  on public.booking_visits(human_id, booking_date, legacy_compat_key)
  where runtime_generation = 'legacy_compat';
create unique index bookings_one_dog_per_visit
  on public.bookings(visit_id, dog_id)
  where visit_id is not null;
```

Enable RLS and revoke direct application-role writes on policy versions, visits and lineages. An immutable trigger rejects changes to policy code/rule and any change to an already-set effective instant. No owner-facing RPC may write `previous_day_1500_v1.effective_at`: the later schedule RPC records a future instant only in its immutable schedule row, and only the revoked private persisted-latch function may set policy `effective_at` once to exactly that frozen schedule instant at/after it has arrived. Test direct owner/application denial, early latch denial, exact-instant write and a delayed successful latch recording the original frozen instant rather than its later execution time.

Add a deferrable constraint trigger on `bookings` that requires every non-null `visit_id` row's `booking_date` and dog owner to match its visit. Add two typed, mutually exclusive lineage edges. Every non-null `supersedes_visit_id` is a successful reschedule: it must reference a predecessor with the same human/lineage, the replacement revision must equal predecessor revision plus one, and at commit that predecessor must be `superseded` (never active/cancelled/otherwise terminal). Every non-null `continues_cancelled_visit_id` is a cancellation rebook: it must reference the same human/lineage, use predecessor revision plus one, reference a predecessor already `cancelled`, be committed no earlier than cancellation and no later than exactly 24 hours after `cancelled_at`, and contain the same canonical dog/service pairs. Add-ons and prices are not part of the signed matching rule and follow the ordinary new-booking review. The cancellation continuation does not increment or reset `self_service_reschedule_count`. Once either successor exists, immutable guards prevent changing either row's lineage/revision/linkage. Direct inserts/updates test active/wrong-terminal predecessors, both edge kinds at once, changed owner/dogs/services, 24 hours exact, the next microsecond, skipped/duplicate revisions and attempted predecessor mutation after successor creation.

Add a deferrable visit-axis constraint/transition trigger for the full lifecycle×approval×confirmation×timestamp matrix. In particular, `waiting_staff|alternative_pending` is active+unconfirmed only; confirmed visits may be only `not_required|approved`; `completed|superseded` is confirmed only; `withdrawn|declined` is unconfirmed only; lifecycle timestamps appear exactly for their matching terminal state; and confirmation/policy/deadline timestamps agree. Preserve the legitimate unconfirmed `approved` deposit hold and both confirmed cancellation versus unconfirmed not-received cancellation, but reject impossible direct inserts/updates such as confirmed+waiting staff, completed+unconfirmed, withdrawn+confirmed or stray terminal timestamps. Transition tests cover every command path, not just inserts.

Add composite aggregate FKs throughout later tables: any row that stores both `visit_id` and `human_id` references `booking_visits(id,human_id)`; visits reference `booking_lineages(id,human_id)`; related/proposed visits are checked to have the same human. PgTAP must attempt mismatched lineage, visit, incident, change-request, ledger, credit-reservation and child-dog inserts directly and prove each fails before any command logic is involved. Include cross-human, cross-lineage and skipped/duplicate replacement revision inserts against the constraint itself.

Backfill one legacy visit for each `(group_id, booking_date, human_id)` with `legacy_compat_key='group:' || group_id`, and one visit per null-group booking with `legacy_compat_key='row:' || booking_id`. Map all-completed and all-cancelled groups to their matching lifecycle state; keep a mixed-status group active when any service row remains active and flag it for staff reconciliation without rewriting child history. Treat ordinary active/paid rows as commercially confirmed and assign `legacy_24h`. Leave legacy unpaid-deposit anomalies unconfirmed for reconciliation rather than pretending the overloaded `bookings.confirmed` flag is commercial confirmation. Derive the rolling deadline from the earliest visit slot. Do not guess that unrelated null-group rows are one multi-dog visit.

Install `ensure_legacy_booking_visit()` before the backfill in the same migration. For any later insert whose caller omitted `visit_id`, it uses the durable key above, a transaction advisory lock and `insert ... on conflict` against `booking_visits_legacy_compat_identity` to find/create one `legacy_compat` visit when `group_id` exists; a genuinely independent null-group insert uses its row-ID key and remains a singleton. It then sets `NEW.visit_id`. Name/order the trigger so it runs before legacy deposit stamping. It is a compatibility dual-write only: legacy status/deposit/notification behaviour remains authoritative before activation. Add concurrency tests proving simultaneous first rows for one group resolve to one visit and an insert committed during/back-to-back with backfill cannot remain null.

In the same migration, `create or replace` the latest `create_staff_booking_group(jsonb,date)` implementation. After its existing staff/ownership/date validation, it derives the one human for the payload, creates one `legacy_compat` lineage/visit with a command-scoped key, and inserts every child with that explicit `visit_id`; it does not invent a public `group_id` or change legacy response semantics. Test that a two-dog staff command creates exactly one visit, while two unrelated null-group direct inserts still create two singleton visits.

Create a `security_invoker=true` staff-only view named `booking_visit_backfill_review` listing null-group rows with the same human/date and creation timestamps within five seconds, mixed-status groups, mixed per-dog deposit/payment values and rows whose commercial-confirmation state cannot be inferred safely. Revoke direct access from customer roles and expose it only through an `is_staff()`-gated RPC. It is a pre-activation reconciliation list, not an automatic merge.

Give every review item a stable `review_key`, deterministic current-row-set hash and structural/commercial reason code. Add immutable `booking_visit_backfill_reconciliation_audit` rows and these named commands:

```sql
preview_booking_visit_backfill_reconciliation(
  p_review_key text,
  p_action text,
  p_payload jsonb
)
apply_booking_visit_backfill_reconciliation(
  p_review_key text,
  p_expected_hash text,
  p_action text,
  p_payload jsonb,
  p_reason text,
  p_idempotency_key uuid
)
```

The action is one of `split_visit`, `merge_singletons`, `exclude_terminal_children` or `set_commercial_state`. Preview is read-only and staff-readable; it returns the locked candidate row IDs, before/after visit graph, invariant blockers and the hash that apply must receive. Apply is production owner-only, takes the same aggregate/capacity locks as live commands, rejects a stale hash or empty reason, rechecks owner/date/dog uniqueness/capacity/lifecycle/history invariants, and writes immutable actor, reason, before/after and idempotency audit. It may move membership or create corrected compatibility aggregates but never delete or rewrite child history, erase a terminal state, invent a payment, or touch any ledger field. A resolved item leaves the review view only when its audited resolution still matches the current row-set hash; later drift reopens it.

The runbook lists each action and payload, requires the preview output and hash to be attached to the change record, and requires separate explicit production approval before any apply call. It records the exact Supabase project/ref first and forbids direct table updates as a substitute.

- [ ] **Step 4: Add behavioural pgTAP coverage**

The test must prove the contracts below and reject a direct malformed `legacy_24h` row with null/non-infinite `effective_at` (the test must exercise the table constraint, not only an RPC). Also cover staff preview versus owner apply grants, every action, stale-hash/retry/concurrent apply behaviour, rollback on invariant failure, immutable audit and the prohibition on structural commands creating financial events:

```sql
select plan(10);
select has_table('public', 'booking_visits');
select has_column('public', 'bookings', 'visit_id');
select is((select effective_at from booking_policy_versions where code='previous_day_1500_v1'), null, 'new policy inactive');
select ok((select count(*) from bookings where visit_id is null) = 0, 'existing rows backfilled');
select ok((select count(*) from booking_visits where policy_code='legacy_24h') > 0, 'legacy policy assigned');
-- Add assertions for dated group isolation, recurring group separation,
-- null-group singleton safety, helper output and authenticated execute denial.
select * from finish();
```

- [ ] **Step 5: Run red/green checks**

Run:

```bash
npm run test:logic -- src/security/bookingVisitFoundationMigration.test.ts
npm run check:migrations
npm run test:db
```

Expected: static test and migration check PASS; pgTAP PASS when local Supabase is available. Record an unavailable Docker daemon as an environment limitation, never as a passing database test.

- [ ] **Step 6: Commit the additive foundation**

```bash
git add supabase/migrations/20260722120000_booking_visit_foundation.sql supabase/tests/140_booking_visit_foundation.test.sql src/security/bookingVisitFoundationMigration.test.ts docs/superpowers/runbooks/2026-07-22-booking-policy-backfill-reconciliation.md
git commit -m "feat(db): add visit-level booking foundation"
```

---

### Task 2: Centralise booking settings, policy assignment and deadlines

**Files:**
- Create: `supabase/migrations/20260722130000_authoritative_booking_policy_rules.sql`
- Create: `supabase/tests/145_booking_policy_rules.test.sql`
- Create: `src/security/bookingPolicyRulesMigration.test.ts`

**Interfaces:**
- Produces singleton typed table `booking_policy_settings`, immutable `booking_deposit_bank_instruction_versions`, immutable `booking_terms_publication_versions`, append-only `booking_policy_settings_audit`, staff-only `current_booking_rules()` and customer-safe `current_customer_booking_rules()`.
- Produces owner-only `update_booking_rules(jsonb)` and audited emergency `set_customer_booking_intake_enabled(boolean,text)`.
- Produces public no-argument enforcement predicate `booking_policy_runtime()`, customer-safe no-argument `booking_policy_runtime_status()`, private test helper `booking_policy_runtime_at(timestamptz)`, `policy_for_confirmation(timestamptz)`, `change_deadline_for(text,date,text)`, private `visit_actionability(uuid,text,timestamptz)` and public `get_customer_booking_visit_capabilities(uuid)`.
- Replaces the latest `get_open_days(date,date)`, `get_blocked_seats(date,date)` and `get_occupancy_range(date,date)` bodies with runtime-aware range validation: legacy limits before activation, authoritative inclusive horizon after activation.
- Canonical settings keys: `bookingHorizonDays`, `autoConfirm`, `depositHoldHours`, `depositBank`, `termsUrl`, `depositTermsVersion`, `depositTermsContentHash`, `customerPortal.allowCancellations`, `customerPortal.allowRescheduling`, `customerPortal.allowRepeatBooking`, `customerPortal.showHistory`.

- [ ] **Step 1: Pin the settings and boundary contract in failing tests**

Cover runtime `inactive`/`scheduled`/exact-instant `active`, defaults (`180`, `true`, `12`), the technical horizon safety bounds `1..730`, allowed deposit hours (`6/12/24/36/48`), complete bank fields, independent action switches, malformed JSON fail-closed behaviour, exact 15:00 success, one microsecond late failure, identical deadlines for every slot on one date, both daylight-saving changes, Sunday and bank-holiday dates with no business-day adjustment, and inclusive horizon day 180/day 181 rejection.

Representative pgTAP assertions:

```sql
select is(
  public.change_deadline_for('previous_day_1500_v1', date '2026-10-26', '08:30'),
  timestamptz '2026-10-25 15:00:00 Europe/London',
  'fixed previous-calendar-day deadline survives DST'
);
select ok(
  timestamptz '2026-10-25 15:00:00 Europe/London'
    <= public.change_deadline_for('previous_day_1500_v1', date '2026-10-26', '13:00'),
  'exact deadline is allowed'
);
```

- [ ] **Step 2: Implement typed, validated settings access**

Create `smarter_dog_private` if needed, then create the immutable, schema-qualified URL validator before the settings table. It accepts only a trimmed absolute `https` URL of at most 2,048 characters with a non-empty DNS/IP hostname, no username/password, no ASCII whitespace/control characters and a syntactically valid optional port/path/query/fragment; it returns strict `false`, never null, for malformed input. Normalise the host to lowercase and the default HTTPS port away before storing/comparing. Activation readiness binds the exact approved public URL and content hash, so a merely syntactic URL is never treated as publication approval.

Create the immutable publication table before the authoritative singleton. A publication is an owner-recorded assertion about one already-published external document, not merely a syntactically valid URL:

```sql
create table public.booking_terms_publication_versions (
  id uuid primary key default gen_random_uuid(),
  public_url text not null
    check (smarter_dog_private.is_valid_booking_terms_url(public_url)),
  version_label text not null check (nullif(trim(version_label),'') is not null),
  approved_content_sha256 text not null
    check (approved_content_sha256 ~ '^[0-9a-f]{64}$'),
  published_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  recorded_by uuid not null references auth.users(id),
  unique (public_url, version_label, approved_content_sha256)
);
```

Create the authoritative singleton rather than relying on free-form `salon_config.settings` for behaviour-critical values:

```sql
create table public.booking_policy_settings (
  singleton boolean primary key default true check (singleton),
  booking_horizon_days integer not null default 180 check (booking_horizon_days between 1 and 730),
  customer_intake_enabled boolean not null default true,
  auto_confirm boolean not null default true,
  allow_customer_cancellations boolean not null default true,
  allow_customer_rescheduling boolean not null default true,
  allow_repeat_booking boolean not null default false,
  show_customer_history boolean not null default true,
  deposit_hold_hours smallint not null default 12 check (deposit_hold_hours in (6,12,24,36,48)),
  bank_account_name text,
  bank_sort_code text,
  bank_account_number text,
  current_bank_instruction_id uuid,
  current_terms_publication_id uuid references public.booking_terms_publication_versions(id),
  terms_url text not null default 'https://smarterdog.co.uk/terms'
    check (smarter_dog_private.is_valid_booking_terms_url(terms_url)),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  check (
    (bank_account_name is null and bank_sort_code is null and bank_account_number is null)
    or (bank_account_name is not null
        and bank_sort_code is not null
        and bank_account_number is not null
        and nullif(trim(bank_account_name),'') is not null
        and bank_sort_code ~ '^[0-9]{2}-[0-9]{2}-[0-9]{2}$'
        and bank_account_number ~ '^[0-9]{8}$')
  )
);
insert into public.booking_policy_settings(singleton) values (true)
on conflict (singleton) do nothing;
```

Copy compatible legacy `autoConfirm`, portal flags and deposit/bank values once during migration; set the new horizon to the signed default `180` and rescheduling to `true` to preserve existing availability. Leave legacy JSON keys present during the expand phase, but no new policy code may read them.

Staff-only `current_booking_rules()` must return exactly:

```json
{
  "bookingHorizonDays": 180,
  "autoConfirm": true,
  "depositHoldHours": 12,
  "depositBank": {"accountName":"","sortCode":"","accountNumber":""},
  "termsUrl": "https://smarterdog.co.uk/terms",
  "depositTermsVersion": null,
  "depositTermsContentHash": null,
  "customerPortal": {
    "allowCancellations": true,
    "allowRescheduling": true,
    "allowRepeatBooking": false,
    "showHistory": true
  }
}
```

`current_customer_booking_rules()` returns only intake availability, horizon, customer switches, the current generic Terms URL and the read-only deadline description. It excludes bank details, internal Terms publication/version/hash and auto-confirm configuration. Bank instructions are returned only in an owned visit receipt that actually requires a deposit.

Every complete bank-details save inserts/reuses an immutable `booking_deposit_bank_instruction_versions` row and sets `current_bank_instruction_id`; blanking all bank fields clears the current pointer but never deletes a historical version. When a visit first enters `awaiting_terms`/`awaiting_payment`, snapshot that version ID on its deposit row. Owned projections and outbox payloads always render the snapshot, never today's mutable settings, so a settings change during a hold cannot redirect payment or erase what the customer was told. Revoke direct access to version rows; only staff settings and the owned payable-visit projection may read the appropriate fields. Add change-during-hold and cross-customer privacy tests.

Treat `termsUrl` as the current generic policy link. `depositTermsVersion` and `depositTermsContentHash` must be supplied together or both cleared; a complete owner save inserts/reuses the immutable publication row for that exact URL/version/hash and sets `current_terms_publication_id`. While runtime is inactive/scheduled, clearing both clears the pointer and blocks readiness without deleting history. Once runtime is active, `update_booking_rules` rejects clearing or an incomplete replacement with `terms_publication_required_active`; the owner can publish/switch atomically or use the separate emergency intake control, but can never leave active booking creation without Terms. Add `booking_visits.terms_publication_id` in this migration. Every v1 visit snapshots the current publication when its commercial eligibility is established (or at confirmation for an immediately exempt visit), and the value is then immutable. Every v1 deposit row must reference that same publication. Booking-specific confirmations, continuations, deposit/payment outcomes and reminders render the visit snapshot; only generic policy/settings copy may use today's global URL. Revoke direct application-role access to publication rows and expose URL/version only through an owned visit or staff projection; never expose the content hash to a customer. Test a Settings change between preview/create, during `awaiting_terms`, after acceptance but before outbox delivery and before a retry: stale preview is rejected, while an existing visit continues to show and accept only its original publication. Also test active clear/incomplete replacement rejection and a defensive null-pointer failure on same-day, last-minute and ordinary no-deposit creates.

`update_booking_rules(p_rules jsonb)` must reject unknown keys, non-integer horizons outside the implementation safety range `1..730`, deposit hours outside the exact choice set, partial bank details, any Terms URL rejected by that parser, a blank non-null deposit Terms version, a non-lowercase/non-64-hex content hash and a version/hash supplied without its pair. The signed default/inclusive policy remains 180; 730 is only a query/load guard, not a customer promise. Add 0/1/730/731 and large-range load fixtures plus direct-table and RPC cases for `https://` without a host, HTTP, credentials, whitespace/control characters, overlength input, malformed ports and a valid path/query/fragment. Add direct-table pgTAP for each partial-bank combination; PostgreSQL three-valued `CHECK` semantics must not allow invalid input through as `UNKNOWN`. It updates `booking_policy_settings` atomically, records `updated_by`, and returns the validated rules. `salon_config.settings` remains compatibility data only until the final contract cleanup.

Every successful save also inserts one `booking_policy_settings_audit` row with actor, timestamp and explicit before/after JSON. Revoke direct table writes from application roles so a visible control cannot appear saved without passing the same validation used at runtime.

`set_customer_booking_intake_enabled(p_enabled,p_reason)` is an owner-only emergency control, separate from ordinary Booking Rules UI, and requires a non-empty audit reason. Customer preview/create/repeat/reschedule-destination commands fail closed with `customer_intake_paused` when false; withdrawal and existing-visit cancellation remain available according to their own switches so the kill switch cannot trap customers in bookings.

Replace the three customer availability RPC bodies in this new migration rather than editing their historical files. While runtime is inactive/scheduled, preserve the existing 92-day range cap. At active runtime, require `p_start`/`p_from` on or after the current London date and `p_end`/`p_to <= current London date + booking_horizon_days`; the configured last day is included and the next day raises `booking_horizon_exceeded`. Preserve the existing authenticated-only grants and minimal non-PII result shapes.

- [ ] **Step 3: Implement policy assignment and deadline helpers**

`booking_policy_runtime_at(p_at)` returns `inactive` while v1 has no effective instant, `scheduled` while its instant is in the future and `active` at/after that instant during foundation-only deterministic tests. Public `booking_policy_runtime()` supplies `statement_timestamp()` and remains the scalar enforcement predicate; revoke the timestamp helper from application roles. Every v1 command/projection/caller added by later plans must enforce only when this server predicate equals `active`, not merely when a date or policy row is non-null.

Add customer-safe `booking_policy_runtime_status()` returning exactly `{ state: 'inactive'|'scheduled'|'failed'|'active', scheduledEffectiveAt: string|null }` with no readiness hashes, release SHA, failure detail, actor or project information. In the foundation phase it adapts the scalar state and returns null for the instant. Rollout Task 8 replaces its body to read the persisted schedule/latch: `scheduled` exposes only the future instant; `failed` may expose that attempt's instant but no reason; `active` is authoritative. UI wake-ups use this status only to refetch; browser time never authorises a mutation. Add role/privacy and malformed-result decoder tests now, then scheduled→failed and scheduled→active tests after the real schedule tables exist.

```sql
create or replace function public.policy_for_confirmation(p_confirmed_at timestamptz)
returns text language sql stable set search_path = public, pg_temp as $$
  select coalesce(
    (select code from public.booking_policy_versions
      where effective_at is not null and effective_at <= p_confirmed_at
      order by effective_at desc limit 1),
    'legacy_24h'
  );
$$;

create or replace function public.change_deadline_for(
  p_policy_code text,
  p_booking_date date,
  p_start_slot text
) returns timestamptz language plpgsql stable set search_path = public, pg_temp as $$
declare
  v_start_local timestamp := (p_booking_date::text || ' ' || p_start_slot)::timestamp;
begin
  if p_policy_code = 'legacy_24h' then
    -- Preserve the deployed rule's London wall-clock subtraction across DST.
    return (v_start_local - interval '24 hours') at time zone 'Europe/London';
  end if;
  if p_policy_code = 'previous_day_1500_v1' then
    return ((p_booking_date - 1)::text || ' 15:00')::timestamp at time zone 'Europe/London';
  end if;
  raise exception 'unknown_booking_policy' using errcode='22023';
end;
$$;
```

Pin both spring-forward and autumn-back legacy fixtures so grandfathering preserves the deployed wall-clock behaviour rather than silently changing to 24 absolute elapsed hours.

Private `visit_actionability` must return orthogonal facts—`deadline_passed`, `switch_enabled`, `state_eligible`, `move_limit_reached` and `processing_state_safe`—plus the final `allowed`, `reason_code`, `deadline_at`, all three visit state axes, `is_last_minute` and remaining self-service reschedules. It allows unconfirmed withdrawal at any time. For a recognised cancellation/reschedule intent, `deadline_passed` has final reason precedence over switch or move-limit failures so an after-cutoff messaging path cannot accidentally answer; UI capability consumers may still render the independent switch/limit facts. `processing_state_safe` uses current server time and rejects an automatic mutation once visit start/arrival/service has begun even if a trusted provider timestamp proves the request itself was sent on time. Revoke this helper from `anon` and `authenticated` because its timestamp argument exists for service-role provider time and deterministic tests only. Public `get_customer_booking_visit_capabilities(p_visit_id uuid)` derives the owner from `auth.uid()` and always uses `statement_timestamp()`; a browser can never supply the effective request time.

- [ ] **Step 4: Run the focused suites**

Run:

```bash
npm run test:logic -- src/security/bookingPolicyRulesMigration.test.ts
npm run check:migrations
npm run test:db
```

Expected: all assertions PASS; the new policy remains inactive.

- [ ] **Step 5: Commit authoritative rules**

```bash
git add supabase/migrations/20260722130000_authoritative_booking_policy_rules.sql supabase/tests/145_booking_policy_rules.test.sql src/security/bookingPolicyRulesMigration.test.ts
git commit -m "feat(db): centralise booking policy rules"
```

---

### Task 3: Add visit-level deposits, incidents, overrides and credit ledger

**Files:**
- Create: `supabase/migrations/20260722140000_visit_deposits_incidents_credits.sql`
- Create: `supabase/tests/150_visit_deposits_incidents_credits.test.sql`
- Create: `src/security/bookingPolicyLedgerMigration.test.ts`
- Modify: `docs/superpowers/runbooks/2026-07-22-booking-policy-backfill-reconciliation.md`

**Interfaces:**
- Produces `booking_visit_deposits`, `booking_deposit_money_reconciliations`, `booking_change_requests`, `booking_change_destination_reservations`, `booking_deposit_transfer_reservations`, `booking_late_deposit_satisfaction_requests`, `booking_service_prepayment_reconciliations`, `booking_visit_service_payments`, `booking_customer_contact_events`, `booking_policy_incidents`, `booking_policy_incident_audit`, `customer_booking_rule_overrides`, `booking_financial_ledger`, `customer_credit_reservations`, `booking_refund_non_working_days`, `booking_refund_calendar_coverage`, `booking_visit_bill_summary` and `booking_policy_audit`.
- Produces `resolve_deposit_requirement(uuid,date,timestamptz,text)`, `refund_due_at(timestamptz)` and customer/staff-scoped credit balance projections.
- Produces staff-only `preview_legacy_visit_opening_money(...)` and `record_legacy_visit_opening_money(...)`; ambiguous legacy money is never repaired through direct SQL or inferred from `Paid in Full`.
- Deposit states: `not_required`, `awaiting_terms`, `awaiting_payment`, `received`, `received_liability`, `not_received`, `reconciliation_required`. `received` is a satisfied visit that may confirm; `received_liability` is money found/declined after the visit will not confirm and must link a refund, credit or transfer disposition. Refund, credit, transfer and retention are immutable financial events, not ordinary deposit states.
- `Deposit check due` is a derived attention state when `state in ('awaiting_terms','awaiting_payment') and due_at <= statement_timestamp()`; it is never a timer-driven lifecycle mutation.

- [ ] **Step 1: Write failing ledger and threshold tests**

Test one incident/next-booking behaviour, clearing after a later completed visit, a threshold formed by three incidents spanning exactly 12 months, persistence until but not beyond the exact 12-month incident-free anniversary, and a new lone incident after a 12-month gap starting a fresh episode rather than resurrecting the old three-incident threshold. Also cover manual require/waive overrides, one incident per visit, waived exclusion, same-day/last-minute/insufficient-window exemptions, a hold ending exactly at appointment start remaining eligible for a deposit, exact-due-time escalation for both unresolved deposit states, five-working-day refund due dates across a weekend, and non-expiring credit/reservation arithmetic. Direct inserts must also reject every impossible deposit combination, including received without source/evidence/actor, credit with a fabricated bank time, bank without a receipt time, unresolved without due/decision fields, and v1 payable/ordinary received without accepted Terms. Add valid fixtures for a settled legacy import without reconstructable bank instructions and a post-withdrawal `received_liability` without accepted Terms but with bank evidence plus mandatory refund/credit disposition.

- [ ] **Step 2: Add immutable ledgers and constraints**

Use these key shapes:

```sql
create table public.booking_policy_incidents (
  id uuid primary key default gen_random_uuid(),
  revision integer not null default 1 check (revision > 0),
  visit_id uuid not null unique,
  human_id uuid not null references public.humans(id),
  kind text not null check (kind in ('late_cancellation','late_reschedule','no_show','late_arrival_unserviceable','late_partial_change')),
  appointment_date date not null,
  recorded_by uuid not null references auth.users(id),
  recorded_at timestamptz not null default now(),
  reason text not null,
  waived_at timestamptz,
  waived_by uuid references auth.users(id),
  waiver_reason text,
  check ((waived_at is null) = (waived_by is null)),
  check (waived_at is null or nullif(trim(waiver_reason),'') is not null),
  foreign key (visit_id, human_id) references public.booking_visits(id, human_id)
);

create table public.booking_policy_incident_audit (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.booking_policy_incidents(id),
  action text not null check (action in ('recorded','waived','unwaived','corrected')),
  reason text not null,
  actor_id uuid not null references auth.users(id),
  occurred_at timestamptz not null default now()
);

create table public.booking_visit_deposits (
  visit_id uuid primary key references public.booking_visits(id),
  origin text not null check (origin in ('legacy_import','visit_v1')),
  state text not null check (state in (
    'not_required','awaiting_terms','awaiting_payment','received',
    'received_liability','not_received','reconciliation_required'
  )),
  amount_pence integer not null default 1000 check (amount_pence = 1000),
  requirement_reason text,
  exemption_reason text,
  requirement_decided_at timestamptz not null,
  customer_payment_reference text,
  staff_verification_reference text,
  bank_instruction_id uuid references public.booking_deposit_bank_instruction_versions(id),
  due_at timestamptz,
  bank_received_at timestamptz,
  satisfaction_source text check (satisfaction_source in ('bank','credit','transfer','legacy_import')),
  satisfaction_event_id uuid,
  disposition_event_id uuid,
  recorded_at timestamptz,
  recorded_by uuid references auth.users(id),
  terms_publication_id uuid references public.booking_terms_publication_versions(id),
  terms_accepted_at timestamptz,
  updated_at timestamptz not null default now(),
  check (
    state = 'reconciliation_required'
    or (state = 'not_required' and due_at is null and bank_received_at is null)
    or (state in ('awaiting_terms','awaiting_payment')
        and due_at is not null and nullif(trim(requirement_reason),'') is not null
        and bank_received_at is null and recorded_at is null)
    or (state = 'received' and satisfaction_source is not null
        and satisfaction_event_id is not null and recorded_at is not null
        and (origin = 'legacy_import' or recorded_by is not null)
        and ((satisfaction_source = 'bank' and bank_received_at is not null)
             or (satisfaction_source = 'credit' and bank_received_at is null)
             or (satisfaction_source = 'transfer' and bank_received_at is null)
             or satisfaction_source = 'legacy_import'))
    or (state = 'received_liability' and satisfaction_source = 'bank'
        and satisfaction_event_id is not null
        and bank_received_at is not null and recorded_at is not null
        and recorded_by is not null)
    or (state = 'not_received' and recorded_at is not null
        and (origin = 'legacy_import' or recorded_by is not null))
  ),
  check (state in ('received','received_liability')
         or (satisfaction_source is null and satisfaction_event_id is null and disposition_event_id is null)),
  check (state = 'received_liability' or disposition_event_id is null),
  check (state in ('not_required','reconciliation_required')
         or (origin = 'legacy_import' and state in ('received','received_liability','not_received'))
         or bank_instruction_id is not null),
  check (
    origin = 'legacy_import' or state not in ('awaiting_terms','awaiting_payment','received')
    or terms_publication_id is not null
  ),
  check (
    origin = 'legacy_import' or state not in ('awaiting_payment','received')
    or terms_accepted_at is not null
  )
);

create unique index booking_visit_deposits_v1_reference_unique
  on public.booking_visit_deposits(customer_payment_reference)
  where origin = 'visit_v1' and customer_payment_reference is not null;

create table public.booking_change_requests (
  id uuid primary key default gen_random_uuid(),
  source_visit_id uuid not null references public.booking_visits(id),
  proposed_visit_id uuid references public.booking_visits(id),
  human_id uuid not null references public.humans(id),
  revision integer not null default 1 check (revision > 0),
  kind text not null check (kind in ('cancel','reschedule','partial_change','staff_alternative')),
  channel text not null check (channel in ('website','whatsapp','staff')),
  reason_code text not null check (reason_code in (
    'on_time_customer_change','salon_change','accepted_late_customer_request',
    'source_deadline_late','destination_last_minute_staff_review',
    'auto_confirm_disabled_staff_review','staff_alternative','staff_partial_change'
  )),
  status text not null check (status in (
    'pending_staff','waiting_customer','accepted','declined','withdrawn','closed'
  )),
  requested_at timestamptz not null,
  received_at timestamptz not null default now(),
  provider_message_id text,
  customer_message text,
  requested_booking_date date,
  requested_slot_assignments jsonb,
  requested_destination_hash text,
  source_revision bigint,
  review_id uuid,
  decided_at timestamptz,
  decided_by uuid references auth.users(id),
  decision_reason text,
  outcome_key text unique,
  foreign key (source_visit_id, human_id) references public.booking_visits(id, human_id),
  unique (id, human_id, source_visit_id),
  check (
    (kind in ('reschedule','staff_alternative')
      and requested_booking_date is not null and requested_slot_assignments is not null
      and requested_destination_hash is not null and source_revision is not null)
    or
    (kind not in ('reschedule','staff_alternative')
      and requested_booking_date is null and requested_slot_assignments is null
      and requested_destination_hash is null and source_revision is null and review_id is null)
  )
);

create unique index booking_change_requests_one_open_per_visit
  on public.booking_change_requests(source_visit_id)
  where status in ('pending_staff','waiting_customer');

create table public.booking_change_destination_reservations (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  human_id uuid not null references public.humans(id),
  source_visit_id uuid not null,
  proposal_revision integer not null check (proposal_revision > 0),
  purpose text not null check (purpose in (
    'auto_confirm_review','new_booking_alternative','reschedule_counterproposal'
  )),
  booking_date date not null,
  slot_assignments jsonb not null,
  destination_hash text not null,
  state text not null check (state in ('held','consumed','released')),
  created_at timestamptz not null default now(),
  consumed_at timestamptz,
  released_at timestamptz,
  foreign key (request_id, human_id, source_visit_id)
    references public.booking_change_requests(id, human_id, source_visit_id),
  check ((state = 'held') = (consumed_at is null and released_at is null)),
  check ((state = 'consumed') = (consumed_at is not null and released_at is null)),
  check ((state = 'released') = (released_at is not null and consumed_at is null))
);

create unique index booking_change_one_held_destination
  on public.booking_change_destination_reservations(request_id)
  where state = 'held';

create table public.booking_deposit_transfer_reservations (
  id uuid primary key default gen_random_uuid(),
  human_id uuid not null references public.humans(id),
  source_visit_id uuid not null,
  destination_visit_id uuid not null,
  source_satisfaction_event_id uuid not null,
  amount_pence integer not null check (amount_pence = 1000),
  state text not null check (state in ('held','applied','released')),
  fallback_source_disposition text not null check (fallback_source_disposition in ('retain','refund','credit')),
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  released_at timestamptz,
  foreign key (source_visit_id, human_id) references public.booking_visits(id, human_id),
  foreign key (destination_visit_id, human_id) references public.booking_visits(id, human_id),
  check ((state = 'held') = (applied_at is null and released_at is null)),
  check ((state = 'applied') = (applied_at is not null and released_at is null)),
  check ((state = 'released') = (released_at is not null and applied_at is null))
);

create unique index booking_deposit_transfer_one_active_source
  on public.booking_deposit_transfer_reservations(source_visit_id)
  where state = 'held';

create unique index booking_deposit_transfer_one_use_per_satisfaction
  on public.booking_deposit_transfer_reservations(source_satisfaction_event_id);

create unique index booking_deposit_transfer_one_source_per_destination
  on public.booking_deposit_transfer_reservations(destination_visit_id);

create table public.booking_customer_contact_events (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.booking_visits(id),
  channel text not null check (channel in ('website','whatsapp','phone','email','in_person')),
  contacted_at timestamptz not null,
  provider_message_id text,
  recorded_by uuid references auth.users(id),
  recorded_at timestamptz not null default now(),
  idempotency_key text not null unique,
  check (channel <> 'whatsapp' or provider_message_id is not null)
);

create table public.booking_financial_ledger (
  id uuid primary key default gen_random_uuid(),
  human_id uuid not null references public.humans(id),
  visit_id uuid references public.booking_visits(id),
  related_visit_id uuid references public.booking_visits(id),
  event_kind text not null check (event_kind in (
    'deposit_received','deposit_transferred','deposit_retained','service_prepayment_transferred',
    'refund_due','refund_paid','refund_cancelled','credit_issued','credit_reserved',
    'credit_released','credit_applied'
  )),
  amount_pence integer not null check (amount_pence > 0),
  reason text not null,
  idempotency_key text not null unique,
  due_at timestamptz,
  settles_event_id uuid references public.booking_financial_ledger(id),
  actual_paid_at timestamptz,
  bank_reference text,
  refund_origin text check (refund_origin in ('deposit','account_credit','service_prepayment')),
  refund_deadline_basis text check (refund_deadline_basis in ('deposit_working_days','staff_explicit')),
  refund_calendar_source text,
  refund_calendar_coverage_id uuid,
  recorded_by uuid references auth.users(id),
  recorded_at timestamptz not null default now(),
  check (
    (event_kind = 'refund_due') =
    (due_at is not null and refund_origin is not null and refund_deadline_basis is not null)
  ),
  check (
    event_kind <> 'refund_due'
    or (
      refund_deadline_basis = 'deposit_working_days'
      and refund_origin in ('deposit','account_credit')
      and refund_calendar_source is not null
      and refund_calendar_coverage_id is not null
    )
    or (
      refund_deadline_basis = 'staff_explicit'
      and refund_origin = 'service_prepayment'
      and refund_calendar_source is null
      and refund_calendar_coverage_id is null
    )
  ),
  check (
    (event_kind in ('refund_paid','refund_cancelled')) = (settles_event_id is not null)
  ),
  check ((event_kind = 'refund_paid') =
    (actual_paid_at is not null and nullif(trim(bank_reference),'') is not null)),
  check (event_kind = 'refund_due' or refund_calendar_source is null),
  check (event_kind = 'refund_due' or refund_calendar_coverage_id is null),
  check (event_kind = 'refund_due' or refund_origin is null),
  check (event_kind = 'refund_due' or refund_deadline_basis is null),
  check (event_kind = 'refund_paid' or (actual_paid_at is null and bank_reference is null)),
  foreign key (visit_id, human_id) references public.booking_visits(id, human_id),
  foreign key (related_visit_id, human_id) references public.booking_visits(id, human_id)
);

create unique index booking_financial_ledger_one_refund_settlement
  on public.booking_financial_ledger(settles_event_id)
  where event_kind in ('refund_paid','refund_cancelled');

alter table public.booking_visit_deposits
  add foreign key (satisfaction_event_id) references public.booking_financial_ledger(id),
  add foreign key (disposition_event_id) references public.booking_financial_ledger(id);

alter table public.booking_deposit_transfer_reservations
  add foreign key (source_satisfaction_event_id)
    references public.booking_financial_ledger(id);

create table public.customer_credit_reservations (
  id uuid primary key default gen_random_uuid(),
  human_id uuid not null references public.humans(id),
  visit_id uuid not null unique references public.booking_visits(id),
  amount_pence integer not null check (amount_pence > 0),
  state text not null check (state in ('reserved','released','applied')),
  reserve_event_id uuid not null unique references public.booking_financial_ledger(id),
  terminal_event_id uuid unique references public.booking_financial_ledger(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (visit_id, human_id) references public.booking_visits(id, human_id),
  check ((state = 'reserved') = (terminal_event_id is null))
);

create schema if not exists smarter_dog_private;
create table smarter_dog_private.booking_command_receipts (
  actor_scope text not null,
  idempotency_key uuid not null,
  request_hash text not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (actor_scope, idempotency_key)
);
```

`booking_change_requests` records on-time applied changes, late pending changes and staff alternatives. Its revision increments on every staff/customer-visible state transition and is the optimistic token required by decision wrappers. A reschedule/alternative stores executable destination data in immutable structured columns: requested date, canonical assignments and hash, source revision, review evidence and reason code. Every other kind must leave the entire destination tuple null—partial destination fragments are invalid. Free-text `customer_message` is display/audit context only. A constraint trigger verifies that the source/proposed visit, customer, review evidence and destination snapshot have one owner, that the canonical hash matches, and that reason code agrees with kind/status/channel (`on_time_customer_change`, `source_deadline_late`, `destination_last_minute_staff_review`, `auto_confirm_disabled_staff_review`, `staff_alternative`, `staff_partial_change`, `accepted_late_customer_request` or `salon_change`). Application roles cannot update the destination after insert. Direct-insert tests reject partial tuples and every invalid reason/kind/status/channel pairing. A late pending request never mutates the source visit. Only one unresolved request of any kind may exist for a source visit; concurrent cancel-versus-reschedule/alternative inserts lock the visit, then replay the compatible request or return the existing request for staff rather than creating conflicting decisions.

`booking_change_destination_reservations` holds proposed capacity without creating an unsafe second active visit. Its typed purpose is `auto_confirm_review`, `new_booking_alternative` or `reschedule_counterproposal`. Each proposal is a new immutable reservation ID/revision/hash; replacing a proposal releases the old row and inserts the next revision, while a partial unique index permits only one held destination per request. Customer acceptance supplies the exact displayed reservation ID/revision/hash, not only a mutable request ID. Capacity queries count every `held` row. For an unconfirmed new-booking alternative, the obsolete visit remains an auditable `active+unconfirmed+alternative_pending` record but its own old slot is excluded from capacity **only while** the matching `new_booking_alternative` reservation is held; the reservation is then the sole capacity hold. For an auto-confirm-disabled reschedule or confirmed-source counterproposal, the confirmed source remains booked and the reservation is an additional capacity hold, but still not another visit. Decline/customer or staff withdrawal releases one; acceptance consumes it in the same transaction that creates the permitted destination visit. A next-day-after-15:00 destination review has no reservation row and promises no capacity until staff accept or propose a held alternative. Constraint and concurrency tests prove purpose/context compatibility, old-slot exclusion, snapshot equality, stale proposal rejection, no `proposed_visit_id` before acceptance, no reservation outliving a closed request and exactly-once release/consume across proposal/withdraw races.

`booking_deposit_transfer_reservations` is the durable pending-money half of a staff-approved late carry-forward. It binds the same-human source £10 satisfaction event to one unconfirmed replacement and prevents retention/refund/credit/application while held. The immutable satisfaction event is globally single-use across **all** reservation states, and a destination visit can have at most one transfer source across all states; a released or applied row can therefore never be bypassed by inserting another held row. A constraint trigger also proves that the destination is the source's direct same-lineage successor, names the source as predecessor, is still unconfirmed when held, and that the linked ledger event is the source visit's current £10 satisfaction evidence for the same human. Allowed combinations are explicit: `replacementDepositMode='carry_forward'` requires `sourceDepositMoney.kind='transfer_to_replacement'`; `new_required|waive` forbid transfer; and `retain+carry` is impossible. Customer acceptance of the current Terms applies the transfer and confirms atomically. Withdrawal, waiver, decline or correction releases the reservation and settles the stored audited fallback source disposition; no path can double-use the £10. Test Terms acceptance versus withdrawal/staff correction races, two source deposits racing for one destination, two reservations racing to reuse one source satisfaction event, reuse after `released`/`applied`, invalid predecessor/lineage, and direct malformed cross-human/event/amount rows.

`booking_late_deposit_satisfaction_requests` is the durable staff-review bridge when an overdue website Terms action tries to use reserved account credit or a carry-forward transfer. It stores one visit, due-time snapshot, source kind `reserved_credit|reserved_transfer`, the exact reservation ID, customer Terms acceptance/publication, request time and state `pending|accepted|declined`; constraints prove same human/visit/amount and one open request. It never applies money or confirms. Staff acceptance consumes the named reservation through the late-deposit command; decline releases credit back to the account or releases the transfer to its audited fallback without inventing bank evidence. Add exact-due/next-microsecond, credit/transfer double-use and withdraw-versus-staff-decision races.

`booking_customer_contact_events` is the trusted evidence for the automatic same-day/last-minute incident waiver: website uses the committed server time, WhatsApp uses the signature-verified provider time, and a staff-recorded phone/email/in-person contact records staff actor plus claimed contact time. Reject future times and require the event to match the visit and precede its start before granting the exemption. Add `smarter_dog_private.booking_command_receipts` with `(actor_scope, idempotency_key)` uniqueness, request hash and immutable JSON response so an identical retry replays and a key reused with different input fails. Ledger/audit tables enable RLS, deny all customer reads and all direct application-role inserts/updates/deletes, and allow staff detail reads only through `is_staff()`-gated projections. All writes go through later staff/customer commands under deterministic row/advisory locks. The customer credit balance is a `security_invoker` staff view over immutable financial events minus active reservations; a separate owned customer RPC returns only that customer's available/reserved totals. No expiry column exists.

`booking_visit_deposits.received` means the £10 obligation is satisfied, not necessarily that cash arrived. Its source-specific evidence is mandatory: `bank` links a same-visit £10 `deposit_received` event and carries the customer bank receipt time plus staff actor; `credit` links a same-visit £10 `credit_applied` event, carries no fake bank timestamp and requires accepted deposit Terms; `transfer` links the replacement's £10 `deposit_transferred` event to the same-human source visit and ultimately to its original bank/credit/legacy satisfaction, carrying no second bank receipt; `legacy_import` links the audited opening event and preserves any trustworthy legacy timestamp. `received_liability` never confirms: it requires bank satisfaction evidence and, once resolved, a same-human £10 disposition event of `refund_due`, explicit `credit_issued` or eligible `deposit_transferred`; before customer choice its disposition is null and the mandatory reconciliation below stays open. Add a constraint trigger that validates event kind, visit/human, related source and amount for both links, and requires every v1 deposit publication ID to equal the immutable publication ID on its visit. Test both credit-satisfaction paths (immediate auto-confirm and reserved credit applied at later approval), on-time reschedule transfer, audited staff late carry-forward with no fake receipt, publication mismatch/settings drift, plus late-decline/found-after-release liability states that cannot confirm.

`booking_deposit_money_reconciliations` makes the no-choice liability state structurally valid and visible. `received_liability` always requires real bank satisfaction evidence, but `disposition_event_id` is nullable while exactly one same-human/visit/amount reconciliation is `open`. A deferred cross-table constraint requires either `(null disposition + open reconciliation)` or `(valid refund_due|credit_issued|deposit_transferred disposition + matching resolved reconciliation)`, never neither/both. Resolving the customer's later choice sets the disposition and closes the task in one transaction. Direct application inserts are denied. Add malformed liability-without-task, disposition-with-open-task, wrong-human/amount/event, rollback and no-choice→choice concurrency tests.

`booking_visit_bill_summary` is the server-owned financial read model for the signed part-payment rule. It groups included child service/add-on price bases by visit and joins the visit deposit exactly once. It exposes a monotonic `bill_revision` derived from immutable visit service-payment events. `deposit_part_payment_pence` is `1000` only when the current visit owns a valid `received` bank/credit/legacy satisfaction or a valid transfer-in and that money has not been refunded, credited, retained or transferred away; `not_required`, unresolved and `received_liability` contribute zero. `gross_service_total_pence`, reconciled non-deposit payment evidence and `amount_due_pence` remain separate, with `amount_due_pence = greatest(gross_service_total_pence - non_deposit_paid_pence - deposit_part_payment_pence, 0)`. The projection never sums child `deposit_amount` and never treats a duplicated legacy flag as multiple money. On-time transfer removes the source's credit and adds exactly one credit to the replacement; a partial multi-dog change that proceeds leaves it on the surviving visit. Add single- and multi-dog bank/credit/transfer fixtures, disposition-away fixtures and direct legacy duplicate-field fixtures proving the final bill is reduced by £10 exactly once.

`booking_visit_service_payments` is append-only, command-written evidence for the non-deposit balance: visit/human, monotonic `bill_revision`, amount pence, payment method, actual paid time, optional reference, actor, reason and idempotency key. It never overloads the deposit ledger or duplicates an amount per dog. A deferred constraint prevents total service payments exceeding the locked recomputed amount due; exceptional overpayment opens reconciliation instead of being silently clipped. The active compatibility mirror may update legacy child payment fields in the same command context for old readers, but the immutable visit event remains authoritative and multi-dog rows cannot each claim the whole payment.

`refund_due_at(p_from)` adds five UK working days in `Europe/London`, skipping Saturdays, Sundays and dates in `booking_refund_non_working_days`; the latter is a locked, audited England-and-Wales bank-holiday calendar, independent of salon opening days. `booking_refund_calendar_coverage` stores the authoritative source/version, verified range, actor and time, so a missing row is never silently interpreted as an ordinary weekday. Seed and test coverage through at least the activation horizon plus five working days, add that coverage to readiness, monitor the remaining range and document annual maintenance. Test the last fully covered start date and first uncovered date. If a cancellation/refund request falls outside coverage, do not block the customer's cancellation: create a deduplicated urgent staff alert and use a clearly marked conservative Monday-Friday-only deadline, which is never later than the true holiday-adjusted promise; readiness/monitoring must treat that fallback as a defect to resolve. Store the calendar version/completeness with the `refund_due` event.

A `refund_due` ledger event stores `refund_origin`, `due_at` and a typed deadline basis. Deposit/account-credit obligations use `deposit_working_days` and require the calendar source plus exact coverage-row ID; a service-prepayment obligation uses `staff_explicit`, requires the staff-entered promised due instant and forbids both calendar fields. Add the coverage foreign key after the coverage table is created. Exactly one terminal `refund_paid|refund_cancelled` may link to it through `settles_event_id`. `refund_paid` stores actual paid time plus nonblank bank reference; `refund_cancelled` is allowed only for an unsettled customer account-credit refund request, requires an audited reason and cannot cancel a contractual deposit refund. The settlement command must lock the obligation and require identical human, visit and amount before insert. All supplied financial occurrence times must be no later than server receipt time and plausible for the referenced visit/obligation; a payment claimed before its booking/request needs a separate staff-only exceptional command/reason/audit rather than passing ordinary validation. Test both deadline bases, every invalid origin/basis/calendar combination, future/implausibly backdated evidence, mismatched references and concurrent paid/cancelled settlements.

Credit arithmetic has one equation and uses no `credit_refunded` pseudo-event. Permanent gross credit is `credit_issued - credit_applied - refund_paid where the settled obligation has refund_origin='account_credit'`. `credit_reserved`/`credit_released` are audit events and never enter that gross equation. Each mutable `customer_credit_reservations` row is only the lockable operational projection: it links exactly one matching `credit_reserved` event and, when terminal, exactly one same-human/visit/amount `credit_applied|credit_released` event. Available credit is permanent gross minus `state='reserved'` rows minus unresolved account-credit `refund_due` obligations; it never subtracts the audit event and projection twice. When a refund is paid, the permanent debit replaces the now-settled temporary refund reservation, so the balance falls exactly once; `refund_cancelled` simply removes that temporary reservation. Constraint triggers prevent event/table drift and over-reservation. Add reserve→apply/release, request→paid/cancel, malformed event links, double-settle and concurrent deposit-allocation-versus-refund-request balance fixtures.

`booking_service_prepayment_reconciliations` preserves non-deposit `payment/payment_method/paid_at/paid_amount` evidence when a staff cancellation cannot safely infer its commercial disposition. It stores exact amount/evidence, state `open|refund_due|transferred|closed`, target/obligation links, actor/reason and immutable audit; the all-open staff queue includes it. Staff cancellation with service prepayment must choose one explicit handling: `reconciliation_required` (safe default, preserves evidence and opens the task), `transfer` to an eligible same-human visit with a `service_prepayment_transferred` event, or `refund_due` with an explicit customer-facing promised due instant and linked `refund_due(refund_origin='service_prepayment')`. Because no automatic service-prepayment refund policy was signed, the server must not invent the deposit's five-working-day deadline for this money. Nothing clears/zeros the legacy evidence; resolution links to it. Add full/part-paid cancellation, cross-human target, amount mismatch and double-resolution fixtures.

- [ ] **Step 2a: Reconcile legacy deposit flags and money before cutover**

Convert every `humans.deposit_required=true` into one current audited `customer_booking_rule_overrides` row with mode `required`, reason `Legacy deposit requirement migrated`, and a deterministic idempotency key. Do not clear the legacy boolean yet.

For each backfilled `legacy_compat` visit, reconcile every current money field together: `deposit_required`, `deposit_amount`, `deposit_reference`, `deposit_due_by`, `deposit_received_at`, `payment`, `payment_method`, `paid_at` and `paid_amount`. A consistent non-required visit becomes `not_required`. A consistent unpaid £10 requirement becomes `awaiting_payment` with the preserved reference/due time. Create one £10 opening `deposit_received` event only when the rows and payment audit prove exactly one visit-level £10 deposit was received; duplicated dog rows are evidence of the same payment only when their reference/time/method/amount agree. Do not sum duplicates, infer £10 from `Paid in Full`, or treat a full/partial service settlement as a deposit event. Preserve repeated historical references because the deployed format can legitimately repeat for one customer/date; flag them for staff disambiguation and enforce uniqueness only on newly generated `visit_v1` references through the partial index. Non-£10 amounts, conflicting references/receipt times within one visit, `Paid in Full` without a separable deposit audit, partial/mismatched `paid_amount`, or any disagreement becomes `reconciliation_required` and remains in `booking_visit_backfill_review`; activation is blocked until staff preserve the real liability through the named command below. Even a structurally valid unresolved `legacy_import` hold in `awaiting_terms|awaiting_payment|received_liability|reconciliation_required` is an activation blocker: it must be manually resolved while legacy runtime is still authoritative, because it has no accepted immutable v1 Terms publication and may not confirm after cutover. Add a duplicate-legacy-reference fixture and a pre-midnight unresolved-hold/post-midnight payment fixture proving migration succeeds without weakening v1 uniqueness or bypassing Terms.

```sql
preview_legacy_visit_opening_money(
  p_visit_id uuid,
  p_classification text,
  p_evidence jsonb
)
record_legacy_visit_opening_money(
  p_visit_id uuid,
  p_expected_hash text,
  p_classification text,
  p_evidence jsonb,
  p_reason text,
  p_idempotency_key uuid
)
```

Both commands are staff-only and take the visit/ledger locks. Preview is read-only and returns the complete source-field evidence, proposed one-per-visit deposit/ledger result, blockers and deterministic hash. Record rejects a stale hash, empty reason or incomplete evidence; writes immutable actor, evidence, before/after and idempotency audit; and permits only `no_deposit`, `awaiting_10_deposit`, `received_10_deposit`, `service_prepayment` or `received_liability`. It preserves the actual source timestamps/references when evidenced and otherwise stores them as unknown—never fabricating a receipt time, treating `Paid in Full` as a deposit, summing duplicated dog flags or converting service prepayment into deposit money. `service_prepayment` opens the typed service-prepayment reconciliation; `received_liability` opens the deposit-money reconciliation without confirming the visit. A review item closes only after its recorded state and audit satisfy the view's current evidence hash.

Extend the reconciliation runbook with exact preview/record examples, role and project/ref checks, evidence requirements and a zero-open-review activation query. PgTAP covers every classification, staff/non-staff grants, dry preview, stale hash, retry, concurrent decisions, rollback, immutable audit and ambiguous evidence remaining open. Structural commands from Task 1 cannot call these money functions; money commands cannot regroup child bookings.

Replace the latest `stamp_booking_deposit`, deposit payment-mirror trigger and `deposit-auto-release` job body in this migration without editing history. The compatibility implementation branches on the associated visit's `runtime_generation` and the server runtime: while inactive/scheduled it preserves the characterised legacy behaviour only for `legacy_compat` visits and mirrors settled legacy state into the one-per-visit record; it never stamps or releases `visit_v1`; at/after activation it performs no legacy mutation. Schedule the existing job name to call the guarded function, so a delayed activation finaliser is harmless. Test the insert-trigger order explicitly: `ensure_legacy_booking_visit` must assign `visit_id` before deposit stamping. Add pgTAP for pre-activation legacy parity, v1 exclusion, active no-op, one opening event per multi-dog visit, payment mirror idempotency and every conflict class remaining blocked for review.

- [ ] **Step 3: Implement the deposit-requirement resolver**

The resolver order is fixed:

1. Use the server-recorded commercial-eligibility instant and `eligibility_policy_code`: request creation when auto-confirm applies, staff approval when approval is required, or customer acceptance of a staff proposal. Snapshot the policy active at that eligibility instant; never use the later manual deposit-verification time and never rewrite the snapshot at activation.
2. Return `false/same_day_or_last_minute` when that eligibility instant is after the visit deadline.
3. Return `false/insufficient_window` when `eligibility instant + depositHoldHours > appointment start`.
4. Apply a current audited staff `waived` or `required` override.
5. Partition ordered unwaived incidents into contiguous episodes: a gap of 12 calendar months or more closes the prior episode at the exact anniversary, and later incidents count afresh. Within the current episode, detect whether any third incident completed a three-incidents-within-12-month inclusive window. Once triggered, return `true/three_incidents_12m` until 12 months after the most recent incident in that same episode; each further incident less than 12 months later extends it. Never let a lone incident after an already-cleared 12-month gap resurrect an old threshold (it still follows the next-booking rule below).
6. Compare the latest unwaived incident appointment date with the latest successfully completed different visit whose appointment date is later; an uncleared single incident returns `true/next_booking_after_incident`. Creation time or retrospective data entry alone cannot clear it.
7. Otherwise return `false/not_required`.

It returns staff-only `required`, precise `reason_code`, `incident_count_12m`, `amount_pence`, `hold_hours` and `due_at`, plus a separate customer-safe reason category. Incident-driven requirements map only to `recent_booking_history`; an explicit staff override maps to `staff_applied_requirement`. Customer projections never receive counts, incident kinds, dates, notes or the internal code. A required result is invalid when bank details or `current_terms_publication_id` are incomplete; the caller must create a staff alert and refuse to start a deposit deadline. A syntactically valid generic Terms URL without a recorded version/content hash is not sufficient.

- [ ] **Step 4: Derive overdue attention without a new cron**

Expose `deposit_check_due` as `state in ('awaiting_terms','awaiting_payment') and due_at <= statement_timestamp()` in the staff projection added by the portal/staff plan. Add exact-boundary pgTAP proof for both unresolved states and prove that advancing the test clock changes the projection while leaving the deposit, visit and child booking rows byte-for-byte unchanged. Do not add a replacement timer job. The guarded legacy `deposit-auto-release` remains behaviourally unchanged for `legacy_compat` until the effective instant and is removed by the later activation finaliser.

- [ ] **Step 5: Run migration, static and pgTAP suites**

Run:

```bash
npm run test:logic -- src/security/bookingPolicyLedgerMigration.test.ts
npm run check:migrations
npm run test:db
```

Expected: PASS, including proof that overdue deposits retain visit capacity.

- [ ] **Step 6: Commit ledgers**

```bash
git add supabase/migrations/20260722140000_visit_deposits_incidents_credits.sql supabase/tests/150_visit_deposits_incidents_credits.test.sql src/security/bookingPolicyLedgerMigration.test.ts docs/superpowers/runbooks/2026-07-22-booking-policy-backfill-reconciliation.md
git commit -m "feat(db): add booking policy ledgers"
```

---

### Task 4: Add atomic customer visit commands

**Files:**
- Create: `supabase/migrations/20260722150000_customer_visit_commands.sql`
- Create: `supabase/tests/155_customer_visit_commands.test.sql`
- Modify: `src/supabase/rpc.ts`
- Modify: `src/supabase/repositories/bookingsRepo.ts`
- Test: `src/supabase/repositories/bookingsRepo.test.ts`

**Interfaces:**
- Produces the preview, create, deposit-Terms, proposal-acceptance, credit-refund, withdrawal, reviewed cancellation and reviewed reschedule functions in the exact public-signature block below. It also produces revoked private `smarter_dog_private.booking_change_reviews`, `record_late_booking_change_core(...)` and `confirm_booking_visit_core(...)`; there is no independently callable public late-request RPC.
- Every visit command returns one `CustomerVisitReceipt` with visit IDs, row IDs, state, deadline, deposit result and any committed notification outcome key. Account-credit refund commands use the separate receipt below.

Use these exact public signatures:

```sql
preview_customer_booking_visit(
  p_booking_date date,
  p_bookings jsonb,
  p_rebook_from_visit_id uuid default null
)
preview_customer_reschedule_visit(
  p_visit_id uuid,
  p_booking_date date,
  p_slot_assignments jsonb
)
preview_customer_cancel_visit(p_visit_id uuid)
create_customer_booking_visit(
  p_booking_date date,
  p_bookings jsonb,
  p_idempotency_key uuid,
  p_rebook_from_visit_id uuid default null,
  p_accept_deposit_terms boolean default false,
  p_deposit_terms_publication_id uuid default null,
  p_credit_allocation_pence integer default 0
)
accept_customer_booking_deposit_terms(
  p_visit_id uuid,
  p_deposit_terms_publication_id uuid,
  p_credit_allocation_pence integer,
  p_idempotency_key uuid
)
accept_customer_booking_visit_proposal(
  p_visit_id uuid,
  p_proposal_id uuid,
  p_proposal_revision integer,
  p_destination_hash text,
  p_idempotency_key uuid,
  p_accept_deposit_terms boolean default false,
  p_deposit_terms_publication_id uuid default null,
  p_credit_allocation_pence integer default 0
)
accept_customer_booking_change_proposal(
  p_request_id uuid,
  p_proposal_id uuid,
  p_proposal_revision integer,
  p_destination_hash text,
  p_idempotency_key uuid,
  p_accept_deposit_terms boolean default false,
  p_deposit_terms_publication_id uuid default null,
  p_credit_allocation_pence integer default 0
)
request_customer_credit_refund(p_amount_pence integer, p_idempotency_key uuid)
cancel_customer_credit_refund(p_refund_due_id uuid, p_idempotency_key uuid)
withdraw_customer_booking_visit(p_visit_id uuid, p_idempotency_key uuid, p_reason text default null)
withdraw_customer_booking_change_request(p_request_id uuid, p_idempotency_key uuid)
cancel_customer_booking_visit(p_visit_id uuid, p_review_id uuid, p_idempotency_key uuid, p_reason text default null, p_paid_deposit_outcome text default 'refund')
reschedule_customer_booking_visit(p_visit_id uuid, p_booking_date date, p_slot_assignments jsonb, p_review_id uuid, p_idempotency_key uuid, p_reason text default null)
-- private/revoked: smarter_dog_private.record_late_booking_change_core(...)
```

- [ ] **Step 1: Define the typed receipt and failing repository tests**

```ts
export type CustomerVisitReceipt =
  | CustomerVisitSuccessReceipt
  | CustomerChangePendingReceipt
  | CustomerVisitBlockedReceipt;

export type CustomerVisitMoneyOutcome =
  | { kind: "none" | "unchanged"; amount_pence: null; refund_due_at: null }
  | { kind: "refund_due"; amount_pence: number; refund_due_at: string }
  | { kind: "credit_issued" | "credit_reserved" | "credit_released" | "credit_applied" | "deposit_transferred" | "deposit_retained"; amount_pence: number; refund_due_at: null };

export interface CustomerVisitSuccessReceipt {
  outcome: "confirmed" | "waiting_staff" | "awaiting_terms" | "awaiting_payment" | "late_deposit_review" | "withdrawn" | "cancelled" | "rescheduled";
  block_reason: null;
  visit_id: string;
  replacement_visit_id: string | null;
  lineage_id: string;
  booking_ids: string[];
  lifecycle_state: "active" | "superseded" | "cancelled" | "withdrawn" | "declined" | "completed";
  approval_state: "not_required" | "waiting_staff" | "approved" | "alternative_pending";
  confirmation_state: "unconfirmed" | "confirmed";
  policy_code: "legacy_24h" | "previous_day_1500_v1" | null;
  deadline_at: string | null;
  is_last_minute: boolean;
  booking_timing: "ordinary" | "same_day" | "last_minute" | "insufficient_window";
  customer_deposit_reason: "not_required" | "recent_booking_history" | "staff_applied_requirement" | "staff_waiver" | "same_day_or_last_minute" | "insufficient_window";
  deposit_state: string;
  deposit_amount_pence: number;
  deposit_due_at: string | null;
  deposit_payment_instructions: {
    account_name: string;
    sort_code: string;
    account_number: string;
    customer_reference: string;
  } | null;
  money_outcome: CustomerVisitMoneyOutcome;
  outcome_key: string;
}

export interface CustomerVisitBlockedReceipt {
  outcome: "blocked";
  block_reason: string;
  visit_id: string | null;
  replacement_visit_id: null;
  lineage_id: null;
  booking_ids: [];
  lifecycle_state: null;
  approval_state: null;
  confirmation_state: null;
  policy_code: null;
  deadline_at: string | null;
  is_last_minute: null;
  booking_timing: null;
  customer_deposit_reason: null;
  deposit_state: null;
  deposit_amount_pence: null;
  deposit_due_at: null;
  deposit_payment_instructions: null;
  money_outcome: null;
  outcome_key: null;
  staff_alert_key: string | null;
}

export interface CustomerChangePendingReceipt {
  outcome: "change_waiting_staff" | "change_request_withdrawn";
  block_reason: null;
  visit_id: string; // confirmed source remains active
  replacement_visit_id: null;
  lineage_id: string;
  booking_ids: string[];
  lifecycle_state: "active";
  approval_state: "not_required" | "approved";
  confirmation_state: "confirmed";
  policy_code: "legacy_24h" | "previous_day_1500_v1";
  deadline_at: string;
  is_last_minute: boolean;
  booking_timing: "ordinary" | "same_day" | "last_minute" | "insufficient_window";
  customer_deposit_reason: "not_required" | "recent_booking_history" | "staff_applied_requirement" | "staff_waiver" | "same_day_or_last_minute" | "insufficient_window";
  deposit_state: string;
  deposit_amount_pence: number;
  deposit_due_at: string | null;
  deposit_payment_instructions: null;
  request_id: string;
  request_status: "pending_staff" | "withdrawn";
  staff_review_reason: "auto_confirm_disabled_staff_review" | "destination_last_minute_staff_review";
  desired_destination: {
    booking_date: string;
    slots: string[];
    capacity_held: boolean;
    destination_hash: string;
    proposal_id: string | null;
    proposal_revision: number | null;
  };
  money_outcome: CustomerVisitMoneyOutcome;
  outcome_key: string;
}

export type CustomerCreditRefundReceipt =
  | {
      outcome: "refund_requested";
      obligation_id: string;
      amount_pence: number;
      refund_due_at: string;
      outcome_key: string;
    }
  | {
      outcome: "refund_request_cancelled";
      obligation_id: string;
      amount_pence: number;
      refund_due_at: null;
      outcome_key: string;
    };
```

Tests must reject malformed/multiple receipts and success fields on a blocked result, decode `awaiting_terms` separately from `awaiting_payment`, and decode `change_waiting_staff` as a confirmed active source plus a structured request/destination snapshot—not an unconfirmed replacement. The receipt distinguishes a held `auto_confirm_disabled_staff_review` destination from an unheld `destination_last_minute_staff_review` destination. `change_request_withdrawn` must still identify the unchanged confirmed source and cannot be confused with withdrawing that visit. The client renders same-day/last-minute/insufficient-window copy only from `booking_timing`, `is_last_minute` and the customer-safe deposit reason; it never infers them from dates. Cancellation receipts must carry refund-versus-credit plus the immutable five-working-day due time, reschedules must carry transfer/retention, and waiting approval must distinguish reserved/released/applied credit from received money. Expose payment instructions only to the owning visit while it is payable, never expose `staff_verification_reference`, and prove network failure never reports success. Deposit credit allocation is all-or-nothing: commands accept exactly `0` or `1000` pence and reject `1`, `999`, `1001`, insufficient balance and concurrent double allocation; there is no hidden split bank/credit state. Ordinary blocked results have both keys null and can never be mistaken for notifications; only `policy_setup_incomplete|deposit_setup_incomplete` may carry a non-null `staff_alert_key`, with all commercial IDs/outcome key null. Credit-refund request/cancel decoders verify the owned obligation, due-date presence by outcome and idempotent retry.

Implement one revoked, command-context-only `smarter_dog_private.confirm_booking_visit_core(...)` and route **every** transition from first-unconfirmed to confirmed through it: create, approval, proposal acceptance, deposit Terms plus credit/transfer, bank/late-deposit decision, waiver and any compatibility wrapper. Under the visit/dog/deposit/reservation locks it rechecks lifecycle, current revision, immutable Terms publication, deposit satisfaction/exemption and `visit_start_at`. Before start it permits only the caller's already-authorised commercial branch. At or after start it rejects every customer/service path with `staff_review_required`; the only confirming branch is staff-only `retrospective_attended` with a non-empty reason, one matching immutable attendance evidence ID and service-provided evidence IDs for every included dog. It writes those IDs and actor in audit. A never-attended/absent/unstarted request cannot confirm through any wrapper. Tests cover each command family at the instant before start, exact start, the next instant, and races between customer acceptance, staff waiver/payment and arrival/service evidence.

- [ ] **Step 2: Implement create and withdraw commands**

`create_customer_booking_visit` must:

- derive the human and dog ownership from `auth.uid()`;
- validate 1–4 dogs, exact date, calendar/capacity, configured inclusive booking horizon (default 180 days) and same-day released-slot/30-minute rule;
- after deriving the canonical dog/service pairs, apply recent-cancellation continuity **before** branching on ordinary versus Repeat entry: take a human+canonical-pair advisory lock, find the most recently cancelled eligible visit by `cancelled_at desc, id` whose cancellation is no more than exactly 24 hours before the server commit, has no continuation and whose lineage has no active visit, then reuse that lineage/count, allocate `max(revision)+1` under the lineage lock and write `continues_cancelled_visit_id`; the next microsecond, changed dog/service, already-consumed edge or concurrent competing create starts a new lineage or deterministically re-evaluates rather than colliding;
- when `p_rebook_from_visit_id` is supplied, require `allow_repeat_booking=true`, require an owned eligible past source and copy its dogs/services. A completed/non-cancelled source or a cancellation outside the exact 24-hour continuity window starts a new lineage; an eligible recent cancelled source follows the continuity rule above and cannot reset the move count. Repeat never increments the reschedule count merely for copying a past booking;
- create one lineage/visit and all dog rows in one transaction;
- before inserting any active-runtime v1 visit, require and snapshot the current immutable Terms publication even when the visit is same-day, last-minute, insufficient-window or otherwise deposit-exempt; a missing pointer commits only `blocked/policy_setup_incomplete` plus a deduplicated staff alert and no commercial/capacity rows;
- choose `approval_state='waiting_staff'` when `autoConfirm=false` or a next-day request is made after the 15:00 deadline;
- otherwise snapshot the commercial-eligibility instant, resolve deposit policy, require deposit terms when needed and leave the visit unconfirmed until staff verify payment;

Tests exercise the same recent-cancellation candidate through ordinary new booking, Repeat booking and a competing pair of those entry routes, proving one continuation winner and no route that resets the three-move lineage count.
- return a committed `blocked/deposit_setup_incomplete` receipt and insert a deduplicated `salon_todos` alert in the same successful transaction when a required deposit lacks complete bank details; return the parallel `blocked/policy_setup_incomplete` result when the immutable Terms publication is unavailable for any v1 path. Do not raise after inserting because that would roll the alert back;
- assign policy/deadline only when the visit becomes confirmed;
- key idempotency to authenticated user plus a client request UUID.

`preview_customer_booking_visit` applies the same ownership, horizon, calendar and deposit decision logic to support the final review screen, but reserves nothing and returns no incident count/detail. A deposit preview carries the immutable current Terms publication ID, public URL and version but never its internal content hash. The authoritative create repeats all checks under locks and treats a changed publication as `stale_review`. When auto-confirm applies and a deposit is required, create refuses to insert unless the customer accepted that exact current publication ID; it snapshots the ID on the visit/deposit and then creates `awaiting_payment` with the eligibility-time due date.

Do not rely on the repeat-booking UI to enforce its switch. PgTAP must prove a direct RPC call with `p_rebook_from_visit_id` fails when Repeat booking is disabled or the source is another customer's/ineligible visit. Also prove that a permitted repeat creates a new lineage, while the separate automatic same-dogs/services rebooking detector finds an owned cancellation within 24 hours and preserves that cancelled visit's lineage and move count.

When staff approval is required, the preview may identify an incident/override-based prospective deposit. The customer may pre-accept the current Terms publication and explicitly allocate the full 1000p from existing credit during request creation; create records that candidate publication acceptance and reserves, but does not consume, that credit while approval is pending. Withdrawal or decline releases it automatically. At approval, first snapshot the then-current publication at the real eligibility instant and rerun the complete deposit resolver. If the result is required, a candidate acceptance satisfies it only when the publication IDs are identical: a mismatch preserves the audit/reservation but enters `awaiting_terms` for the new snapshot; a match applies the full reserved credit or creates `awaiting_payment`. If the resolver is no longer required for **any** reason—including timing exemption, a later completed visit clearing recent history or a changed staff override—release every unconsumed credit/transfer reservation and confirm with the exact audited no-deposit reason. If no Terms were pre-accepted and the result remains required, approval creates `awaiting_terms` and starts the hold window at the approval instant. `accept_customer_booking_deposit_terms` verifies visit ownership and the exact snapshotted publication ID without moving `due_at`, then changes to `awaiting_payment`; a later Settings publication cannot replace it. If the customer explicitly allocates exactly 1000p of available credit, it applies the credit and confirms in the same transaction. Every allocation parameter is constrained to `0|1000`; expiry of either unresolved state never releases capacity automatically. Tests change publication, complete a later clearing visit and change an override while staff approval is pending, proving stale acceptance cannot satisfy a new snapshot and every no-longer-required branch releases money exactly once.

Terms acceptance may be recorded after `due_at`, but no website action may satisfy money or first-confirm late. `accept_customer_booking_deposit_terms`, both proposal acceptors and carry-forward application lock/recheck `statement_timestamp() <= due_at` **and** `statement_timestamp() < visit_start_at` immediately before applying reserved credit/transfer and calling the confirmation core. Exact due is eligible; the next microsecond is not. After due but before start, an attempted 1000p credit allocation is reserved once and a carry-forward remains held; the command creates/replays `booking_late_deposit_satisfaction_requests`, returns `late_deposit_review`, and leaves the visit unconfirmed for staff. At/after start it also routes staff-only and cannot confirm without the retrospective core. No path fabricates a bank receipt. Tests cover exact due/next microsecond/exact start for immediate credit, pre-reserved credit, carry-forward transfer, customer proposal acceptance and concurrent staff decision/withdrawal.

`withdraw_customer_booking_visit` must allow only the owner of an unconfirmed visit. Before start with no arrival/service evidence, it terminalises the commercial request, marks only unbegun included child rows `Cancelled` with `Customer withdrew unconfirmed request`, releases genuinely held future capacity and restores reserved credit. If start/arrival/service/completion evidence already exists, withdrawal still closes the unconfirmed commercial request but preserves every begun/completed child grooming status and operational audit, releases no already-consumed capacity and creates an urgent manual reconciliation item; it can never erase evidence to make the visit look unused. A purely reserved, never-applied account-credit allocation is fully known: release it atomically and close with no money reconciliation. Likewise, `awaiting_terms` before payment instructions were exposed needs none. A visit that entered `awaiting_payment`, exposed bank instructions or has actual applied/received money creates mandatory reconciliation until staff record no payment, refund, transfer or credit; do not make this conditional on the customer's claim. It never creates an incident. Test withdrawal racing arrival, service start, completion and retrospective approval.

`withdraw_customer_booking_change_request` is a separate owned, idempotent command. It may close only that customer's still-pending reschedule request, releases its destination reservation when one exists, leaves the confirmed source visit and its money/lineage/count byte-for-byte unchanged, and creates no incident. It remains available after either source or destination deadline. A concurrent staff accept versus customer withdrawal has exactly one winner under the same request/source/capacity locks.

`accept_customer_booking_visit_proposal` derives ownership, requires the exact displayed immutable proposal ID/revision/destination hash for the current `alternative_pending` reservation, locks/revalidates its capacity/commercial details, and records customer acceptance idempotently. A later staff reproposal returns `stale_review` rather than accepting unseen details. Acceptance consumes no self-service reschedule. It snapshots commercial eligibility at that instant: an exempt proposal confirms; a deposit-required proposal applies explicitly allocated reserved credit or enters the same website Terms/`awaiting_terms|awaiting_payment` flow without extending the hold. Staff have no wrapper that accepts a proposal on the customer's behalf.

`accept_customer_booking_change_proposal` is deliberately separate. It derives ownership of the pending change and its still-active confirmed source, verifies the exact displayed proposal ID/revision/hash and then atomically creates the replacement, supersedes the source and consumes the reservation. It never releases the source before that commit, consumes no customer reschedule allowance and cannot accept an expired, replaced, withdrawn or capacity-mismatched proposal. Its website Terms/credit branches use the same rules as other staff proposals. Staff have no wrapper that accepts it for the customer.

`request_customer_credit_refund` derives the human from `auth.uid()`, locks that credit account, rejects more than the available unreserved balance, reserves the requested amount against reuse and writes one `refund_due` event with the snapshotted five-working-day `due_at`. It moves no money automatically. An idempotent retry returns the same request; staff later record the matching `refund_paid` settlement or resolve an exception. The owned balance projection continues to show available, reserved and pending-refund amounts without exposing ledger/staff detail.

`cancel_customer_credit_refund` derives the owner, locks an unsettled account-credit `refund_due` request and writes the single linked `refund_cancelled` event; it cannot cancel a deposit refund or race a staff settlement. The owned projection immediately restores the reserved amount. Paid-versus-cancelled concurrency has exactly one winner.

- [ ] **Step 3: Implement cancellation and rescheduling commands**

`preview_customer_cancel_visit` returns the complete current dog/service list, source revision, money outcome choices, exact deadline/copy and a short-lived single-use review ID bound to those facts and the customer. `cancel_customer_booking_visit` requires that review ID, accepts an optional reason (`null` maps to `Prefer not to say`) and authoritative `p_paid_deposit_outcome` constrained to `refund|credit`. It locks the visit, rejects a stale/mismatched/consumed review with `review_required`, applies actionability, cancels every row, creates the refund/credit outcome once and returns one receipt. A staff edit between dialog open and submit can therefore never cancel dogs/details the customer did not review.

The signed policy decides the £10 deposit outcome but not an additional paid-in-full/part-paid service balance. If reconciled non-deposit prepayment evidence exists, preview/submit returns `financial_review_required`, preserves the visit and every money record, and routes the customer to staff; it must not cancel while refunding or crediting only £10. Add paid-in-full and part-paid fixtures for website, staff review and WhatsApp, plus an unpaid control that remains self-service eligible.

`preview_customer_reschedule_visit` derives ownership and writes a short-lived, single-use private review row bound to customer, source revision, canonical destination/slot hash, current runtime/settings version, authoritative `autoConfirm`, destination policy/deadline and staff-review reason. It returns the exact destination deadline/copy plus opaque review ID; no capacity is reserved by preview. This is mandatory even when the source is legacy, so a post-activation legacy→v1 replacement displays the new 3:00 pm deadline before commit. A stale/mismatched/consumed review returns `review_required` and cannot mutate. The private table is application-role unreadable; its row cannot be supplied for another customer, source revision, date, assignment hash or settings version.

`reschedule_customer_booking_visit` requires that review ID, then locks source and destination, revalidates the review/capacity and enforces identical dog/service/add-on/price basis. When `autoConfirm=true` and no destination-specific staff review applies, it increments the lineage count only after a successful customer move, creates the replacement and supersedes the source in one transaction. SQL copies the source's full non-deposit payment evidence (`payment`, `payment_method`, `paid_at`, `paid_amount` and any payment/reference audit) as well as transferring deposit/credit state; callers cannot resubmit or reset it, and no second bank/paid event is invented. Paid-in-full, part-paid and unpaid fixtures must survive customer, staff and WhatsApp moves byte-for-byte apart from explicit transfer links. Ambiguous legacy payment remains a blocking reconciliation item. The replacement uses the active policy and any failure rolls back both visits, money links and the count.

When the authoritative review says `autoConfirm=false`, the command instead inserts the immutable pending request with reason `auto_confirm_disabled_staff_review` and atomically creates a matching destination reservation. It creates no replacement visit, keeps the confirmed source active, consumes no move and creates no incident/deposit. Capacity immediately counts the held destination. Staff acceptance owns the first replacement insert: it revalidates the still-held reservation and source revision, creates/supersedes atomically, consumes the reservation and then increments the move count. Decline or `withdraw_customer_booking_change_request` releases it. Tests must prove no moment contains two active visit records for the lineage and no held capacity leaks after any terminal request result.

If an otherwise on-time source is requested for the next calendar day after that day's 15:00 cutoff, it cannot bypass staff help. The command stores one pending desired-destination snapshot with reason `destination_last_minute_staff_review` in `booking_change_requests`, promises/reserves no destination capacity, keeps the source active, consumes no move and creates no incident/deposit. The customer sees `Staff will review this request; your original appointment remains booked and the requested slot is not held.` Staff acceptance rechecks capacity and atomically commits the replacement/count; it creates **no incident** because source actionability was on time, while the replacement snapshots last-minute/no-deposit because the destination cutoff passed. If unavailable, staff decline or propose another slot. Add a direct fixture proving generic late-incident logic never evaluates this branch against the destination deadline. Website, WhatsApp and Flow all use it. A valid staff-released same-day slot at least 30 minutes away follows the signed same-day booking rule and may commit atomically; it becomes confirmed/no-deposit with no later self-service controls. A genuinely late **source** change still follows the late request/pause rules.

After the deadline, cancel/reschedule commands return `blocked` and never mutate the visit. Deadline classification is orthogonal to feature switches and move limits: a recognised after-cutoff change intent is always classified `source_deadline_late` before `switch_disabled`/`move_limit` for messaging safety, while capability projections may still expose all facts for UI. This ensures an after-cutoff WhatsApp intent is silenced even when its switch is disabled. The revoked private late-change core can record one idempotent pending request for `cancel|reschedule|partial_change`, leaves the original active and creates no incident, but cannot be executed by `public`, `anon`, `authenticated` or `service_role`. Portal Task 5 wraps it in the required single transaction that also writes the inbox/contact evidence and pauses automation; the later WhatsApp service wrapper reuses that atomic wrapper. Add a grant test proving a direct authenticated RPC cannot create an unpaused late request.

The trusted provider/receipt instant decides only whether the customer expressed the request by the deadline. Every command also evaluates current server state at processing: if appointment start has arrived, arrival/service has begun, or the source is no longer safely replaceable, it makes no automatic change and routes to staff. A delayed signed on-time webhook can therefore prove timely contact but cannot cancel or reschedule a visit after service time.

Every source-terminalising command calls one shared locked core that closes incompatible open change requests and releases their held destination reservations. This applies to customer/staff cancellation, decline/withdrawal of the source, no-show, unserviceable arrival, completion and unrelated supersession; only the exact accepted reschedule request being consumed may transition its reservation to `consumed`. Constraint and race tests prove a terminal source cannot retain a held reservation or later be accepted by staff.

- [ ] **Step 4: Add database concurrency and boundary tests**

Cover exact deadline, one microsecond late, switch-disabled plus one-microsecond-late precedence, delayed signed on-time processing after visit start, legacy→v1 preview copy, missing/stale/mismatched/expired cancel or reschedule review token and re-preview, a staff edit between cancel review and submit, late-request source immutability, `autoConfirm=false` held destination and accept/decline/withdraw races, on-time source→last-minute destination pending without capacity promise/move count, staff acceptance capacity recheck, pending-change withdrawal leaving the source unchanged, cancelled source, mixed dog ownership, changed service/add-on, fourth self-service move, retry replay, same key/different payload rejection, racing cancel/reschedule, concurrent late cancel-versus-reschedule producing only one open staff request, deterministic lock order, recurring dated isolation, credit double-spend prevention, deposit transfer and source rollback on destination failure. Run public wrappers against the real inactive runtime and expect `policy_not_active`; run their same revoked private dispatchers with transaction-scoped inactive, scheduled and simulated-active instants to exercise every v1 success/block branch. No test may set the real v1 effective row or leave a test override available to application roles.

- [ ] **Step 5: Wire wrappers and run focused tests**

Run:

```bash
npm run test:logic -- src/supabase/repositories/bookingsRepo.test.ts
npm run test:db
npm run typecheck
```

Expected: PASS with all repository receipts validated.

- [ ] **Step 6: Commit customer commands**

```bash
git add supabase/migrations/20260722150000_customer_visit_commands.sql supabase/tests/155_customer_visit_commands.test.sql src/supabase/rpc.ts src/supabase/repositories/bookingsRepo.ts src/supabase/repositories/bookingsRepo.test.ts
git commit -m "feat(db): add atomic customer visit commands"
```

---

### Task 5: Add audited staff transition commands

**Files:**
- Create: `supabase/migrations/20260722160000_staff_visit_policy_commands.sql`
- Create: `supabase/tests/160_staff_visit_policy_commands.test.sql`
- Modify: `src/supabase/rpc.ts`
- Create: `src/supabase/repositories/bookingPolicyRepo.ts`
- Create: `src/supabase/repositories/bookingPolicyRepo.test.ts`

**Interfaces:**
- Produces `create_staff_booking_visit`, `update_staff_booking_visit`, `cancel_staff_booking_visit`, `reschedule_staff_booking_visit`, `approve_booking_visit`, `decline_booking_visit`, `propose_booking_visit_slot`, `propose_booking_change_destination`, `withdraw_booking_visit_proposal`, `withdraw_booking_change_proposal`, `decide_booking_change_request`, `record_customer_booking_contact`, `record_visit_deposit_outcome`, `decide_late_visit_deposit`, `record_released_visit_payment`, `resolve_withdrawn_visit_deposit`, `settle_booking_refund_due`, `resolve_service_prepayment_reconciliation`, `record_visit_final_payment`, `waive_visit_deposit_requirement`, `mark_booking_visit_no_show`, `record_unserviceable_late_arrival`, `record_booking_incident`, `set_booking_incident_waiver`, `set_customer_deposit_override`, `resolve_visit_deposit_money`.

- [ ] **Step 1: Write role, state-machine and audit failures first**

Tests must prove non-staff denial; audited staff horizon override; staff-caused changes consume no customer reschedule and create no incident; decline reason required; new-booking proposal atomically releases its unconfirmed original hold and reserves the alternative; confirmed-source reschedule review never releases the source before acceptance; retrospective approval allowed; late change decline closes without incident; accepted ordinary late change records at most one incident unless waived; a trusted same-day/last-minute contact event before start is automatically incident-free even when staff record it later; a post-start or mismatched contact event cannot grant that waiver; a pending pre-start late-cancellation request followed by absence can only become one `late_cancellation` incident; an unapproved absence cannot create an incident; only staff records no-show; one incident per visit; every waiver/override requires reason; current-visit deposit waiver has immutable before/after audit and cannot rewrite a future-account override; Received confirms once; Not received releases once; an on-time bank receipt cannot be declined merely because staff checked it late; a genuinely late receipt can be accepted or declined to one refund/explicit-credit liability with no incident; concurrent/retried decisions settle once; later-found payments never recreate a visit. Also prove a payment decision at/after appointment start cannot confirm a never-attended request without retrospective attended/service evidence.

- [ ] **Step 2: Implement staff approval/proposal commands**

Use these wrapper signatures:

```ts
type CustomerChoiceEvidence = {
  customerChoiceRecorded: true;
  customerChoiceEvidenceId: string;
};

type StaffDepositMoneyChoice =
  | { kind: "none" }
  | { kind: "retain" }
  | { kind: "refund"; customerChoiceRecorded?: false; customerChoiceEvidenceId?: never }
  | ({ kind: "refund" } & CustomerChoiceEvidence)
  | ({ kind: "credit" } & CustomerChoiceEvidence)
  | ({ kind: "transfer"; targetVisitId: string; decisionBasis: "customer_choice" } & CustomerChoiceEvidence)
  | { kind: "transfer"; targetVisitId: string; decisionBasis: "staff_exception"; customerChoiceRecorded?: false; customerChoiceEvidenceId?: never }
  | ({ kind: "transfer_to_replacement"; decisionBasis: "customer_choice" } & CustomerChoiceEvidence)
  | { kind: "transfer_to_replacement"; decisionBasis: "staff_exception"; customerChoiceRecorded?: false; customerChoiceEvidenceId?: never };

type DeclinedLateDepositChoice =
  | ({ kind: "refund" } & CustomerChoiceEvidence)
  | ({ kind: "credit" } & CustomerChoiceEvidence);

type LateDepositSatisfactionEvidence =
  | { kind: "bank"; bankReceivedAt: string; bankReference: string | null }
  | { kind: "reserved_credit"; lateSatisfactionRequestId: string; creditReservationId: string }
  | { kind: "reserved_transfer"; lateSatisfactionRequestId: string; transferReservationId: string };

type IdempotentCommand<T> = T & { idempotencyKey: string };

// Every argument object below is an IdempotentCommand<{ ... }>;
// the field is not optional even where the compact signatures omit repetition.

createStaffBookingVisit(client, { humanId, bookingDate, bookings, overrideHorizon, overrideReason })
updateStaffBookingVisit(client, { visitId, expectedVisitRevision, bookings, changeReason, recordLatePartialIncident })
cancelStaffBookingVisit(client, { visitId, expectedVisitRevision, cause, reason, depositMoney, servicePrepaymentHandling, servicePrepaymentTargetVisitId, servicePrepaymentRefundDueAt, customerChoseServicePrepaymentTransfer, servicePrepaymentChoiceEvidenceId, waiveIncident, contactEventId })
rescheduleStaffBookingVisit(client, { visitId, expectedVisitRevision, bookingDate, assignments, cause, reason, overrideHorizon, overrideReason, sourceDepositMoney, replacementDepositMode, replacementDepositReason, waiveIncident, contactEventId })
approveBookingVisit(client, { visitId, expectedVisitRevision, mode: "ordinary" | "retrospective_attended", attendanceEvidenceId, serviceEvidenceIds, reason })
declineBookingVisit(client, { visitId, expectedVisitRevision, customerReason, servicePrepaymentHandling, servicePrepaymentTargetVisitId, servicePrepaymentRefundDueAt, customerChoseServicePrepaymentTransfer, servicePrepaymentChoiceEvidenceId })
proposeBookingVisitSlot(client, { visitId, expectedVisitRevision, bookingDate, assignments, overrideHorizon, overrideReason })
proposeBookingChangeDestination(client, { requestId, expectedRequestRevision, bookingDate, assignments, reason, overrideHorizon, overrideReason })
withdrawBookingVisitProposal(client, { requestId, expectedRequestRevision, reason })
withdrawBookingChangeProposal(client, { requestId, expectedRequestRevision, reason })
decideBookingChangeRequest(client, { requestId, expectedRequestRevision, decision, waiveIncident, reason, sourceDepositMoney, replacementDepositMode, replacementDepositReason, contactEventId })
recordCustomerBookingContact(client, { visitId, expectedVisitRevision, channel, contactedAt, providerMessageId, reason })
recordVisitDepositOutcome(client, { visitId, expectedVisitRevision, decision, bankReceivedAt, bankReference, retrospectiveMode: "none" | "retrospective_attended", attendanceEvidenceId, serviceEvidenceIds, reason })
decideLateVisitDeposit(client, { visitId, expectedVisitRevision, decision, satisfactionEvidence: LateDepositSatisfactionEvidence, declineDepositMoney: DeclinedLateDepositChoice | null, retrospectiveMode: "none" | "retrospective_attended", attendanceEvidenceId, serviceEvidenceIds, reason })
recordReleasedVisitPayment(client, { visitId, expectedVisitRevision, bankReceivedAt, bankReference, depositMoney: StaffDepositMoneyChoice | null })
resolveWithdrawnVisitDeposit(client, { visitId, expectedVisitRevision, outcome, bankReceivedAt, bankReference, depositMoney: StaffDepositMoneyChoice | null })
settleBookingRefundDue(client, { obligationId, paidAt, bankReference })
resolveServicePrepaymentReconciliation(client, { reconciliationId, expectedRevision, outcome, targetVisitId, refundDueAt, customerChoiceRecorded, customerChoiceEvidenceId, reason })
recordVisitFinalPayment(client, { visitId, expectedVisitRevision, expectedBillRevision, amountPence, paymentMethod, paidAt, paymentReference, reason })
waiveVisitDepositRequirement(client, { visitId, expectedVisitRevision, reason })
markBookingVisitNoShow(client, { visitId, expectedVisitRevision, reason, depositMoney, servicePrepaymentHandling, servicePrepaymentTargetVisitId, servicePrepaymentRefundDueAt, customerChoseServicePrepaymentTransfer, servicePrepaymentChoiceEvidenceId })
recordUnserviceableLateArrival(client, { visitId, expectedVisitRevision, arrivedAt, reason, depositMoney, servicePrepaymentHandling, servicePrepaymentTargetVisitId, servicePrepaymentRefundDueAt, customerChoseServicePrepaymentTransfer, servicePrepaymentChoiceEvidenceId, waiveIncident })
recordBookingIncident(client, { visitId, expectedVisitRevision, kind, evidenceId, reason })
setBookingIncidentWaiver(client, { incidentId, expectedIncidentRevision, waived, reason })
setCustomerDepositOverride(client, { humanId, mode, reason })
resolveVisitDepositMoney(client, { visitId, expectedVisitRevision, depositMoney, reason })
```

The wrapper decoder and SQL validate the discriminated deposit choice, not a loose collection of nullable fields. `transfer` requires its target and rejects cross-human, terminal, already-satisfied or source-equal targets; `transfer_to_replacement` is accepted only inside an atomic reschedule whose replacement is created in that transaction. Every staff-entered `customerChoiceRecorded=true` requires `customerChoiceEvidenceId` referencing an immutable, same-human/visit website review, verified WhatsApp event or staff-recorded contact/message whose structured payload names that exact outcome and transfer target where applicable; a boolean alone is never evidence. Self-service commands create and bind their reviewed choice evidence inside their own transaction. `decisionBasis='staff_exception'` is allowed only in the matrix's explicit late-terminal/carry-forward exceptions and requires the command's staff reason/audit instead. Refund may omit customer evidence only where the matrix defines a refund default/staff exception. A null choice on a reconciliation wrapper leaves or opens reconciliation and cannot settle money. Retain carries no target/choice fields; `none` is valid only when no paid deposit exists.

The server and every staff/customer UI enforce this context matrix after validating the union shape:

| Context | Allowed paid-deposit outcome | Choice/evidence rule |
|---|---|---|
| On-time customer cancellation, any channel | `refund`, `credit` | Refund is default; credit requires the customer's explicit choice |
| On-time customer reschedule, any channel | `transfer_to_replacement` | The reviewed reschedule request is the transfer choice |
| Salon-caused cancellation or reschedule | `refund`, `transfer` | Full refund or customer-preferred eligible transfer; never retain or account credit |
| Accepted late customer cancellation/reschedule | `retain`, `refund`, `transfer` | Retain is default; staff may record the signed refund/eligible-transfer exception |
| No-show or unserviceable late arrival | `retain`, `refund`, `transfer` | Retain is default; staff may record the signed exception |
| Declined late payment | `refund`, `credit` | Both require the customer's recorded choice; no choice stays reconciliation |
| Withdrawn-paid or payment found after release | `refund`, `credit`, `transfer` | Exact customer choice required; no choice stays reconciliation |
| No paid deposit | `none` | Any money outcome is rejected |

No command may widen its row by accepting another union member. Add direct-RPC, repository and component tests for every allowed cell and every rejected cross-context value, especially late-terminal credit, salon retain/credit, on-time reschedule retain/refund and declined-late transfer/retain.

Every staff path that chooses a destination—create, direct reschedule, unconfirmed-request alternative and confirmed-source counterproposal—carries the same typed `overrideHorizon` boolean plus mandatory non-empty `overrideReason` when true. The database calculates ordinary horizon eligibility first; false cannot exceed it, true records actor, reason, source/destination and configured limit in immutable audit. Customer acceptance of an already audited staff proposal does not ask for a second override. Add exact-last-day/next-day, missing-reason, direct-RPC, stale-setting and two-staff concurrency fixtures for all four destination paths.

The `IdempotentCommand` intersection makes every mutating wrapper above require `idempotencyKey: string` containing a UUID and use the private command-receipt contract. Bank/paid/contact/arrival timestamps are evidence, never caller authority: the server rejects future or lifecycle-inconsistent values before classifying them, and exceptional pre-request evidence requires a separately audited reason. Existing-entity staff commands require the optimistic visit/request/incident revision rendered in the modal; a lock plus mismatched revision returns `stale_review` before mutation so a second staff member cannot overwrite, cancel, reschedule or decide newly changed details. Add compile-time/repository tests rejecting a missing idempotency key and two-staff concurrency fixtures for each commercial mutation family.

Ordinary approval is allowed only before appointment start. It snapshots commercial eligibility; if that instant is after the deadline, set `is_last_minute=true` and bypass deposit. If approval starts a deposit requirement, keep `confirmation_state='unconfirmed'` until staff verify it. Policy assignment still occurs only at the actual confirmation instant. A later bank check does not retroactively turn a pre-deadline deposit hold into a last-minute exemption. Customer acceptance of a staff proposal is the final approval step and follows the same decision.

`mode='retrospective_attended'` is the only approval after start. It requires the explicit attendance evidence ID and per-dog service evidence IDs from the wrapper, a non-empty reason, and rejects an absent/unstarted request. It approves/confirms the historical service through the shared confirmation core without starting a deposit hold. Before confirmation it releases every unconsumed reserved credit or deposit-transfer reservation, records audited `not_required/retrospective_service` and proves the released amount contributes zero to `booking_visit_bill_summary`; it never silently applies a pre-reserved £10 after service. Direct-RPC tests reject `ordinary` at/after start, retrospective mode without matching evidence and races against withdrawal/refund/reservation use.

Staff create/update/cancel/reschedule commands lock the same visit/capacity/reservation keys as customer commands and emit the same receipt shape. A horizon override requires a non-empty reason and audit. `cause='salon'` never increments customer reschedules or creates an incident and records the customer's refund/transfer preference. `cause='accepted_late_customer_request'` requires a matching trusted request/contact event and applies the signed late-change incident/deposit defaults unless staff explicitly waive them, **except** that a same-day/last-minute change referencing a matching trusted customer-contact event before appointment start is automatically incident-free and cannot be overridden into an incident. Direct `reschedule_staff_booking_visit` accepts the same `sourceDepositMoney`, `replacementDepositMode` and audited waiver-reason contract as `decide_booking_change_request`; mandatory same-day/last-minute/insufficient-window exemptions override and reject incompatible modes in both paths. `record_customer_booking_contact` is staff-only for phone/email/in-person evidence, requires a non-empty reason, rejects future timestamps and appends actor/time/source audit; website and WhatsApp create their own event inside their atomic request commands. A partial dog/service/add-on edit requires a reason and creates no incident unless staff deliberately select the late-partial incident option. Staff can withdraw a proposal but cannot accept it for the customer; role/grant tests enforce the authenticated-owner command boundary.

Every staff command that terminalises a visit calls one shared service-prepayment disposition core before commit, including `cancel_staff_booking_visit`, `decline_booking_visit` when anomalous payment exists, `mark_booking_visit_no_show` and `record_unserviceable_late_arrival`. Their wrappers expose the same typed fields: `servicePrepaymentHandling='reconciliation_required'|'transfer'|'refund_due'`, nullable target/promised due instant, the explicit customer-transfer-choice flag and its trusted contact/message evidence ID. When non-deposit money exists the server rejects a missing handling choice; callers should default the staff control to `reconciliation_required`, never silently omit it. That safe default preserves all evidence and opens the all-open task. `transfer` requires an eligible same-human target plus `customerChoiceRecorded=true` and a matching owned website/WhatsApp/contact evidence row; a boolean alone is insufficient. `refund_due` requires an explicit promised due instant and `refund_deadline_basis='staff_explicit'` because the signed five-working-day SLA applies to deposits, not automatically to service prepayment. `resolve_service_prepayment_reconciliation` is the only later resolver and locks/revisions the task; its transfer branch enforces the same choice/evidence pair. A terminal transition can release capacity, but cannot clear payment fields or close without a linked audited financial outcome. Add atomic paid-in-full/part-paid tests for each wrapper and direct RPC, including missing/mismatched choice evidence and rollback when the money disposition fails.

`withdraw_booking_visit_proposal` is staff-only, idempotent and requires a reason. It locks the waiting-customer proposal, releases the proposed capacity and any reserved credit, closes it with the correct customer outcome, and never silently restores the already-released original slot; staff must create a fresh proposal if needed. Tests cover concurrent customer acceptance versus staff withdrawal, with exactly one winner and no leaked capacity/credit.

If a staff-created/proposed visit resolves as deposit-required, the staff command can create only an unconfirmed `awaiting_terms` visit and website continuation. Staff cannot accept deposit Terms for the customer or force commercial confirmation; only an audited deposit waiver changes that requirement.

For a pending reschedule, `decide_booking_change_request` branches on the stored reason and reservation, not free text. Acceptance of `auto_confirm_disabled_staff_review` consumes the matching held destination while atomically creating the replacement and superseding the confirmed source. Acceptance of `destination_last_minute_staff_review` rechecks unheld capacity first and fails/proposes safely if unavailable. Decline leaves the confirmed source unchanged and releases any destination reservation. `propose_booking_change_destination`/`withdraw_booking_change_proposal` are the distinct confirmed-source counterproposal path: they reserve/release only the proposed destination and never release/supersede the source; only `accept_customer_booking_change_proposal` performs that atomic replacement. This is separate from `propose_booking_visit_slot`, where an unconfirmed new-booking request's obsolete hold is released before the alternative is reserved. Concurrency tests cover customer withdrawal versus staff accept, proposal versus decline and an ordinary booking racing the held reservation.

- [ ] **Step 3: Implement deposit, incident, waiver and money commands**

`decide_booking_change_request` accepts or declines the pending request. Decline closes it and leaves the confirmed source active with no incident. Accept performs the whole visit change, creates at most one incident when late and unwaived, and never records a second no-show for the same source visit.

For an accepted unwaived late reschedule, old money and the replacement requirement are two explicit decisions. `sourceDepositMoney.kind` defaults to `retain`; refund/credit/transfer is audited separately. Before accepting any client `replacementDepositMode`, the server resolves the destination's own commercial-eligibility timing and hold window. A staff-released same-day destination, an actual last-minute destination or a destination whose configured hold would run beyond appointment start is unconditionally `not_required` with its signed reason: it confirms without a new deposit or website Terms step, and this is **not** an audited waiver. The late source incident/default old-money disposition still applies independently. Only an ordinary eligible destination defaults to `new_required`, because the signed rule normally retains the old deposit **and** requires a new £10 deposit. That replacement snapshots the current Terms publication and is created as unconfirmed `awaiting_terms`; the source is superseded only in the same atomic commit, and the visit-level outcome sends a website continuation for that snapshot. Staff cannot accept Terms or mark a new deposit for the customer. `carry_forward` is the staff-discretion exception: it reserves the old £10 for transfer but still waits for the customer to accept the replacement's snapshotted website Terms before applying it and confirming. `waive` is offered only for an otherwise-required ordinary destination, requires a separate audited reason and confirms with no replacement deposit. Reject `new_required|carry_forward|waive` input for a mandatory exemption rather than mislabelling it. Constraint/ledger tests prove all three exemption precedences, the old £10 cannot be both retained and transferred, a carried amount cannot be used twice, no staff Terms bypass exists, and failure rolls back source/replacement/money/incident together.

`record_visit_deposit_outcome` accepts `received|not_received`, the bank receipt timestamp for `received`, explicit retrospective mode/evidence fields and an idempotency key. Before appointment start, an on-time bank `received` confirms and emits one outcome key even when staff verification occurs after due; `not_received` cancels/releases without incident. At/after start, `received` can confirm only through `retrospective_attended` with the same attendance/per-dog service evidence and reason as approval; otherwise it records/routes the payment liability without confirming an absence. It refuses to disguise a known late receipt as on-time or absent.

`waive_visit_deposit_requirement(p_visit_id uuid, p_expected_visit_revision integer, p_reason text, p_idempotency_key uuid)` is staff-only and applies to the current visit, unlike the account-level `set_customer_deposit_override`. It requires the rendered current revision, server time strictly before appointment start, an unconfirmed `awaiting_terms` requirement (or an `awaiting_payment` record already resolved by staff as no payment), a non-empty reason and no satisfaction event. Under one lock it rejects a stale revision, appends immutable before/after audit, changes the visit deposit to `not_required/staff_visit_waiver`, releases any reserved credit and confirms the otherwise eligible visit once through the shared core. At/after start it returns `retrospective_review_required` and cannot turn an unapproved absence into a confirmed visit; staff must use the evidence-backed retrospective path. It cannot erase bank evidence, modify future requirements or waive a received/liability/reconciliation state. Tests cover role denial, stale review, exact-start rejection, absent visit, retry, concurrent Terms acceptance/credit allocation, no-payment prerequisite and the confirmation outcome.

`decide_late_visit_deposit` requires one discriminated satisfaction source. `bank` preserves a receipt time after the snapshotted due time without fabrication; `reserved_credit` and `reserved_transfer` must identify the one pending late-satisfaction request plus its same-human/visit £10 reservation. Before appointment start, `accept` consumes that exact source once and confirms through the shared core. A bank `decline` records that money really arrived, declines/releases the unconfirmed visit and settles only to the customer's evidenced refund or non-expiring-credit choice; transfer, retain and none are rejected, while no choice records `received_liability` and opens mandatory reconciliation. Declining reserved credit releases it back to the existing account credit; declining a reserved transfer releases it to its stored audited source fallback. Neither non-bank decline fabricates new cash, refund or credit. At or after appointment start, neither this command nor `record_visit_deposit_outcome(received)` may turn a never-confirmed request into an ordinary confirmed visit. Acceptance requires `retrospectiveMode='retrospective_attended'`, a non-empty reason, one matching immutable attendance evidence ID and service-provided evidence IDs covering every included dog; the command records those exact IDs in audit. `retrospectiveMode='none'`, missing/mismatched evidence or an absent/unstarted visit cannot confirm and keeps/routes the source through its correct liability/reservation reconciliation with no incident. Conflicting accept/decline/not-received/withdraw calls lock the visit, deposit and named source reservation and settle once. `record_released_visit_payment` handles bank money found after an earlier release in the same audited way but, with no recorded customer choice, leaves an open reconciliation rather than inventing a default; it can never reactivate the released visit. Add bank/credit/transfer late fixtures, on-time/late evidence first discovered after appointment start, every retrospective field/evidence mismatch, decline-transfer rejection and no-choice→later-choice fixtures.

`resolve_withdrawn_visit_deposit` closes the mandatory post-withdrawal reconciliation without replaying a booking outcome. `outcome='no_payment'` records the completed check only; it does not cancel/release again or send `deposit_not_received`. `payment_found` requires bank evidence and atomically uses `received_liability` plus the customer's recorded refund, credit or eligible-transfer choice. With no choice it remains visibly open for staff/customer follow-up. A row lock makes `no_payment` versus concurrent late discovery one auditable winner; later evidence uses the released-payment correction path and still never recreates the visit.

`settle_booking_refund_due` is the only `Mark refunded` command. It accepts the `refund_due` obligation ID—not a required visit ID—plus actual paid time, bank reference and idempotency UUID. Under a ledger lock it verifies staff role, unresolved kind, exact amount/human and any nullable source visit, then inserts the one linked `refund_paid` event. This supports pooled account-credit refunds with no single visit as well as visit deposit refunds. Concurrent/double settlement replays or rejects without a second payment record.

`resolve_visit_deposit_money` accepts the discriminated `refund|credit|transfer|retain` choice, requires an eligible source state and the embedded eligible target for transfer, writes balanced ledger/audit rows and never mutates capacity. Credit/transfer requires `customerChoiceRecorded=true` plus staff actor. For declined-late and withdrawn-paid requests, refund also requires the customer's recorded choice; ordinary on-time cancellation remains the separate signed default-refund path when credit was not explicitly selected. Staff cannot infer any missing choice from nullable fields.

`mark_booking_visit_no_show` is the only no-show transition. Under one visit lock it requires staff, `confirmed_at <= visit_start_at`, appointment start reached, no arrival/service evidence and no matching trusted pre-start contact for a same-day/last-minute visit; communicated absence is resolved incident-free instead. A visit first approved retrospectively after start is therefore ineligible even if its current confirmation flag is true, and its required attended/service evidence independently contradicts no-show. The command terminalises the visit/all included child rows, releases capacity, applies the default retained-deposit or audited exception, records exactly one no-show incident and enqueues **no** automatic customer outcome. If an open pre-start late-cancellation request exists, it rejects with `resolve_as_late_cancellation` so staff resolution records that single classification. Race/rollback tests cover arrival, customer contact, retrospective approval and staff cancellation.

`record_unserviceable_late_arrival` similarly locks and terminalises the confirmed visit only when actual arrival evidence exists, service was explicitly not provided and no child service started/completed; it records the one incident/deposit outcome and no incident-specific automatic message. `record_booking_incident` handles evidence-backed late cancellation/reschedule/partial-change corrections but cannot be used to bypass either terminal transition. Every kind still requires a commercially confirmed/approved visit; late cancellation/reschedule references the accepted after-deadline change event, and `late_partial_change` references an audited after-deadline commercial edit while the remainder proceeds. A retrospectively serviced request must be approved first; a never-confirmed request can never acquire an incident. Add direct-RPC pgTAP for future no-show, communicated same-day absence, serviced late arrival, on-time partial edit and mismatched evidence rejection. `set_booking_incident_waiver` requires the rendered incident revision, appends waive/unwaive audit instead of overwriting history and increments the revision once. It and `set_customer_deposit_override` require non-empty reasons and actor attribution.

- [ ] **Step 4: Run all staff command tests**

Run:

```bash
npm run test:logic -- src/supabase/repositories/bookingPolicyRepo.test.ts
npm run test:db
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit staff commands**

```bash
git add supabase/migrations/20260722160000_staff_visit_policy_commands.sql supabase/tests/160_staff_visit_policy_commands.test.sql src/supabase/rpc.ts src/supabase/repositories/bookingPolicyRepo.ts src/supabase/repositories/bookingPolicyRepo.test.ts
git commit -m "feat(db): add audited booking policy commands"
```

---

### Task 6: Add the shared TypeScript policy model and regenerate schema types

**Files:**
- Create: `src/types/bookingPolicy.ts`
- Create: `src/engine/bookingPolicy.ts`
- Create: `src/engine/bookingPolicy.test.ts`
- Modify: `src/types/index.ts`
- Modify: `src/supabase/database.types.ts`
- Modify: `src/supabase/transforms.ts`
- Test: `src/supabase/transforms.test.ts`

**Interfaces:**
- Produces `BookingVisit`, `VisitLifecycleState`, `VisitApprovalState`, `VisitConfirmationState`, `DepositState`, `IncidentKind`, `VisitActionability`, `CustomerVisitReceipt`.
- Produces presentation-only helpers; SQL remains authoritative for permission decisions.

- [ ] **Step 1: Write pure selector tests**

Pin labels and UI grouping for waiting approval, waiting deposit, check due, confirmed, last-minute, declined/withdrawn, remaining reschedules, staff-only incidents and money outcomes.

- [ ] **Step 2: Add exact domain types to `src/types/bookingPolicy.ts` and re-export them from `src/types/index.ts`**

```ts
export type VisitLifecycleState =
  | "active"
  | "superseded"
  | "cancelled"
  | "withdrawn"
  | "declined"
  | "completed";

export type VisitApprovalState =
  | "not_required"
  | "waiting_staff"
  | "approved"
  | "alternative_pending";

export type VisitConfirmationState = "unconfirmed" | "confirmed";

export type DepositState =
  | "not_required"
  | "awaiting_terms"
  | "awaiting_payment"
  | "received"
  | "received_liability"
  | "not_received"
  | "reconciliation_required";

export interface BookingVisit {
  id: string;
  revision: number;
  lineageId: string;
  humanId: string;
  bookingDate: string;
  lifecycleState: VisitLifecycleState;
  approvalState: VisitApprovalState;
  confirmationState: VisitConfirmationState;
  policyCode: "legacy_24h" | "previous_day_1500_v1" | null;
  confirmedAt: string | null;
  commercialEligibilityAt: string | null;
  eligibilityPolicyCode: "legacy_24h" | "previous_day_1500_v1" | null;
  deadlineAt: string | null;
  isLastMinute: boolean;
  remainingSelfServiceReschedules: number;
  bookings: Booking[];
  deposit: VisitDeposit | null;
}

export interface StaffBookingChangeRequest {
  id: string;
  revision: number;
  sourceVisitId: string;
  sourceVisitRevision: number;
  // remaining typed request/destination fields
}

export interface StaffBookingPolicyIncident {
  id: string;
  revision: number;
  visitId: string;
  visitRevision: number;
  // remaining staff-only evidence and waiver fields
}
```

Staff projections expose and decoders validate the visit, request and incident revision appropriate to every mutable command. Repository tests mutate each entity between render and submit and require `stale_review`; a missing/non-integer revision fails decoding before an RPC call. Immutable refund obligations and append-only override commands instead lock and revalidate their current terminal/effective state. Do not add client helpers named `canCancel` or `canReschedule` that recalculate a deadline. Map the server-returned actionability instead.

- [ ] **Step 3: Regenerate and map database types**

Run against the local migrated database:

```bash
npx supabase gen types typescript --local > /tmp/smarter-dog-database.types.ts
diff -u src/supabase/database.types.ts /tmp/smarter-dog-database.types.ts || true
cp /tmp/smarter-dog-database.types.ts src/supabase/database.types.ts
npm run typecheck
npx supabase gen types typescript --local > /tmp/smarter-dog-database.types.verify.ts
cmp -s src/supabase/database.types.ts /tmp/smarter-dog-database.types.verify.ts
```

Review the diff before copying. Ensure the currently missing deposit/human-rule fields also appear. The post-copy typecheck and second generation must both pass before staging; a non-zero `cmp` means the generated file is stale or was edited by hand.

- [ ] **Step 4: Run focused and full type tests**

Run:

```bash
npm run test:logic -- src/engine/bookingPolicy.test.ts src/supabase/transforms.test.ts
npm run typecheck
npm run lint
```

Expected: PASS.

- [ ] **Step 5: Commit the shared model**

```bash
git add src/types/bookingPolicy.ts src/engine/bookingPolicy.ts src/engine/bookingPolicy.test.ts src/types/index.ts src/supabase/database.types.ts src/supabase/transforms.ts src/supabase/transforms.test.ts
git commit -m "feat: add visit-level booking policy model"
```

---

### Task 7: Normalise visit events and reporting inputs

**Files:**
- Create: `supabase/migrations/20260722170000_visit_policy_events.sql`
- Create: `supabase/tests/165_visit_policy_events.test.sql`
- Modify: `src/engine/reportsAnalytics.ts`
- Modify: `src/engine/reportsAnalytics.test.ts`
- Modify: `src/lib/bookingEventFormat.js`
- Modify: `src/lib/bookingEventFormat.test.js`
- Modify: `src/supabase/database.types.ts`

**Interfaces:**
- Adds `visit_id`, `outcome_key` and visit-level event kinds to `booking_events` without deleting historical rows.
- Adds trusted `requested_at` and server `committed_at` to visit events; `occurred_at` remains compatibility display data only.
- Emits one event per visit outcome, not one per dog.
- Produces `sync_booking_visit_completion(uuid)` plus a guarded child-status trigger that derives aggregate completion/reopen state.

- [ ] **Step 1: Write failing event/report parity tests**

Prove replacement and in-place staff reschedules each count once, exact deadline is not late, a delayed signed on-time webhook committed after the deadline still reports from its trusted request instant, legacy visits use 24 hours, new visits use 15:00 previous day, multi-dog outcomes count once and no-show/late-arrival categories remain distinct. For completion, prove one completed dog leaves a two-dog visit active, every `included` child completed moves it once to `completed`, an audited `removed` child is excluded, correction of a child out of Completed reopens with audit, legacy child updates remain compatible, and the incident resolver clears a one-incident requirement only while a later different visit is genuinely completed. Include retrospective approval of already-completed children, which must synchronise immediately even though no child-status trigger fires.

- [ ] **Step 2: Add visit event emission**

Extend event kinds with `requested`, `approved`, `proposed`, `declined`, `withdrawn`, `confirmed`, `rescheduled`, `cancelled`, `deposit_received`, `deposit_not_received`, `incident_recorded`, `incident_waived`, `credit_changed`, `completed` and `completion_reopened`; extend the formatter/tests for both completion kinds. Every committed mutation/event/outbox outcome from a visit command inserts an idempotent `outcome_key`; a blocked/no-mutation receipt keeps it null. Events also store trusted `requested_at` used for deadline classification and server `committed_at` used for audit ordering. Website uses its committed request instant; webhook uses the signature-verified provider timestamp; Flow uses its first verified/decrypted database receipt instant. Do **not** suppress a legacy row trigger merely because `visit_id` is present—every row is dual-written before activation. Add a write-revoked private command-context keyed to the current transaction; security-definer visit commands establish it while they write child rows/outbox events, and only those writes suppress the duplicate row event. Inactive/scheduled legacy writers continue to emit exactly the characterised row events; active direct writes are blocked and compatibility wrappers enter the visit-command context. Test both paths and prove application roles cannot forge the context.

The child-status trigger calls `sync_booking_visit_completion`: a confirmed non-terminal visit becomes `completed` with one `completed_at`/`completed` visit event only when every `included` child is `Completed`; removed children count only when an audited partial-change command marked their membership. Every path that changes commercial confirmation also calls the synchroniser explicitly, especially retrospective approval and post-service payment decisions, so pre-completed child rows cannot leave the aggregate active. If staff correct any included child out of Completed, reopen the visit to `active`, clear `completed_at` and append `completion_reopened` without deleting history. Full cancelled/declined/withdrawn/superseded visits never reopen through a child edit. This aggregate state—not an inferred row date—is authoritative for history and incident clearing.

- [ ] **Step 3: Replace the hard-coded `<24h` report calculation**

Reports consume stored `customer_change_deadline_at` and classify late only when trusted `requested_at > deadline_at`; `committed_at` is retained separately for processing/audit latency. Do not derive from the current global policy or use commit time to reclassify a delayed webhook.

- [ ] **Step 4: Run focused suites and commit**

Run:

```bash
npm run test:logic -- src/engine/reportsAnalytics.test.ts src/lib/bookingEventFormat.test.js
npm run test:db
npx supabase gen types typescript --local > /tmp/smarter-dog-database.types.ts
diff -u src/supabase/database.types.ts /tmp/smarter-dog-database.types.ts || true
cp /tmp/smarter-dog-database.types.ts src/supabase/database.types.ts
npm run typecheck
npx supabase gen types typescript --local > /tmp/smarter-dog-database.types.verify.ts
cmp -s src/supabase/database.types.ts /tmp/smarter-dog-database.types.verify.ts
```

Expected: PASS.

```bash
git add supabase/migrations/20260722170000_visit_policy_events.sql supabase/tests/165_visit_policy_events.test.sql src/engine/reportsAnalytics.ts src/engine/reportsAnalytics.test.ts src/lib/bookingEventFormat.js src/lib/bookingEventFormat.test.js src/supabase/database.types.ts
git commit -m "feat: normalise booking policy events"
```

---

### Task 8: Foundation verification and inactive deployment gate

**Files:**
- Create: `docs/superpowers/runbooks/2026-07-22-booking-policy-foundation-rollout.md`
- Modify: `docs/migrations.md`

**Interfaces:**
- Produces the exact staging/prod migration order and rollback boundary.
- Does not activate `previous_day_1500_v1`.

- [ ] **Step 1: Write the runbook with concrete gates**

The runbook must require: clean backup/PITR confirmation; migration validation; `booking_visit_backfill_review` counts split by grouping, commercial confirmation, legacy customer override and legacy money conflict without customer details; an audit proving every `humans.deposit_required=true` row has one migrated override; one-per-visit opening deposit/ledger totals reconciled against legacy rows; zero unresolved `legacy_import` holds in `awaiting_terms|awaiting_payment|received_liability|reconciliation_required`; UK refund-calendar coverage through the configured horizon plus five working days; old portal/WhatsApp smoke tests; new RPC role/ownership tests; proof that guarded legacy `deposit-auto-release` behaviour remains in force until the future effective instant; proof that no new visit-deposit cron exists because overdue attention is derived; and a query proving `previous_day_1500_v1.effective_at is null`. It must explicitly forbid deploying the foundation alone as a customer-visible policy change and identify every unresolved money/reconciliation row as a later activation blocker.

- [ ] **Step 2: Run the complete local bar**

```bash
npm run lint
npm run typecheck
npm run check:migrations
npm run test
npm run test:db
npm run build
deno test --node-modules-dir=none --allow-env supabase/functions/
```

Expected: every available command PASS. Do not substitute static SQL tests for pgTAP when Docker is available.

- [ ] **Step 3: Review the migration diff for destructive behaviour**

Run:

```bash
rg -n "delete from|drop table|drop column|status = 'Cancelled'|deposit-auto-release|effective_at" supabase/migrations/20260722*.sql
```

Expected: no booking deletion, no visit cancellation, no new destructive cron, and no activation timestamp assigned.

- [ ] **Step 4: Commit the runbook**

```bash
git add docs/superpowers/runbooks/2026-07-22-booking-policy-foundation-rollout.md docs/migrations.md
git commit -m "docs: add booking policy foundation rollout"
```

## Completion Gate

This plan is complete only when the new schema and commands are testable while the current application still behaves as before and `previous_day_1500_v1` remains inactive. Continue with `2026-07-22-booking-policy-portal-staff.md`; do not activate the policy between plans.
