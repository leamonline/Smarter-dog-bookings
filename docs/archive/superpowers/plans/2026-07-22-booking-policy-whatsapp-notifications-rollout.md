# Booking Policy WhatsApp, Notifications and Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put WhatsApp, customer notifications, reminders and production rollout onto the same visit-level policy, then activate the 3:00 pm previous-calendar-day rule safely at an explicit future London midnight.

**Architecture:** Edge Functions become thin adapters over the visit commands built in the foundation plan. The original Meta message timestamp is authenticated by the service-role wrapper and used for deadline decisions. Late change intent atomically records a staff request and a durable conversation automation pause before the handler can draft or send anything. A visit-level outbox emits each customer outcome once. Activation is an audited owner action after application, Terms, bank details, templates and staging evidence are ready.

**Tech Stack:** Supabase Edge Functions/Deno, Meta WhatsApp Cloud API, PostgreSQL 15/pg_cron/pg_net, React inbox controls, Vitest 4, pgTAP and Playwright.

## Global Constraints

- Prerequisites: complete the Foundation plan and Portal/Staff Tasks 1–9 with the new policy inactive. Portal/Staff Task 10 is deliberately deferred until this plan's Task 8 creates the real readiness/schedule/latch schema, then runs at roadmap Task 4 Step 5 before integrated review.
- Every Edge Function branches on the server runtime. Before the effective instant it preserves the live legacy path/copy/timing while dual-writing visits; at/after it, all booking, deposit, reminder, silence and notification paths use v1 together.
- Source of truth: `docs/superpowers/specs/2026-07-22-booking-cancellation-rescheduling-policy-design.md`.
- WhatsApp and website use the same SQL actionability and mutations. Do not add a second JavaScript deadline implementation.
- The browser never supplies an effective request time. Only the service-role WhatsApp wrapper may pass the provider timestamp extracted from a signature-verified Meta event.
- A reschedule is one transaction. Delete the Flow sequence that creates a replacement before cancelling its source.
- After a late cancellation/reschedule intent, the triggering message and every later inbound message receive no automated reply until staff explicitly resolve and resume automation.
- Human-written staff replies remain possible while paused. Staff-only Generate reply may prepare text, but nothing generated is sent automatically.
- Deposit-required bookings finish on the authenticated website with explicit deposit Terms acceptance. WhatsApp may create only a provisional request/link.
- Reminder delivery is a courtesy. Failure never moves the stored deadline.
- Do not edit or publish the external Terms, submit a Meta template, deploy Edge Functions, migrate production, send customer messages or activate the policy without explicit approval.
- Preserve notification fallbacks and delivery audit unless a test proves a replacement is equivalent.
- Enable RLS on every new public table, keep outbox/event/lease writes command-only, use `security_invoker` views, and add explicit revokes/grants for every security-definer function. Customers must never gain direct access to inbox pause, incident, staff audit or delivery rows.
- Use UK English in messages, templates, tests and runbooks.

---

### Task 1: Add a shared Edge Function booking-policy adapter

**Files:**
- Create: `supabase/functions/_shared/bookingPolicy.ts`
- Create: `supabase/functions/_shared/bookingPolicy.test.ts`
- Modify: `supabase/functions/_shared/manageBooking.ts`
- Modify: `src/lib/whatsapp/manageBooking.test.ts`
- Modify: `supabase/functions/_shared/flowBooking.ts`
- Modify: `src/lib/whatsapp/flowBooking.test.ts`

**Interfaces:**
- `listDatedBookingVisits(client, humanId)` returns visit IDs and dated summaries.
- `getVisitCapabilities(client, visitId, trustedDecisionSource)` calls SQL; webhook uses the provider timestamp and Flow uses the first database receipt instant; it never calculates a deadline locally.
- `previewWhatsAppCancel(input)` and `previewWhatsAppReschedule(input)` persist a service-side review bound to the interaction, visit revision, complete dog list, destination hash where applicable, displayed policy/deadline and settings version.
- `cancelWhatsAppVisit(input)` and `rescheduleWhatsAppVisit(input)` return the common visit receipt.
- `previewWhatsAppCreate(input)` and `createWhatsAppVisit(input)` provide the equivalent reviewed service path for new bookings; they never call the auth-user RPC or accept Terms for the customer.
- `prepareDepositWebsiteHandoff(input)` creates/reuses the provisional visit plus durable handoff intent/outbox identity and returns no token; the outbox claim service alone mints the signed short-lived continuation token immediately before rendering the website link.

- [ ] **Step 1: Write failing adapter contracts**

Cover:

- one dated visit returned for a multi-dog appointment;
- two dates that share a legacy `group_id` remain separate;
- an ambiguous on-time selection asks which dated visit and mutates nothing;
- an ambiguous late change intent sends nothing, pauses automation and leaves target linking to staff;
- exact deadline uses the SQL `allowed` result;
- inactive runtime preserves the current 60-day WhatsApp window, while active runtime includes configured day 180 and rejects day 181 at both option and write boundaries;
- a webhook service request carries provider account ID, message ID and provider timestamp;
- an encrypted Flow request carries no invented provider timestamp: its wrapper captures the database receipt instant on the first signature-verified/decrypted call and replays it on retries;
- browser/client timestamps are absent from public RPCs;
- changed dogs, services, add-ons or price in a reschedule payload are rejected.
- cancel/reschedule `Yes` without the exact unexpired review ID displayed in that interaction is rejected; a staff edit or settings/destination change forces a fresh summary and customer confirmation;
- auto-confirm-disabled and next-day-after-15 destinations return one pending change with held/unheld capacity truth while the source stays booked.

- [ ] **Step 2: Define the adapter input and receipt**

```ts
type VerifiedWebhookCommandSource = {
  source: "webhook";
  humanId: string;
  verifiedInboundEventId: string;
  providerAccountId: string;
  providerMessageId: string;
  providerSentAt: string;
};

type VerifiedFlowCommandSource = {
  source: "flow";
  humanId: string;
  providerAccountId: string;
  flowToken: string;
  flowAction: string;
  canonicalSubmissionHash: string;
};

export type WhatsAppVisitCommandInput =
  (VerifiedWebhookCommandSource | VerifiedFlowCommandSource) &
  (
    | {
        commandKind: "create";
        visitId: null;
        reviewId: string;
        reason: null;
      }
    | {
        commandKind: "cancel";
        visitId: string;
        reviewId: string;
        reason: string | null;
        paidDepositOutcome: "refund" | "credit";
      }
    | {
        commandKind: "reschedule";
        visitId: string;
        reviewId: string;
        reason: string | null;
      }
  );

export type WhatsAppVisitCommandReceipt =
  | {
      commandKind: "create";
      outcome: "confirmed" | "waiting_staff" | "deposit_website_required";
      visitId: string; // committed current/provisional visit
      requestId: string | null;
      sourceVisitId: null;
      replacementVisitId: null;
      desiredDestination: null;
      outcomeKey: string;
      deadlineAt: string | null;
      blockReason: null;
    }
  | {
      commandKind: "cancel";
      outcome: "cancelled";
      visitId: string; // cancelled source
      requestId: null;
      sourceVisitId: string;
      replacementVisitId: null;
      desiredDestination: null;
      outcomeKey: string;
      deadlineAt: string;
      blockReason: null;
    }
  | {
      commandKind: "reschedule";
      outcome: "rescheduled";
      visitId: string; // committed replacement/current visit
      requestId: null;
      sourceVisitId: string;
      replacementVisitId: string;
      desiredDestination: null;
      outcomeKey: string;
      deadlineAt: string;
      blockReason: null;
    }
  | {
      commandKind: "reschedule";
      outcome: "change_waiting_staff";
      visitId: string; // unchanged confirmed source
      requestId: string;
      sourceVisitId: string;
      replacementVisitId: null;
      desiredDestination: {
        bookingDate: string;
        slots: string[];
        capacityHeld: boolean;
        staffReviewReason: "auto_confirm_disabled_staff_review" | "destination_last_minute_staff_review";
      };
      outcomeKey: string;
      deadlineAt: string;
      blockReason: null;
    }
  | {
      commandKind: "cancel" | "reschedule";
      outcome: "late_request_paused";
      visitId: string | null;
      requestId: string | null;
      sourceVisitId: string | null; // nullable for unresolved ambiguous target
      replacementVisitId: null;
      desiredDestination: null;
      outcomeKey: null;
      deadlineAt: string | null;
      blockReason: null;
    }
  | {
      commandKind: "cancel" | "reschedule";
      outcome: "staff_review_required";
      visitId: string | null;
      requestId: string | null;
      sourceVisitId: string | null;
      replacementVisitId: null;
      desiredDestination: null;
      outcomeKey: string;
      deadlineAt: string | null;
      blockReason: "processing_state_changed";
    }
  | {
      commandKind: "create" | "cancel" | "reschedule";
      outcome: "blocked";
      visitId: string | null;
      requestId: null;
      sourceVisitId: string | null;
      replacementVisitId: null;
      desiredDestination: null;
      outcomeKey: string | null; // non-null only when an action_blocked outbox row committed
      deadlineAt: string | null;
      blockReason: string;
    };
```

Validate ISO timestamps, review IDs and visit/human UUIDs at the adapter boundary. Do not accept an arbitrary service idempotency UUID or trust `humanId` as authority. A webhook wrapper requires the persisted signature-verified inbound event and proves its business account/message/sender phone/conversation maps uniquely to the same human and owned visit before claiming anything; duplicate/shared-phone ambiguity routes staff-only. For webhooks, claim one immutable source key from a fixed application namespace plus canonical `whatsapp:{providerAccountId}:{providerMessageId}` bytes—**not** command kind. Store the first command kind and canonical payload hash with that claim; identical redelivery replays, while reclassification or a changed payload for the same signed message conflicts without a second mutation. For Flow, claim exactly `flow:{providerAccountId}:{flowToken}:{flowAction}` once after verification/decryption; the issued token/action/review is already bound server-side to human, source visit and revision. Store the canonical submission hash plus first command kind as the immutable request hash; a changed retry/reclassification conflicts instead of gaining another UUID. Never log the token or raw sensitive payload. Another business account cannot collide. PostgreSQL verifies sender ownership, review binding, current processing safety and final mutation. Add cross-human, swapped-visit and duplicate-phone denial fixtures.

