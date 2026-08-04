# Path B execution plan — staff-controlled first release

**Supersedes, for scope purposes only,** the portal/staff and WhatsApp plans
dated 2026-07-22. Those remain the reference for anything reinstated later.
The signed design document is unchanged and remains the product source of
truth; nothing here alters an agreed business rule.

**Shape of the release.** Customers *request*; staff *decide*. Deposits and
incidents are recorded and enforced by the database exactly as designed.
Refunds are made manually by the owner and recorded. WhatsApp acknowledges,
never decides.

## Standing constraints

- The foundation branch `codex/booking-policy` is the base. Rebase on
  `origin/main` before starting, and again after the hotfix merges.
- `previous_day_1500_v1.effective_at` stays null for every task in this plan.
- **Deployment and activation are separate actions from implementation, and
  separate from each other.** Merging this work deploys inactive schema and
  code. Activation is a later, explicitly approved owner action against a
  scheduled future London midnight.
- No production migration, no Terms publication, no Meta template submission
  and no customer contact without explicit approval.
- No agreed policy rule is removed because its automation is deferred. The
  three-incident threshold and the working-day refund calculation keep their
  current database behaviour until separately approved.
- UK English throughout.

## Deliberately deferred

Each of these stays unbuilt. The database support already exists and remains
dormant, so reinstating any of them is additive.

| Deferred | Why it is safe to defer |
|---|---|
| Automatic customer self-service rescheduling | Customer requests; staff decide. The lineage and three-move cap stay built and unused. |
| Held destination-slot reservations | Nothing holds a destination, so nothing can leak a hold. Staff check availability when they act. |
| Staff alternative-slot proposals and customer acceptance | Replaced by a phone call or message. |
| Deposit carry-forward reservation UI | Staff record the outcome directly; the reservation table stays unused. |
| Dedicated late deposit-satisfaction workflow | The narrow "reserved credit used after the due time" case goes to staff as an ordinary deposit decision. |
| Notification outbox and worker | **Conditional** — see Task 9. Only built if existing notifications cannot safely carry visit-level outcomes. |
| Full 50-file operational consumer audit | Except the bill-summary correction and the destructive-delete replacement, which are in scope (Tasks 7 and 8). |
| UI for migration/backfill procedures | Runbook psql only, unless repeated operational use is demonstrated. |

---

## Task order and boundaries

Implementation runs in this order. Each task is one reviewable commit unless
noted; the PR grouping is given at the end.

**Database boundary:** PostgreSQL owns every deadline, permission, money and
incident decision. **Application boundary:** React renders server decisions
and never recalculates a deadline or an eligibility. Any client helper that
would answer "can this be cancelled?" locally is a defect.

---

### Task 1 — Complete the staff visit write commands

**Why first:** Tasks 5, 7 and 8 all call these, and they are the last
unbuilt piece of the foundation's write path.

**Files**
- Create `supabase/migrations/20260726144007_staff_visit_write_commands.sql`
- Create `supabase/tests/170_staff_visit_write_commands.test.sql`
- Modify `src/supabase/rpc.ts`

**Adds:** `create_staff_booking_visit`, `update_staff_booking_visit`,
`cancel_staff_booking_visit`, `reschedule_staff_booking_visit`.

**Acceptance criteria**
- A staff cancellation or move acts on the whole visit, never one dog row.
- Staff-caused changes consume no customer reschedule allowance and create no
  incident unless staff deliberately record one with a reason.
- Cancellation with non-deposit prepayment evidence requires an explicit
  choice: open reconciliation, transfer to an eligible same-customer visit, or
  refund due with a stated promised date. It never silently strands the money.
- A stale visit revision returns `stale_review`; staff must re-review.
- Rescheduling copies the source's payment evidence unchanged and invents no
  second payment event.
- Every command is idempotent and writes immutable audit.

**Tests:** pgTAP for whole-visit atomicity, revision staleness, prepayment
branch coverage, incident non-creation, and role denial for non-staff.

---

### Task 2 — Customer and staff visit projections

**Files**
- Create `supabase/migrations/20260726144013_staff_booking_policy_projections.sql`
- Create `supabase/tests/172_booking_policy_projections.test.sql`
- Create `src/security/bookingPolicyProjectionsMigration.test.ts`
- Create `src/supabase/repositories/bookingPolicyRepo.ts` and its test

**Adds:** `list_customer_booking_visits()`,
`list_staff_booking_policy_attention()`, `list_staff_booking_visit(uuid)`.

**Acceptance criteria**
- A customer sees every own upcoming visit, one row per visit with its dogs
  nested and deterministic ordering.
- A customer never sees another customer's visit, an incident count or kind, a
  staff note, a verification reference or an audit actor.
