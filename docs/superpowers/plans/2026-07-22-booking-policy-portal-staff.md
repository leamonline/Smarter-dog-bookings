# Booking Policy Portal and Staff Workflows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the customer website and staff application onto the visit-level booking policy, with server-owned actionability, whole-visit changes, manual approval/deposit handling and audited staff discretion.

**Architecture:** PostgreSQL exposes customer-safe visit projections and idempotent visit commands created by the foundation plan. React renders those server decisions instead of recalculating deadlines. Customer screens group one or more dog rows into a single dated visit; staff screens expose explicit approval, proposal, deposit, money and incident decisions while ordinary grooming status remains on each dog booking.

**Tech Stack:** React 19, TypeScript 6 and JavaScript, the repository's existing hooks/subscriptions, Supabase JS 2/PostgreSQL 15, Vitest 4 with Testing Library, Playwright.

## Global Constraints

- Prerequisite: complete `docs/superpowers/plans/2026-07-22-booking-policy-foundation.md` with `previous_day_1500_v1` still inactive.
- Add one server-backed runtime hook and keep the currently deployed customer/staff/settings surfaces active while runtime is `inactive` or `scheduled`. New v1 screens/commands switch together only when the server returns `active`; pre-activation code may read dual-written visits for diagnostics but cannot change customer-visible behaviour.
- Source of truth: `docs/superpowers/specs/2026-07-22-booking-cancellation-rescheduling-policy-design.md`.
- Start in the same isolated worktree and branch as the foundation work. Rebase that worktree on current `origin/main` before implementation begins.
- Never calculate whether a customer may cancel or reschedule in React. Render the capability and reason returned by PostgreSQL.
- Never group a visit using `group_id` alone. Read and mutate by `booking_visits.id`.
- Never send one visit-level outcome per dog. UI receipts and later notifications use the single visit outcome key.
- Upcoming visits are always visible. Only history, cancellation, rescheduling and repeat booking have customer-portal switches.
- Keep the existing general onboarding Terms acceptance. Add booking-level acceptance only when a deposit is required.
- An unconfirmed request can be withdrawn at any time and cannot create an incident.
- An overdue, unchecked deposit remains `Waiting for staff approval`/`Deposit check due`; it never releases capacity automatically.
- Preserve existing user changes and migrate call sites before adding any direct-write barrier.
- After each migration tranche, regenerate local Supabase TypeScript definitions to a temporary file, review the diff and replace `src/supabase/database.types.ts` through the repository's generated-file workflow before dependent code is considered complete.
- Do not activate the new policy, apply production migrations or contact customers in this plan.
- Use UK English for UI copy, fixtures and errors.

---

### Task 1: Add safe visit projections and staff attention queues

**Files:**
- Create: `supabase/migrations/20260722180000_booking_policy_projections.sql`
- Create: `supabase/tests/170_booking_policy_projections.test.sql`
- Create: `src/security/bookingPolicyProjectionsMigration.test.ts`
- Modify: `src/supabase/repositories/bookingPolicyRepo.ts`
- Modify: `src/supabase/repositories/bookingPolicyRepo.test.ts`
- Modify: `src/supabase/database.types.ts`

**Interfaces:**
- `list_customer_booking_visits()` returns owned visits, nested dog rows, deposit summary and server capabilities without incident details.
- `list_staff_booking_policy_attention()` returns every open approval, alternative, deposit-check, deposit/service-prepayment reconciliation, threshold-review and refund queue item regardless of appointment/due date; optional date-scoped metrics use a separate projection and cannot hide unresolved work.
- `list_staff_booking_visit(uuid)` returns the complete staff audit view, including the visit-level bill summary and its one applied deposit part-payment.
- All three functions return stable field names consumed by `src/types/bookingPolicy.ts`.

- [ ] **Step 1: Write failing role and projection tests**

The pgTAP file must prove:

- a customer sees every own upcoming visit even when the old `showUpcoming` JSON setting is false;
- a customer cannot see another human's visit, incident count, staff note, staff verification reference or audit actor;
- `show_customer_history=false` hides only resolved terminal history; a past-start waiting approval/deposit/reconciliation/refund or pending-change item remains visible and actionable until resolved;
- a multi-dog visit is one projection with deterministic dog ordering;
- capabilities contain exact `deadline_at`, switches, remaining moves and a machine-readable `block_reason`;
- unconfirmed requests expose `withdraw=true` regardless of the deadline;
- a confirmed source with a pending reschedule exposes only its owned structured destination, held/not-held truth and `withdraw_pending_change=true`; it never appears as an unconfirmed replacement;
- the staff queue includes overdue deposits without changing visit or capacity state.

- [ ] **Step 2: Pin the repository decoder first**

Add a test fixture with this exact public shape:

```ts
export interface CustomerBookingVisitProjection {
  id: string;
  revision: number;
  bookingDate: string;
  lifecycleState: VisitLifecycleState;
  approvalState: VisitApprovalState;
  confirmationState: VisitConfirmationState;
  policyCode: BookingPolicyCode | null;
  deadlineAt: string | null;
  isLastMinute: boolean;
  termsPublication: null | {
    id: string;
    publicUrl: string;
    version: string;
  };
  dogs: Array<{
    bookingId: string;
    dogId: string;
    dogName: string;
    slot: string;
    serviceLabel: string;
    addOnLabels: string[];
  }>;
  deposit: CustomerDepositSummary | null;
  pendingChange: null | {
    requestId: string;
    status: "pending_staff" | "waiting_customer";
    staffReviewReason: "auto_confirm_disabled_staff_review" | "destination_last_minute_staff_review" | "staff_alternative";
    requestedBookingDate: string;
    slots: string[];
    capacityHeld: boolean;
    destinationHash: string;
    proposalId: string | null;
    proposalRevision: number | null;
  };
  capabilities: BookingVisitCapabilities;
}
```

For an owned `awaiting_payment` visit, `CustomerDepositSummary` may include the snapshotted account name, sort code, account number and that visit's unique customer payment reference. `awaiting_terms` exposes the amount and the visit's snapshotted Terms publication prompt but not payment instructions until acceptance. It never includes another visit's reference, staff verification reference, content hash or bank receipt evidence; payment instructions disappear once they are no longer actionable.

Reject the whole payload when a visit or capability is malformed; do not silently fall back to row-level actions.

- [ ] **Step 3: Implement security-definer projections**

`list_customer_booking_visits()` derives the human from `auth.uid()`, uses explicit columns, has `set search_path = public, pg_temp`, and grants execute only to `authenticated`. The history switch filters only resolved terminal past records; it can never hide a past-start unconfirmed request, open change, deposit/reconciliation or refund action. It returns only `recent_booking_history` or `staff_applied_requirement` for a required deposit. The UI renders plain language such as `A £10 deposit is needed because of recent booking history` or `The team has applied a £10 deposit requirement to this booking`; it never returns incident kinds, counts, dates, notes or evidence.

`list_staff_booking_policy_attention()` calls the existing staff-role assertion, returns aggregate counts and visit IDs, and computes `deposit_check_due` as `state in ('awaiting_terms','awaiting_payment') and due_at <= statement_timestamp()`. It also derives pending and overdue refunds from immutable `refund_due` events and their snapshotted due times. Open rows are not filtered by a Today/date-range lower bound: add fixtures for an approval still open after appointment start and a refund/reconciliation item several months old. It must not write anything. `list_staff_booking_visit()` exposes the current visit revision plus every mutable request and incident revision; repository decoders reject missing/non-integer revisions, and staff mutation tests require `stale_review` after a concurrent edit. PgTAP covers equality for both unresolved deposit states and the exact refund SLA boundary.

- [ ] **Step 4: Run the focused checks**

Run:

```bash
npx supabase gen types typescript --local > /tmp/smarter-dog-database.types.ts
diff -u src/supabase/database.types.ts /tmp/smarter-dog-database.types.ts || true
cp /tmp/smarter-dog-database.types.ts src/supabase/database.types.ts
npm run typecheck
npx supabase gen types typescript --local > /tmp/smarter-dog-database.types.verify.ts
cmp -s src/supabase/database.types.ts /tmp/smarter-dog-database.types.verify.ts
npm run test:logic -- src/security/bookingPolicyProjectionsMigration.test.ts src/supabase/repositories/bookingPolicyRepo.test.ts
npm run test:db
```

Expected: role, privacy, grouping and decoder tests PASS.

- [ ] **Step 5: Commit the projections**

```bash
git add supabase/migrations/20260722180000_booking_policy_projections.sql supabase/tests/170_booking_policy_projections.test.sql src/security/bookingPolicyProjectionsMigration.test.ts src/supabase/repositories/bookingPolicyRepo.ts src/supabase/repositories/bookingPolicyRepo.test.ts src/supabase/database.types.ts
git commit -m "feat: add booking visit projections"
```

---

### Task 2: Make Booking Rules settings authoritative end to end

**Files:**
- Modify: `src/constants/salonSettings.ts`
- Modify: `src/constants/salonSettings.test.ts`
- Modify: `src/types/index.ts`
- Modify: `src/supabase/transforms.ts`
- Modify: `src/supabase/transforms.test.ts`
- Modify: `src/supabase/hooks/useSalonConfig.js`
- Modify: `src/supabase/hooks/useSalonConfig.component.test.jsx`
- Create: `src/supabase/hooks/useBookingPolicyRuntime.ts`
- Create: `src/supabase/hooks/useBookingPolicyRuntime.component.test.tsx`
- Modify: `src/components/views/SettingsView.jsx`
- Modify: `src/components/views/SettingsView.component.test.jsx`
- Modify: `src/components/views/settings/BookingRulesSettings.jsx`
- Modify: `src/components/views/settings/CustomerPortalSettings.jsx`
- Modify: `src/components/views/settings/BusinessSettings.component.test.jsx`
- Modify: `e2e/settings-tabs.spec.ts`