Decoder tests enforce the receipt union: every successful create identifies its committed current/provisional `visitId` while both predecessor fields are null; cancellation's `visitId` equals its source; reschedule's `visitId` equals its non-null replacement; pending change identifies the unchanged source as `visitId`; ambiguous late pauses may have no visit/request/source and never have an outcome key; an on-time-but-now-unsafe `staff_review_required` result has a safe acknowledgement key and does **not** imply a policy pause; and blocked results have no replacement/request and only carry a key when a safe `action_blocked` outbox row actually committed. Reject a mismatched command/outcome or success branch with a null/currently ambiguous visit. No caller may overload `replacementVisitId` for create or coerce a null ID/key into success.

Active v1 never jumps from intent straight to mutation. The conversational path stores the opaque review against its interaction before showing the whole visit/deadline and records it in durable confirmation state; `apply-customer-confirm` passes it on `Yes`. The Flow data-exchange preview screen obtains the review, displays the destination policy/deadline (including legacy→v1), and returns the review ID only in encrypted server state for the confirmation submit. A missing/expired/stale review returns refresh-required and sends/renders a new confirmation summary; it never silently executes.

For a cancellation with a paid deposit, `previewWhatsAppCancel` displays Refund as the default and Credit as an explicit alternative, binds that exact choice into the review hash and stores it in the conversational/Flow confirmation state. `cancelWhatsAppVisit` requires the same `paidDepositOutcome`; a changed/missing choice forces a fresh preview. Credit can never be inferred from free text or a nullable field. Add refund-default, explicit-credit, changed-choice, cross-review and idempotent replay tests.

`previewWhatsAppCreate` derives the human from the verified sender/Flow binding and stores a short-lived review over owned dogs, services, add-ons, price basis, date, canonical slots, capacity result, settings version, approval decision and prospective deposit decision. `createWhatsAppVisit` accepts only that review plus the one provider idempotency claim and returns `confirmed|waiting_staff|deposit_website_required|blocked`. It rechecks all facts under capacity locks. A deposit-required result creates/reuses only the provisional request and website continuation; WhatsApp cannot set Terms acceptance, allocate customer credit or record payment. Add mixed-owner dog, altered price/service, stale capacity/settings and swapped-review denial tests.

- [ ] **Step 3: Remove local rolling-24-hour decisions**

Delete policy checks based on `new Date()`, appointment time subtraction or the legacy minimum-hours setting from `_shared/manageBooking.ts` and `_shared/flowBooking.ts`. Presentation may format `deadlineAt`; it may not decide `allowed`.

Remove the active-path `windowDays = 60` defaults from `availableDateOptions` and `availableGroupDateOptions`. The adapter reads the server customer-safe runtime settings once and passes the authoritative horizon to every single/multi-dog availability query. Keep `60` only inside the explicit inactive/scheduled legacy branch so deployment cannot widen the live window early.

- [ ] **Step 4: Run and commit**

```bash
deno test --node-modules-dir=none --allow-env supabase/functions/_shared/bookingPolicy.test.ts
npm run test:logic -- src/lib/whatsapp/manageBooking.test.ts src/lib/whatsapp/flowBooking.test.ts
```

Expected: adapter, visit identity and payload-lock tests PASS.

```bash
git add supabase/functions/_shared/bookingPolicy.ts supabase/functions/_shared/bookingPolicy.test.ts supabase/functions/_shared/manageBooking.ts src/lib/whatsapp/manageBooking.test.ts supabase/functions/_shared/flowBooking.ts src/lib/whatsapp/flowBooking.test.ts
git commit -m "refactor: share booking policy with WhatsApp"
```

---

### Task 2: Make WhatsApp cancel and reschedule atomic by visit

**Files:**
- Create: `supabase/migrations/20260722200000_whatsapp_booking_policy_wrappers.sql`
- Create: `supabase/tests/180_whatsapp_booking_policy_wrappers.test.sql`
- Create: `src/security/bookingPolicyWhatsAppWrappersMigration.test.ts`
- Modify: `src/supabase/database.types.ts`
- Modify: `supabase/functions/whatsapp-agent/handler.ts`
- Modify: `supabase/functions/whatsapp-agent/__tests__/dispatch.test.ts`
- Create: `supabase/functions/whatsapp-agent/bookingPolicy.test.ts`
- Modify: `supabase/functions/apply-customer-confirm/index.ts`
- Create: `supabase/functions/apply-customer-confirm/index.test.ts`
- Modify: `supabase/functions/whatsapp-flow-endpoint/index.ts`
- Modify: `supabase/functions/whatsapp-flow-endpoint/db.ts`
- Create: `supabase/functions/whatsapp-flow-endpoint/bookingPolicy.test.ts`

- [ ] **Step 1: Characterise the current duplicate-booking failure**

Add a red test for the current Flow order: destination creation succeeds, source cancellation returns a late-policy failure, and the customer is left with two active visits. In inactive/scheduled runtime the replacement is one atomic command evaluated with the characterised legacy rolling-24-hour policy and legacy result/copy; its late case returns blocked with no destination and the source unchanged. In simulated active runtime the same regression uses v1 and returns the appropriate pending/pause receipt without a destination visit. Policy/copy compatibility does not require preserving an unsafe create-then-cancel implementation.

In the active-runtime red tranche, require the source-deadline-late receipt to include a persisted staff request/attention ID and a conversation already set to staff-only mode. A two-call `record request` then `pause conversation` implementation is not acceptable. The inactive legacy branch retains its existing response semantics and must not expose the v1 pause/request workflow early.

- [ ] **Step 2: Pass the original Meta time from the verified event**

Parse `msg.timestamp` once as seconds since Unix epoch, persist it to the inbound message `sent_at`, and pass the same ISO instant plus the verified WhatsApp business account ID to the webhook service-role visit wrapper and `apply-customer-confirm`. Reject a missing/invalid webhook timestamp for a change command and hand it to staff without mutation; do not substitute processing time.

The encrypted Flow request type has no Meta message ID or provider timestamp. Give it a separate service wrapper: immediately after signature verification and decryption, pass the scoped Flow token/action plus a canonical request hash; PostgreSQL captures `statement_timestamp()` on the first idempotency claim and stores/replays that deadline instant. Do not use Flow-session creation time, Edge processing `new Date()`, a client field or the time of a retry. Add exact-15:00 and one-microsecond-late database fixtures for this source.

For webhooks, provider account ID plus message ID are the one idempotency source. For Flow, provider account ID plus the verified Flow token/action are the one source. The database stores the first command kind and canonical payload hash beside the claim; a retry with different classification/data is rejected rather than receiving a second command identity. Retried identical delivery replays the first receipt and never consumes another reschedule or emits another request.

- [ ] **Step 3: Use dated visit selection in both interaction paths**

Replace `group_id` selection with `booking_visits.id`. Labels use appointment date, all dog names and earliest slot. A recurring series produces separate choices per date. Before the deadline, an ambiguous target may ask the customer to choose. After the deadline—even when the action's self-service switch is disabled—ambiguity must not generate a clarification reply: pause the conversation and leave target linking to staff. For a reschedule, Flow sends only source booking IDs, proposed slots and the server review evidence; SQL copies commercial details from the source. Current server processing state is a second gate: a delayed signed on-time message received after visit start/arrival/service is staff-only and cannot mutate automatically, but because its trusted request instant was on time it receives one safe `The team will review this; your appointment has not been changed` acknowledgement and does not enter the late-intent silence pause unless another actual after-cutoff intent occurs.

- [ ] **Step 4: Replace create-then-cancel with one RPC**

Both the conversational agent and WhatsApp Flow call `reschedule_whatsapp_booking_visit`. The Edge handler never sends an outcome itself. A command atomically records the matching outbox outcome and returns its receipt; Flow may render that receipt inside the encrypted result screen, but any actual WhatsApp/SMS message is owned solely by the outbox attempt chain:

- `rescheduled`: enqueue/render old and new dated visit once;
- `change_waiting_staff`: enqueue/render only that staff will review, state that the original remains booked, and use the receipt's truthful `Slot held` or `Requested slot is not held`; do not claim the move succeeded, consume a move or pause the conversation merely because the **destination** is next-day-after-15;
- `late_request_paused`: the same database transaction has already recorded staff attention and paused automation, so send nothing;
- `staff_review_required`: processing-state safety has recorded staff attention without changing the visit or opening the late-intent pause; enqueue one safe review acknowledgement and leave ordinary/manual routing available;
- `blocked`: enqueue a deduplicated safe explanation only when the block is not the late deadline; `financial_review_required` says the appointment remains booked while staff review the additional payment and never claims that a deposit-only refund or cancellation completed;
- `deposit_website_required`: enqueue the website handoff; generate the short-lived continuation token only when the worker claims the send, not at mutation time;
- database/network error: mutate nothing and place the message in staff attention.

Apply the same sole-sender contract to create/cancel/waiting approval. No handler, `apply-customer-confirm`, fallback or Flow completion callback may also call the provider. Add handler-versus-worker race and provider-redelivery tests proving one outbound attempt chain per logical result.

The portal plan has already added the nullable policy-pause fields and private atomic request/contact/message/pause core. This migration adds only service-role cancel/reschedule/create wrappers and deterministic provider-idempotency derivation, all with explicit revokes. A late outcome calls that core so it inserts/reuses the request (or unresolved attention item for an ambiguous target) and changes the conversation to `human_takeover` with auto-send disabled in the same transaction. There must be no committed state where a late request exists but automation is still enabled.

