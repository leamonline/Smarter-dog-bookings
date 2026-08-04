# Legal-Risk Remediation Tranche 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close B-01, H-01, H-02 and H-06 at the authoritative database boundary, retain necessary customer/staff workflows through narrow RPCs, and make every customer-visible failure explicit.

**Architecture:** One idempotent migration removes broad customer policies, reissues the affected SECURITY DEFINER functions with explicit grants, and adds narrow profile/cancellation interfaces. React calls typed wrappers only. Static SQL contract tests provide a runnable local red/green loop; pgTAP tests provide behavioural database evidence when a Supabase test database is available.

**Tech Stack:** PostgreSQL/RLS/pgTAP, Supabase RPC, React 19, TypeScript/JavaScript, Vitest, Testing Library.

## Global Constraints

- Use UK English for customer and staff copy.
- Every production behaviour change starts with a failing automated regression test.
- Work only on `fix/legal-risk-remediation`, based on audited commit `3df4b3a5a0bf5bc7373f3f64f40aea413062d9f6`.
- Do not apply a migration to production, inspect identifiable customer records, publish legal wording, or change a supplier console.
- Keep `supabase/migrations/20260712115759_legal_risk_tranche1.sql` idempotent.
- Every new/reissued public function has a pinned `search_path`, explicit `REVOKE` from `PUBLIC` and `anon`, and the narrowest required `GRANT`.
- Staff and customers share the PostgreSQL `authenticated` role. Preserve staff table writes through staff-only RLS; do not revoke a table privilege that staff still require.
- Existing trusted-contact links remain readable. Only customer creation of new links is disabled.
- Customer-reported dog size is not authoritative. `dogs.size` remains staff-owned; customer writes use `dogs.reported_size`.
- A customer booking never falls back to size supplied in booking JSON.
- Production-generated `src/supabase/database.types.ts` is not hand-edited.
- The local Docker daemon is unavailable. `npm run test:db` must be attempted and its environmental failure recorded; runnable static SQL tests are the required local database red/green proof.

## File Structure

- `supabase/migrations/20260712115759_legal_risk_tranche1.sql` — all authoritative Tranche 1 database changes.
- `supabase/tests/100_customer_write_permissions.test.sql` — B-01/H-01 behavioural database tests.
- `supabase/tests/110_customer_cancellation.test.sql` — H-06 behavioural database tests.
- `supabase/tests/120_trusted_contact_lock.test.sql` — H-02 database absence/RLS tests.
- `src/security/legalRiskTranche1Migration.test.ts` — runnable static invariants over the effective migration state.
- `src/supabase/rpc.ts` — narrow customer profile and cancellation wrappers; unsafe trusted-contact wrapper removed.
- `src/supabase/repositories/dogsRepo.ts` — separates authoritative and reported dog size.
- `src/supabase/repositories/bookingsRepo.ts` — typed single-booking cancellation command and receipt.
- `src/supabase/repositories/bookingsRepo.test.ts` — cancellation wrapper contract.
- `src/components/customer/onboarding/ProfileGate.jsx` — profile-completion RPC caller.
- `src/components/customer/CustomerDashboard.jsx` — contact-details RPC caller, trusted-contact read-only wiring and awaited booking refresh.
- `src/components/customer/TrustedHumansSection.jsx` — read-only trusted-contact display.
- `src/components/customer/TrustedHumansSection.component.test.jsx` — H-02 unavailable-state regression.
- `src/components/customer/booking/BookingWizard.tsx` — no size derivation and explicit partial reschedule result.
- `src/components/customer/booking/DogSelection.sizeVerification.component.test.tsx` — unverified size cannot be selected.
- `src/components/customer/booking/AddDogInline.tsx` and `src/components/customer/DogsSection.jsx` — reported-size wording.
- `src/components/customer/BookingCard.jsx` — failure-visible, receipt-confirmed cancellation.
- `src/components/customer/BookingCard.component.test.jsx` — cancellation UI regression coverage.

