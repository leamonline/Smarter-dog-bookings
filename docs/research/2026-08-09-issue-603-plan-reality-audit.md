# Issue #603 plan-versus-reality audit

**Status:** Active dated audit
**Audited:** 9 August 2026
**Repository baseline:** `main@8eb8800fb345aeeba4887b266a4ff95a85fb7802`
**Scope:** Issues #603–#612, current repository implementation and a prior aggregate report with incomplete provenance

This record separates what the issue programme asks for from what already
exists. It is deliberately dated: issue state, deployment state, production
data and feature flags must be checked again before implementation or release.

## Evidence rules

- **Repository-confirmed:** code, configuration, migrations or tests at the
  baseline demonstrate the fact.
- **Issue intent:** the open issue body describes desired work; it is not
  implementation evidence.
- **Prior observation (unverified here):** a preceding planning audit reported
  a read-only aggregate check on 9 August 2026. Its exact project/environment,
  query text or hash, execution timestamp and tool/actor record were not
  retained in a durable artefact. The counts below are context, not evidence.
- **Inference:** a conclusion drawn from those sources. It is labelled and
  must not be treated as a production fact.

All ten issues were open when checked on 9 August. Their issue bodies are the
live scope authority; the classifications below explain the delta, not a new
task list.

## Classification vocabulary

| Classification | Meaning |
|---|---|
| Confirmed gap | The issue describes behaviour directly visible at the baseline and its target is absent. |
| Partial foundation | Some required machinery exists, but it does not satisfy the issue's end state. |
| Reframe around existing contract | The plan is directionally sound but must extend an existing contract rather than invent a new one. |
| Governance/evidence gap | Signals or procedures exist, but their catalogue, enforcement or decision record does not. |

## Issue-by-issue comparison

### #603 — Epic: converge booking, notification and release architecture

**Classification:** Reframe around existing contract.

The epic's seams are confirmed: live booking-row writes, a visit compatibility
generation, per-booking notifications, duplicated capacity logic and separate
application/database rollout. Its desired outcome remains valid.

The important correction is maturity. This is not a blank visit architecture:

- fourteen `20260726144000`–`20260726144013` migrations define visit identity,
  line membership, lineage, policy/deposit/incident records, projections and
  commands;
- `CustomerVisitSuccessReceipt` already carries visit, replacement, lineage,
  booking IDs and outcome data; and
- `bookingPolicyInactiveIsolation.test.ts` already enforces the dark-command
  activation protocol.

The programme should therefore extend/version real contracts, keep migration
writers serial and preserve the separate customer-policy activation gate.

### #604 — Notify customers when staff reschedule an appointment

**Classification:** Confirmed gap with a proposed visit-level solution.

`useBookings.updateBooking`, staff modal and drag/drop paths update booking rows
in place. That operation neither inserts a booking nor changes status to
cancelled, so existing confirmation/cancellation triggers do not produce a
customer reschedule message. No `notify-booking-rescheduled` function or
visit-level reschedule intent exists.

An earlier dated scope note explicitly deferred the message. Issue #604 now
reopens that product/architecture decision; the historical note remains useful
evidence but is no longer sufficient current direction. The issue's desired
one-message-per-visit outcome depends on the narrow #610 foundation and a safe
legacy-compatible #609 command.

### #605 — Audit and contract-test authentication for every Edge Function

**Classification:** Confirmed governance/evidence gap.

Repository discovery finds 27 deployable `index.ts` entry points and 22
`[functions.*]` sections in `supabase/config.toml`. The five implicit entries
at the baseline are:

- `broadcast-message`;
- `notify-customer-welcome`;
- `reminder-sms-fallback`;
- `resend-booking-notification`; and
- `whatsapp-update-notes`.

CI deploys every changed function with `--no-verify-jwt`; local configuration
and comments say that caller authentication occurs in each function. There is
no complete machine-readable caller/auth/replay/origin/service-role inventory
or discovery guard. The count mismatch is not by itself proof of an exposed
endpoint; it is proof that configuration and review coverage are incomplete.