Migrate `apply-customer-confirm/index.ts` as a first-class live caller. Its create, cancel and reschedule `Yes` branches must branch on server runtime: inactive/scheduled uses the new atomic visit dispatcher with the characterised legacy policy/copy; active passes the verified button event timestamp plus the exact stored review ID and never uses its current processing-time 24-hour test or direct per-row/group writes. A paid-deposit cancellation also passes the exact reviewed refund/explicit-credit choice. A v1 deposit-required create returns the outbox-owned website handoff and cannot confirm in WhatsApp. A pending-change receipt creates only the source-still-booked outbox outcome; an actual late receipt pauses atomically and enqueues no acknowledgement, while an on-time request that is unsafe only because processing reached start/arrival/service records staff attention and enqueues the one safe review acknowledgement without a policy pause. `No` remains non-mutating, invalidates the unused review, but cannot clear an existing policy pause. Add focused tests for all three `Yes` branches, refund/explicit-credit binding, missing/stale review, staff edit between prompt and Yes, legacy→v1 deadline display, auto-confirm-off held destination, next-day-after-15 unheld destination, exact boundary, switch-off late silence, delayed on-time processing after start/arrival/one-dog service, retry/provider reclassification conflict, provider timestamp, no direct `bookings` mutation and no direct provider send.

- [ ] **Step 5: Run and commit**

```bash
deno test --node-modules-dir=none --allow-env supabase/functions/whatsapp-agent/__tests__/dispatch.test.ts supabase/functions/whatsapp-agent/bookingPolicy.test.ts supabase/functions/apply-customer-confirm/index.test.ts supabase/functions/whatsapp-flow-endpoint/bookingPolicy.test.ts
npm run test:logic -- src/lib/whatsapp/manageBooking.test.ts src/lib/whatsapp/flowBooking.test.ts
npm run test:logic -- src/security/bookingPolicyWhatsAppWrappersMigration.test.ts
npm run test:db
npx supabase gen types typescript --local > /tmp/smarter-dog-database.types.ts
diff -u src/supabase/database.types.ts /tmp/smarter-dog-database.types.ts || true
cp /tmp/smarter-dog-database.types.ts src/supabase/database.types.ts
npm run typecheck
npx supabase gen types typescript --local > /tmp/smarter-dog-database.types.verify.ts
cmp -s src/supabase/database.types.ts /tmp/smarter-dog-database.types.verify.ts
```

Expected: no path can leave two active visits and duplicate webhook delivery is idempotent.

```bash
git add supabase/migrations/20260722200000_whatsapp_booking_policy_wrappers.sql supabase/tests/180_whatsapp_booking_policy_wrappers.test.sql src/security/bookingPolicyWhatsAppWrappersMigration.test.ts src/supabase/database.types.ts supabase/functions/whatsapp-agent/handler.ts supabase/functions/whatsapp-agent/__tests__/dispatch.test.ts supabase/functions/whatsapp-agent/bookingPolicy.test.ts supabase/functions/apply-customer-confirm/index.ts supabase/functions/apply-customer-confirm/index.test.ts supabase/functions/whatsapp-flow-endpoint/index.ts supabase/functions/whatsapp-flow-endpoint/db.ts supabase/functions/whatsapp-flow-endpoint/bookingPolicy.test.ts
git commit -m "fix: make WhatsApp rescheduling atomic"
```

---

### Task 3: Enforce the persisted late-change silence until staff resume automation

**Files:**
- Modify: `supabase/functions/whatsapp-agent/handler.ts`
- Modify: `supabase/functions/whatsapp-agent/bookingPolicy.test.ts`
- Modify: `src/supabase/hooks/inbox/useConversationLifecycle.js`
- Modify: `src/supabase/hooks/inbox/useConversationLifecycle.component.test.jsx`
- Modify: `src/components/views/inbox/InboxView.jsx`
- Modify: `src/components/views/inbox/InboxView.component.test.jsx`
- Modify: `src/components/views/inbox/thread/whyHeld.js`
- Modify: `src/components/views/inbox/thread/WhyHeldExplainer.test.js`

**Interfaces:**
- Uses authoritative human-scoped `booking_automation_pauses`, the nullable conversation projection fields and atomic private pause core created in portal Task 5.
- Completes service-only `pause_booking_change_automation(...)` integration and the staff-only `resolve_booking_change_and_resume(...)` workflow without adding a second pause implementation.

- [ ] **Step 1: Write fail-closed database tests**

Extend the Task 2 database tests to prove one transaction creates/reuses the late change request when a unique visit is known, opens/reuses the human-scoped pause, appends the request/attention pause item, projects every known thread to `human_takeover`, disables auto-send and records the trigger event/visit. For an ambiguous target, record staff attention with no linked visit and no customer reply; staff link or close it manually. Retrying is idempotent. Only staff can clear it, and only after every linked request/attention item is decided or explicitly closed. Test two visits and a concurrent resume-versus-new-request race.

- [ ] **Step 2: Put the pause guard before every automated path**

After persisting/deduplicating the inbound message and safely resolving the human, check the authoritative active human pause—not merely fields on the current conversation row—before intent routing, Claude calls, drafts, booking actions or auto-send. This catches a first WhatsApp message after a website-only pause and survives thread/phone changes. An ambiguous/shared-phone identity routes to staff without an automated reply rather than guessing around a possible pause. When set:

- normal webhook processing marks the event processed and returns without a draft or outbound message;
- staff `suggest_only` may return a suggestion to the compose box but cannot persist/send it automatically;
- a human-written staff send remains available.

When the triggering late intent is first detected, call `pause_booking_change_automation` before any response construction and return an empty automated outcome. The triggering message also receives no reply.

- [ ] **Step 3: Verify the website and WhatsApp paths share one pause**

The website route already invokes the portal-plan database command that creates the inbox message, creates/reuses staff attention and opens the human pause with `reason='late_booking_change'` in the same transaction. Add integration tests proving a website-created pause with no WhatsApp row suppresses the first later WhatsApp webhook, survives a verified phone change, does not cross a shared/duplicate phone, and a WhatsApp-created pause appears in the same staff queue. Neither path may pass through an auto-reply webhook or perform message and pause as separate commits.

- [ ] **Step 4: Add a clear staff state and explicit resume**

Inbox copy: `Late booking change — automation paused until staff resolve all linked items.` Show every `booking_automation_pause_items` row, its visit/request/attention state and every held customer outcome; never collapse a human-scoped pause to the first request. Staff resolve or explicitly close each item and choose `Send outcome` or `Handled manually` for each held outcome. `Resolve all items and resume` appears only when the authoritative server projection says every linked item is terminal and every held outcome is released or suppressed. The command takes the pause revision, re-locks the human, rejects a concurrent new item, settles all selected outcomes and only then clears the human pause atomically. Staff then choose whether to resume AI handling or keep Human only; never silently restore a stale previous mode. Keep the stored previous state for audit only. Tests cover two visits/multiple held outcomes, partial resolution, a concurrent new item and no premature whole-human resume.

- [ ] **Step 5: Run and commit**

```bash
npm run test:component -- src/supabase/hooks/inbox/useConversationLifecycle.component.test.jsx src/components/views/inbox/InboxView.component.test.jsx
npm run test:logic -- src/components/views/inbox/thread/WhyHeldExplainer.test.js
npm run test:db
deno test --node-modules-dir=none --allow-env supabase/functions/whatsapp-agent/bookingPolicy.test.ts
```

Expected: the trigger and every later inbound message stay silent until explicit staff resolution.

```bash
git add supabase/functions/whatsapp-agent/handler.ts supabase/functions/whatsapp-agent/bookingPolicy.test.ts src/supabase/hooks/inbox/useConversationLifecycle.js src/supabase/hooks/inbox/useConversationLifecycle.component.test.jsx src/components/views/inbox/InboxView.jsx src/components/views/inbox/InboxView.component.test.jsx src/components/views/inbox/thread/whyHeld.js src/components/views/inbox/thread/WhyHeldExplainer.test.js
git commit -m "feat: pause automation for late booking changes"
```

---

### Task 4: Route deposit-required WhatsApp bookings to the website

**Files:**
- Modify: `supabase/functions/_shared/bookingPolicy.ts`
- Modify: `supabase/functions/_shared/bookingPolicy.test.ts`
- Modify: `supabase/functions/whatsapp-agent/handler.ts`
- Modify: `supabase/functions/whatsapp-agent/bookingPolicy.test.ts`
- Modify: `supabase/functions/whatsapp-flow-endpoint/index.ts`
- Modify: `supabase/functions/whatsapp-flow-endpoint/bookingPolicy.test.ts`
- Modify: `src/CustomerApp.jsx`
- Create: `src/components/customer/booking/DepositContinuationGate.tsx`
- Create: `src/components/customer/booking/DepositContinuationGate.component.test.tsx`

- [ ] **Step 1: Test mandatory website handoff**

When the server deposit decision is required, neither WhatsApp path may create a confirmed visit, accept Terms or mark a deposit. The mutation creates/reuses one provisional visit and one durable handoff intent; its receipt contains only `deposit_website_required`, the visit identity and outcome key—never a continuation token. When the sole outbox worker claims that intent, the claim service mints one short-lived, single-purpose token bound to the human/visit/outcome, renders one website link and stores only the token hash/expiry. A retry of the same claim reuses the still-valid token or rotates it under the same logical outcome without another booking mutation. Flow does not mint a parallel token: it renders the generic authenticated website route or the same claimed outbox link when available. Customers authenticate before seeing or accepting booking details. Tests prove mutation logs/receipts contain no raw token, an unclaimed intent has none, cross-human/replay/expiry fail and handler/Flow/outbox races yield one logical handoff.

- [ ] **Step 2: Handle approval-first deposits**

When auto-confirm is disabled, WhatsApp creates `waiting_staff` without starting a deposit clock. If later staff approval makes it deposit-required, the visit stays unconfirmed and the visit-level outbox sends a website link for deposit Terms/payment. The link never lets a user act on another human's visit.

- [ ] **Step 3: Handle exemption receipts without false payment copy**