**Interfaces:**
- Reads `current_booking_rules()` and saves with `update_booking_rules(jsonb)`.
- `BookingPolicySettings` contains `bookingHorizonDays`, `autoConfirm`, `depositHoldHours`, `depositBank`, `termsUrl`, `depositTermsVersion`, `depositTermsContentHash` and four customer-portal switches.

- [ ] **Step 1: Replace settings fixtures with the signed contract**

Tests must expect:

```ts
const bookingPolicySettings = {
  bookingHorizonDays: 180,
  autoConfirm: true,
  depositHoldHours: 12,
  depositBank: {
    accountName: "Smarter Dog",
    sortCode: "12-34-56",
    accountNumber: "12345678",
  },
  termsUrl: "https://smarterdog.co.uk/terms",
  depositTermsVersion: "2026-07-22",
  depositTermsContentHash: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  customerPortal: {
    allowCancellations: true,
    allowRescheduling: true,
    allowRepeatBooking: false,
    showHistory: true,
  },
};
```

Delete expectations for `advanceBookingWeeks`, `minCancellationHours` and `showUpcoming` only after the new tests are red.

- [ ] **Step 2: Route reads and saves through the typed RPCs**

Keep general salon configuration on the existing hook, but add `bookingRules`, `bookingRulesLoading` and `updateBookingRules`. A failed policy save leaves the last confirmed values on screen and shows the server error; it must not optimistically claim success.

Confine legacy JSON reads to an explicit runtime-legacy adapter used only while inactive/scheduled; v1 code may not read them. Leave compatibility serialisation until post-activation telemetry proves old clients have aged out.

`useBookingPolicyRuntime` calls `booking_policy_runtime_status()` and exposes `inactive|scheduled|failed|active` plus its customer-safe scheduled instant. It polls/subscribes at a low rate in every non-active state and refetches on focus, visibility and reconnect, so a tab opened before the owner schedules activation can observe `inactive→scheduled→active` or `scheduled→failed` without reload. When scheduled, it additionally sets a local wake-up for the instant, polls tightly around the boundary and invalidates customer/staff policy queries only when the server returns active; browser clock alone never authorises an action. `failed` renders the characterised legacy runtime plus a neutral staff-only setup warning and never v1 controls. Test an already-open inactive tab observing a later schedule, a tab opened hours before midnight switching, a failed attempt, and a sleeping/offline tab refetching on visibility/focus/online. While inactive/scheduled/failed, `SettingsView` keeps current legacy controls operational and presents v1 bank/Terms/other values in a clearly labelled `Upcoming policy` owner setup section so readiness can be completed; saving v1 configuration cannot alter legacy runtime. At active, remove the legacy controls from the rendered surface without requiring a new deployment.

- [ ] **Step 3: Rebuild the two settings panels**

`BookingRulesSettings.jsx` must show:

- booking horizon as whole days, default `180`, with the server/UI technical safety range `1..730`;
- auto-confirm switch;
- read-only `Customer changes close at 3:00 pm on the previous calendar day`;
- deposit hold select with only `6`, `12`, `24`, `36`, `48` and `12` selected by default;
- account name, sort code and account number saved together or rejected together;
- HTTPS full Terms URL, the published deposit Terms version and lowercase SHA-256 content hash used to create the immutable booking-level publication snapshot;
- an explicit warning when deposit-dependent booking is blocked by incomplete bank details or an incomplete Terms publication pair.

`CustomerPortalSettings.jsx` must always describe upcoming visits as visible and provide separate switches for cancellation, rescheduling, repeat booking and past history. It must not render a `Show upcoming bookings` switch.

- [ ] **Step 4: Prove one save changes the next runtime read**

In component and Playwright tests, save each control, refetch `current_booking_rules()`, reload the settings route and assert the saved value. Include server rejection for horizon `0`/`731`, a partial bank account, a deposit window outside the exact choice set, a version without a content hash and a malformed hash. Prove changing to a second publication affects only later previews/visits; an existing hold continues to render its original URL/version.

- [ ] **Step 5: Run and commit**

```bash
npm run test:logic -- src/constants/salonSettings.test.ts src/supabase/transforms.test.ts
npm run test:component -- src/supabase/hooks/useSalonConfig.component.test.jsx src/supabase/hooks/useBookingPolicyRuntime.component.test.tsx src/components/views/SettingsView.component.test.jsx src/components/views/settings/BusinessSettings.component.test.jsx
npx playwright test e2e/settings-tabs.spec.ts
npm run typecheck
```

Expected: all policy settings round-trip and invalid saves remain unsaved.

```bash
git add src/constants/salonSettings.ts src/constants/salonSettings.test.ts src/types/index.ts src/supabase/transforms.ts src/supabase/transforms.test.ts src/supabase/hooks/useSalonConfig.js src/supabase/hooks/useSalonConfig.component.test.jsx src/supabase/hooks/useBookingPolicyRuntime.ts src/supabase/hooks/useBookingPolicyRuntime.component.test.tsx src/components/views/SettingsView.jsx src/components/views/SettingsView.component.test.jsx src/components/views/settings/BookingRulesSettings.jsx src/components/views/settings/CustomerPortalSettings.jsx src/components/views/settings/BusinessSettings.component.test.jsx e2e/settings-tabs.spec.ts
git commit -m "feat: enforce booking policy settings"
```

---

### Task 3: Replace row-level customer appointments with visit cards

**Files:**
- Modify: `src/CustomerApp.jsx`
- Modify: `src/components/customer/CustomerDashboard.jsx`
- Modify: `src/components/customer/AppointmentsSection.jsx`
- Modify: `src/components/customer/BookingCard.jsx`
- Modify: `src/components/customer/BookingCard.component.test.jsx`
- Modify: `src/components/customer/BookingCard.deposit.component.test.jsx`
- Create: `src/components/customer/VisitPolicyActions.jsx`
- Create: `src/components/customer/VisitPolicyActions.component.test.tsx`
- Create: `src/components/customer/CustomerCreditCard.tsx`
- Create: `src/components/customer/CustomerCreditCard.component.test.tsx`
- Create: `src/supabase/hooks/useCustomerBookingVisits.ts`
- Create: `src/supabase/hooks/useCustomerBookingVisits.component.test.tsx`
- Create: `src/supabase/hooks/useCustomerCredit.ts`
- Create: `src/supabase/hooks/useCustomerCredit.component.test.tsx`
- Modify: `src/supabase/repositories/bookingPolicyRepo.ts`
- Modify: `src/supabase/repositories/bookingPolicyRepo.test.ts`
- Modify: `src/supabase/database.types.ts`

- [ ] **Step 1: Write visit grouping and capability tests**

Pin these render states before changing the component:

| Projection | Customer card |
|---|---|
| Confirmed and on time | Exact deadline plus enabled server-approved actions |
| Confirmed and late | Appointment remains booked, no Cancel/Reschedule, `Message the team` |
| Waiting staff | `Waiting approval by staff` and Withdraw |
| Alternative pending | Proposed date/details and Accept/Withdraw |
| Awaiting deposit | £10 terms/payment instructions, due time, Withdraw |
| Staff-only deposit check due | Customer still sees `Waiting approval by staff`, no overdue/expiry threat, Withdraw |
| Pending change | Original visit plus desired destination, held/not-held truth and Withdraw change |
| Declined/withdrawn | Outcome and customer-facing reason, no incident language |

Every visit card lists all affected dogs. Incident counts, internal reasons and staff overrides must be absent.

Add account-level credit fixtures for available £10, credit reserved against a pending visit, refund requested/pending and refund paid. A customer sees only totals, the applicable visit label and refund due date; no staff actor, incident reason or raw ledger detail is exposed. Requesting a refund reserves the selected credit immediately so it cannot also fund a deposit, writes no automatic bank payment, and is idempotent.

- [ ] **Step 2: Add one customer visit query hook**

Use `bookingPolicyRepo.listCustomerBookingVisits()` behind one existing-style hook cache scoped by authenticated user. After every successful receipt, invoke that hook's explicit refetch plus the existing availability refetch callbacks; clear user-scoped state on auth change. Do not introduce a new query framework or combine raw `bookings` rows in the browser.

`useCustomerCredit` calls the owned `get_customer_credit_balance()` projection and exposes available, reserved and pending-refund pence. `CustomerCreditCard` remains visible while any amount exists; `Request refund` calls `request_customer_credit_refund` with a stable UUID, confirms the amount and server-returned five-working-day due date, then invokes the credit and visit hooks' explicit refetch callbacks. An unsettled account-credit refund exposes `Cancel refund request`, which calls `cancel_customer_credit_refund`; it never appears for a deposit refund and races staff settlement safely. Applied or staff-verified refunded amounts disappear only when the authoritative projection changes. Fixtures assert available/reserved/pending totals across request, cancel and paid settlement without double deduction.

- [ ] **Step 3: Switch to visits only when runtime becomes active and preserve general onboarding Terms**