- The history switch hides only *resolved terminal* history. A past-start
  request awaiting approval, an open deposit, an unresolved reconciliation or a
  pending refund stays visible and actionable.
- The staff attention queue is not filtered by date: a three-month-old
  unresolved item still appears.
- `deposit_check_due` is derived as `state in ('awaiting_terms',
  'awaiting_payment') and due_at <= statement_timestamp()`, and reading it
  writes nothing.
- Repository decoders reject a malformed payload outright rather than falling
  back to row-level actions.

**Tests:** pgTAP for privacy, grouping and the history-switch boundary;
decoder tests for malformed payloads and missing revisions.

---

### Task 3 — Authoritative Booking Rules settings

**Files:** `src/constants/salonSettings.ts`, `src/supabase/transforms.ts`,
`src/supabase/hooks/useSalonConfig.js`, new
`src/supabase/hooks/useBookingPolicyRuntime.ts`,
`src/components/views/settings/BookingRulesSettings.jsx`,
`CustomerPortalSettings.jsx`, plus their tests and `e2e/settings-tabs.spec.ts`.

**Acceptance criteria**
- **No decorative controls.** Every visible control changes the next server
  decision. `minCancellationHours`, `advanceBookingWeeks` and
  `Show upcoming bookings` are removed from the rendered surface.
- The 3:00 pm rule appears as read-only versioned text.
- Horizon saves as whole days, default 180, rejected outside 1–730.
- Deposit hold offers exactly 6/12/24/36/48, default 12.
- Bank details save complete or are rejected complete.
- Terms URL, deposit Terms version and lowercase SHA-256 hash create the
  immutable publication; version and hash save or clear together.
- An explicit warning shows when deposit-dependent booking is blocked by
  incomplete bank details or a missing Terms publication.
- While the runtime is inactive, legacy controls keep working and v1 values
  appear in a clearly labelled "Upcoming policy" setup section.

**Tests:** save → reload → assert for every control; server rejection cases;
component tests for the runtime hook across inactive/scheduled/active.

---

### Task 4 — Customer visit cards with typed receipts

**Files:** `src/CustomerApp.jsx`, `CustomerDashboard.jsx`,
`AppointmentsSection.jsx`, `BookingCard.jsx`, new `VisitPolicyActions.jsx`,
new `src/supabase/hooks/useCustomerBookingVisits.ts`, plus tests.

**Acceptance criteria**
- One card per appointment listing every dog on it.
- Actions come from the server's capabilities; the client computes no deadline.
- Render states pinned: confirmed on time; confirmed past deadline (booked,
  no Cancel/Reschedule, "Message the team"); waiting approval; awaiting terms;
  awaiting payment; request pending; declined/withdrawn.
- A deposit-check-due visit still shows the customer "Waiting approval by
  staff" — never an overdue or expiry threat.
- No incident counts, internal reason codes or staff overrides anywhere.
- Receipts decode through `decodeCustomerVisitReceipt`; a malformed or failed
  response never renders as success.

**Tests:** component tests for each render state including multi-dog fixtures;
receipt decoder tests already exist and are extended.

---

### Task 5 — Customer request flow (not automatic decisions)

**This is the deliberate narrowing.** The customer asks; staff decide.

**Files:** `supabase/migrations/20260726144014_customer_change_requests.sql`,
`supabase/tests/174_customer_change_requests.test.sql`,
`src/components/customer/VisitPolicyActions.jsx`, new
`RequestChangeDialog.jsx`, `src/supabase/rpc.ts`, plus tests.

**Adds:** `request_customer_booking_change(visit, kind, message, idempotency)`
— a public wrapper over the existing private late-change core, extended to
accept on-time requests too.

**Acceptance criteria**
- On-time **cancellation** commits immediately through
  `cancel_customer_booking_visit`. Every one of these is enforced server-side
  at the moment of commitment, inside the same transaction, or the command
  refuses: the visit is still eligible for self-service cancellation; the
  deadline has not passed; the booking has not changed since the customer
  reviewed it (the review token); the whole visit is cancelled atomically; no
  non-deposit prepayment requires staff review; the customer chose an allowed
  deposit outcome; the submission is idempotent; capacity is released only as
  part of the successful transaction; and a typed receipt is returned.
- **Rescheduling is always a request** in this release, on time or late. It
  never creates a destination, never holds capacity and never consumes a move.
- The customer sees plainly that the original appointment remains booked.
- A late cancellation is also a request, not a mutation.
- One unresolved request per visit; a second returns the existing one.
- Withdrawing a request leaves the source visit byte-for-byte unchanged.
- No request creates an incident. Only a staff decision can.

**Tests:** pgTAP for one-open-request, source immutability, withdrawal races;
component tests for the request dialog and the "still booked" copy.

---