---

### Task 1: Remove broad customer human updates

**Files:**
- Create: `src/security/legalRiskTranche1Migration.test.ts`
- Create: `supabase/tests/100_customer_write_permissions.test.sql`
- Modify: `supabase/migrations/20260712115759_legal_risk_tranche1.sql`
- Modify: `src/supabase/rpc.ts`
- Modify: `src/components/customer/onboarding/ProfileGate.jsx`
- Modify: `src/components/customer/CustomerDashboard.jsx`

**Interfaces:**
- Produces `updateCustomerContactDetails(client, input)` and `completeCustomerProfile(client, input)` in `src/supabase/rpc.ts`.
- Both RPCs derive the target human from `auth.uid()`; neither accepts a human ID or protected column.

- [ ] **Step 1: Write the failing static and pgTAP tests**

Create `src/security/legalRiskTranche1Migration.test.ts` with migration helpers matching the existing `src/security/supabaseSecurityReview.test.ts` pattern. The first assertions are:

```ts
const latestMigration = readProjectFile(
  "supabase/migrations/20260712115759_legal_risk_tranche1.sql",
);

function extractFunction(sql: string, name: string): string {
  const start = sql.search(
    new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${name}\\s*\\(`, "i"),
  );
  expect(start, `expected ${name} definition`).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf("$$;", start);
  expect(end, `expected ${name} closing delimiter`).toBeGreaterThan(start);
  return sql.slice(start, end + 3);
}

describe("Tranche 1 human write boundary", () => {
  it("leaves the broad customer humans UPDATE policy dropped", () => {
    expect(finalPolicyState("customer_update_own_human", "humans")).toBe("dropped");
  });

  it("exposes only narrow customer profile RPCs", () => {
    const contact = extractFunction(latestMigration, "update_customer_contact_details");
    const completion = extractFunction(latestMigration, "complete_customer_profile");
    expect(contact).toMatch(/update public\.humans/i);
    expect(completion).toMatch(/update public\.humans/i);
    expect(contact).not.toMatch(/approved_at|approved_by|source|signup_submitted_at|archived_at/i);
    expect(completion).not.toMatch(/approved_by|source|signup_submitted_at|archived_at/i);
  });

  it("routes both customer components through the narrow wrappers", () => {
    expect(readProjectFile("src/components/customer/onboarding/ProfileGate.jsx"))
      .toContain("completeCustomerProfile");
    expect(readProjectFile("src/components/customer/CustomerDashboard.jsx"))
      .toContain("updateCustomerContactDetails");
  });
});
```

Create `supabase/tests/100_customer_write_permissions.test.sql` using the repository's `begin; select plan(...); set local role authenticated; set_config('request.jwt.claims', ...); select * from finish(); rollback;` convention. Use synthetic UUIDs. It must prove direct pending-customer updates to `approved_at`, `approved_by`, `source`, `signup_submitted_at` and `archived_at` affect zero rows; booking remains blocked after a forged approval attempt; the narrow RPC changes permitted fields only; and `anon` cannot execute either RPC.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
fnm exec --using=22 npm run test:logic -- src/security/legalRiskTranche1Migration.test.ts
```

Expected: FAIL because the effective policy is still created and the two RPCs/wrappers do not exist.

- [ ] **Step 3: Implement the database boundary**

Append these public interfaces to `20260712115759_legal_risk_tranche1.sql`:

```sql
drop policy if exists "customer_update_own_human" on public.humans;

drop policy if exists "staff_update_humans" on public.humans;
create policy "staff_update_humans" on public.humans
  for update to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

create or replace function public.update_customer_contact_details(
  p_name text,
  p_surname text,
  p_address text,
  p_postcode text default null,
  p_email text default null,
  p_whatsapp boolean default false,
  p_fb text default null,
  p_insta text default null,
  p_tiktok text default null
)
returns table (id uuid, name text, surname text, address text, postcode text,
  email text, whatsapp boolean, fb text, insta text, tiktok text)
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if nullif(trim(coalesce(p_name, '')), '') is null
     or nullif(trim(coalesce(p_surname, '')), '') is null
     or nullif(trim(coalesce(p_address, '')), '') is null then
    raise exception 'profile_fields_required' using errcode = '22023';
  end if;
  return query
  update public.humans h
     set name = trim(p_name), surname = trim(p_surname), address = trim(p_address),
         postcode = nullif(upper(trim(coalesce(p_postcode, ''))), ''),
         email = nullif(trim(coalesce(p_email, '')), ''),
         whatsapp = coalesce(p_whatsapp, false),
         fb = nullif(trim(coalesce(p_fb, '')), ''),
         insta = nullif(trim(coalesce(p_insta, '')), ''),
         tiktok = nullif(trim(coalesce(p_tiktok, '')), '')
   where h.customer_user_id = v_uid
  returning h.id, h.name, h.surname, h.address, h.postcode,
            h.email, h.whatsapp, h.fb, h.insta, h.tiktok;
  if not found then
    raise exception 'no_linked_human' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.complete_customer_profile(
  p_name text, p_surname text, p_address text,
  p_postcode text default null, p_policies_version text default null
)
returns table (id uuid, name text, surname text, address text, postcode text,
  policies_accepted_at timestamptz, policies_version text)
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  v_version text := nullif(trim(coalesce(p_policies_version, '')), '');
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if nullif(trim(coalesce(p_name, '')), '') is null
     or nullif(trim(coalesce(p_surname, '')), '') is null
     or nullif(trim(coalesce(p_address, '')), '') is null
     or v_version is null then
    raise exception 'profile_fields_required' using errcode = '22023';
  end if;
  return query
  update public.humans h
     set name = trim(p_name), surname = trim(p_surname), address = trim(p_address),
         postcode = nullif(upper(trim(coalesce(p_postcode, ''))), ''),
         policies_accepted_at = coalesce(h.policies_accepted_at, now()),
         policies_version = coalesce(h.policies_version, v_version)
   where h.customer_user_id = v_uid
  returning h.id, h.name, h.surname, h.address, h.postcode,
            h.policies_accepted_at, h.policies_version;
  if not found then
    raise exception 'no_linked_human' using errcode = '42501';
  end if;
end;
$$;
```

End each signature with `REVOKE ALL` from `PUBLIC`, `anon`, `authenticated`, followed by `GRANT EXECUTE ... TO authenticated`.

- [ ] **Step 4: Replace the two raw React updates**

Add typed wrappers that send exactly the SQL parameters. `ProfileGate` calls `completeCustomerProfile` without a human ID. `CustomerDashboard` calls `updateCustomerContactDetails`. Preserve existing friendly error handling and success state. Remove each component's `.from("humans").update(...)` chain.

- [ ] **Step 5: Verify GREEN**

Run:

```bash
fnm exec --using=22 npm run test:logic -- src/security/legalRiskTranche1Migration.test.ts
fnm exec --using=22 npm run test:component -- src/components/customer/onboarding
fnm exec --using=22 npm run typecheck
```

Expected: focused tests and type-check pass.

- [ ] **Step 6: Commit Task 1**

```bash
git add supabase/migrations/20260712115759_legal_risk_tranche1.sql supabase/tests/100_customer_write_permissions.test.sql src/security/legalRiskTranche1Migration.test.ts src/supabase/rpc.ts src/components/customer/onboarding/ProfileGate.jsx src/components/customer/CustomerDashboard.jsx
git commit -m "fix(auth): narrow customer profile writes"
```

---

### Task 2: Make dog size staff-authoritative and remove raw customer inserts