Same-day, last-minute and insufficient-window visits show their server exemption reason and never show bank instructions. A request that became deposit-required before the deadline stays required when staff check the payment later; the later verification timestamp cannot convert it into a last-minute exemption.

- [ ] **Step 4: Run and commit**

```bash
deno test --node-modules-dir=none --allow-env supabase/functions/_shared/bookingPolicy.test.ts supabase/functions/whatsapp-agent/bookingPolicy.test.ts supabase/functions/whatsapp-flow-endpoint/bookingPolicy.test.ts
npm run test:component -- src/components/customer/booking/DepositContinuationGate.component.test.tsx
npm run typecheck
```

Expected: deposit-required intent has no WhatsApp acceptance bypass.

```bash
git add supabase/functions/_shared/bookingPolicy.ts supabase/functions/_shared/bookingPolicy.test.ts supabase/functions/whatsapp-agent/handler.ts supabase/functions/whatsapp-agent/bookingPolicy.test.ts supabase/functions/whatsapp-flow-endpoint/index.ts supabase/functions/whatsapp-flow-endpoint/bookingPolicy.test.ts src/CustomerApp.jsx src/components/customer/booking/DepositContinuationGate.tsx src/components/customer/booking/DepositContinuationGate.component.test.tsx
git commit -m "feat: hand deposit bookings to the website"
```

---

### Task 5: Add a visit-level notification outbox and outcome worker

**Files:**
- Create: `supabase/migrations/20260722210000_booking_visit_notification_outbox.sql`
- Create: `supabase/tests/185_booking_visit_notification_outbox.test.sql`
- Create: `src/security/bookingVisitNotificationOutboxMigration.test.ts`
- Modify: `src/supabase/database.types.ts`
- Create: `supabase/functions/_shared/visitNotification.ts`
- Create: `supabase/functions/_shared/visitNotification.test.ts`
- Create: `supabase/functions/notify-booking-visit-outcome/index.ts`
- Create: `supabase/functions/notify-booking-visit-outcome/index.test.ts`
- Modify: `supabase/functions/resend-booking-notification/index.ts`
- Modify: `src/supabase/hooks/useDeliveryFailures.js`
- Modify: `src/supabase/hooks/useDeliveryFailures.test.js`
- Modify: `src/components/dashboard/DeliveryFailuresCard.jsx`
- Modify: `src/components/dashboard/DeliveryFailuresCard.component.test.jsx`
- Modify: `src/components/modals/booking-detail/DeliveryFailureCard.jsx`
- Modify: `src/components/modals/booking-detail/DeliveryFailureCard.component.test.jsx`

**Interfaces:**
- `booking_visit_notification_outbox` has one unique `(visit_id, outcome_key, channel)` row.
- Every row carries the monotonic visit-event sequence and optional predecessor/supersession rule; workers claim at most the next eligible outcome for one visit under a visit lock.
- `booking_visit_notification_attempts` records each claim/provider attempt separately, including `prepared`, `sending`, `accepted`, `failed_retryable` and `delivery_unknown`.
- Outcome kinds: `request_received`, `change_request_received`, `action_blocked`, `proposal_sent`, `declined`, `deposit_required`, `reschedule_deposit_required`, `deposit_received_confirmed`, `deposit_not_received`, `confirmed`, `cancelled`, `rescheduled`, `refund_due`, `credit_issued`, `day_before_reminder`.
- `deposit_required` is the one initial approval/payment-instruction outcome, not a reminder; no scheduled deposit reminder kind or job exists.
- `reschedule_deposit_required` is the distinct accepted-late-reschedule state: the destination is held and source superseded, but the replacement is unconfirmed pending website Terms/new payment or carry-forward. It states the audited old-deposit disposition and never uses confirmed-reschedule copy. The ordinary `rescheduled` outcome is enqueued only after the replacement actually confirms.
- Late source-deadline change requests, policy conversation pauses, incidents/no-show and staff-only notes never enqueue automatically. `request_received` applies only to ordinary new booking requests. `change_request_received` applies to an on-time reschedule awaiting staff: its immutable payload says the original remains booked and whether the requested destination is held; it never claims a replacement exists.
- A `booking-visit-notification-dispatch` pg_cron/pg_net job invokes the worker every minute. An expired `prepared` lease is retryable; an expired/ambiguous `sending` attempt becomes `delivery_unknown` and requires staff reconciliation unless that provider genuinely supports a tested idempotency key.
- Any outcome linked to a policy-paused conversation remains `held_for_staff` and unclaimable until staff explicitly resolve it as `send outcome` or `handled manually`; the latter records suppression so it can never send later.

- [ ] **Step 1: Write duplicate and privacy tests**

Prove a two-dog visit emits one logical confirmation, a retry reuses the same outbox row, an outcome change gets a new key, held and unheld `change_request_received` each render once with source-still-booked truth, non-late `action_blocked` is deduplicated, a pre-deadline `financial_review_required` action-blocked message preserves the appointment/additional-payment truth, and `reschedule_deposit_required` cannot render or race ahead as a confirmed reschedule. A post-deadline financial-review request obeys deadline precedence and sends nothing. Late change/pause and no-show insert none; a staff decision outcome stays held while its conversation is paused; manual handling suppresses it permanently; explicit release sends it once; customer-safe payload omits incident detail; the dispatcher job exists; exponential retry respects `next_attempt_at`; an expired pre-send lease is recoverable; and a conclusively failed delivery retries without reapplying the booking mutation. Add a crash-after-provider-acceptance fixture: the stale `sending` attempt becomes `delivery_unknown`, enters staff attention and is not blindly sent again. Add handler/outbox races proving handlers never send directly. Add ordering/staleness fixtures: `request_received` or `change_request_received` is suppressed when staff accept/decline before claim; `reschedule_deposit_required` precedes the later real `rescheduled` confirmation; `deposit_required` followed by withdrawal before dispatch is suppressed; a payment-instruction attempt first reaching send at/after its immutable deposit due time is suppressed/routed to staff without releasing the visit; an unsent confirmation superseded by cancellation does not send stale confirmation, while a confirmation already accepted by the provider is followed by—not raced by—the cancellation outcome.

- [ ] **Step 2: Create the outbox from committed visit events**

Insert outbox rows in the same transaction as the visit command. Store immutable event ID, its monotonic per-visit sequence, visit ID, human ID, template kind, data snapshot, applied deadline/booking timing, the visit's immutable `terms_publication_id` and any predecessor/supersession semantics. Time-sensitive rows carry `not_after`: `deposit_required` uses the deposit due time and `day_before_reminder` uses the customer change deadline. Resolve contact/channel and current truthful template variant at send time using existing recipient rules, but resolve booking-specific Terms URL/version from that visit publication—not current Settings. Do not copy the internal content hash into a customer payload and do not call external HTTP from inside the command transaction.

- [ ] **Step 3: Add one idempotent worker**

`notify-booking-visit-outcome` calls a security-definer claim RPC that locks the visit/outbox sequence, suppresses state-sensitive rows that are no longer true (`proposal_sent`, `deposit_required`, payment instructions and reminders), rejects any row whose `not_after <= statement_timestamp()`, resolves explicit terminal supersession, and claims only the next eligible row. Expired payment instructions/reminders create staff evidence where appropriate but never cancel/release the visit or send stale action/payment promises. Immediately before provider send, claim/render calls current server actionability again and chooses an approved pre-deadline, closed-deadline, same-day/last-minute or insufficient-window variant from stored policy/timing; this second check also applies to authorised retries. It atomically creates a `prepared` attempt and sets a short lease. Immediately before the external request it commits `sending` with a correlation key; after a provider response it completes through idempotent accepted/conclusive-failure RPCs and records provider IDs. Later sequence rows cannot overtake an unresolved `sending|delivery_unknown` predecessor. Only `prepared` leases and conclusively rejected/unsent attempts are automatically retryable. A timeout, process death or indeterminate connection after `sending` becomes `delivery_unknown`; the staff queue must reconcile it against provider logs and explicitly mark delivered or authorise a retry. Reuse a provider idempotency key only where the provider contract is documented and tested—database uniqueness alone is not exactly-once delivery. The worker must reuse the existing confirmation SMS fallback semantics where applicable.

Extend the existing delivery-failure hook/cards rather than hiding ambiguity in logs. `delivery_unknown` has distinct copy, correlation/provider evidence and exactly two audited actions after staff check: `Mark delivered` closes the logical outcome without another send; `Authorise retry` creates one new attempt. Ordinary confirmed failures retain their existing retry controls. Customer-facing cards never expose this staff queue.

Schedule `booking-visit-notification-dispatch` every minute using the repository's Vault-backed Supabase URL/service-secret pattern. Reapplying the migration replaces only that named job. Add a static migration test proving the URL is not hard-coded and the job invokes `notify-booking-visit-outcome`.

Keep legacy row triggers until the final contract task. Reuse Foundation Task 7's unforgeable private transaction command-context/outcome key to suppress them only while a visit command has atomically enqueued the corresponding outbox outcome. Never test `visit_id` alone: every dual-written legacy row has one. Inactive/scheduled legacy writers continue the characterised row-notification path and do not enqueue v1 outbox rows; active visit commands emit only the visit outcome.

- [ ] **Step 4: Run and commit**

```bash
npm run test:logic -- src/security/bookingVisitNotificationOutboxMigration.test.ts
npm run test:logic -- src/supabase/hooks/useDeliveryFailures.test.js
npm run test:component -- src/components/dashboard/DeliveryFailuresCard.component.test.jsx src/components/modals/booking-detail/DeliveryFailureCard.component.test.jsx
npm run test:db
deno test --node-modules-dir=none --allow-env supabase/functions/_shared/visitNotification.test.ts supabase/functions/notify-booking-visit-outcome/index.test.ts
npx supabase gen types typescript --local > /tmp/smarter-dog-database.types.ts
diff -u src/supabase/database.types.ts /tmp/smarter-dog-database.types.ts || true
cp /tmp/smarter-dog-database.types.ts src/supabase/database.types.ts
npm run typecheck
npx supabase gen types typescript --local > /tmp/smarter-dog-database.types.verify.ts
cmp -s src/supabase/database.types.ts /tmp/smarter-dog-database.types.verify.ts
```