### Task 6 — Staff approval, decline and request decisions

**Files:** new `src/components/views/staff/BookingPolicyQueue.jsx`,
`src/supabase/hooks/useBookingPolicyAttention.ts`,
`src/components/modals/booking-detail/BookingActions.jsx`, plus tests.

**Acceptance criteria**
- One queue showing waiting approvals, pending change requests, deposit checks
  due, open reconciliations and pending refunds, with counts.
- Approve reruns the full deposit resolver at the real approval instant and
  starts the hold window there.
- Decline requires a short customer-facing reason.
- Deciding a change request accepts or declines it; accepting a late change
  records exactly one incident unless waived; declining records none.
- Nothing in the queue expires or auto-releases.

**Tests:** component tests per queue state; confirm dialogs assert the exact
amounts and dogs before acting.

---

### Task 6b — Refund calendar warning surface *(done — migration landed)*

`20260726144003_refund_calendar_coverage_warnings.sql` retains the coverage
table, seeds England-and-Wales bank holidays through 2029, adds
`refund_due_at_verified()` which fails loudly outside verified coverage, and
adds `booking_refund_calendar_status()` escalating at 180/90/30 days.
Maintenance is one owner-only SQL call, documented in
[the refund calendar runbook](../runbooks/2026-07-23-refund-calendar-maintenance.md).

**Remaining for Task 7:** surface `booking_refund_calendar_status()` in
Settings. Refund-creating commands now use `refund_due_at_verified()`, so an
unbacked date cannot be written.

---

### Task 7 — Deposit outcomes, incidents and manual refunds

**Files:** new `src/components/views/staff/DepositReconciliation.jsx`,
`IncidentControls.jsx`, `RefundLedger.jsx`, plus tests. Possibly a small
migration for a staff refund-queue projection.

**Acceptance criteria**
- One deposit per visit, never one per dog.
- Received requires the customer's bank receipt time; a future time is
  refused. An on-time receipt confirms even when checked late.
- Not received releases the visit and records no incident.
- A liability resolves to refund or credit with a reason, and the refund
  appears in a pending-refund list until settled.
- **Settling a refund is manual and recorded:** the owner makes the bank
  transfer, then records actual paid time and bank reference. The system never
  moves money.
- **The receipt distinguishes three states and never conflates them:**
  *cancellation completed*; *refund recorded as due, with its date*; *refund
  sent and reconciled*. The customer is never told money has been refunded
  merely because the obligation was recorded. A test asserts the middle state's
  copy contains no past-tense "refunded".
- Incidents and waivers are staff-only, one per visit, each with a reason.
- Customers see the resulting deposit requirement in plain language, never a
  strike count.

**Tests:** component tests for each money decision; pgTAP already covers the
underlying commands.

---

### Task 8 — Bill-summary correction and destructive-delete replacement

The two safety-critical extracts from the deferred consumer audit.

**Files:** `src/engine/cashup.ts`, `src/components/views/today/MiniInvoiceModal.jsx`,
`src/components/modals/booking-detail/PaymentStateSection.jsx`,
`ServicesPaymentCard.jsx`, `src/supabase/hooks/useGroupBookings.js`,
`src/components/modals/RecurringBookingModal.jsx`, plus tests.

**Acceptance criteria**
- A two-dog visit with £84 of work and one £10 deposit shows **£74** due, not
  £64. The £10 is applied once per visit and never summed per dog.
- Refund, credit, retention or transfer-away removes that credit exactly once.
- `useGroupBookings.js`'s live hard-delete is replaced: `RecurringBookingModal`
  lists the selected dated visits and calls one visit command per date under an
  idempotent batch receipt, reporting partial failure. **No raw delete
  remains.**

**Tests:** bank-, credit- and transfer-funded two-dog fixtures asserting £74;
a recurring-cancel test asserting no row is ever deleted.

---

### Task 9 — Limited WhatsApp integration

Assumes the atomic-reschedule hotfix has merged.

**Files:** `supabase/migrations/20260726144015_whatsapp_policy_acknowledgement.sql`,
`supabase/tests/176_whatsapp_policy_acknowledgement.test.sql`,
`supabase/functions/whatsapp-agent/handler.ts`,
`supabase/functions/apply-customer-confirm/index.ts`,
`src/supabase/hooks/inbox/useConversationLifecycle.js`,
`src/components/views/inbox/InboxView.jsx`, plus Deno and component tests.

**Scope:** detect a cancellation or reschedule intent, record a staff request,
send **one** neutral acknowledgement, then pause automation.

**The acknowledgement, verbatim:**

> Thanks, your request has been received. Because the appointment is now
> inside the change deadline, it needs to be reviewed by the salon. We'll get
> back to you.