### #606 — Run critical browser journeys on pull requests, including WebKit

**Classification:** Confirmed gap.

The CI `e2e` job deliberately returns success without running Playwright on
pull requests. The desktop, tablet and mobile Playwright projects all set
`browserName: "chromium"`; device emulation does not exercise WebKit. The
production build is used when the suite does run, and failure traces/reports
already provide useful foundation.

The missing work is a real PR-head critical suite, mobile WebKit, a negative
control proving the gate fails and merge enforcement that never executes
untrusted PR code in a write-capable job.

### #607 — Add a runtime schema and capability compatibility contract

**Classification:** Partial foundation.

Existing controls are narrower than the issue target:

- `migrations-applied` checks migrations added by a change against production;
- the scheduled drift workflow reconciles all committed migrations; and
- `booking_policy_runtime_status()` reports the booking-policy seam.

There is no generic customer/staff-safe projection of named schema/application
capabilities, no typed consumer decoder for it and no negative test proving an
old-schema/new-code mismatch fails closed. The first implementation should be
the smallest capability seam needed by a real slice, not an unrelated release
platform.

### #608 — Converge capacity rules across browser, Edge Functions and PostgreSQL

**Classification:** Partial foundation; reframe around established database authority.

PostgreSQL is already the final write/concurrency guard. Browser TypeScript and
Deno capacity helpers also exist, together with an existing parity test suite.
The current [capacity reference](../capacity-engine.md) explicitly documents
three hardcoded large-dog rule copies and the database source of truth.

The issue should not rebuild the working browser/Deno suite. It still needs
focused runtime SQL and multi-session race evidence, a versioned server reason
contract, quote/write equivalence and removal of the simplified AI preflight.
Because capacity is live on every current channel, this is early risk evidence,
not a low-priority cleanup after visit cutover.

### #609 — Cut over from booking-row authority to booking visits

**Classification:** Reframe around a substantial deployed substrate; live cutover remains open.

Repository-confirmed foundations include `booking_visits`, line membership,
legacy dual-write, reconciliation functions, row revisions, typed receipts,
customer/staff projections and dark visit commands. A provenance-limited prior
aggregate report is consistent with visit records and booking links having
existed in one hosted environment, but it is not independent deployment proof.

Live staff authority has not cut over. `useBookings` still directly inserts,
updates and deletes `bookings`; `useGroupBookings` reads/deletes booking rows;
the inactive-policy guard deliberately keeps visit mutations without
production callers. Therefore #609 is a staged caller migration and retirement
programme, not a schema-foundation ticket and not one rewrite PR.

Ambiguous legacy grouping must return typed `visit_review_required` with no
mutation, intent or raw-row fallback. That accepted contract is not yet
implemented.

### #610 — Create a durable visit-level notification outbox and delivery state

**Classification:** Partial booking-level foundation; target model absent.

Current notification infrastructure already provides:

- `notification_log` keyed around booking/trigger/recipient;
- `pending`, `sent` and `failed` state;
- provider-message evidence for some channels;
- a partial unique idempotency index; and
- a scheduled stale-`pending` reaper.

It does not provide one logical visit intent, append-only attempts, safe worker
claims, ordered outcomes or `delivery_unknown`. In particular, marking an
ambiguous stale send as failed cannot prove it is safe to send again. The
appropriate first slice is staff-reschedule intent/attempt delivery, not a
big-bang migration of every current notification.

### #611 — Align interface capability, error handling and documentation

**Classification:** Confirmed interface/documentation gap.

At the baseline:

- the enabled-looking `Let's book!` action opens an explanation that booking is
  not switched on;
- `ErrorBoundary` renders `error.message` to the user; and
- source/UI copy still uses `offline mode` for deterministic sample data.

These are independently fixable truth/safety issues. They should describe
current capability honestly rather than implying that visit cutover or
reschedule automation already exists.

### #612 — Define a governed product and operational measurement model

**Classification:** Governance/evidence gap over existing signals.