Expected: exactly-once logical enqueue, retry-safe conclusive failures and no blind duplicate after ambiguous delivery tests PASS.

```bash
git add supabase/migrations/20260722210000_booking_visit_notification_outbox.sql supabase/tests/185_booking_visit_notification_outbox.test.sql src/security/bookingVisitNotificationOutboxMigration.test.ts src/supabase/database.types.ts supabase/functions/_shared/visitNotification.ts supabase/functions/_shared/visitNotification.test.ts supabase/functions/notify-booking-visit-outcome/index.ts supabase/functions/notify-booking-visit-outcome/index.test.ts supabase/functions/resend-booking-notification/index.ts src/supabase/hooks/useDeliveryFailures.js src/supabase/hooks/useDeliveryFailures.test.js src/components/dashboard/DeliveryFailuresCard.jsx src/components/dashboard/DeliveryFailuresCard.component.test.jsx src/components/modals/booking-detail/DeliveryFailureCard.jsx src/components/modals/booking-detail/DeliveryFailureCard.component.test.jsx
git commit -m "feat: add visit-level booking notifications"
```

---

### Task 6: Move day-before reminders to 10:00 Europe/London

**Files:**
- Create: `supabase/migrations/20260722220000_booking_policy_reminder_schedule.sql`
- Create: `supabase/tests/190_booking_policy_reminders.test.sql`
- Modify: `supabase/functions/notify-booking-reminder/index.ts`
- Create: `supabase/functions/notify-booking-reminder/index.test.ts`
- Modify: `supabase/functions/reminder-send/index.ts`
- Create: `supabase/functions/reminder-send/index.test.ts`
- Modify: `supabase/functions/reminder-sms-fallback/index.ts`
- Create: `supabase/functions/reminder-sms-fallback/index.test.ts`
- Modify: `src/lib/reminders/templates.js`
- Modify: `src/lib/reminders/templates.test.js`
- Modify: `src/supabase/hooks/useTomorrowReminders.js`
- Modify: `src/supabase/hooks/groupRemindersByCustomer.js`
- Modify: `src/supabase/hooks/groupRemindersByCustomer.test.js`
- Modify: `src/components/modals/send-reminder/SendReminderModal.jsx`
- Create: `src/components/modals/send-reminder/SendReminderModal.component.test.jsx`
- Modify: `src/components/modals/send-reminder/bookingToReminderRow.js`
- Modify: `src/components/modals/send-reminder/bookingToReminderRow.test.js`
- Modify: `src/components/modals/booking-detail/ReminderCard.jsx`
- Modify: `src/components/modals/booking-detail/ReminderCard.component.test.jsx`
- Modify: `src/components/dashboard/TomorrowRemindersCard.jsx`
- Create: `src/components/dashboard/TomorrowRemindersCard.component.test.jsx`

- [ ] **Step 1: Pin the London-time and eligibility matrix, with contract cases explicitly deferred**

Before Task 8 exists, pure/runtime-adapter tests cover GMT/BST dates, invocation at 09:00/10:00 UTC, explicit injected `inactive|scheduled|failed|active` results, confirmed active visits only, one reminder per multi-dog visit, no unconfirmed/pending/superseded visit and no duplicate immediate reminder for a booking confirmed after 10:00. Do not seed fictitious readiness/latch tables in this migration. The real readiness hash/revocation/finaliser-failure and persisted-active database cases are declared here but run after Task 8 creates those objects, then again in roadmap Task 4 Step 5. A 14:59 failed/leased reminder retried at or after 15:00 is suppressed, not sent with an expired action promise. The same matrix applies to the staff `reminder-send` endpoint and its SMS fallback: active runtime requires a visit ID, a policy-paused human is blocked until staff resolve it, caller-supplied stale text cannot override server copy, and a primary/fallback race still records one logical visit reminder.

- [ ] **Step 2: Add two UTC invocations behind an activation-aware London guard**

Keep current `daily-booking-reminder-1400-utc` and `daily-booking-reminder-1500-utc` jobs before activation. Add `daily-booking-reminder-0900-utc` and `daily-booking-reminder-1000-utc`. Every scheduled/manual/fallback entry reads the exact shared readiness-aware runtime predicate/irreversible latch—not `effective_at` alone. While inactive, scheduled or failed closed, only the existing London 15:00 legacy call may send; active runtime permits only the London 10:00 call. All other invocations exit successfully before claiming an outbox row. This makes the deployed dual schedule behaviourally identical before activation and DST-safe afterwards. The future activation finaliser removes the old jobs after the policy becomes effective. Hash drift, readiness revocation or delayed/failed finalisation tests prove no partial 10:00 switch.

- [ ] **Step 3: Render policy-specific deadline copy**

For `previous_day_1500_v1`:

```text
Reminder: [dogs] are booked for tomorrow, [date/time]. You can cancel or reschedule until 3:00 pm today. Full terms: [terms URL]
```

Legacy visits use their stored rolling deadline and must not be told a 3:00 pm rule that does not apply. Because grandfathered confirmed legacy visits legitimately have no `terms_publication_id`, their renderer uses the stored legacy deadline plus the current validated generic Terms URL and never requires deposit acceptance retroactively. Every v1 reminder requires the visit's immutable publication snapshot. A later Settings publication therefore affects the generic link on legacy copy and later v1 visits, but never an existing v1 visit.

`day_before_reminder.not_after` is that stored deadline. Claim and immediate pre-send checks require server time strictly before it. Once the deadline is reached, suppress the reminder rather than selecting a template that says the customer can still change; this applies to automatic, manual, retry and SMS fallback paths.

- [ ] **Step 3a: Migrate staff-triggered reminders and fallback to the same visit outcome**

At inactive/scheduled runtime, retain the characterised booking-row request for old staff bundles. At active runtime, `reminder-send` accepts one `visit_id`, rechecks staff authorisation plus confirmed/active state, loads all dogs from the safe visit projection, renders the applied policy/deadline/Terms server-side and claims the same visit reminder outcome used by the scheduled worker. It rejects arbitrary message/template text and returns the existing logical outcome when already sent. `SendReminderModal`, `bookingToReminderRow`, `ReminderCard` and `TomorrowRemindersCard` group/display by visit, list every dog and never offer a pending or policy-paused visit; staff must resolve the late-change conversation before sending a reminder.

`reminder-sms-fallback` consumes the failed primary delivery attempt for that visit/outcome rather than regrouping `notification_log` rows by customer or child booking. Before SMS it rechecks the shared runtime predicate, confirmed/active visit state, human pause and `not_after`; then it records the fallback provider result on the same delivery chain. A deadline-reached, cancelled/superseded, successful-primary or already-sent fallback cannot send again.

- [ ] **Step 4: Run and commit**

```bash
npm run test:logic -- src/lib/reminders/templates.test.js src/supabase/hooks/groupRemindersByCustomer.test.js src/components/modals/send-reminder/bookingToReminderRow.test.js
npm run test:component -- src/components/modals/send-reminder/SendReminderModal.component.test.jsx src/components/modals/booking-detail/ReminderCard.component.test.jsx src/components/dashboard/TomorrowRemindersCard.component.test.jsx
npm run test:db
deno test --node-modules-dir=none --allow-env supabase/functions/notify-booking-reminder/index.test.ts supabase/functions/reminder-send/index.test.ts supabase/functions/reminder-sms-fallback/index.test.ts
```

Expected at this first pass: pure/inactive/scheduled/failed adapter cases pass and one reminder per eligible visit is proven without inventing activation objects. Task 6 reaches its final green state only after Task 8 plus roadmap Task 4 Step 5 rerun the real active/revoked/finaliser cases and prove 10:00 London behaviour across DST.

```bash
git add supabase/migrations/20260722220000_booking_policy_reminder_schedule.sql supabase/tests/190_booking_policy_reminders.test.sql supabase/functions/notify-booking-reminder/index.ts supabase/functions/notify-booking-reminder/index.test.ts supabase/functions/reminder-send/index.ts supabase/functions/reminder-send/index.test.ts supabase/functions/reminder-sms-fallback/index.ts supabase/functions/reminder-sms-fallback/index.test.ts src/lib/reminders/templates.js src/lib/reminders/templates.test.js src/supabase/hooks/useTomorrowReminders.js src/supabase/hooks/groupRemindersByCustomer.js src/supabase/hooks/groupRemindersByCustomer.test.js src/components/modals/send-reminder/SendReminderModal.jsx src/components/modals/send-reminder/SendReminderModal.component.test.jsx src/components/modals/send-reminder/bookingToReminderRow.js src/components/modals/send-reminder/bookingToReminderRow.test.js src/components/modals/booking-detail/ReminderCard.jsx src/components/modals/booking-detail/ReminderCard.component.test.jsx src/components/dashboard/TomorrowRemindersCard.jsx src/components/dashboard/TomorrowRemindersCard.component.test.jsx
git commit -m "feat: send booking reminders at 10am London"
```

---

### Task 7: Align confirmation copy, Terms links and Meta templates

**Files:**
- Modify: `src/constants/salonPolicies.ts`
- Create: `src/constants/bookingPolicyCopy.ts`
- Create: `src/constants/bookingPolicyCopy.test.ts`
- Modify: `supabase/functions/notify-booking-confirmed/index.ts`
- Create: `supabase/functions/notify-booking-confirmed/index.test.ts`
- Modify: `supabase/functions/notify-booking-cancelled/index.ts`
- Create: `supabase/functions/notify-booking-cancelled/index.test.ts`
- Modify: `supabase/functions/whatsapp-admin/templates.ts`
- Modify: `supabase/functions/whatsapp-admin/templates.test.ts`
- Modify: `supabase/functions/_shared/visitNotification.ts`
- Modify: `supabase/functions/_shared/visitNotification.test.ts`
- Create: `docs/superpowers/runbooks/2026-07-22-booking-policy-copy-and-terms.md`