**Acceptance criteria**
- The request, the acknowledgement and the automation pause commit in **one
  transaction**. There must be no state where a request exists and automation
  is still enabled.
- Exactly one acknowledgement per request, idempotent across provider
  redelivery. Later messages in the paused conversation get no automated reply.
- The acknowledgement promises nothing: it must not mention approval,
  cancellation, refund, credit, a slot or an outcome. A test asserts the
  absence of those words.
- Deadline decisions use the provider's signed message timestamp, never
  processing time.
- Only staff can resume automation, and only once every linked request is
  decided or explicitly closed.
- Deposit-required booking intent hands off to the website.

**Notification decision (the conditional deferral):** before building
anything, verify whether the existing per-booking notification triggers fire
once per *dog* on a multi-dog visit. If they do, a visit-level acknowledgement
would arrive two or three times, and the outbox becomes necessary. If a single
message can be sent safely, the outbox stays deferred. **This check gates the
decision and must be recorded in the task's commit message.**

---

### Task 10 — Audited activation latch, inaccessible by default

**Files:** `supabase/migrations/20260726144016_booking_policy_activation.sql`,
`supabase/tests/178_booking_policy_activation.test.sql`,
`src/security/bookingPolicyActivationMigration.test.ts`, runbook.

**Adds:** an immutable `booking_policy_activation_schedule` table and an
owner-only `schedule_booking_policy_activation(...)`, plus the revoked private
persisted-latch function that is the sole writer of `effective_at`.

**Acceptance criteria**
- Scheduling records a future London-midnight instant immutably, with actor,
  release SHA and reason. Scheduling alone changes no runtime behaviour.
- The latch may set `effective_at` **once**, only to exactly the frozen
  scheduled instant, and only at or after it has arrived. A latch that runs
  late still records the original instant, not its own execution time.
- The latch is revoked from `public`, `anon`, `authenticated` **and**
  `service_role`. Application roles hold no UPDATE on
  `booking_policy_versions`.
- A direct owner UPDATE without the transaction-local latch key is rejected.
- An early latch call before the instant is rejected.
- `booking_policy_runtime_status()` exposes only state and the scheduled
  instant — never a reason, actor, hash or release SHA.
- **After this task the policy is still inactive.** The migration must not
  schedule anything.

**Tests:** explicit security tests for every role; early/exact/late latch;
double-latch rejection; the privacy shape of the status function.

---

### Task 11 — End-to-end coverage of the core journeys

**Files:** `e2e/booking-policy-customer.spec.ts`,
`e2e/booking-policy-staff.spec.ts`, seed fixtures.

**Customer journeys:** view a multi-dog visit; cancel on time and see the
refund/credit outcome; request a reschedule and see the original still booked;
hit the deadline and get the "message the team" route; withdraw an unconfirmed
request.

**Staff journeys:** approve a request; decline with a reason; record Received
and Not received; resolve a liability to refund and settle it; record and waive
an incident; cancel a recurring series without a delete.

**Acceptance criteria:** journeys pass at desktop, tablet and mobile widths;
run against the offline/sample-data preview so no real customer data is
touched.

---

## Commit and PR grouping

Small, independently reviewable commits throughout. Suggested PRs:

| PR | Tasks | Reviewable as |
|---|---|---|
| Already open | Hotfix | Standalone defect fix, deployable alone |
| 1 | 1, 2 | Database write commands and projections |
| 2 | 3 | Settings made authoritative |
| 3 | 4, 5 | Customer visit cards and request flow |
| 4 | 6, 7 | Staff decisions, deposits, incidents, refunds |
| 5 | 8 | Bill-summary and destructive-delete corrections |
| 6 | 9 | WhatsApp acknowledgement and pause |
| 7 | 10, 11 | Activation latch and end-to-end coverage |

PRs 1–7 all deploy **inactive**. None of them activates anything.

## Pre-merge gate

Unchanged from what was agreed, and required before the final integration PR:
regenerated `src/supabase/database.types.ts` (two generations, `cmp` clean);
the real `npm run test:db` in the supported Docker/Supabase environment; every
stub-versus-real difference investigated rather than assumed; Deno Edge
Function tests; lint, typecheck, migration checks, Vitest, production build;
RLS verification; and explicit activation-latch security tests.

**The temporary PostgreSQL stub is supporting evidence only. It is not final
verification.**

## Separation of deployment and activation

Three distinct, separately approved actions:

1. **Merge** — code and migrations land on `main`. Migrations still have to be
   applied to production by hand.
2. **Deploy** — migrations applied, functions and front end released. The
   policy is inactive; customers and staff see today's behaviour.
3. **Activate** — the owner schedules a future London midnight and the audited
   latch flips the runtime. Only this changes customer-visible policy.

Approval for any one of these is not approval for the next.