**Files:**
- Modify: `src/security/legalRiskTranche1Migration.test.ts`
- Modify: `supabase/tests/100_customer_write_permissions.test.sql`
- Modify: `supabase/migrations/20260712115759_legal_risk_tranche1.sql`
- Modify: `src/supabase/rpc.ts`
- Modify: `src/supabase/repositories/dogsRepo.ts`
- Modify: `src/components/customer/booking/BookingWizard.tsx`
- Modify: `src/components/customer/booking/AddDogInline.tsx`
- Create: `src/components/customer/booking/DogSelection.sizeVerification.component.test.tsx`
- Modify: `src/components/customer/DogsSection.jsx`

**Interfaces:**
- `CustomerDog.size` is authoritative and nullable.
- `CustomerDog.reportedSize` is customer-reported and nullable.
- Existing `create_customer_dog`/`update_customer_dog` signatures remain callable for deployment compatibility, but `p_size` writes only `reported_size`.

- [ ] **Step 1: Extend tests and verify RED**

Static assertions must prove:

```ts
expect(finalPolicyState("customer_insert_own_dogs", "dogs")).toBe("dropped");
const createDog = extractFunction(
  lastDefinitionOf(/create or replace function public\.create_customer_dog/i),
  "create_customer_dog",
);
const createBooking = extractFunction(
  lastDefinitionOf(/create or replace function public\.create_customer_booking_group/i),
  "create_customer_booking_group",
);
expect(createDog).toMatch(/reported_size/i);
expect(createDog).not.toMatch(/insert into public\.dogs[^;]*\(name, breed, size,/i);
expect(createBooking).not.toMatch(/coalesce\([^;]*v_dog_size[^;]*v_in_size/i);
```

Add pgTAP cases proving raw owned-dog insert fails; customer create stores `size is null` and `reported_size='small'`; customer update cannot make reported size authoritative; signup dogs are unverified; repeat/approved signup submission fails; approval fails while an owned dog has no authoritative size; and booking JSON size cannot bypass `dogs.size is null`.

Run the focused static test. Expected: FAIL on every new assertion.

- [ ] **Step 2: Implement authoritative/reported size separation**

Append:

```sql
alter table public.dogs add column if not exists reported_size text;
alter table public.dogs drop constraint if exists dogs_reported_size_check;
alter table public.dogs add constraint dogs_reported_size_check
  check (reported_size is null or reported_size in ('small', 'medium', 'large'));

drop policy if exists "customer_insert_own_dogs" on public.dogs;
drop policy if exists "combined_insert_dogs" on public.dogs;
drop policy if exists "staff_insert_dogs" on public.dogs;
create policy "staff_insert_dogs" on public.dogs
  for insert to authenticated with check ((select public.is_staff()));
```

Reissue these latest effective functions in the same migration:

- `create_customer_dog`: write `reported_size = v_size`, set `size = null`, return both fields.
- `update_customer_dog`: write `reported_size = v_size`; preserve `size` only when neither breed nor reported size changed, otherwise clear `size` for staff reconfirmation; return both fields.
- `submit_customer_signup`: require an unapproved `source='self_signup'` shell with `signup_submitted_at is null`; insert dog JSON size into `reported_size`, not `size`.
- `approve_customer_signup`: reject with `signup_dog_size_unconfirmed` while any non-archived owned dog has `size is null`.
- `create_customer_booking_group`: remove the caller-size fallback and raise `dog_size_unconfirmed` whenever authoritative `dogs.size` is null.

Keep every existing ownership, profile-completeness, approval, pregnancy, calendar, capacity and advisory-lock check from the latest definitions. Reapply explicit grants for every reissued function.

- [ ] **Step 3: Update the customer model and UI**

`dogsRepo.ts` selects/maps `reported_size` to `reportedSize`. `createForHuman` returns `size: null` and the reported value. `BookingWizard` stops `getSizeForBreed` fallback when mapping database dogs. `DogSelection` already disables a null authoritative size; the new component test proves the button remains disabled even when `reportedSize` or breed implies a size.

