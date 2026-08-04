# Booking Policy Programme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the signed booking, cancellation, rescheduling and deposit policy as one coherent programme without exposing customers or staff to a partially migrated system.

**Architecture:** The programme introduces a visit aggregate and immutable policy/financial audit first, migrates the customer and staff applications second, migrates WhatsApp and notifications third, and activates only after one full staging release is proven. The dated visit—not a dog row or recurring `group_id`—is the policy boundary. PostgreSQL is authoritative; every interface consumes the same visit capabilities and atomic commands.

**Tech Stack:** Supabase/PostgreSQL 15 and Edge Functions, React 19, TypeScript 6, the repository's existing hook/subscription cache pattern, Vitest 4, pgTAP, Playwright, Meta WhatsApp Cloud API.

## Global Constraints

- Signed product source: `docs/superpowers/specs/2026-07-22-booking-cancellation-rescheduling-policy-design.md`.
- Executable subplans, in order:
  1. `docs/superpowers/plans/2026-07-22-booking-policy-foundation.md`
  2. `docs/superpowers/plans/2026-07-22-booking-policy-portal-staff.md`
  3. `docs/superpowers/plans/2026-07-22-booking-policy-whatsapp-notifications-rollout.md`
- Execute in an isolated worktree created from current `origin/main`. This planning checkout is currently one local commit ahead and eight dependency-only commits behind; do not implement on the stale checkout.
- Treat the three plans as one release train. Intermediate commits are reviewable, but no partial production rollout may expose new state without its customer, staff and messaging consumers.
- Keep `previous_day_1500_v1.effective_at` null until the final owner-approved activation task.
- A request receives its policy only at first commercial confirmation. Existing confirmed visits are legacy; a post-activation replacement of a legacy visit receives v1.
- Commercial eligibility, used for last-minute/deposit exemption, is snapshotted before any manual bank-check delay. A pre-deadline deposit-required hold does not become exempt merely because staff verify it after 3:00 pm.
- Exact deadline is 15:00:00 Europe/London on the previous calendar day; any later instant is late.
- Do not mutate production, publish Terms, submit Meta templates or message customers without explicit approval.
- Preserve unrelated user changes and use UK English.

## Delivery Sequence

| Phase | Deliverable | Activation state | Exit gate |
|---|---|---|---|
| 0 | Clean implementation worktree and baseline | Inactive | Baseline checks recorded |
| 1 | Visit, policy, deposit, credit, incident and command foundation | Inactive | Old paths still work; new DB tests green |
| 2 | Customer portal and staff workflows | Inactive | All app writes/reads use visits; E2E green |
| 3 | WhatsApp, notification, reminder and contract migration | Inactive | Atomic duplicate regression and silence tests green |
| 4 | Staging release and external readiness | Inactive | Terms, Meta, bank details and staged journeys approved |
| 5 | Future-midnight production activation and monitoring | Scheduled, then active | 48-hour evidence complete |
| 6 | Stale-client retirement | Active | Separate approval and ageing evidence complete |

---

### Task 1: Establish a clean implementation baseline

**Files:**
- Read: `package.json`
- Read: `docs/superpowers/specs/2026-07-22-booking-cancellation-rescheduling-policy-design.md`
- Read: all three implementation plans listed above

- [ ] **Step 1: Create an isolated worktree from current origin**

```bash
BOOKING_POLICY_PLAN_SOURCE="$(git rev-parse --show-toplevel)"
git fetch origin
git worktree add ../Smarter-dog-bookings-policy -b codex/booking-policy origin/main
cd ../Smarter-dog-bookings-policy
mkdir -p docs/superpowers/specs docs/superpowers/plans
cp -p "$BOOKING_POLICY_PLAN_SOURCE/docs/superpowers/specs/2026-07-22-booking-cancellation-rescheduling-policy-design.md" docs/superpowers/specs/
cp -p "$BOOKING_POLICY_PLAN_SOURCE/docs/superpowers/plans/2026-07-22-booking-policy-roadmap.md" docs/superpowers/plans/
cp -p "$BOOKING_POLICY_PLAN_SOURCE/docs/superpowers/plans/2026-07-22-booking-policy-foundation.md" docs/superpowers/plans/
cp -p "$BOOKING_POLICY_PLAN_SOURCE/docs/superpowers/plans/2026-07-22-booking-policy-portal-staff.md" docs/superpowers/plans/
cp -p "$BOOKING_POLICY_PLAN_SOURCE/docs/superpowers/plans/2026-07-22-booking-policy-whatsapp-notifications-rollout.md" docs/superpowers/plans/
```