- [ ] **Step 1: Write one wording contract by outcome**

Pin concise UK-English copy for ordinary confirmation, waiting staff, held/unheld reschedule review, reschedule deposit required, deposit required, deposit received, deposit not received, decline, on-time cancellation, on-time reschedule and late staff proposal. Each applicable outcome names the visit date/all dogs and the deposit refund, credit, transfer or retention result.

V1 ordinary confirmation must say:

```text
You can cancel or reschedule until 3:00 pm on [previous date]. After that, your appointment remains booked and you will need to message the team. Full terms: [terms URL]
```

That is the **pre-deadline** variant only. Immediately before every first send or authorised retry, the server renderer chooses from these facts without client date inference:

- ordinary/insufficient-window at or before the exact deadline: the text above (`insufficient_window` also says no deposit is needed);
- ordinary/insufficient-window only after the deadline: `Changes closed at 3:00 pm on [previous date]. Your appointment remains booked; message the team if you need help. Full terms: [URL]`;
- same-day/actual last-minute: `No deposit is needed. Self-service changes are closed; contact the team before the appointment if you need help. Full terms: [URL]`;
- `change_request_received`: original appointment remains booked plus the snapshotted held/not-held destination statement;
- `reschedule_deposit_required`: destination held, replacement not yet confirmed, website Terms/payment or carry-forward still required, and the old-deposit disposition.

A confirmation first dispatched/retried at exactly 15:00:00 still uses the open-deadline variant; the next microsecond uses the closed variant. A confirmation enqueued at 14:59 but first dispatched/retried at 15:01 therefore uses closed copy. This includes a pre-deadline deposit hold that staff verify after 15:00. `day_before_reminder` is separately suppressed at its deadline as defined in Task 6 because an at-deadline reminder would no longer be useful; that delivery rule must not leak into actionability or confirmation copy. Add exact-boundary, next-microsecond and 14:59→15:01 tests for WhatsApp, SMS fallback and any retained email renderer.

The general onboarding Terms acceptance remains unchanged. Every v1 visit stores its immutable Terms publication for booking-specific links; only a deposit-required booking additionally records customer acceptance of that publication and its timestamp.

- [ ] **Step 2: Centralise the Terms URL and applied-policy renderer**

Generic policy/settings copy reads the current validated URL from authoritative policy settings, with `https://smarterdog.co.uk/terms` as the default. Booking-specific v1 website, WhatsApp, staff confirmation, deposit/payment outcome and reminder paths instead resolve URL/version through the visit's immutable `terms_publication_id`. `_shared/visitNotification.ts` is the active outbox renderer and must consume that snapshot plus current server actionability at send time; do not leave it with task-local wording or join today's Settings publication. Its explicit grandfathered branch accepts only `policy_code='legacy_24h'` with a null publication, renders the stored rolling deadline and current generic URL, and never treats that null as a failed v1 setup. A v1 null publication is invalid and routes staff-only without sending. Tests change Settings while a v1 hold/outbox row exists and before an authorised retry: the old v1 visit always renders its old URL/version, while a later v1 visit uses the new publication; separate legacy-null confirmation/reminder fixtures keep sending correct rolling-deadline copy with the validated generic URL.

- [ ] **Step 3: Prepare but do not submit Meta template changes**

Document exact Meta template names/variants for pre-deadline, closed-deadline, same-day/last-minute, insufficient-window, held/unheld change request and reschedule-deposit-required copy, including variable order, example values and category. Add tests that the code-side template registry matches the proposed Meta definitions. The Terms checklist must explicitly verify the unusual late-reschedule rule—not hide it under generic late-change wording: on accepted unwaived late reschedule the old deposit is normally retained **and** a new £10 deposit is normally required; carry-forward is an audited staff exception; and the replacement remains unconfirmed until the customer completes website Terms/payment. The runbook requires external Terms publication and every required Meta variant approval before activation; repository completion alone is not approval.

- [ ] **Step 4: Run and commit**

```bash
npm run test:logic -- src/constants/bookingPolicyCopy.test.ts
deno test --node-modules-dir=none --allow-env supabase/functions/_shared/visitNotification.test.ts supabase/functions/notify-booking-confirmed/index.test.ts supabase/functions/notify-booking-cancelled/index.test.ts supabase/functions/whatsapp-admin/templates.test.ts
```

Expected: every outcome has one tested renderer; generic copy has one current URL source and booking-specific copy has one immutable visit-publication source.

```bash
git add src/constants/salonPolicies.ts src/constants/bookingPolicyCopy.ts src/constants/bookingPolicyCopy.test.ts supabase/functions/_shared/visitNotification.ts supabase/functions/_shared/visitNotification.test.ts supabase/functions/notify-booking-confirmed/index.ts supabase/functions/notify-booking-confirmed/index.test.ts supabase/functions/notify-booking-cancelled/index.ts supabase/functions/notify-booking-cancelled/index.test.ts supabase/functions/whatsapp-admin/templates.ts supabase/functions/whatsapp-admin/templates.test.ts docs/superpowers/runbooks/2026-07-22-booking-policy-copy-and-terms.md
git commit -m "feat: align booking policy messages"
```

---

### Task 8: Add activation-safe compatibility dispatch and hosted test coverage

**Files:**
- Create: `supabase/migrations/20260722230000_booking_policy_contract.sql`
- Create: `supabase/tests/195_booking_policy_contract.test.sql`
- Create: `src/security/bookingPolicyContractMigration.test.ts`
- Modify: `src/supabase/database.types.ts`
- Modify: `scripts/run-hosted-pgtap.sh`
- Modify: `docs/migrations.md`

- [ ] **Step 1: Prove all production callers use visit commands**

Run and classify every match:

```bash
rg -n "cancel_customer_booking\(|reschedule_customer_booking\(|deposit-auto-release|status.*Cancelled|booking_slot.*update|booking_date.*update" src supabase/functions supabase/migrations
```

Expected before the compatibility migration: only explicit runtime-dispatched wrappers, historical migrations and tests remain. The current `117_customer_reschedule.test.sql` and every pre-activation `140`–`195` pgTAP file must be listed by `scripts/run-hosted-pgtap.sh`; Task 11 later adds `200`.

- [ ] **Step 2: Write contract precondition tests**

Fail unless:

- every `bookings` row has a reconciled `visit_id`;
- every structural backfill/reconciliation queue is empty. In particular, mixed active/terminal child groups, ambiguous human/date/group identity, commercial-confirmation ambiguity and money conflicts cannot be waived by generic sign-off; staff must split/correct them or record an explicit compatibility mapping that excludes terminal children, after which the blocking query itself reaches zero;
- no active visit has mixed humans, dates or duplicate dog rows;
- no visit has multiple active successors;
- no per-dog deposit conflict remains;
- legacy wrappers reject altered dog/service/add-on/price payloads;
- direct visit-owned writes are blocked;
- visit notification suppression prevents old row triggers from double-sending.
- every pending/retry/leased legacy `notification_log` row for booking confirmations, outcomes or reminders is drained, mapped once to the visit outbox or immutably suppressed before activation; unrelated welcome/ready/waitlist traffic is excluded by explicit kind, not a broad table clear;
- `notification-pending-reaper` and hourly fallback recheck current visit state, human pause, runtime and mapped/suppressed identity so a legacy row crossing activation cannot send stale/duplicate policy copy;
- future-finaliser scheduling resolves London midnight correctly in GMT and BST, and every legacy cron guard becomes a no-op at the exact effective instant even if finalisation is delayed.
- a release-readiness marker is owner-recorded, immutable/revocable and bound to the exact Terms URL/version/content hash, Meta template set, settings/bank hash and release SHA;
- while an activation is scheduled, ordinary Booking Rules saves cannot alter its frozen settings; an owner must cancel with a reason, change settings, record fresh readiness and obtain fresh activation approval;
- finalisation fails closed when any readiness/settings/release hash differs, leaves legacy jobs live and creates a staff alert without exposing v1.

- [ ] **Step 3: Apply expand/contract cleanup without activation**

Do **not** set `bookings.visit_id` not null or revoke stale-client RPCs before activation. The foundation insert trigger must continue filling omitted visit IDs, and write guards run in audit/compatibility mode while runtime is inactive/scheduled. Make every legacy RPC explicitly runtime-dispatched:

- before active, `create_customer_booking_group`, `cancel_customer_booking`, `reschedule_customer_booking`, `create_whatsapp_booking_group` and `apply_whatsapp_booking_action` preserve their characterised legacy result while dual-writing/mirroring visit state;
- after active, old cancel **and** reschedule payloads fail before mutation with `SDB_CLIENT_REFRESH_REQUIRED` unless they carry equivalent server-issued, revision-bound review evidence. Dated-visit ambiguity alone is insufficient because an old cancel cannot prove it showed every current dog/details or survive a concurrent staff edit. Only the current versioned preview-plus-command client may cancel or create the replacement; add multi-dog/staff-edit stale-cancel tests;
- after active, an old create/confirm payload that cannot represent staff approval, deposit Terms/credit or the v1 receipt fails before insert with `SDB_CLIENT_REFRESH_REQUIRED`, causing the web/Flow caller to refetch runtime and restart on the current journey;
- no wrapper accepts a client timestamp or downgrades to legacy after active.

At active runtime, triggers reject direct visit-owned changes from stale raw clients with the same refresh-required error and leave the visit unchanged. Keep the wrappers during a documented ageing window. Defer `visit_id not null`, wrapper revocation and physical legacy-column drops to the post-activation retirement task after telemetry proves no stale reads/writes.

