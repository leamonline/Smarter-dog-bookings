# Measurement catalogue

**Catalogue version:** 1.1.0
**Status:** A0 definitions plus initial report-quality implementation; no live baseline
**Authority:** Metric definitions and decision use for issue #612
**Work package:** [#615](https://github.com/leamonline/Smarter-dog-bookings/issues/615)
**Baseline:** `main@8eb8800fb345aeeba4887b266a4ff95a85fb7802`
**Last verified:** 9 August 2026

## Purpose

This catalogue defines what Smarter Dog means by its initial product and
operational measures before changing instrumentation. It supports
prioritisation, incident detection and STOP/GO review without pretending that
an existing table is automatically a trustworthy metric.

A0 was documentation only. The first implementation slice under #612 improves
the existing funnel and denial reports without new events, schema or retention.
It does not establish a live baseline or approve a rollout threshold. See the
[implementation plan](../plans/active/2026-09-08-issue-612-measurement-quality.md).

## Confidence scale

| Confidence | Meaning |
|---|---|
| **High** | Stable identity, complete source and tested transitions support the definition. |
| **Medium** | The source is useful but best-effort, incomplete by channel or not yet reconciled. Treat the result as directional. |
| **Low** | A proxy or fragmented source exists but cannot yet support a rollout decision alone. |
| **None** | No current canonical source can calculate the definition. |

No metric below has a verified numerical baseline at this repository baseline.

## Source and channel taxonomy

Current values are inconsistent: denial events use `portal`, `whatsapp_flow`,
`staff`, `system` and `unknown`, while booking rows also contain values such as
`staff_manual` and WhatsApp-specific sources. A later instrumentation change
should map existing values into this versioned reporting vocabulary without
rewriting historical raw data:

| Dimension | Canonical value | Meaning |
|---|---|---|
| `operation_source` | `staff_diary` | Staff created or changed the appointment from diary/admin surfaces. |
| `operation_source` | `staff_inbox` | Staff applied an appointment action from an Inbox conversation. |
| `operation_source` | `customer_portal` | Customer used the authenticated web journey. |
| `operation_source` | `whatsapp_flow` | Customer used a structured WhatsApp Flow. |
| `operation_source` | `whatsapp_assistant` | A guarded assistant proposal reached a customer confirmation/server command boundary. |
| `operation_source` | `system` | A scheduled or internal process originated the operation. |
| `operation_source` | `unknown` | Historical or malformed source cannot be classified; never silently coerce it. |
| `delivery_channel` | `whatsapp`, `sms`, `email`, `webpush`, `none` | The communication medium, independent of operation source. |

The raw value and taxonomy version should remain available during migration so
mapping errors are detectable.

## Metrics

### `MET-OP-001` — successful appointment operations by source

- **Question:** Which source completes appointment operations successfully?
- **Definition:** Count unique appointment operations with a committed terminal
  receipt. Completion rate is committed terminal operations divided by all
  terminal operation attempts for the same operation kind and source.
- **Exclusions:** Demo/test traffic; malformed attempts without trustworthy
  identity; idempotent replay from the success count; multi-dog booking lines
  after the first operation-level count.
- **Dimensions:** operation kind, `operation_source`, customer/staff boundary,
  single/multi-dog, capability generation.
- **Current source/confidence:** `bookings.source`, channel-specific RPC effects
  and inactive visit audit/receipt foundations. No common live operation ID;
  **Low**.
- **Owner:** @leamonline (repository owner; assigned 9 September 2026).
- **Privacy:** Restricted operational identifiers in source; aggregate only in
  reports. No names, contact details, dog names, notes or message content.
- **Refresh:** Calculate on demand at a named gate; routine cadence unassigned.
- **Decision use:** B4 adoption and rollback context. It cannot gate GO until
  operation identity and attempt completeness are validated.

### `MET-FUNNEL-001` — booking journey completion by step

- **Question:** Where do customers leave the portal booking journey?
- **Definition:** For each unique `session_id`, record the furthest valid step.
  Overall completion is sessions reaching `booked` divided by sessions reaching
  `started`; step reach is sessions reaching a step divided by started sessions.
- **Exclusions:** Demo/test sessions, invalid step names, duplicate rows for the
  same session/step and sessions outside the chosen reporting window.
- **Dimensions:** furthest step, dog-count band and entry source where known.
- **Current source/confidence:** `booking_funnel_events`, emitted best-effort by
  the customer portal; no cross-channel funnel. **Medium, directional**.
- **Owner:** @leamonline (repository owner; assigned 9 September 2026).
- **Privacy:** Session UUID and optional restricted `human_id` stay in the
  operational source; reports are aggregate.
- **Refresh:** On demand for product review; routine cadence unassigned.
- **Decision use:** Prioritisation only until event-loss and session-quality
  checks pass; not a Tranche B safety gate.

### `MET-CAP-001` — capacity denial and recovered demand

- **Question:** How much attempted demand is rejected, why, and how often does a
  presented alternative succeed?
- **Definition:** Denial mix counts unique denied attempts by structured reason.
  A denial rate requires denied plus successful attempts with the same trusted
  attempt identity. Recovery is denied attempts with `alternative_taken=true`
  divided by denied attempts with `alternative_shown=true`; do not infer later
  recovery without an approved linkage/window.
- **Exclusions:** Duplicate logging, invalid/test requests, policy/calendar
  denials when a specifically capacity-only view is requested.
- **Dimensions:** reason, operation source, requested date/slot, dog count/size,
  alternative shown/taken and capacity-policy generation.
- **Current source/confidence:** `booking_denials` is best-effort and records
  portal/Flow denials, including non-capacity reasons. Successful-attempt linkage
  is absent. Denial mix **Medium, directional**; true rate **Low**.
- **Owner:** @leamonline (repository owner; assigned 9 September 2026).
- **Privacy:** Restricted optional `human_id`; report only aggregates. Exclude
  `reason_detail` from analytics output because it is free text.
- **Refresh:** At A1/B3 evidence review and on demand; routine cadence unassigned.
- **Decision use:** A1/B3 drift and channel-parity review. Any approved-rule SQL
  divergence is STOP regardless of historical rate.

### `MET-CHANGE-001` — cancellation and reschedule success

- **Question:** Do change operations finish safely by source and operation kind?
- **Definition:** Unique committed cancellation/reschedule operations divided by
  terminal attempts. Report blocked, stale, review-required and transport-unknown
  outcomes separately; never count an idempotent replay as a new success.
- **Exclusions:** Edits that do not change date/time or cancellation state;
  retries of the same idempotency key; demo/test traffic.
- **Dimensions:** operation kind, source, staff/customer, single/multi-dog,
  block reason and capability generation.
- **Current source/confidence:** booking status/events and channel-specific RPC
  outcomes are fragmented; dark visit receipts show the target shape. **Low**.
- **Owner:** @leamonline (repository owner; assigned 9 September 2026).
- **Privacy:** Restricted operation/visit IDs; aggregate reporting only.
- **Refresh:** At B4 staging/rollout review; routine cadence unassigned.
- **Decision use:** B4 GO/rollback evidence once a complete attempt source exists.

### `MET-NOTIFY-001` — customer notification outcome by operation and channel

- **Question:** After an appointment operation, was the required customer
  communication delivered, failed, retrying or unknown?
- **Definition:** Report intent counts by current state. Success rate is sent
  intents divided by terminal intents, while retrying and unknown remain
  separate non-terminal/uncertain cohorts and are never hidden from the
  denominator narrative.
- **Exclusions:** Staff web push; duplicate attempt rows; messages unrelated to a
  governed appointment operation; demo/test sends.
- **Dimensions:** event type, operation source, delivery channel, attempt count,
  failure category and payload version.
- **Current source/confidence:** `notification_log` and provider-specific message
  state are booking/trigger oriented and staff reschedule lacks an intent.
  **Low**.
- **Owner:** @leamonline (repository owner; assigned 9 September 2026).
- **Privacy:** Restricted recipient and provider IDs; safe error category only.
  No message body, secret or raw provider payload in analytics.
- **Refresh:** At each B2/B4 staging and release review; routine cadence
  unassigned.
- **Decision use:** Hard STOP if a required controlled-test operation creates no
  intent, duplicates an intent/send, or leaves an unknown outcome invisible to
  staff. Live numerical thresholds require a named owner and validated baseline.

### `MET-REPLAY-001` — replay, duplicate and manual repair

- **Question:** How often are commands replayed, duplicated or repaired, and do
  safety controls prevent additional mutation or sends?
- **Definition:** Count replayed idempotency keys once by operation and outcome;
  separately count confirmed duplicate mutations, confirmed duplicate sends and
  manual repairs linked to the original operation.
- **Exclusions:** Provider retries that are valid attempts on one intent; UI
  refreshes with no command; test traffic outside a controlled evidence report.
- **Dimensions:** operation kind, source, replay outcome, duplicate type, repair
  reason and capability generation.
- **Current source/confidence:** visit command receipts/audit foundations and
  notification dedupe keys exist, but live cross-path linkage and manual repair
  taxonomy do not. **Low**.
- **Owner:** @leamonline (repository owner; assigned 9 September 2026).
- **Privacy:** Restricted operation and idempotency identifiers; never publish
  raw keys.
- **Refresh:** At every replay/concurrency test and incident review.
- **Decision use:** Any confirmed duplicate mutation or send in controlled
  proof is STOP. This is an invariant, not an invented production baseline.

### `MET-INBOX-001` — inbound message to staff resolution time

- **Question:** How long does an inbound customer message remain unresolved?
- **Definition:** Duration from first unresolved inbound message to the first
  durable resolved/closed outcome for the same work item. Reopenings form a new
  interval; report a distribution, not only an average.
- **Exclusions:** Provider status callbacks, outbound-only threads, spam/test
  conversations and intervals lacking a trustworthy resolution event.
- **Dimensions:** intent, risk, hand-off required, AI mode and resolution type.
- **Current source/confidence:** WhatsApp messages/conversations contain useful
  timestamps but no governed single resolution event for this definition.
  **None** for an exact metric.
- **Owner:** @leamonline (repository owner; assigned 9 September 2026).
- **Privacy:** Restricted conversation ID; aggregate durations only. Never ingest
  message content.
- **Refresh:** Routine cadence unassigned; calculate only after the resolution
  contract exists.
- **Decision use:** Later Inbox prioritisation, not A/B tranche gating.

### `MET-AI-001` — AI draft and action disposition

- **Question:** Are AI suggestions accepted unchanged, edited, rejected or
  escalated without increasing risk?
- **Definition:** One disposition per generated draft: sent unchanged, sent
  edited, rejected, expired or escalated. Booking-action outcomes are linked but
  reported separately as staged, rejected or committed.
- **Exclusions:** Fallback text when the assistant is disabled, duplicate event
  processing and test/demo drafts.
- **Dimensions:** intent, risk, hand-off, model generation, AI mode and action
  outcome. Do not dimension by customer message text.
- **Current source/confidence:** `whatsapp_drafts`, outbound messages and
  `whatsapp_ai_action_audit` provide partial evidence; edit/unchanged and final
  operation linkage are incomplete. **Low**.
- **Owner:** @leamonline (repository owner; assigned 9 September 2026).
- **Privacy:** Restricted conversation/draft IDs; no prompts, message text,
  customer detail or raw model payload in analytics.
- **Refresh:** At a separately approved AI review; routine cadence unassigned.
- **Decision use:** Inform human-review quality. Never enable auto-send or
  autonomous booking from acceptance rate alone.

### `MET-DEPOSIT-001` — deposit hold outcome

- **Question:** Do deposit holds complete, expire or require manual resolution?
- **Definition:** For each unique hold, classify one terminal outcome: completed,
  expired/released or manually resolved. Rates divide each terminal class by all
  terminal holds; open holds are reported separately with age.
- **Exclusions:** Legacy `deposit_amount` fields that do not represent a governed
  hold; duplicate transitions; test/demo data.
- **Dimensions:** origin, outcome, requirement reason, timing class and policy
  generation; never bank evidence or customer detail.
- **Current source/confidence:** visit deposit/hold tables and projections exist,
  but v1 policy is inactive and live legacy semantics differ. **Low / not a live
  v1 baseline**.
- **Owner:** @leamonline (repository owner; assigned 9 September 2026).
- **Privacy:** Restricted visit/human IDs and financial classification; aggregate
  only, with no bank evidence.
- **Refresh:** At a separately approved policy-readiness review; routine cadence
  unassigned.
- **Decision use:** Later policy activation readiness, not permission to activate
  policy in this roadmap.

### `MET-ACTION-001` — unresolved operational-action age

- **Question:** What staff work remains unresolved, and for how long?
- **Definition:** Age from durable action creation to now for every open action;
  terminal actions contribute time-to-resolution. Report counts and age bands by
  action kind without hiding oldest items.
- **Exclusions:** Dismissed informational notices, test/demo actions and work with
  no durable open state.
- **Dimensions:** action kind, severity, source, retryability and capability
  generation.
- **Current source/confidence:** delivery failures and visit-policy attention
  projections cover parts of the problem, but no single governed action source
  spans live and inactive models. **Low**.
- **Owner:** @leamonline (repository owner; assigned 9 September 2026).
- **Privacy:** Restricted action/visit IDs; aggregate reports only; safe summaries
  must not contain customer text.
- **Refresh:** At B2/B4 operational review and incident hand-off; routine cadence
  unassigned.
- **Decision use:** STOP if a B2/B4 failure or unknown state cannot create visible
  staff work. Numerical age thresholds require an assigned operational owner.

## Shared data-quality contract

Any implementation claiming these metrics must test:

1. stable operation/session/intent identity and schema version are present;
2. multi-dog booking lines do not inflate appointment-level counts;
3. idempotent replay does not inflate success or delivery;
4. duplicate events and invalid state transitions are detected;
5. required source/channel values are mapped without discarding the raw value;
6. funnel steps form a valid progression and event loss is visible;
7. notification intents join to operations without free-text matching;
8. missing sources and `unknown` values remain visible; and
9. analytics failure remains unable to fail or roll back customer/staff work.

## Privacy and retention

- Collect the minimum stable identifiers needed to deduplicate and join
  operations. Customer names, dog names, phone numbers, email, addresses, notes,
  message content, prompts, provider payloads and secrets are prohibited from
  analytical events and extracts.
- Row-level operational sources remain access-controlled. Product reports use
  aggregates and suppress accidental free-text fields.
- A0 creates no copy and changes no retention. Any later instrumentation or
  analytical store must assign an owner and approve an explicit retention
  period before it writes data.
- **Retention decision (9 September 2026, owner @leamonline):** row-level
  measurement telemetry is kept for **90 days**. `booking_funnel_events` and
  `booking_denials` rows older than 90 days are deleted daily by
  `prune_measurement_telemetry()`
  (`20260909150000_telemetry_retention_90_days.sql`). Ninety days is the
  longest window the Reports view offers, so no readable row is ever purged.
  Reports compute aggregates on demand; nothing aggregate is stored. Any new
  analytical table inherits this 90-day default unless its own entry here
  records a different, justified period.
- Erasure and access-control obligations on operational sources are not bypassed
  by calling a use “analytics”.

## STOP/GO use

The first gate uses definitions and contract evidence, not invented production
thresholds. These conditions are immediately decision-worthy:

- capacity behaviour diverges from the approved PostgreSQL contract;
- a required controlled-test operation creates no notification intent;
- replay or concurrency produces a duplicate mutation or send;
- unknown delivery is invisible or automatically retried;
- a runtime capability mismatch does not fail closed; or
- a failure cannot produce visible, recoverable staff work.

Before a live numerical threshold is used, a named owner must validate source
completeness, approve a baseline period and record the threshold and response in
the relevant release decision. This catalogue deliberately supplies none.


## Initial reporting implementation — 8 September 2026

The implementation base is `main@a7bf56d41af39e447f5e74bc00b96ae96b925334`.
The historical source assessments above remain historical; this slice verifies
only the portal funnel and denial reporting paths.

### Funnel session and window contract

One attempt is the ID retained by `src/lib/funnelSession.ts` in tab sessionStorage
across wizard remounts and refreshes. Success or explicit reset clears it. Closing
the tab normally ends the stored session; browser restoration can retain session
storage. Storage failure falls back to memory and can split an attempt across
page loads. There is no inactivity timeout, so an unfinished session is not a
confirmed abandonment or a unique customer.

For a selected N-day period, the window begins at 00:00 UTC N-1 dates before
today and ends at the report request time. It includes closed days and today so
far. Only sessions with an observed `started` event in that window enter the
completion denominator. `booked` must also be observed in the window. Sessions
without a start are excluded and counted visibly; these may be earlier attempts
crossing the boundary or lost events. This is not a cross-channel conversion rate.

Per-step reach remains inferred from the furthest recorded step for the qualifying
cohort. Repeated session/step events count once, and the report exposes their
number without calling every revisit a duplicate write. Missing intermediate
steps, absent starts and malformed events are aggregate quality indicators.
`confirm_failed` is a valid diagnostic event, not a funnel step. Blocker events
retain their wizard step and therefore participate in repeated-step counts.
Neither zero warnings nor a monotonic chart proves loss-free telemetry. No raw
session identifier is rendered in the report.

### Read completeness and denial interpretation

Both reports select only required structured fields, page deterministically by
creation time and row ID, and require exact source counts. They reject missing
pages, duplicate IDs, changing counts, request errors and more than 100,000 rows.
The user sees unavailable instead of partial numbers. This protects against
silent server row caps; it is not a transactional database snapshot.

Denials are recorded events, including policy and calendar refusals, not proven
unique failed appointments. Zero recorded events does not establish universal
success. Successful-attempt linkage is still absent, so a true denial rate is
unavailable. Existing alternative flags do not establish later recovery.

### Remaining #612 work

This slice does not complete the umbrella issue. Operation/channel contracts,
versioned event envelopes, notification-operation linkage, exact change/replay
rates, Inbox resolution, AI disposition, deposit and operational-action reporting
still need governed sources and separate implementation. The measurement owner
(@leamonline) and the 90-day retention decision are recorded above, so new
analytical storage is no longer blocked on either. Production reconciliation, complete ten-question
reporting and numerical rollout thresholds remain unverified.