Expected: `codex/booking-policy` starts at current `origin/main`, with exactly the five untracked approved documents copied from the planning checkout. Do not cherry-pick the planning checkout's unrelated ahead commit.

- [ ] **Step 2: Confirm policy-relevant upstream changes**

```bash
git diff --name-status main...origin/main
git status --short
```

Expected from the planning snapshot: upstream differences are dependency/CI files only. If policy files have changed by execution time, stop and reconcile every affected plan path before coding.

- [ ] **Step 3: Record baseline verification**

```bash
npm ci
npm run lint
npm run typecheck
npm run check:migrations
npm run test
npm run build
```

Run `npm run test:db` when local Supabase/Docker is available. Record exact pre-existing failures; do not weaken tests or mislabel unavailable checks as passes.

- [ ] **Step 4: Commit only the signed design and plans if they are not already tracked**

```bash
git status --short
cmp -s "$BOOKING_POLICY_PLAN_SOURCE/docs/superpowers/specs/2026-07-22-booking-cancellation-rescheduling-policy-design.md" docs/superpowers/specs/2026-07-22-booking-cancellation-rescheduling-policy-design.md
cmp -s "$BOOKING_POLICY_PLAN_SOURCE/docs/superpowers/plans/2026-07-22-booking-policy-roadmap.md" docs/superpowers/plans/2026-07-22-booking-policy-roadmap.md
cmp -s "$BOOKING_POLICY_PLAN_SOURCE/docs/superpowers/plans/2026-07-22-booking-policy-foundation.md" docs/superpowers/plans/2026-07-22-booking-policy-foundation.md
cmp -s "$BOOKING_POLICY_PLAN_SOURCE/docs/superpowers/plans/2026-07-22-booking-policy-portal-staff.md" docs/superpowers/plans/2026-07-22-booking-policy-portal-staff.md
cmp -s "$BOOKING_POLICY_PLAN_SOURCE/docs/superpowers/plans/2026-07-22-booking-policy-whatsapp-notifications-rollout.md" docs/superpowers/plans/2026-07-22-booking-policy-whatsapp-notifications-rollout.md
git add docs/superpowers/specs/2026-07-22-booking-cancellation-rescheduling-policy-design.md docs/superpowers/plans/2026-07-22-booking-policy-roadmap.md docs/superpowers/plans/2026-07-22-booking-policy-foundation.md docs/superpowers/plans/2026-07-22-booking-policy-portal-staff.md docs/superpowers/plans/2026-07-22-booking-policy-whatsapp-notifications-rollout.md
git commit -m "docs: define booking policy implementation"
unset BOOKING_POLICY_PLAN_SOURCE
```

Expected before `git add`: the five copied document paths are the only untracked changes and every `git diff --no-index` command prints nothing. Stop if any other path appears or any document differs.

---

### Task 2: Execute the visit-level foundation plan

**Files:**
- Follow: `docs/superpowers/plans/2026-07-22-booking-policy-foundation.md`

- [ ] **Step 1: Complete each foundation task test-first**

Do not merge tasks to skip red/green evidence. The minimum database boundary includes:

- `booking_visits` and `booking_lineages`;
- immutable policy versions and typed authoritative settings;
- separate lifecycle, approval and confirmation axes;
- one visit deposit plus financial/credit and incident audit;
- idempotent customer/staff visit commands with deterministic locks;
- visit-level events/report inputs and generated TypeScript types.

- [ ] **Step 2: Stop on unsafe backfill ambiguity**

Every non-null legacy `group_id` is split by customer and appointment date. Every null-group row begins as its own visit. Staff review possible legacy multi-dog matches; code must not guess. Do not continue towards activation while any required reconciliation is unresolved.

- [ ] **Step 3: Prove inactive compatibility**

Run the foundation completion bar and query:

```sql
select code, effective_at
from public.booking_policy_versions
where code = 'previous_day_1500_v1';
```

Expected: `effective_at` is null, legacy application journeys still work and no new path automatically releases an unconfirmed/deposit visit.

---

### Task 3: Execute the customer portal and staff workflow plan