Do not unschedule `deposit-auto-release` in a standalone partial deployment or when merely scheduling a future activation. Foundation Task 3 already replaced its body with the named activation-aware compatibility function. This contract migration must assert that the existing job still targets that exact guarded function, that inactive/scheduled preserves only `legacy_compat`, and that active/`visit_v1` is a no-op; it may harden grants or fail deployment, but must not independently reimplement a second guard. There is no replacement deposit timer: `Deposit check due` is derived from visit-deposit state and time.

Inventory the legacy notification backlog by explicit booking confirmation/outcome/reminder kinds. Add an idempotent migration/owner command that drains deliverable rows before activation or maps their logical identity to the new visit outbox, and suppresses stale duplicates with immutable audit; never bulk-delete them. Once activation is scheduled, every legacy policy-notification producer takes the activation advisory lock and creates its legacy row plus an immutable bridge/mapping identity in one transaction; if the latch won first it routes only through the active visit outbox. Every legacy claim and final send-permit check takes that lock and rechecks the persisted latch/current visit/human pause/mapping. At/after the scheduled instant an unresolved `scheduled` attempt must invoke/wait for the latch before sending; `active` forbids the legacy provider call, while `failed` explicitly continues the normal legacy timing/copy and bridge audit rather than blacking out messages. The latch's final locked sweep maps all pending/retry/expired-lease policy rows and fails closed—leaving those rows deliverable by legacy—if any row is unmappable or any provider attempt is still `sending`/`delivery_unknown`; only a successful active transition immutably suppresses the bridged legacy sends. It can become active only with zero unbridged or in-flight policy rows. Thus a post-readiness/post-schedule insert cannot appear in the gap. Preserve unrelated welcome, ready and waitlist notifications unchanged. Add a producer-versus-latch race, a policy row inserted after scheduling, leases obtained on both sides of midnight, a send-permit-versus-latch race, pending/retry/expired lease, each failed-latch cause followed by a successful legacy send, and mixed unrelated traffic to pgTAP/Deno tests.

Create `booking_policy_release_readiness` and `booking_policy_activation_schedule` plus append-only readiness-revocation/audit rows. Owner-only `record_booking_policy_release_readiness(...)` records the exact current `terms_publication_id` plus its URL/version/content SHA-256, Meta template-set identifier, current authoritative settings/bank hash, refund-calendar coverage and release SHA after the external checks; it cannot infer publication/approval. Revoke direct writes. A later settings or release mismatch does not silently update the marker.

Create, but do not call, owner-only `schedule_previous_day_1500_policy_activation(p_effective_date date, p_readiness_id uuid)`. It rejects unless `public.is_owner()` is true, rejects a non-future date, resolves exactly midnight in `Europe/London`, requires an unrevoked matching readiness marker, complete bank settings, a non-null current Terms publication whose ID/URL/version/content hash exactly equal the marker, current refund-calendar coverage, empty blocking reconciliation views and zero unresolved `legacy_import` holds in `awaiting_terms|awaiting_payment|received_liability|reconciliation_required`. It permits only one live schedule, assigns no policy to unconfirmed visits, stores the frozen hashes/future instant in an immutable schedule row, schedules one uniquely named internal latch/finaliser job, and appends actor/readiness/release/effective instant to `booking_policy_audit`. It does **not** set the immutable policy-version `effective_at` yet and must not unschedule or otherwise change live legacy jobs at call time. The latch repeats the legacy-hold query under its advisory lock; a hold created or reopened after scheduling makes that attempt `failed` and legacy runtime continues.

While schedule state is `scheduled`, `update_booking_rules` rejects changes to every frozen predicate input with `activation_schedule_locked`; the separate emergency intake-disable control remains available. Owner-only `cancel_scheduled_booking_policy_activation(p_reason)` works only **before** the effective instant, requires a reason, unschedules the job and audits cancellation. Readiness revocation is also rejected at or after that instant. There is no at/after-instant reset or cancellation of the same attempt: the first runtime/job evaluation under the activation advisory lock must durably latch it `active` or `failed` before returning. A failed row remains immutable proof that v1 was never exposed; recovery creates fresh readiness and a new future schedule row rather than clearing/reusing it. Once active, it is irreversible. Revoke all owner commands from `public`, `anon` and `service_role`; grant `authenticated` only because Supabase shares that database role and rely on the explicit owner gate inside each security-definer function.

Before replacing the runtime helper, put every behaviour-changing legacy producer behind the same transaction-scoped activation advisory lock whenever a live schedule exists. This includes legacy create/cancel/reschedule/confirm wrappers, direct-write compatibility triggers, deposit stamping/payment mirror, `deposit-auto-release`, reminder state mutation and notification enqueue. Each acquires the lock before runtime dispatch, re-evaluates the persisted state after acquiring it and holds the lock through its mutation commit. A pre-midnight command paused across midnight therefore either commits fully before the latch or wakes after it and follows `active|failed`; it can never commit a legacy mutation after an active latch. The latch takes the same lock through validation and its state commit. Add deterministic barrier tests for create, cancel, reschedule, raw compatibility write and auto-release started just before midnight while another session tries to latch.

Replace `booking_policy_runtime_at` in this contract migration with one exact frozen-schedule predicate plus an irreversible **persisted** latch. Before the stored London-midnight instant it returns `scheduled`. At/after that instant, the first caller/job takes the activation advisory lock and atomically validates the still-unrevoked readiness plus frozen release/settings/bank/Terms/refund-calendar hashes, rechecks zero unresolved legacy deposit holds, runs the final legacy-policy-notification bridge sweep and proves there is no in-flight or ambiguous send. On success it persists `state='active'`, `activated_at` and the policy-version `effective_at` **before** returning active; on any hash, legacy hold, backlog, lease or delivery ambiguity it persists `state='failed'` and returns fail-closed legacy. Legacy producers and workers share that lock, so none can commit or gain a send permit between the sweep and latch. `failed` is an explicit stable legacy runtime: legacy commands/jobs/messages continue until a newly approved future schedule, while v1 remains unexposed. No call may observe an unpersisted/transient active predicate, so later revocation/settings/finaliser timing can never revert after any v1 mutation. `policy_for_confirmation`, commands and every job guard use that same latch, never `effective_at` alone. Once active, later legitimate Booking Rules saves affect future decisions without reverting to legacy, and marker revocation is denied. Add concurrent exact-instant fixtures proving one latch winner, a pre-midnight legacy unpaid hold blocking a post-midnight receipt/cutover, resolution followed by a fresh future schedule, post-schedule enqueue and legacy-mutation serialisation, no active→legacy transition, active plus later settings save, and failed hash/revocation/backlog/in-flight cases followed by ordinary legacy operation.

Replace `booking_policy_runtime_status()` in the same migration. It reads only the persisted schedule/latch and returns the customer-safe `{state, scheduledEffectiveAt}` contract: `scheduled` before the frozen instant, `failed` after a failed latch, and `active` only after the durable active row commits. It exposes no readiness/failure/hash/actor detail. Application and Edge enforcement still uses `booking_policy_runtime()='active'`; status timestamps merely schedule refetches. Test privacy, an already-open client observing scheduled→failed and scheduled→active, and failed continuing legacy behaviour.

Create internal `smarter_dog_private.finalize_previous_day_1500_policy(timestamptz,uuid)`, executable only by the database job owner. At/after the expected effective instant, under the same advisory lock, it invokes/reuses the latch. On active it marks cleanup/audit complete and unschedules `deposit-auto-release`, `daily-booking-reminder-1400-utc`, `daily-booking-reminder-1500-utc` and its own job. If another runtime caller latched active first, cleanup may be delayed but runtime/job guards are already irreversibly active. On failed it keeps legacy jobs intact, records the staff alert and disables that immutable attempt; recovery requires a new future schedule. Add scheduled-input mutation, pre-instant cancellation, at/after cancellation/revocation rejection, hash drift, concurrent first-call and delayed-cleanup tests.

- [ ] **Step 4: Run local and hard-locked hosted pgTAP**

```bash
npm run check:migrations
npm run test:logic -- src/security/bookingPolicyContractMigration.test.ts
npm run test:db
npx supabase gen types typescript --local > /tmp/smarter-dog-database.types.ts
diff -u src/supabase/database.types.ts /tmp/smarter-dog-database.types.ts || true
cp /tmp/smarter-dog-database.types.ts src/supabase/database.types.ts
npm run typecheck
npx supabase gen types typescript --local > /tmp/smarter-dog-database.types.verify.ts
cmp -s src/supabase/database.types.ts /tmp/smarter-dog-database.types.verify.ts
git diff --check
scripts/run-hosted-pgtap.sh btjnxvgkpdbfrrqxvkfj
```

Review the displayed generated diff before the copy. The second generation and `cmp` are the equality gate after replacement. Expected: local and staging schema tests PASS; the script refuses every non-staging project reference.

- [ ] **Step 5: Commit the contract**

```bash
git add supabase/migrations/20260722230000_booking_policy_contract.sql supabase/tests/195_booking_policy_contract.test.sql src/security/bookingPolicyContractMigration.test.ts src/supabase/database.types.ts scripts/run-hosted-pgtap.sh docs/migrations.md
git commit -m "chore: complete booking policy compatibility contract"
```

---

### Task 9: Validate staging across customer, staff and WhatsApp journeys

**Files:**
- Create: `e2e/booking-policy-whatsapp.spec.ts`
- Create: `e2e/booking-policy-notifications.spec.ts`
- Modify: `e2e/fixtures/bookingPolicyActiveRuntime.ts`
- Create: `docs/superpowers/runbooks/2026-07-22-booking-policy-staging-validation.md`

- [ ] **Step 1: Deploy only to the approved staging project**

Follow the repository staging runbook and record commit SHA, migration list, Edge Function versions, policy effective value and cron jobs. Confirm `previous_day_1500_v1.effective_at is null` before and after deployment.

- [ ] **Step 2: Exercise the atomic duplicate-bug regression**

On shared **inactive** staging, use a visit inside its legacy rolling-24-hour deadline. Attempt a Flow and agent reschedule. Assert the new atomic legacy dispatcher creates no destination, leaves the source active and returns the characterised legacy policy/copy; it must not expose a v1 staff request/pause/silence state early.