Booking funnel events, capacity denials, notification rows, grooming data,
WhatsApp provider state, AI audit and Sentry events already provide useful raw
signals. The repository has no versioned catalogue that freezes numerator,
denominator, exclusions, source/channel taxonomy, privacy, retention, owner and
data-quality checks.

The safe first unit is documentation-only: catalogue and classify existing
signals without inventing baselines, thresholds or owners. Schema
instrumentation, dashboards and notification-operation joins follow only when
#607/#610 contracts are stable.

## Unverified prior aggregate snapshot

**Reported date:** 9 August 2026. This repository does not retain the exact
project/environment, query text or hash, execution timestamp, tool/actor or a
sanitised result artefact. This documentation pass did not rerun the query.
Treat the figures as unverified prior context only; they cannot support a
release, reconciliation or GO decision without a fresh, explicitly targeted,
reproducible aggregate check.

| Measure | Count |
|---|---:|
| Booking rows | 497 |
| Distinct visits referenced by booking rows | 471 |
| Visits with one booking row | 446 |
| Visits with two booking rows | 24 |
| Visits with three booking rows | 1 |
| Cancelled visits with zero remaining booking children | 10 |
| Total visit records | 481 |

The arithmetic reconciles:

- `446 × 1 + 24 × 2 + 1 × 3 = 497` booking rows;
- the multi-row visits contribute `24 + 2 = 26` rows beyond one row per linked
  visit;
- `471 + 10 = 481` total visit records; and
- `497 - 481 = 26 - 10 = 16`.

The prior report stated that every one of the 497 booking rows linked to a
visit. If reproduced, “zero orphans” would apply only in the
**booking-to-visit** direction. It also reported ten cancelled visits without
remaining booking children in the reverse direction; that shape is not
automatically an error.

The same prior report identified **three future candidate pairs, covering six
active visits**. The count must be re-established before use. Even if
reproduced, they would be candidates for human review, not confirmed duplicates
or permission to merge or rewrite records. No identifiers or customer details
belong in this general repository record.

## What the snapshot does and does not prove

**If reproduced, it would support:**

- the compatibility substrate is populated;
- all observed booking rows have a visit link;
- multi-row/multi-dog visit shapes exist; and
- reverse childlessness and potential pairing need explicit classification.

**It does not prove:**

- that every booking is linked to the semantically correct visit;
- that the candidate pairs are one appointment;
- that no owner/date/membership mismatch exists outside the aggregate query;
- that the counts remain current;
- that reschedule automation is safe; or
- that policy activation, provider templates or fallback channels are ready.

**Conditional inference:** if reproduced, the reported linkage rate would make
a narrow cutover technically plausible, but unresolved candidates would still
make heuristic auto-grouping unsafe. The appropriate response is the
fail-closed contract in
[ADR 005](../architecture/decisions/005-fail-closed-on-ambiguous-legacy-visit-grouping.md),
not an invented acceptable-error threshold.

## Corrections the implementation programme must preserve

1. Extend the existing visit receipt; do not freeze a parallel blank contract.
2. Preserve `V1_ONLY_COMMANDS`: remove a command only with its intentional
   caller, never as a broad cleanup.
3. Keep visit authority independent from customer-policy activation.
4. Treat PostgreSQL capacity parity/races as early live-risk evidence.
5. Land migration-bearing work serially and regenerate types after each merge.
6. Separate operation, intent and attempt state; retain `delivery_unknown` and
   prohibit blind retry.
7. Apply hosted database changes only after exact target and change
   verification.
8. Make the evidence tranche a valid stopping point. Reschedule automation
   requires the named decision in the
   [go/no-go record](2026-08-09-reschedule-automation-go-no-go.md).

## Related records

- [Current architecture](../architecture/overview.md)
- [Active issue #603 programme plan](../plans/active/2026-08-09-issue-603-architecture-convergence.md)
- [Booking-policy authority](../specifications/booking-policy.md)
- [Notification-delivery target contract](../specifications/notification-delivery.md)