After the existing profile/onboarding gate, use `useBookingPolicyRuntime`: inactive/scheduled renders the characterised legacy dashboard/actions unchanged; active routes through the visit projection. An in-progress legacy mutation that crosses the instant must obey the server response, refetch runtime and restart on the v1 screen rather than retrying stale payloads. Do not remove or weaken the existing general Terms acceptance in the onboarding flow. V1 `AppointmentsSection` separates upcoming, `Action needed` and permitted resolved history. Past-start waiting approval/deposit/reconciliation/refund/change records remain in `Action needed` regardless of `showHistory`; the switch hides only resolved terminal history. Upcoming is never hidden. Add component and E2E fixtures for a hidden-history account with each unresolved past-start state.

- [ ] **Step 4: Run component checks and commit**

```bash
npm run test:component -- src/components/customer/BookingCard.component.test.jsx src/components/customer/BookingCard.deposit.component.test.jsx src/components/customer/VisitPolicyActions.component.test.tsx src/components/customer/CustomerCreditCard.component.test.tsx src/supabase/hooks/useCustomerBookingVisits.component.test.tsx src/supabase/hooks/useCustomerCredit.component.test.tsx
npm run test:logic -- src/supabase/repositories/bookingPolicyRepo.test.ts
npm run typecheck
```

Expected: one card and one action set per visit, including multi-dog fixtures.

```bash
git add src/CustomerApp.jsx src/components/customer/CustomerDashboard.jsx src/components/customer/AppointmentsSection.jsx src/components/customer/BookingCard.jsx src/components/customer/BookingCard.component.test.jsx src/components/customer/BookingCard.deposit.component.test.jsx src/components/customer/VisitPolicyActions.jsx src/components/customer/VisitPolicyActions.component.test.tsx src/components/customer/CustomerCreditCard.tsx src/components/customer/CustomerCreditCard.component.test.tsx src/supabase/hooks/useCustomerBookingVisits.ts src/supabase/hooks/useCustomerBookingVisits.component.test.tsx src/supabase/hooks/useCustomerCredit.ts src/supabase/hooks/useCustomerCredit.component.test.tsx src/supabase/repositories/bookingPolicyRepo.ts src/supabase/repositories/bookingPolicyRepo.test.ts
git commit -m "feat: show customer appointments as visits"
```

---

### Task 4: Enforce the booking horizon, approval and deposit journey

**Files:**
- Modify: `src/components/customer/booking/DateSelection.tsx`
- Modify: `src/components/customer/booking/DateSelection.component.test.tsx`
- Modify: `src/components/customer/booking/DateSelection.fullday.component.test.tsx`
- Modify: `src/components/customer/booking/DateSelection.lastminute.component.test.tsx`
- Modify: `src/components/customer/booking/SlotSelection.tsx`
- Modify: `src/components/customer/booking/SlotSelection.rules.component.test.tsx`
- Modify: `src/components/customer/booking/BookingWizard.tsx`
- Modify: `src/components/customer/booking/BookingConfirmation.tsx`
- Modify: `src/components/CustomerUnavailablePage.jsx`
- Create: `src/components/CustomerUnavailablePage.component.test.jsx`
- Create: `src/components/customer/booking/DepositTermsStep.tsx`
- Create: `src/components/customer/booking/DepositTermsStep.component.test.tsx`
- Create: `src/components/customer/booking/BookingOutcome.component.test.tsx`
- Modify: `src/supabase/repositories/bookingsRepo.ts`
- Modify: `src/supabase/repositories/bookingsRepo.test.ts`

- [ ] **Step 1: Replace the 28-day fixture with an inclusive configured horizon**

Test day `+180` selectable and day `+181` absent when the server returns `180`. Exercise real repository calls to runtime-aware `get_open_days`, `get_blocked_seats` and `get_occupancy_range`, not only a longer rendered array; remove the stale 92-day assumption comment. Verify the same horizon is used for a new booking, repeat booking and reschedule destination. Staff-only booking remains able to request an audited override through staff commands.

- [ ] **Step 2: Preview the server decision and pin every submission receipt**

The wizard must handle exactly:

- `confirmed`: show all dogs, date/time, the server-rendered applied policy/deadline, Terms link and deposit/credit result; use 3:00 pm copy only for v1 and preserve the stored rolling deadline for legacy visits;
- `waiting_staff`: show that the slot is held and staff will approve or decline, with Withdraw available on the dashboard;
- `awaiting_payment`: show one £10 visit deposit, bank details, exact due time and `I accept the deposit terms` recorded before creation;
- `blocked/deposit_setup_incomplete`: show no booking/slot success language or commercial IDs, explain that the team needs to complete setup and offer a neutral contact route; the committed staff alert remains server-owned.

Call `preview_customer_booking_visit` after date/slot selection so a deposit-required auto-confirm journey shows the exact current immutable Terms publication and retains its opaque publication ID for submit. Treat the preview as advisory: a changed publication/capacity/policy returns `stale_review` and requires the new Terms to be shown and accepted. It must never show `All booked in` for an unconfirmed request.

- [ ] **Step 3: Submit only through `create_customer_booking_visit`**

Generate a UUID once per user submission and reuse it for retries. Send dog/service/add-on selections, but never send a claimed customer ID, request timestamp, policy, incident count or deposit requirement. The server receipt controls the result screen.

When the visit requires staff approval, the hold clock does not begin until staff approve. If the preview shows that account history/override would require a deposit, the website may let the customer pre-accept the displayed publication ID and explicitly reserve existing credit; the request receipt must say the credit is reserved, not spent. Withdrawal/decline or an approval-time exemption releases it. Otherwise, staff approval returns `awaiting_terms`, snapshots `due_at` and the then-current Terms publication, and exposes a dashboard continuation—not a wizard success state. The customer then uses website `DepositTermsStep` for that snapshot; acceptance changes it to `awaiting_payment` without restarting/extending the due time, and neither staff nor WhatsApp can tick it for them. Explicit allocation of sufficient non-expiring credit may satisfy and confirm the deposit in that same website action.

- [ ] **Step 4: Preserve the signed same-day and last-minute rules**

Same-day self-booking remains limited to staff-released slots at least 30 minutes away. A next-day request after 15:00 enters staff approval rather than auto-confirming. Same-day and actual last-minute receipts show `No deposit required` and no self-service change controls after confirmation. An advance `insufficient_window` exemption also shows `No deposit required`, but is **not** last-minute and retains the normal enabled cancel/reschedule controls until its 3:00 pm deadline. Add separate server-capability and component fixtures so these states cannot be collapsed.

When the audited emergency intake control is false, hide/disable new, repeat and reschedule-destination entry and render `CustomerUnavailablePage` with a neutral contact-the-team message. Existing visit withdrawal and enabled on-time cancellation remain reachable.

- [ ] **Step 5: Run focused tests and commit**

```bash
npm run test:component -- src/components/customer/booking/DateSelection.component.test.tsx src/components/customer/booking/DateSelection.fullday.component.test.tsx src/components/customer/booking/DateSelection.lastminute.component.test.tsx src/components/customer/booking/SlotSelection.rules.component.test.tsx src/components/customer/booking/DepositTermsStep.component.test.tsx src/components/customer/booking/BookingOutcome.component.test.tsx src/components/CustomerUnavailablePage.component.test.jsx
npm run test:logic -- src/supabase/repositories/bookingsRepo.test.ts
npm run typecheck
```

Expected: horizon, idempotency and all three outcomes PASS.

```bash
git add src/components/customer/booking/DateSelection.tsx src/components/customer/booking/DateSelection.component.test.tsx src/components/customer/booking/DateSelection.fullday.component.test.tsx src/components/customer/booking/DateSelection.lastminute.component.test.tsx src/components/customer/booking/SlotSelection.tsx src/components/customer/booking/SlotSelection.rules.component.test.tsx src/components/customer/booking/BookingWizard.tsx src/components/customer/booking/BookingConfirmation.tsx src/components/CustomerUnavailablePage.jsx src/components/CustomerUnavailablePage.component.test.jsx src/components/customer/booking/DepositTermsStep.tsx src/components/customer/booking/DepositTermsStep.component.test.tsx src/components/customer/booking/BookingOutcome.component.test.tsx src/supabase/repositories/bookingsRepo.ts src/supabase/repositories/bookingsRepo.test.ts
git commit -m "feat: add policy-aware customer booking outcomes"
```

---

### Task 5: Implement customer cancellation, withdrawal, rescheduling and repeat booking

**Files:**
- Create: `supabase/migrations/20260722181000_booking_policy_conversation_pause.sql`
- Create: `supabase/tests/172_booking_policy_conversation_pause.test.sql`
- Create: `src/security/bookingPolicyConversationPauseMigration.test.ts`
- Modify: `src/components/customer/BookingCard.jsx`
- Modify: `src/components/customer/BookingCard.component.test.jsx`
- Modify: `src/components/customer/booking/BookingWizard.tsx`
- Modify: `src/components/customer/booking/BookingWizard.partialReschedule.component.test.tsx`
- Create: `src/components/customer/VisitChangeDialog.tsx`
- Create: `src/components/customer/VisitChangeDialog.component.test.tsx`
- Create: `src/components/customer/MessageTeamDialog.tsx`
- Create: `src/components/customer/MessageTeamDialog.component.test.tsx`
- Modify: `src/supabase/repositories/bookingPolicyRepo.ts`
- Modify: `src/supabase/repositories/bookingPolicyRepo.test.ts`