Change the Add Dog copy from `Size auto-set` to `Estimated size: {size} — we’ll confirm this before online booking.` In `DogsSection`, label non-authoritative display values as `reported {size}` and keep the authoritative value unqualified.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
fnm exec --using=22 npm run test:logic -- src/security/legalRiskTranche1Migration.test.ts
fnm exec --using=22 npm run test:component -- src/components/customer/booking/DogSelection.sizeVerification.component.test.tsx
fnm exec --using=22 npm run typecheck
fnm exec --using=22 npm run check:migrations
```

Expected: all commands pass.

- [ ] **Step 5: Commit Task 2**

```bash
git add supabase/migrations/20260712115759_legal_risk_tranche1.sql supabase/tests/100_customer_write_permissions.test.sql src/security/legalRiskTranche1Migration.test.ts src/supabase/rpc.ts src/supabase/repositories/dogsRepo.ts src/components/customer/booking/BookingWizard.tsx src/components/customer/booking/AddDogInline.tsx src/components/customer/booking/DogSelection.sizeVerification.component.test.tsx src/components/customer/DogsSection.jsx
git commit -m "fix(bookings): require verified dog size"
```

---

### Task 3: Disable unsafe trusted-contact creation

**Files:**
- Create: `src/components/customer/TrustedHumansSection.component.test.jsx`
- Create: `supabase/tests/120_trusted_contact_lock.test.sql`
- Modify: `src/security/legalRiskTranche1Migration.test.ts`
- Modify: `supabase/migrations/20260712115759_legal_risk_tranche1.sql`
- Modify: `src/supabase/rpc.ts`
- Modify: `src/components/customer/TrustedHumansSection.jsx`
- Modify: `src/components/customer/CustomerDashboard.jsx`

**Interfaces:**
- Existing trusted links remain display-only.
- No customer-facing mutation interface exists until a separately approved invitation lifecycle is complete.

- [ ] **Step 1: Write failing tests**

The component test renders one existing contact and asserts their name/relationship remain visible, while `queryByRole('button', {name:/add a trusted human/i})`, phone/name textboxes and the old modal are absent. It asserts the copy `Adding a trusted human online is temporarily unavailable.`

The static test asserts the migration contains:

```sql
drop function if exists public.add_customer_trusted_human(text, text, text, text);
```

It also asserts neither `src/supabase/rpc.ts` nor `TrustedHumansSection.jsx` contains `addCustomerTrustedHuman` or `add_customer_trusted_human`.

The pgTAP file asserts the function is absent, direct customer insertion into `human_trusted_contacts` fails, and no new link row appears.

Run both Vitest files. Expected: FAIL because the RPC and add form still exist.

- [ ] **Step 2: Remove the unsafe surface**

Append the exact `drop function` statement to the migration. Remove `addCustomerTrustedHuman` from `rpc.ts`. Remove the add modal, form state, mutation handler and `onAdded` callback. Keep the existing list rendering and show the neutral unavailable copy beneath it. Remove `onAdded` from the dashboard call site.

- [ ] **Step 3: Verify GREEN**

Run:

```bash
fnm exec --using=22 npm run test:logic -- src/security/legalRiskTranche1Migration.test.ts
fnm exec --using=22 npm run test:component -- src/components/customer/TrustedHumansSection.component.test.jsx
fnm exec --using=22 npm run typecheck
```

Expected: all pass.

- [ ] **Step 4: Commit Task 3**

```bash
git add supabase/migrations/20260712115759_legal_risk_tranche1.sql supabase/tests/120_trusted_contact_lock.test.sql src/security/legalRiskTranche1Migration.test.ts src/supabase/rpc.ts src/components/customer/TrustedHumansSection.jsx src/components/customer/TrustedHumansSection.component.test.jsx src/components/customer/CustomerDashboard.jsx
git commit -m "fix(privacy): disable unsafe trusted-contact linking"
```

---

### Task 4: Replace raw customer cancellation with one atomic RPC

**Files:**
- Create: `supabase/tests/110_customer_cancellation.test.sql`
- Create: `src/supabase/repositories/bookingsRepo.test.ts`
- Create: `src/components/customer/BookingCard.component.test.jsx`
- Modify: `src/security/legalRiskTranche1Migration.test.ts`
- Modify: `supabase/migrations/20260712115759_legal_risk_tranche1.sql`
- Modify: `src/supabase/rpc.ts`
- Modify: `src/supabase/repositories/bookingsRepo.ts`
- Modify: `src/components/customer/BookingCard.jsx`
- Modify: `src/components/customer/CustomerDashboard.jsx`
- Modify: `src/components/customer/booking/BookingWizard.tsx`

**Interfaces:**

```ts
export interface CustomerCancellationReceipt {
  targetBookingId: string;
  bookingGroupId: string | null;
  cancelledBookingIds: string[];
  cancelledCount: number;
  cancelledAt: string;
}