- [ ] **Step 3: Exercise notification and reminder outcomes**

Run the complete app, Edge Functions and database against the disposable active local/branch fixture from the portal plan; this is mandatory, not optional. There, repeat the next-day-after-v1-deadline Flow and agent regression: no destination visit, source active, one human pause item/staff request, no trigger or later automated reply, and staff resolve/resume only after every linked item closes. Cover reviewed create/cancel/reschedule, held/unheld change reviews, sender binding, provider reclassification, sole outbox sender, website-first pause then first WhatsApp, and Flow result-screen versus outbound separation.

For a multi-dog visit, verify exactly one request, confirmation, cancellation/reschedule and deposit outcome per committed transition. On shared inactive staging, prove the existing London 15:00 reminder path sends and the 10:00 path exits. On the disposable active full stack, prove the real public runtime, portal/staff UI, WhatsApp wrappers, outbox worker and scheduled/manual/fallback guards use 10:00 only, suppress at the 15:00 deadline and remain correct across GMT/BST. Verify pending visits/reservations never enter calendars/reminders. Teardown must prove the active fixture state is gone; never activate shared staging merely to test active behaviour.

- [ ] **Step 4: Exercise external readiness without changing production**

Record:

- public Terms page draft covers every topic in the signed design;
- proposed Meta templates and variables match the repository registry;
- complete bank details are stored through settings and displayed correctly in staging;
- staff can see and operate every attention/reconciliation queue;
- cancellation/rescheduling switches plus audited `set_customer_booking_intake_enabled(false, reason)` stop new self-service actions without deleting audit or blocking withdrawal/eligible cancellation of existing visits.

- [ ] **Step 5: Run the full verification bar**

```bash
npm run lint
npm run typecheck
npm run check:migrations
npm run test
npm run test:db
deno test --node-modules-dir=none --allow-env supabase/functions/
npx playwright test e2e/customer-booking-policy.spec.ts e2e/staff-booking-policy.spec.ts e2e/booking-policy-whatsapp.spec.ts e2e/booking-policy-notifications.spec.ts
npm run build
```

Expected: shared inactive staging compatibility and the disposable full active-stack suite both PASS. An unavailable active fixture, dependency or unapproved external template remains an explicit release blocker; clock-injected unit tests do not substitute for active integrated routing.

- [ ] **Step 6: Commit staging acceptance coverage**

```bash
git add e2e/booking-policy-whatsapp.spec.ts e2e/booking-policy-notifications.spec.ts e2e/fixtures/bookingPolicyActiveRuntime.ts docs/superpowers/runbooks/2026-07-22-booking-policy-staging-validation.md
git commit -m "test: validate booking policy staging journeys"
```

---

### Task 10: Activate at a future London midnight with audited rollback

**Files:**
- Create: `docs/superpowers/runbooks/2026-07-22-booking-policy-activation.md`
- Create: `scripts/verify-booking-policy-readiness.mjs`
- Create: `src/security/bookingPolicyReadiness.test.ts`

- [ ] **Step 1: Encode the release checklist**

The readiness script exits non-zero unless all of these are true:

- application and Edge Function target SHAs match the approved release;
- schema and hosted pgTAP are green;
- the current immutable Terms publication is HTTPS and staff have manually confirmed its live URL/version/content hash;
- live Terms explicitly state the default retain-old-plus-new-£10 late-reschedule rule, audited carry-forward exception and website Terms/payment requirement before replacement confirmation;
- required Meta templates are approved;
- complete bank details exist;
- an unrevoked release-readiness marker matches the live Terms content hash/version, Meta template set, settings/bank hash, refund-calendar coverage and release SHA;
- no backfill, payment, refund or conversation-pause anomaly blocks release;
- no unmapped/undrained legacy booking-confirmation/outcome/reminder notification, lease or retry can cross activation; unrelated notification kinds are counted separately and remain untouched;
- overdue deposit attention is proven to be derived without a replacement cron; activation guards on the legacy deposit/reminder jobs are installed; and the legacy jobs are still present immediately before the effective instant;
- the requested effective date is a future date and resolves to exactly `00:00 Europe/London`.

- [ ] **Step 2: Require a fresh explicit production approval**

The runbook separates read-only readiness from mutation. It must display the exact project reference, release SHA, readiness marker ID, Terms version/content hash, effective instant, jobs to unschedule and policy row/schedule to update, then stop for owner approval. Recording or revoking the readiness marker is also a separate audited production mutation requiring approval. Do not infer approval from approval to implement this plan.

- [ ] **Step 3: Activate atomically**

After approval, call `schedule_previous_day_1500_policy_activation(chosen_date, readiness_id)`. In one database transaction it:

1. validates the exact unrevoked readiness marker/hashes and that v1 has never been activated;
2. leaves already confirmed visits assigned to `legacy_24h`;
3. leaves unconfirmed visits without a policy until first commercial confirmation;
4. records the immutable chosen London-midnight instant and frozen inputs in the activation schedule, leaving the policy-version `effective_at` null until the exact-instant latch succeeds;
5. schedules the internal latch/finaliser for that instant without changing live legacy behaviour early;
6. records actor, Terms version, release SHA and effective instant in immutable audit.

At the exact effective instant, the first runtime/job caller atomically persists either the valid irreversible active latch (including policy `effective_at`) or a failed attempt; only then may runtime, policy assignment and job guards switch together. Cleanup removes obsolete jobs plus itself after an active latch. No customer policy changes before that instant. A replacement of a legacy visit is assigned v1 when it confirms. If readiness is revoked/drifts before the instant, the attempt latches failed, legacy remains live and staff create fresh readiness plus a new future schedule; there is no reset/reuse or automatic reschedule.

- [ ] **Step 4: Monitor the first 48 hours**

At activation, +15 minutes, +2 hours, first 10:00 reminder, first 15:00 boundary, +24 hours and +48 hours, record:

- duplicate active visits per lineage;
- command failures/replays and capacity conflicts;
- notification duplicates/failures;
- late change requests and paused conversations;
- unconfirmed, overdue-deposit and reconciliation queues;
- policy assignment split between legacy and v1;
- staff overrides, without exposing customer detail in the runbook.

- [ ] **Step 5: Use non-destructive rollback**

If required, call audited `set_customer_booking_intake_enabled(false, reason)`, disable cancellation/rescheduling switches and keep WhatsApp change handling in staff-only mode. Existing withdrawal and any intentionally retained cancellation path remain available. Do not rewrite `policy_code`, delete visits, recreate old deposit auto-cancellation, erase ledgers or remove audit. Fix forward, then re-enable deliberately.

- [ ] **Step 6: Commit the activation tooling before production use**

```bash
npm run test:logic -- src/security/bookingPolicyReadiness.test.ts
node scripts/verify-booking-policy-readiness.mjs --help
git add docs/superpowers/runbooks/2026-07-22-booking-policy-activation.md scripts/verify-booking-policy-readiness.mjs src/security/bookingPolicyReadiness.test.ts
git commit -m "docs: add booking policy activation gate"
```

Expected: tests PASS and `--help` performs no network or database mutation.

---

### Task 11: Retire stale-client compatibility after the monitoring window

**Files:**
- Create: `supabase/migrations/20260725120000_booking_policy_legacy_retirement.sql`
- Create: `supabase/tests/200_booking_policy_legacy_retirement.test.sql`
- Create: `src/security/bookingPolicyLegacyRetirementMigration.test.ts`
- Modify: `src/supabase/database.types.ts`
- Modify: `scripts/run-hosted-pgtap.sh`
- Modify: `docs/migrations.md`

- [ ] **Step 1: Require separate post-activation evidence and approval**

Do not run this task merely because activation succeeded. Require at least the completed 48-hour monitoring window, zero `visit_id is null`, zero unresolved dual-write anomalies, zero calls from stale app/Flow versions during the agreed ageing period, current front-end/Edge Function versions everywhere, and a fresh explicit production migration approval.

- [ ] **Step 2: Write retirement tests first**

Prove `bookings.visit_id` can be set not null, old public create/cancel/reschedule grants are revoked, direct visit-owned writes remain blocked, all current commands still work, historical legacy visits remain readable and no policy/financial/audit row is deleted. Add `200_booking_policy_legacy_retirement.test.sql` to the hard-locked hosted runner.

- [ ] **Step 3: Apply only safe contract constraints**

Set `bookings.visit_id` not null and revoke obsolete wrapper execution after preconditions pass. Keep compatibility columns physically present but read-only until a later storage-maintenance decision; column deletion is not needed to complete this policy and must not be bundled with activation.

- [ ] **Step 4: Verify and commit**

```bash
npm run check:migrations
npm run test:logic -- src/security/bookingPolicyLegacyRetirementMigration.test.ts
npm run test:db
npx supabase gen types typescript --local > /tmp/smarter-dog-database.types.ts
diff -u src/supabase/database.types.ts /tmp/smarter-dog-database.types.ts || true
cp /tmp/smarter-dog-database.types.ts src/supabase/database.types.ts
npm run typecheck
npx supabase gen types typescript --local > /tmp/smarter-dog-database.types.verify.ts
cmp -s src/supabase/database.types.ts /tmp/smarter-dog-database.types.verify.ts
git diff --check
scripts/run-hosted-pgtap.sh btjnxvgkpdbfrrqxvkfj
git add supabase/migrations/20260725120000_booking_policy_legacy_retirement.sql supabase/tests/200_booking_policy_legacy_retirement.test.sql src/security/bookingPolicyLegacyRetirementMigration.test.ts src/supabase/database.types.ts scripts/run-hosted-pgtap.sh docs/migrations.md
git commit -m "chore: retire legacy booking policy writes"
```

Expected: every gate PASS with no destructive history cleanup.

## Completion Gate

The programme is complete only after the owner-approved activation, first 48-hour monitoring window and recorded release evidence. Repository implementation and staging success alone do not authorise or constitute production activation.