**Files:**
- Follow: `docs/superpowers/plans/2026-07-22-booking-policy-portal-staff.md`

- [ ] **Step 1: Migrate read models before exposing controls**

Customer and staff screens consume visit projections. Upcoming and unresolved action-needed records stay visible; the history switch hides only resolved terminal history. Capacity includes active visit holds plus held destination reservations; diaries/calendars retain confirmed active/completed visits, while reminders use confirmed active visits only.

- [ ] **Step 2: Migrate all customer writes to receipts**

New, repeat, withdrawal, cancellation and reschedule actions use visit commands. The portal lists every dog, uses separate server switches, preserves service/price details during a move, limits self-service to three successful moves and never creates a destination before source replacement can commit.

- [ ] **Step 3: Finish staff safety paths before deposit migration is considered usable**

Staff can approve, decline, propose, reconcile Received/Not received, accept/decline late payment, resolve refund/credit/transfer, record/waive incidents and override deposit policy. No request expires automatically and no never-confirmed request becomes an incident.

- [ ] **Step 4: Prove settings integrity**

For every visible Booking Rules control, save, reload and assert the next server decision changes. Remove minimum-notice, advance-weeks and show-upcoming authority; retain separate cancellation, rescheduling, repeat and history settings.

- [ ] **Step 5: Keep activation null and stop after portal Task 9**

Run the portal/staff Tasks 1–9 completion tests and repeat the inactive policy query. Portal Task 10's real active-runtime fixture depends on the readiness/schedule/latch schema created later by WhatsApp/rollout Task 8, so defer it explicitly; do not invent a duplicate fixture contract or deploy this phase alone to production.

---

### Task 4: Execute WhatsApp, notifications and inactive contract migration

**Files:**
- Follow only Tasks 1–8 of `docs/superpowers/plans/2026-07-22-booking-policy-whatsapp-notifications-rollout.md`. Tasks 9–10 belong to roadmap Task 6 below; Task 11 is roadmap Task 7 after monitoring.

- [ ] **Step 1: Close the original duplicate-booking bug first**

Both WhatsApp agent and Flow must call one atomic reschedule command. In inactive runtime, prove the duplicate regression is fixed under the legacy rolling-24-hour policy/copy with no destination and source unchanged. The v1 staff-request/silence result is proven later on the disposable active stack.

- [ ] **Step 2: Enforce durable silence**

Late change intent uses the provider timestamp, records the request and pauses the whole conversation before response generation. The trigger and later messages receive no automated reply until staff close the request and explicitly resume a chosen mode.

- [ ] **Step 3: Complete visit-level messages and reminder timing**

Outcome outbox uniqueness is per visit/outcome/channel. Reminder invocation is DST-safe at 10:00 Europe/London and copy uses the visit's stored policy/deadline. Deposit-required WhatsApp intent finishes on the authenticated website.

- [ ] **Step 4: Apply the compatibility contract only after all callers migrate**

Populate and validate every existing `visit_id`, keep the compatibility insert trigger for stale clients, strengthen runtime-aware direct-write barriers, suppress legacy row-level duplicate notifications and include every new pgTAP file in the hard-locked staging runner. Defer `SET NOT NULL`, stale-wrapper revocation and physical legacy-column deletion to the separately approved post-monitoring retirement task.

- [ ] **Step 5: Run the deferred real active-runtime integration**

After rollout Task 8 has created the actual readiness, activation schedule and persisted latch, execute portal/staff Task 10 on a disposable local/ephemeral stack. Rerun rollout Task 6's deferred readiness-revocation/finaliser reminder matrix against those real objects. Then run the combined portal/staff/WhatsApp/outbox active journeys and prove fixture teardown returns the stack to inactive. This gate must pass before roadmap Task 5 review; shared staging remains inactive.

---

### Task 5: Review the integrated programme before any deployment

**Files:**
- Review: every changed file on `codex/booking-policy`
- Create during execution: `docs/superpowers/runbooks/2026-07-22-booking-policy-integrated-review.md`

- [ ] **Step 1: Run independent code review by risk area**

Review separately:

1. database state machine, RLS/security-definer grants and lock ordering;
2. customer/staff states and accessibility at desktop/tablet/mobile;
3. WhatsApp silence, provider timestamp and idempotency;
4. notification/cron duplication and daylight-saving behaviour;
5. migration compatibility, backfill and rollback.

Resolve every critical/high finding and rerun its focused test before the full suite.