export async function cancelCustomerBooking(
  client: SupabaseClient,
  input: { bookingId: string; reason: string },
): Promise<{ receipt: CustomerCancellationReceipt | null; error: CustomerCancellationError | null }>;
```

- [ ] **Step 1: Write repository, component, static and pgTAP failures**

Repository tests prove only `cancel_customer_booking` is called with `p_booking_id`/`p_reason`; structured RPC errors are preserved; empty/multiple/malformed receipts are failures; one valid row maps to the camel-case receipt.

BookingCard tests prove a network/RLS error retains the form/reason/booking, shows `role=alert` and does not call refresh; `SDC01`/`SDC02` have friendly copy; a valid receipt awaits refresh before closing; refresh failure does not claim the booking disappeared.

Static tests prove the broad `customer_cancel_own_bookings_update` policy is dropped and the final function derives group/owner/settings server-side.

pgTAP proves another customer's booking is rejected, disabled online cancellation is rejected, the Europe/London notice window is enforced, a group cancels atomically, mixed status rolls back, only cancellation fields/trigger-managed timestamps change, raw multi-column update fails and anon cannot execute.

Run repository/component/static tests. Expected: FAIL because the RPC and UI behaviour do not exist.

- [ ] **Step 2: Implement the cancellation function**

Append a SECURITY DEFINER `public.cancel_customer_booking(p_booking_id uuid, p_reason text)` returning `(target_booking_id, booking_group_id, cancelled_booking_ids, cancelled_count, cancelled_at)`. Its body must:

1. require `auth.uid()` and a linked human;
2. trim a 1–500 character reason;
3. resolve and lock the owned target;
4. derive the whole group from the target's stored `group_id`;
5. lock every group row and verify ownership/status before any update;
6. read `customerPortal.allowCancellations` (default true) and `minCancellationHours` (default 24) from `salon_config.settings`;
7. compare the earliest `booking_date + slot` using `Europe/London`;
8. update only `status='Cancelled'` and `cancel_reason`;
9. verify the affected row count and return one receipt.

Use stable codes `SDC01` for disabled online cancellation, `SDC02` for a passed deadline and `SDC03` for a non-cancellable target/group. Drop `customer_cancel_own_bookings_update`, preserve `staff_update_bookings`, revoke public/anon execution and grant authenticated execution.

- [ ] **Step 3: Replace the repository/UI path**

Add the wrapper in `rpc.ts`, replace `cancelMany`/`listIdsInGroup` with `cancelCustomerBooking`, and preserve `code`, `message`, `details` and `hint` on errors.

BookingCard closes and clears only after a valid receipt and awaited `onBookingChanged`. On RPC failure it keeps the form open. On refresh failure after a committed cancellation it says `Your cancellation was saved, but we couldn't refresh your bookings. Refresh the page to see the latest status.`