**Interfaces:**
- Produces authenticated `submit_customer_late_booking_message(uuid,text,text,uuid)` and the private atomic request/contact/inbox/pause core that later WhatsApp service wrappers reuse.
- Adds authoritative human-scoped `booking_automation_pauses`, nullable conversation projection/audit fields and staff-only resolve/resume commands; it does not send a message automatically.

- [ ] **Step 1: Write blocked-action and whole-visit tests**

Tests must prove:

- Cancel and Reschedule appear only when their separate server capabilities allow them;
- exact 15:00 succeeds and the next instant returns a blocked receipt without local mutation;
- cancellation preview lists every dog and source revision, reason is optional with `Prefer not to say`, and a staff edit before submit forces refetch/reconfirmation;
- a paid on-time cancellation requires Refund or Credit and records the explicit choice;
- a visit with additional paid-in-full/part-paid service money returns `financial_review_required`, remains booked with all money evidence intact and routes to staff instead of refunding only £10;
- a reschedule preview displays the destination policy/deadline and returns the mandatory review ID; missing/expired/mismatched review is re-previewed before submit;
- a reschedule changes date/slots only, preserves dogs/services/add-ons/price/deposit and reports remaining moves;
- when auto-confirm is disabled, the original remains confirmed while one pending change visibly holds destination capacity; customer withdrawal closes only that change and releases the hold;
- an on-time next-day destination requested after 15:00 leaves the original confirmed, shows that staff review is required and that the destination is **not held**;
- the fourth customer move is blocked;
- a failed replacement leaves the source active;
- Withdraw remains available after the deadline while unconfirmed and never mentions incidents;
- Repeat booking starts a new lineage and obeys its independent switch/horizon.
- an Alternative pending new-booking visit can be accepted only by its owning customer through `accept_customer_booking_visit_proposal`; a reschedule counterproposal uses the separate `accept_customer_booking_change_proposal`, keeps the confirmed source booked until that atomic acceptance and consumes no reschedule;
- a switch-disabled after-cutoff website action still routes through the late `Message the team` state, and an on-time request processed after appointment start cannot mutate automatically;
- the website late-message command commits the customer contact event, inbox message, one staff request/attention item and automation pause together; duplicate submission replays one receipt and a forced failure rolls everything back.

- [ ] **Step 2: Use one dialog for irreversible visit outcomes**

`VisitChangeDialog` receives the visit projection and requested action. For cancellation, call `preview_customer_cancel_visit` when the dialog opens, show that server-returned dog list/money choices and submit its review ID; a stale result closes the confirmation step, refetches and makes the customer review the changed visit again. For rescheduling, launch `BookingWizard` in locked-content mode: dog, service, add-on and price steps are read-only; only date and slot assignments can change. After destination selection it calls `preview_customer_reschedule_visit`, displays the server-returned destination deadline/policy—including v1 copy for a legacy→v1 move—and stores the opaque review ID. Submit passes the same date/assignments/review ID; expiry or any revision/settings mismatch triggers a fresh preview and explicit re-confirmation rather than a silent retry.

On an RPC `blocked` result, refetch the visit and render the authoritative explanation. `financial_review_required` says the appointment remains booked and the team must review the additional payment; it never claims a deposit-only refund completed. Never create the replacement first in client code.

When reschedule returns `change_waiting_staff`, `BookingCard` retains the original date/actionable visit and adds a subordinate pending-change panel with requested date/slots, reason-specific copy and `Slot held` or `Requested slot is not held`. It says no move has yet occurred. `Withdraw change request` calls only `withdraw_customer_booking_change_request`; it must never call the visit-withdraw or cancel command. When staff counterpropose, the same panel shows that alternative while the original remains booked.

For an unconfirmed new-booking `alternative_pending` card, `VisitPolicyActions` exposes Accept proposal and Withdraw. Accept calls `accept_customer_booking_visit_proposal`. For a confirmed-source reschedule counterproposal it calls `accept_customer_booking_change_proposal` instead. Both submit the exact displayed proposal ID/revision/destination hash plus one stable idempotency UUID, show the proposed date/all dogs and, when required, the displayed Terms publication ID plus explicit credit allocation before submitting. A reproposal or a changed current publication before eligibility returns `stale_review` and must be shown again; it cannot accept a new slot or unseen Terms from an old card. Once the accepted visit enters `awaiting_terms`, it renders that visit's snapshot even if Settings changes. Render only the authoritative confirmed/awaiting payment result. There is no staff-side accept control.

- [ ] **Step 3: Add the after-deadline team route**

First create `20260722181000_booking_policy_conversation_pause.sql`. Add authoritative `booking_automation_pauses` with one open pause per human, immutable trigger/reason/time and staff resolution audit, plus `booking_automation_pause_items` linking every late request or unresolved attention item/visit/event into that pause. A second late change for another visit appends an item to the same open pause; it does not overwrite a scalar request/visit. Application roles cannot read or write either table directly; every inbound/automated channel calls the security-definer active-pause guard after resolving the human and before routing. Add `policy_pause_reason`, `policy_paused_at`, `policy_pause_event_id`, `policy_pause_visit_id`, `policy_pause_previous_state` and `policy_pause_previous_auto_send` to existing conversation records only as staff-visible first-trigger projections/audit—not the authority. Extend conversations safely with a channel/thread identity so website support does not depend on a pre-existing WhatsApp row. Preserve every existing channel—especially valid separate WhatsApp and SMS rows for one phone—and backfill `support_thread_key = lower(channel) || ':' || phone_e164`; never coerce SMS to WhatsApp. Before adding uniqueness, preflight null/unknown channels, null/invalid phone identities and duplicate channel-qualified keys into a blocking reconciliation report instead of guessing. Permit a separate `website` thread with nullable phone and unique `support_thread_key='website:' || human_id`; retain the rule that WhatsApp/SMS rows require E.164. The WhatsApp handler may address only a verified WhatsApp thread and must never send to SMS- or website-only threads. Add a same-phone WhatsApp+SMS fixture proving both survive with distinct keys, plus null/duplicate preflight and idempotent rerun tests.

Implement one private command that, under deterministic locks, validates the visit/customer and server-owned late actionability, finds the existing WhatsApp thread only when its normalised verified phone **and** linked human match, otherwise creates/reuses that human's website-only thread, records a trusted website `booking_customer_contact_events` row, writes the inbound inbox message tied to `visit_id`, creates/reuses the staff request/attention item, opens/reuses the human-scoped pause, appends its unique pause item and projects `human_takeover`/auto-send-disabled onto every known thread in the same transaction. A missing phone still creates the website thread. A duplicate/shared phone linked to another human is never claimed or exposed. There must be no committed state where the late request/message exists while the human pause/item is absent, including a zero-row thread lookup. The authenticated wrapper derives the human from `auth.uid()`, uses `statement_timestamp()`, exposes no arbitrary contact time and is idempotent by user plus UUID. Its action argument is a canonical `cancel|reschedule|partial_change` enum; the server trims the message, requires 1–1000 visible characters and rejects control characters/oversize payloads before any inbox or audit write. The resume command locks the human/pause and succeeds only when **all** linked requests/attention items are terminal or explicitly closed; a concurrent new late request wins the same lock and prevents premature resume. Enable RLS/revokes and add pgTAP for ownership, rollback, exact boundary, invalid action, blank/control/oversize text, no existing conversation, missing phone, conflicting duplicate phone, same-day/last-minute pre-start contact, duplicate replay and customer denial of pause/audit reads. Prove two visits can create two pause items, resolving one cannot resume, a concurrent resolve/new-request race stays paused, a website pause made before any WhatsApp row suppresses the human's first later WhatsApp inbound, survives a phone change, and never leaks/claims a shared phone belonging to another human. Mirror the limits in `MessageTeamDialog`, but do not rely on browser validation.

`MessageTeamDialog` states that the appointment remains booked and calls `submit_customer_late_booking_message`. The browser must not chain message, request and pause writes. The web UI must not promise cancellation or rescheduling, and a successful receipt must not create or enqueue any automated acknowledgement.

- [ ] **Step 4: Run focused suites and commit**

```bash
npm run test:component -- src/components/customer/BookingCard.component.test.jsx src/components/customer/VisitPolicyActions.component.test.tsx src/components/customer/booking/BookingWizard.partialReschedule.component.test.tsx src/components/customer/VisitChangeDialog.component.test.tsx src/components/customer/MessageTeamDialog.component.test.tsx
npm run test:logic -- src/supabase/repositories/bookingPolicyRepo.test.ts
npm run test:logic -- src/security/bookingPolicyConversationPauseMigration.test.ts
npm run test:db
npx supabase gen types typescript --local > /tmp/smarter-dog-database.types.ts
diff -u src/supabase/database.types.ts /tmp/smarter-dog-database.types.ts || true
cp /tmp/smarter-dog-database.types.ts src/supabase/database.types.ts
npm run typecheck
npx supabase gen types typescript --local > /tmp/smarter-dog-database.types.verify.ts
cmp -s src/supabase/database.types.ts /tmp/smarter-dog-database.types.verify.ts
```

Expected: all action, rollback and switch states PASS.