- [ ] **Step 2: Run one placeholder and stale-rule scan**

```bash
rg -n "24 hours|24-hour|minCancellationHours|advanceBookingWeeks|showUpcoming|create.*then.*cancel|deposit-auto-release" src supabase/functions scripts
rg -n "TODO|FIXME|TBD|implement later|placeholder" src supabase docs/superpowers/runbooks/2026-07-22-booking-policy-*.md
```

Expected: any remaining `24 hours` is explicitly legacy-policy display/test; any legacy identifier is compatibility-only and documented; no unfinished placeholder remains.

- [ ] **Step 3: Run the full local bar from a clean checkout**

```bash
npm run lint
npm run typecheck
npm run check:migrations
npm run test
npm run test:db
deno test --node-modules-dir=none --allow-env supabase/functions/
npm run build
git status --short
```

Also run the mandatory disposable active full-stack portal/staff/WhatsApp/outbox suite and prove teardown removes the active fixture. Expected: all available tests PASS and only intentional tracked changes exist; shared inactive staging is not a substitute for this active integration gate.

- [ ] **Step 4: Open a reviewable pull request without production mutation**

The pull request must link the signed design and three subplans, list migrations/Edge Functions, show test evidence, state that the policy remains inactive and call out external Terms/Meta/bank readiness as separate gates.

---

### Task 6: Stage, approve and activate as one controlled release

**Files:**
- Follow Tasks 9–10 and the staging/activation runbooks produced by the third plan

- [ ] **Step 1: Deploy the complete release to the hard-locked staging project**

Apply migrations, deploy all changed Edge Functions and front end, then run hosted pgTAP and the **inactive compatibility** customer/staff/WhatsApp journeys. Verify the policy remains inactive throughout shared staging validation. Active behaviour must already be green on the disposable full-stack fixture.

- [ ] **Step 2: Complete the external readiness gate**

Before requesting production approval, require:

- public Terms live with the approved version and all signed topics;
- Terms explicitly cover retained old deposit plus normally required new £10 on accepted unwaived late reschedule, carry-forward only as an audited exception, and replacement remaining unconfirmed until website Terms/payment;
- Meta templates approved with matching variables;
- complete bank details tested;
- staff training for approvals, late requests, deposit checks, refunds/credit, incidents and automation resume;
- backfill and financial reconciliation cleared;
- monitor and non-destructive rollback owners identified.

- [ ] **Step 3: Request explicit production deployment and activation approval**

Show exact project, release SHA, migration range, Edge Function versions, Terms version, future London-midnight instant and cron changes. Approval to code or stage is not approval to deploy/activate.

- [ ] **Step 4: Deploy, schedule and monitor**

After approval, deploy the full inactive release, rerun production-safe checks, call the audited activation RPC for the agreed future midnight and monitor the checkpoints in the activation runbook for 48 hours.

- [ ] **Step 5: Close only with evidence**

The programme is complete when:

- no duplicate active visit is possible through any path;
- every channel observes the correct applied deadline and switches;
- all late-message silence and manual staff queues work;
- deposit/credit/incident audit balances;
- first reminder/deadline cycles complete without duplicate or premature actions;
- 48-hour monitoring is recorded and unresolved issues have owners.

---

### Task 7: Retire stale-client compatibility only after monitoring

**Files:**
- Follow only Task 11 of `docs/superpowers/plans/2026-07-22-booking-policy-whatsapp-notifications-rollout.md`

- [ ] **Step 1: Obtain separate retirement evidence and approval**

After the 48-hour window and the agreed stale-client ageing period, show zero null visit IDs, zero unresolved dual-write anomalies, zero stale wrapper calls and current clients/functions everywhere. This is a new production migration approval; activation approval does not authorise it.

- [ ] **Step 2: Apply the narrow retirement migration**

Only then set `bookings.visit_id` not null and revoke obsolete wrapper execution. Keep historical policy, financial, audit and compatibility columns; do not bundle destructive cleanup.

- [ ] **Step 3: Regenerate types and rerun hosted verification**

Run Task 11's local/hosted pgTAP, generated-type diff and typecheck. Record the retirement evidence separately from the activation report.

## Completion Gate

Planning completion does not change runtime behaviour. Implementation completion does not activate production. Only the final, explicitly approved activation and monitoring sequence makes `previous_day_1500_v1` live.