CustomerDashboard exposes a Promise-returning refresh callback. BookingWizard passes only `rescheduleFrom.id`. If the replacement insert succeeds but cancellation fails, show `Your new booking was created, but the original booking could not be cancelled. Please contact the salon so we can fix this.` Do not show the generic create-failure message for that partial success.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
fnm exec --using=22 npm run test:logic -- src/security/legalRiskTranche1Migration.test.ts src/supabase/repositories/bookingsRepo.test.ts
fnm exec --using=22 npm run test:component -- src/components/customer/BookingCard.component.test.jsx
fnm exec --using=22 npm run typecheck
fnm exec --using=22 npm run check:migrations
```

Expected: all pass.

- [ ] **Step 5: Commit Task 4**

```bash
git add supabase/migrations/20260712115759_legal_risk_tranche1.sql supabase/tests/110_customer_cancellation.test.sql src/security/legalRiskTranche1Migration.test.ts src/supabase/rpc.ts src/supabase/repositories/bookingsRepo.ts src/supabase/repositories/bookingsRepo.test.ts src/components/customer/BookingCard.jsx src/components/customer/BookingCard.component.test.jsx src/components/customer/CustomerDashboard.jsx src/components/customer/booking/BookingWizard.tsx
git commit -m "fix(bookings): make customer cancellation atomic"
```

---

### Task 5: Tranche verification and non-production handoff

**Files:**
- Create: `docs/superpowers/runbooks/2026-07-12-legal-risk-tranche1-rollout.md`
- Modify: `.superpowers/sdd/progress.md` (ignored execution ledger only)

**Interfaces:**
- The runbook contains migration order, synthetic smoke checks, rollback-by-disable instructions and explicit production stop points.

- [ ] **Step 1: Attempt database tests and record the environment result**

Run:

```bash
fnm exec --using=22 npm run test:db
```

Current expected local result: the Supabase CLI cannot connect to `/var/run/docker.sock`. Record this as unexecuted database behavioural evidence, not a passing test.

- [ ] **Step 2: Run the complete local verification gate**

Run fresh:

```bash
fnm exec --using=22 npm run lint
fnm exec --using=22 npm run typecheck
fnm exec --using=22 npm run check:migrations
fnm exec --using=22 npm test
fnm exec --using=22 npm run build
```

Expected: every command exits zero, with 0 failed Vitest tests.

- [ ] **Step 3: Write the non-production runbook**

Document:

- the single migration path and its required pre-frontend order;
- synthetic role/RPC smoke checks for B-01, H-01, H-02 and H-06;
- the count-only historical review queries that must not be run in this task;
- the fact that existing trusted links are retained and creation is disabled;
- the unresolved atomic-reschedule follow-up;
- rollback by disabling affected customer controls, never by restoring broad RLS;
- `src/supabase/database.types.ts` regeneration after an authorised schema application;
- explicit stop before production application.

- [ ] **Step 4: Commit the runbook**

```bash
git add docs/superpowers/runbooks/2026-07-12-legal-risk-tranche1-rollout.md
git commit -m "docs: add tranche 1 rollout safeguards"
```

- [ ] **Step 5: Request whole-branch review**

Generate a review package from `10f574e` to `HEAD`, dispatch the final code reviewer, resolve every Critical/Important finding, rerun the full verification gate and stop without pushing or applying the migration.

## Self-Review Results

- **Spec coverage:** B-01 maps to Task 1; H-01 to Task 2; H-02 to Task 3; H-06 to Task 4; verification and stop boundaries to Task 5.
- **Placeholder scan:** The plan contains no unfinished implementation marker. Production-only activities are explicit stop conditions, not missing plan content.
- **Type consistency:** `cancelCustomerBooking` and `CustomerCancellationReceipt` have one signature across RPC wrapper, repository and callers. Dog `size` is authoritative; `reportedSize` is non-authoritative throughout.
- **Scope:** Trusted invitations, atomic rescheduling and production data review remain explicitly outside this release-lock tranche; the unsafe paths are disabled or fail-visible now.