```bash
git add supabase/migrations/20260722181000_booking_policy_conversation_pause.sql supabase/tests/172_booking_policy_conversation_pause.test.sql src/security/bookingPolicyConversationPauseMigration.test.ts src/components/customer/BookingCard.jsx src/components/customer/BookingCard.component.test.jsx src/components/customer/VisitPolicyActions.jsx src/components/customer/VisitPolicyActions.component.test.tsx src/components/customer/booking/BookingWizard.tsx src/components/customer/booking/BookingWizard.partialReschedule.component.test.tsx src/components/customer/VisitChangeDialog.tsx src/components/customer/VisitChangeDialog.component.test.tsx src/components/customer/MessageTeamDialog.tsx src/components/customer/MessageTeamDialog.component.test.tsx src/supabase/repositories/bookingPolicyRepo.ts src/supabase/repositories/bookingPolicyRepo.test.ts src/supabase/database.types.ts
git commit -m "feat: add atomic customer visit changes"
```

---

### Task 6: Add staff approval, decline and alternative-proposal workflows

**Files:**
- Modify: `src/components/dashboard/RightWorkflowSidebar.jsx`
- Modify: `src/components/dashboard/RightWorkflowSidebar.component.test.jsx`
- Create: `src/components/dashboard/BookingRequestsCard.jsx`
- Create: `src/components/dashboard/BookingRequestsCard.component.test.jsx`
- Create: `src/components/modals/BookingRequestModal.jsx`
- Create: `src/components/modals/BookingRequestModal.component.test.jsx`
- Create: `src/supabase/hooks/useBookingPolicyAttention.ts`
- Create: `src/supabase/hooks/useBookingPolicyAttention.component.test.tsx`
- Modify: `src/supabase/repositories/bookingPolicyRepo.ts`
- Modify: `src/supabase/repositories/bookingPolicyRepo.test.ts`

- [ ] **Step 1: Write request-state tests before UI**

Cover ordinary approval, deposit-required approval, decline with mandatory customer-facing reason, an unconfirmed-new-booking proposal that releases its old hold and reserves the alternative, and a confirmed-source reschedule counterproposal that reserves the destination while leaving the original booked. Cover customer acceptance, staff withdrawal, a request still pending after start time, retrospective approval after service, destination-last-minute staff review with no held slot/incident, auto-confirm-disabled reschedule review with a held slot, late cancellation/reschedule accept or decline, attendance after a declined late request, absence while a late cancellation request is pending, rejection of an incident for any never-confirmed request, and a 14:59 phone contact recorded by staff at 15:05 remaining eligible for the mandatory same-day/last-minute incident waiver through its audited contact event. Add two-staff stale-revision fixtures so the second modal refetches instead of overwriting the first decision.

- [ ] **Step 2: Add one attention hook and sidebar card**

Subscribe/refetch the staff projection for `waiting_staff`, `alternative_pending`, `change_waiting_staff`, `late_change_pending` and overdue deposit states. Keep the new card hidden and the legacy workflow unchanged until server runtime is active. `BookingRequestsCard` then shows counts without customer-sensitive detail until opened. Waiting requests remain visibly overdue; the card never implies automatic expiry.

- [ ] **Step 3: Build explicit modal actions**

`BookingRequestModal` must provide:

- Approve unchanged;
- Propose alternative date/time;
- Decline with a short customer-facing reason;
- Withdraw a staff proposal;
- Retrospective approval when the service occurred;
- Accept or decline a late cancellation/reschedule request while showing that the original remains booked until acceptance;
- On an accepted late reschedule, show two separate decisions: old-deposit disposition defaults to Retain, with only Refund or eligible Transfer as audited exceptions—never account Credit; for an ordinary advance destination the replacement defaults to New £10 and separately offers Carry old £10 or Waive with a required reason, but a same-day, actual last-minute or insufficient-hold-window destination instead shows its mandatory `No deposit required` reason and offers none of those three controls;
- On decline, close with no incident and leave the original unchanged.
- Record phone/email/in-person customer contact with its actual occurred time, source and required staff reason, then reference that immutable event when deciding the change. The UI cannot backdate silently, accept a future time or reuse an event from another visit.

Staff cannot silently edit dog/service/add-on/price details while approving. A materially different service uses the existing staff booking editor after declining/closing the request. Direct reschedule and both alternative-proposal forms show the configured horizon; choosing a later destination requires an explicit staff override checkbox plus reason and renders the audited override in the resulting visit/request.

For `change_waiting_staff`, show the immutable requested destination, source visit and whether capacity is held. `auto_confirm_disabled_staff_review` may be accepted against its reservation; `destination_last_minute_staff_review` must recheck availability and clearly says the slot was not held. Decline leaves the source unchanged. A counterproposal calls `propose_booking_change_destination`, reserves only its destination and keeps the original visit booked; customer acceptance is the only path that supersedes the source. The generic unconfirmed-request proposal path must not be reused. Every modal submits the rendered visit/request revision and refetches on `stale_review`.

For late reschedule money, the UI cannot collapse the two server decisions into one selector. It first renders the server's destination deposit decision. A mandatory same-day/last-minute/insufficient-window exemption confirms without a new deposit and is never labelled or audited as `Waive`. For an ordinary required destination, `New £10` or `Carry old £10` returns an unconfirmed `awaiting_terms` replacement and website continuation; it must not show `Rescheduled`/`Confirmed` until customer Terms plus the corresponding new-payment or transfer path completes. `Retain old + Carry old` and every other double-use combination are disabled client-side and rejected by the RPC. `Waive` requires its own reason. Component/repository fixtures cover all three mandatory exemptions, the ordinary default, every permitted exception and server rejection of impossible pairs.

All staff money controls render from the server-returned context-specific allowed-outcome list, never directly from the broad TypeScript vocabulary. Pin the complete matrix from Foundation Task 5: on-time customer cancel `Refund|Credit`; on-time customer reschedule `Transfer` only; salon-caused cancel/reschedule `Full refund|Transfer` only; accepted late change/no-show/unserviceable arrival `Retain|Refund|Transfer`; declined late payment `Refund|Credit`; withdrawn-paid/found-after-release `Refund|Credit|Transfer`; and no paid deposit `None`. Component tests prove disallowed Credit on late terminal outcomes, Retain/Credit on salon-caused changes and Transfer on declined late payment are absent even if a stale client submits them; repository tests require the server rejection.

If the customer is absent before staff decide an already-recorded late cancellation request, staff resolve it as the single late-cancellation incident; the UI must not offer an additional no-show incident. If the customer attends after staff decline the late request, no incident is recorded. For a same-day/last-minute visit whose customer contacted staff before its start, the modal applies the mandatory incident-free exemption and does not offer an incident toggle.

- [ ] **Step 4: Verify server receipts and commit**

```bash
npm run test:component -- src/components/dashboard/RightWorkflowSidebar.component.test.jsx src/components/dashboard/BookingRequestsCard.component.test.jsx src/components/modals/BookingRequestModal.component.test.jsx src/supabase/hooks/useBookingPolicyAttention.component.test.tsx
npm run test:logic -- src/supabase/repositories/bookingPolicyRepo.test.ts
npm run typecheck
```

Expected: queues update once per receipt and no unconfirmed request can be marked as an incident.

```bash
git add src/components/dashboard/RightWorkflowSidebar.jsx src/components/dashboard/RightWorkflowSidebar.component.test.jsx src/components/dashboard/BookingRequestsCard.jsx src/components/dashboard/BookingRequestsCard.component.test.jsx src/components/modals/BookingRequestModal.jsx src/components/modals/BookingRequestModal.component.test.jsx src/supabase/hooks/useBookingPolicyAttention.ts src/supabase/hooks/useBookingPolicyAttention.component.test.tsx src/supabase/repositories/bookingPolicyRepo.ts src/supabase/repositories/bookingPolicyRepo.test.ts
git commit -m "feat: add staff booking request decisions"
```

---

### Task 7: Replace row-level deposit controls with visit reconciliation

**Files:**
- Modify: `src/components/dashboard/RightWorkflowSidebar.jsx`
- Modify: `src/components/dashboard/RightWorkflowSidebar.component.test.jsx`
- Create: `src/components/dashboard/RefundsDueCard.jsx`
- Create: `src/components/dashboard/RefundsDueCard.component.test.jsx`
- Create: `src/components/modals/RefundDueDialog.tsx`
- Create: `src/components/modals/RefundDueDialog.component.test.tsx`
- Create: `src/components/dashboard/ServicePrepaymentReconciliationsCard.jsx`
- Create: `src/components/dashboard/ServicePrepaymentReconciliationsCard.component.test.jsx`
- Create: `src/components/modals/ServicePrepaymentReconciliationDialog.tsx`
- Create: `src/components/modals/ServicePrepaymentReconciliationDialog.component.test.tsx`
- Modify: `src/components/views/today/AwaitingDepositsCard.jsx`
- Modify: `src/components/views/today/AwaitingDepositsCard.component.test.jsx`
- Modify: `src/components/modals/BookingDetailModal.jsx`
- Modify: `src/components/modals/booking-detail/DepositSection.jsx`
- Modify: `src/components/modals/booking-detail/DepositSection.component.test.jsx`
- Create: `src/components/modals/booking-detail/DepositReconciliationDialog.tsx`
- Create: `src/components/modals/booking-detail/DepositReconciliationDialog.component.test.tsx`
- Modify: `src/engine/deposits.ts`
- Modify: `src/engine/deposits.test.ts`
- Modify: `src/supabase/repositories/bookingPolicyRepo.ts`

- [ ] **Step 1: Delete auto-release expectations from tests**

Replace them with these explicit states:

- Awaiting payment: due time and no reminder promise;
- Check due: visually overdue and `Waiting approval by staff`;
- Received: staff enter the customer's bank receipt timestamp and optional reference, then the visit confirms once;
- Not received: visit releases once, sends a not-confirmed outcome later, and creates no incident;
- Withdrawn with possible payment: mandatory unresolved reconciliation;
- Late receipt: staff enter the real bank receipt evidence and can accept or decline; decline must not use `Not received`, releases the unconfirmed visit without incident, and records Refund, Credit or eligible Transfer only when that exact customer choice is known—otherwise the money remains in open reconciliation;
- Payment found after release: never recreates the old visit; offer new booking, refund or credit.
- Refund due: show the snapshotted five-working-day deadline and escalate at the exact due instant until a linked `refund_paid` event is verified; bank holidays come from the authoritative refund calendar, not salon opening days.
- Service prepayment review: preserve the paid-in-full/part-paid evidence separately from the £10 deposit and keep an open staff task until an audited reconciliation, same-human transfer or explicitly dated refund obligation is recorded.

- [ ] **Step 2: Render one deposit per visit**

While runtime is inactive/scheduled, retain the characterised legacy deposit card because its legacy auto-release remains live. At active runtime, remove per-dog totals/buttons: `AwaitingDepositsCard` opens the visit, not an arbitrary child booking. `DepositSection` shows £10 once, the visit's snapshotted Terms URL/version and acceptance time, hold due time, bank receipt time, staff verification time and ledger outcome; it never swaps to the current Settings publication.

- [ ] **Step 3: Add reconciled money decisions**

`DepositReconciliationDialog` exposes only the actions eligible for the current server context: Received on time, Not received, Accept late payment, Decline late payment, Waive this visit's deposit, Refund, Credit, Transfer to selected visit, Retain and Mark refunded are not one universal menu. `Waive this visit's deposit` is visibly separate from the account-level future override: it appears only for server-eligible `awaiting_terms`/verified-no-payment states, requires a reason, calls `waive_visit_deposit_requirement` and renders its audited confirmation/reserved-credit-release receipt. A late decline calls `decide_late_visit_deposit`, records the bank receipt truthfully and releases the visit; it cannot masquerade as `Not received`, and its only settlement choices are the customer's recorded Refund or Credit. Transfer/Retain are unavailable and rejected for that path. Withdrawn-paid and found-after-release reconciliations may offer an eligible customer-chosen transfer. With no choice, the money stays `received_liability` in the all-open reconciliation queue and the UI must not claim any money outcome. A chosen refund shows its immutable due date, stays visibly due/overdue until staff verify it against the matching obligation, and never marks itself paid. Credit has no expiry field or copy. Conflicting or double-clicked decisions render the idempotent server receipt.

Bank receipt and actual refund-paid inputs are validated on both sides: the UI prevents obviously future times and explains the relevant lifecycle window, while the RPC remains authoritative and rejects future, implausibly backdated or mismatched obligation/reference evidence. A payment decision made after appointment start cannot confirm a never-attended request without selecting retrospective attended mode, entering a reason and submitting the exact attendance evidence ID plus per-dog service evidence IDs returned by the server. Missing/stale/mismatched evidence leaves `received_liability`; it never silently confirms.

Add `RefundsDueCard` to the all-open attention queue. Rows are keyed by refund obligation ID and show customer, amount, due/overdue state and safe origin label; they are not constrained to an appointment date or visit. `RefundDueDialog` calls `settle_booking_refund_due(obligationId, paidAt, bankReference, idempotencyKey)` and supports pooled-credit refunds where `visit_id` is null. Visit-bound deposit refunds may open the same dialog from `DepositReconciliationDialog`. Tests prove one settlement, a months-old obligation stays visible, nullable/multiple-origin credit is safe and no UI invents a visit ID.

Add `ServicePrepaymentReconciliationsCard` to that same all-open queue. Rows show the preserved evidence and exact amount independently of the visit deposit. `ServicePrepaymentReconciliationDialog` calls only `resolve_service_prepayment_reconciliation` and offers the server-eligible choices: keep open with a note, transfer to an eligible same-human visit, create a refund obligation with a staff-entered promised date, or close against documented external resolution. Transfer additionally requires staff to select the matching owned website/WhatsApp/contact evidence that records the customer's choice; a tick without evidence cannot submit. It requires the rendered task revision and idempotency key; stale/double resolution refetches the authoritative outcome. Tests cover missing/mismatched choice evidence, full and partial prepayment, cross-human and cancelled-target rejection, amount mismatch, concurrent resolution and a months-old open task that remains visible.

- [ ] **Step 4: Run and commit**

```bash
npm run test:logic -- src/engine/deposits.test.ts
npm run test:component -- src/components/dashboard/RightWorkflowSidebar.component.test.jsx src/components/dashboard/RefundsDueCard.component.test.jsx src/components/modals/RefundDueDialog.component.test.tsx src/components/dashboard/ServicePrepaymentReconciliationsCard.component.test.jsx src/components/modals/ServicePrepaymentReconciliationDialog.component.test.tsx src/components/views/today/AwaitingDepositsCard.component.test.jsx src/components/modals/booking-detail/DepositSection.component.test.jsx src/components/modals/booking-detail/DepositReconciliationDialog.component.test.tsx
npm run typecheck
```

Expected: multi-dog visits show exactly one £10 state and no timer mutates capacity.

```bash
git add src/components/dashboard/RightWorkflowSidebar.jsx src/components/dashboard/RightWorkflowSidebar.component.test.jsx src/components/dashboard/RefundsDueCard.jsx src/components/dashboard/RefundsDueCard.component.test.jsx src/components/modals/RefundDueDialog.tsx src/components/modals/RefundDueDialog.component.test.tsx src/components/dashboard/ServicePrepaymentReconciliationsCard.jsx src/components/dashboard/ServicePrepaymentReconciliationsCard.component.test.jsx src/components/modals/ServicePrepaymentReconciliationDialog.tsx src/components/modals/ServicePrepaymentReconciliationDialog.component.test.tsx src/components/views/today/AwaitingDepositsCard.jsx src/components/views/today/AwaitingDepositsCard.component.test.jsx src/components/modals/BookingDetailModal.jsx src/components/modals/booking-detail/DepositSection.jsx src/components/modals/booking-detail/DepositSection.component.test.jsx src/components/modals/booking-detail/DepositReconciliationDialog.tsx src/components/modals/booking-detail/DepositReconciliationDialog.component.test.tsx src/engine/deposits.ts src/engine/deposits.test.ts src/supabase/repositories/bookingPolicyRepo.ts
git commit -m "feat: add manual visit deposit reconciliation"
```

---

### Task 8: Add staff-only incidents, waivers and deposit overrides

**Files:**
- Modify: `src/components/modals/HumanCardModal.jsx`
- Modify: `src/components/modals/human-card/BookingRulesPanel.jsx`
- Modify: `src/components/modals/human-card/BookingRulesPanel.component.test.jsx`
- Modify: `src/components/modals/human-card/HumanBookingHistory.jsx`
- Modify: `src/components/modals/human-card/HumanBookingHistory.component.test.jsx`
- Modify: `src/components/modals/BookingDetailModal.jsx`
- Create: `src/components/modals/booking-detail/BookingPolicyIncidentSection.tsx`
- Create: `src/components/modals/booking-detail/BookingPolicyIncidentSection.component.test.tsx`
- Modify: `src/components/views/today/BookingJourneyRow.jsx`
- Modify: `src/components/views/today/today.component.test.jsx`

- [ ] **Step 1: Write permission and consequence fixtures**

Pin all five incident kinds, one counting incident per visit, waiver with required reason, one-incident next-booking state, three-in-12-month state, 12 incident-free months, staff require/waive override, and a review prompt when an existing future visit is not retroactively changed.

- [ ] **Step 2: Build staff-only controls**

Only staff can record No-show, and the control calls the named atomic `mark_booking_visit_no_show` transition rather than writing an incident/status separately. It is absent when the visit was not confirmed by its start, was retrospectively approved, has arrival/service evidence or has a qualifying pre-start same-day/last-minute contact. An unserviceable late arrival calls `record_unserviceable_late_arrival` and appears only when arrival evidence exists and no service occurred. A late partial dog/service/add-on change is optional and requires deliberate staff selection plus reason. Marking No-show or another incident must not send a customer notification automatically.

`BookingRulesPanel` replaces the old per-human deposit boolean with the calculated reason and audited override controls: Use policy, Require deposit, Waive deposit. Every non-default choice requires a reason.

- [ ] **Step 3: Keep the customer boundary closed**

Add component and repository assertions that incident kinds, counts, dates, notes, waiver reasons and audit actors never appear in `CustomerApp` props or network projections. Customer copy must still give the safe plain-language category—recent booking history or a staff-applied requirement—and link to the snapshotted booking Terms; generic `required under the booking terms` is not sufficient on its own. Decoder/UI tests reject an unknown/internal reason rather than leaking it.

- [ ] **Step 4: Run and commit**

```bash
npm run test:component -- src/components/modals/human-card/BookingRulesPanel.component.test.jsx src/components/modals/human-card/HumanBookingHistory.component.test.jsx src/components/modals/booking-detail/BookingPolicyIncidentSection.component.test.tsx src/components/views/today/today.component.test.jsx
npm run test:logic -- src/supabase/repositories/bookingPolicyRepo.test.ts
npm run typecheck
```

Expected: staff permissions and privacy tests PASS.

```bash
git add src/components/modals/HumanCardModal.jsx src/components/modals/human-card/BookingRulesPanel.jsx src/components/modals/human-card/BookingRulesPanel.component.test.jsx src/components/modals/human-card/HumanBookingHistory.jsx src/components/modals/human-card/HumanBookingHistory.component.test.jsx src/components/modals/BookingDetailModal.jsx src/components/modals/booking-detail/BookingPolicyIncidentSection.tsx src/components/modals/booking-detail/BookingPolicyIncidentSection.component.test.tsx src/components/views/today/BookingJourneyRow.jsx src/components/views/today/today.component.test.jsx
git commit -m "feat: add audited booking incidents"
```

---

### Task 9: Migrate staff writes and inventory every operational consumer against visit truth

**Files:**
- Create: `supabase/migrations/20260722190000_booking_visit_write_barriers.sql`
- Create: `supabase/tests/175_booking_visit_write_barriers.test.sql`
- Create: `src/security/bookingPolicyConsumerInventory.test.ts`
- Create: `src/engine/bookingOperationalSelectors.ts`
- Create: `src/engine/bookingOperationalSelectors.test.ts`
- Modify: `src/supabase/hooks/useBookings.js`
- Modify: `src/supabase/hooks/useBookings.component.test.jsx`
- Modify: `src/supabase/hooks/useGroupBookings.js`
- Create: `src/supabase/hooks/useGroupBookings.component.test.jsx`
- Modify: `src/supabase/hooks/useMonthBookings.js`
- Modify: `src/supabase/hooks/useMonthBookings.test.js`
- Modify: `src/components/views/inbox/hooks/useSlotCapacityPreview.js`
- Create: `src/components/views/inbox/hooks/useSlotCapacityPreview.test.js`
- Modify: `src/hooks/useNextOpenDayBrief.ts`
- Modify: `src/hooks/useNextOpenDayBrief.test.ts`
- Modify: `src/hooks/useNextOpenDayBrief.component.test.jsx`
- Modify: `src/supabase/queries/bootQueries.js`
- Create: `src/supabase/queries/bootQueries.test.js`
- Modify: `src/components/views/inbox/hooks/useCustomerContext.js`
- Create: `src/components/views/inbox/hooks/useCustomerContext.test.js`
- Modify: `src/supabase/database.types.ts`
- Modify: `src/components/modals/booking-detail/BookingActions.jsx`
- Modify: `src/components/modals/booking-detail/BookingActions.component.test.jsx`
- Modify: `src/components/modals/RecurringBookingModal.jsx`
- Create: `src/components/modals/RecurringBookingModal.component.test.jsx`
- Modify: `src/components/views/TodayView.jsx`
- Modify: `src/engine/today.ts`
- Modify: `src/engine/today.test.ts`
- Modify: `src/engine/cashup.ts`
- Modify: `src/engine/cashup.test.ts`
- Modify: `src/engine/dailyBrief.ts`
- Modify: `src/engine/dailyBrief.test.ts`
- Modify: `src/components/views/reports/useWeeklyCashUp.js`
- Create: `src/components/views/reports/useWeeklyCashUp.test.js`
- Modify: `src/components/views/reports/WeeklyCashUp.jsx`
- Create: `src/components/views/reports/WeeklyCashUp.component.test.jsx`
- Modify: `src/components/views/today/MiniInvoiceModal.jsx`
- Modify: `src/components/views/today/MiniInvoiceModal.component.test.jsx`
- Modify: `src/components/views/today/StatusBoard.jsx`
- Modify: `src/components/views/today/StatusBoard.component.test.jsx`
- Modify: `src/components/modals/booking-detail/PaymentStateSection.jsx`
- Modify: `src/components/modals/booking-detail/PaymentStateSection.component.test.jsx`
- Modify: `src/components/modals/booking-detail/ServicesPaymentCard.jsx`
- Modify: `src/components/modals/booking-detail/ServicesPaymentCard.component.test.jsx`
- Modify: `supabase/functions/calendar-feed/index.ts`
- Modify: `supabase/functions/calendar-ics/index.ts`
- Create: `supabase/functions/calendar-feed/index.test.ts`
- Create: `supabase/functions/calendar-ics/index.test.ts`

- [ ] **Step 1: Characterise every remaining direct policy write**

Use `bookingPolicyConsumerInventory.test.ts` to scan both writes and reads. It fails while application code directly updates/deletes visit-owned date, slot, cancellation, confirmation or deposit fields, and it fails when a new production reader of `bookings` or those policy fields is not classified. Keep per-dog grooming journey updates allowed.

```bash
rg -n "\.delete\(\)|status.*Cancelled|booking_date|booking_slot|deposit_status|deposit_paid" src supabase/functions
```

Maintain an explicit reviewed inventory with one of these reasons: `capacity_hold` (active confirmed/unconfirmed visits plus held change-destination reservations), `confirmed_diary`, `grooming_child_state`, `visit_history`, `visit_event_report`, `visit_bill_summary`, or `inactive_legacy_compatibility`. Generated types and tests are excluded structurally, not with a catch-all path. Each classified production reader names its visit selector/projection; a new raw consumer fails the test until its semantics are deliberately chosen. Cover customer dashboard, Today/day/week/month views, every availability/capacity RPC, history, reports, cash-up, mini invoice/final payment, booking detail, both calendar exports, scheduled/manual reminders, notification recipients and both WhatsApp booking paths. Explicitly migrate the known raw consumers: inbox `useSlotCapacityPreview` counts destination reservations; `useNextOpenDayBrief` and `bootQueries` use the confirmed diary rather than capacity holds; `useCustomerContext` resolves the dated visit and all dogs rather than selecting one child row; cash-up, Today status/amount due, mini invoice and booking-detail payment components consume `booking_visit_bill_summary` and never sum child `deposit_amount`. The generated inventory—not this anticipated list—is the final commit scope.

- [ ] **Step 2: Route staff creation, edits, cancellation and rescheduling through commands**

Use `create_staff_booking_visit`, `update_staff_booking_visit`, `cancel_staff_booking_visit` and `reschedule_staff_booking_visit` from the foundation plan. `BookingActions` must select the dated visit, list all dogs, carry the rendered visit revision, record salon cause/customer request and choose any permitted money/incident outcome; `stale_review` refetches and requires staff to review again. When non-deposit paid-in-full/part-paid evidence exists, cancellation shows it separately from the £10 deposit and requires `Open reconciliation`, eligible same-human Transfer, or Refund due with an explicit promised date; it never clears or silently strands the service prepayment. The all-open attention modal calls `resolve_service_prepayment_reconciliation` and shows linked evidence/outcome. Staff horizon overrides and partial commercial-detail changes require a reason; a late-partial incident is opt-in. Replace the live hard-delete in `useGroupBookings.js`: `RecurringBookingModal` must list the selected dated visits and invoke one visit command per date under an idempotent batch receipt, with partial-failure reporting and no raw delete. A recurring series identifier never becomes the mutation boundary.

For active runtime, final-payment edits also go through the locked visit command and use the rendered bill-summary revision. Cash-up and invoice surfaces show all included dogs/services but one visit total, one £10 part-payment and one remaining balance. The server applies the deposit before accepting the balance, updates compatibility child payment fields atomically, and returns the recomputed visit summary; it never copies £10 onto every dog. Inactive/scheduled screens retain characterised legacy row calculations. Add bank-, credit- and transfer-funded two-dog fixtures proving £84 of work with one £10 applied deposit shows £74 due—not £64—and that refund/credit/retention/transfer-away removes the source credit exactly once.

- [ ] **Step 3: Correct operational read models**

Add `bookingOperationalSelectors.ts` as the single client mapping from visit projection to audiences. Capacity and every availability RPC include active confirmed/unconfirmed visit holds **and** `booking_change_destination_reservations.state='held'`; reservation-versus-booking races lock the same canonical slot keys, and release/consume changes capacity exactly once. The one exception prevents double-counting an unconfirmed new-booking proposal: while its matching `new_booking_alternative` reservation is held, the source visit's obsolete slot is excluded and the reservation is the sole hold. Removing/consuming that reservation transitions the source atomically so neither zero nor two holds can leak. Reservations never appear as visits in a diary, calendar, history or reminder.

Today/day/week/month diaries and calendar exports include confirmed non-cancelled visits in `active` or `completed` lifecycle state, so completing the last dog does not make the appointment disappear from that day or its historical calendar. Arrival/action selectors use only active rows; completed rows render as completed and remain non-actionable. Grooming child rows come from that confirmed diary set. Scheduled/manual reminders use confirmed **active** visits only. Visit history uses explicit terminal states; staff attention alone includes pending requests; reporting uses visit events. Declined, withdrawn, cancelled and superseded visits cannot leak into diary/calendar/reminder counts except where a dedicated history/tombstone consumer explicitly asks for them. Add partial-completion, final-dog completion/reopen, calendar persistence, held-reservation capacity and booking-versus-reservation race fixtures.

- [ ] **Step 4: Add a runtime-aware compatibility guard after all local callers are migrated**

While runtime is inactive/scheduled, the migration trigger preserves legacy writes and mirrors safe date/status/deposit changes into `legacy_compat` visit/audit state so old production bundles cannot drift the aggregate. At active runtime, it rejects direct deletion and direct changes to visit-owned booking date, slot, cancellation and legacy deposit fields when `visit_id` is present, except inside named security-definer commands, returning `SDB_CLIENT_REFRESH_REQUIRED` without partial mutation. Policy cancellation/withdrawal is a tombstoned audited state, not physical deletion. The guard does not block grooming lifecycle, notes, actual price or collection updates.

Keep compatibility wrappers for older deployed clients until the rollout plan proves they have aged out. The final WhatsApp plan migrates the remaining service-role paths before the contract cleanup strengthens the barrier.

- [ ] **Step 5: Run and commit**

```bash
npm run test:component -- src/supabase/hooks/useBookings.component.test.jsx src/supabase/hooks/useGroupBookings.component.test.jsx src/components/modals/booking-detail/BookingActions.component.test.jsx src/components/modals/RecurringBookingModal.component.test.jsx
npm run test:logic -- src/security/bookingPolicyConsumerInventory.test.ts src/engine/bookingOperationalSelectors.test.ts src/engine/today.test.ts src/engine/cashup.test.ts src/engine/dailyBrief.test.ts src/supabase/hooks/useMonthBookings.test.js src/components/views/inbox/hooks/useSlotCapacityPreview.test.js src/hooks/useNextOpenDayBrief.test.ts src/supabase/queries/bootQueries.test.js src/components/views/inbox/hooks/useCustomerContext.test.js src/components/views/reports/useWeeklyCashUp.test.js
npm run test:component -- src/components/views/reports/WeeklyCashUp.component.test.jsx src/components/views/today/MiniInvoiceModal.component.test.jsx src/components/views/today/StatusBoard.component.test.jsx src/components/modals/booking-detail/PaymentStateSection.component.test.jsx src/components/modals/booking-detail/ServicesPaymentCard.component.test.jsx
npm run test:db
deno test --node-modules-dir=none --allow-env supabase/functions/calendar-feed/index.test.ts supabase/functions/calendar-ics/index.test.ts
npx supabase gen types typescript --local > /tmp/smarter-dog-database.types.ts
diff -u src/supabase/database.types.ts /tmp/smarter-dog-database.types.ts || true
cp /tmp/smarter-dog-database.types.ts src/supabase/database.types.ts
npm run typecheck
npx supabase gen types typescript --local > /tmp/smarter-dog-database.types.verify.ts
cmp -s src/supabase/database.types.ts /tmp/smarter-dog-database.types.verify.ts
```

Expected: policy writes use commands, capacity retains visit and change-request holds, and calendars retain confirmed active/completed visits without showing pending reservations.

```bash
git add supabase/migrations/20260722190000_booking_visit_write_barriers.sql supabase/tests/175_booking_visit_write_barriers.test.sql src/security/bookingPolicyConsumerInventory.test.ts src/engine/bookingOperationalSelectors.ts src/engine/bookingOperationalSelectors.test.ts src/supabase/hooks/useBookings.js src/supabase/hooks/useBookings.component.test.jsx src/supabase/hooks/useGroupBookings.js src/supabase/hooks/useGroupBookings.component.test.jsx src/supabase/hooks/useMonthBookings.js src/supabase/hooks/useMonthBookings.test.js src/components/views/inbox/hooks/useSlotCapacityPreview.js src/components/views/inbox/hooks/useSlotCapacityPreview.test.js src/hooks/useNextOpenDayBrief.ts src/hooks/useNextOpenDayBrief.test.ts src/hooks/useNextOpenDayBrief.component.test.jsx src/supabase/queries/bootQueries.js src/supabase/queries/bootQueries.test.js src/components/views/inbox/hooks/useCustomerContext.js src/components/views/inbox/hooks/useCustomerContext.test.js src/supabase/database.types.ts src/components/modals/booking-detail/BookingActions.jsx src/components/modals/booking-detail/BookingActions.component.test.jsx src/components/modals/RecurringBookingModal.jsx src/components/modals/RecurringBookingModal.component.test.jsx src/components/views/TodayView.jsx src/engine/today.ts src/engine/today.test.ts src/engine/cashup.ts src/engine/cashup.test.ts src/engine/dailyBrief.ts src/engine/dailyBrief.test.ts src/components/views/reports/useWeeklyCashUp.js src/components/views/reports/useWeeklyCashUp.test.js src/components/views/reports/WeeklyCashUp.jsx src/components/views/reports/WeeklyCashUp.component.test.jsx src/components/views/today/MiniInvoiceModal.jsx src/components/views/today/MiniInvoiceModal.component.test.jsx src/components/views/today/StatusBoard.jsx src/components/views/today/StatusBoard.component.test.jsx src/components/modals/booking-detail/PaymentStateSection.jsx src/components/modals/booking-detail/PaymentStateSection.component.test.jsx src/components/modals/booking-detail/ServicesPaymentCard.jsx src/components/modals/booking-detail/ServicesPaymentCard.component.test.jsx supabase/functions/calendar-feed/index.ts supabase/functions/calendar-ics/index.ts supabase/functions/calendar-feed/index.test.ts supabase/functions/calendar-ics/index.test.ts
git commit -m "refactor: route booking policy through visits"
```

---

### Task 10: Add end-to-end portal and staff acceptance journeys

**Execution dependency:** Author and run this task only after WhatsApp/rollout Task 8 has created the real readiness, activation-schedule and persisted-latch contracts. Portal Tasks 1–9 remain verifiable against inactive/scheduled runtime first; do not fake or pre-create a second activation schema here. The roadmap returns to this task immediately after that contract migration and before integrated review.

**Files:**
- Create: `e2e/customer-booking-policy.spec.ts`
- Create: `e2e/staff-booking-policy.spec.ts`
- Create: `e2e/fixtures/bookingPolicyActiveRuntime.ts`
- Create: `src/security/bookingPolicyE2EFixture.test.ts`
- Create: `docs/superpowers/runbooks/2026-07-22-booking-policy-portal-staff-validation.md`

- [ ] **Step 1: Seed deterministic policy journeys**

Create a database-owner fixture for a disposable local Supabase stack or single-use branch project. It verifies the target is localhost or an explicitly allowlisted ephemeral test ref, refuses the shared staging/production refs, seeds the frozen readiness/activation state needed for public `booking_policy_runtime()` to return active, and records its seed identity. It exposes no RPC/role grant or production test clock. Teardown resets the local database or destroys/resets the ephemeral branch and proves the fixture marker/effective state is gone; a failed teardown fails the run.

Use named fixtures for: two-dog on-time visit, exact-boundary visit, one-microsecond-late visit, hidden-history account with unresolved past-start actions, waiting approval, auto-confirm-disabled held reschedule change, next-day-after-15 unheld reschedule change, change counterproposal, alternative pending new booking, waiting deposit, deposit check due, paid-in-full service prepayment review, part-paid service prepayment review, one-incident customer, three-incident customer, same-day released slot and legacy visit.

- [ ] **Step 2: Test customer journeys at desktop, tablet and mobile widths**

Against that disposable **active** runtime, cover new booking, deposit Terms, withdraw, reviewed cancellation/refund choice, reviewed atomic reschedule, stale-review refetch, held/unheld pending change and change-only withdrawal, counterproposal acceptance, fourth-move block, cancel-and-rebook inside/exactly-at/outside 24 hours, repeat booking, late `Message the team`, upcoming always visible and the terminal-history-only switch. Assert one visit card and one outcome for a multi-dog visit.

- [ ] **Step 3: Test staff journeys**

Cover approve, decline, both new-request and confirmed-source proposal/accept paths, overdue deposit Received/Not received, current-visit waiver, late payment decision, refund verification, credit transfer, paid-in-full and part-paid service-prepayment reconciliation/transfer/refund across cancellation/no-show/unserviceable-arrival, final visit balance payment with one multi-dog £10 part-payment, no-show, optional partial-change incident, waiver and future-account override. Assert the original remains active while every pending reschedule/change proposal awaits its permitted actor, and that service-prepayment evidence remains visible until one audited disposition succeeds.

- [ ] **Step 4: Run the complete application bar**

```bash
npm run lint
npm run typecheck
npm run check:migrations
npm run test
npm run test:db
npm run test:logic -- src/security/bookingPolicyE2EFixture.test.ts
npx playwright test e2e/customer-booking-policy.spec.ts e2e/staff-booking-policy.spec.ts
npm run build
```

Expected: every available command PASS, the browser observes the real public active runtime, and teardown proves no active fixture remains. Shared staging stays inactive and is not a substitute for this suite. Record an unavailable local/ephemeral Supabase or browser dependency accurately; do not mark it as passed.

- [ ] **Step 5: Commit acceptance coverage**

```bash
git add e2e/customer-booking-policy.spec.ts e2e/staff-booking-policy.spec.ts e2e/fixtures/bookingPolicyActiveRuntime.ts src/security/bookingPolicyE2EFixture.test.ts docs/superpowers/runbooks/2026-07-22-booking-policy-portal-staff-validation.md
git commit -m "test: cover booking policy portal and staff journeys"
```

## Completion Gate

Tasks 1–9 are complete when inactive/scheduled tests preserve characterised legacy customer/staff behaviour while dual-writing safe visit data. The whole portal/staff plan is complete only after the roadmap has executed Task 10 against the real disposable persisted-latch contract and proved simulated active runtime switches every v1 surface/action to visit projections/commands without reload. V1 settings must demonstrably change only active-runtime decisions, pending holds must remain capacity-safe, and the real `previous_day_1500_v1` row stays inactive. Continue with `docs/superpowers/plans/2026-07-22-booking-policy-whatsapp-notifications-rollout.md`; do not activate the shared environment between plans.
