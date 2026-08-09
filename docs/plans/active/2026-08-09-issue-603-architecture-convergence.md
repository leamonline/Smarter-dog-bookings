# Issue #603 architecture convergence programme plan

**Status:** Active
**Authority:** Programme decomposition and execution order
**Issue:** [#603](https://github.com/leamonline/Smarter-dog-bookings/issues/603)
**Base:** `main@8eb8800fb345aeeba4887b266a4ff95a85fb7802`
**Last verified:** 9 August 2026
**Owners:** Unassigned; GitHub owns live assignment
**Dependencies:** Tranche A → [#620](https://github.com/leamonline/Smarter-dog-bookings/issues/620) → [#621](https://github.com/leamonline/Smarter-dog-bookings/issues/621) → [#622](https://github.com/leamonline/Smarter-dog-bookings/issues/622) → [#623](https://github.com/leamonline/Smarter-dog-bookings/issues/623) → [#624](https://github.com/leamonline/Smarter-dog-bookings/issues/624)
**Related requirements:** [Product requirements](../../product/requirements.md)
**Related ADRs:** [ADR index](../../architecture/decisions/README.md)

> This is a programme plan. Every code-bearing work package still requires a
> PR-sized implementation plan conforming to [`.agent/PLANS.md`](../../../.agent/PLANS.md).
> GitHub owns live status, assignees and blockers.

## Goal

Converge the live booking-row, visit, capacity, notification and release paths
without a rewrite, without incidental customer-policy activation, and without
claiming that a database operation proves a customer message was delivered.

## Why

The repository already contains a strong but inactive visit aggregate beside
the live legacy booking-row paths. Capacity is independently implemented in
the browser, Deno and PostgreSQL. Edge authentication is distributed across
27 functions. Frontend and Edge code deploy automatically while database
migrations remain manual. These seams work today, but they make drift and
partial-success states difficult to reason about.

## Current behaviour

- `bookings` rows remain the live staff write authority.
- `booking_visits`, lineages, typed receipts, projections and atomic visit
  commands are implemented and deployed as an inactive compatibility layer.
- `previous_day_1500_v1` remains inactive. The
  `bookingPolicyInactiveIsolation` test proves dark mutation commands have no
  production caller.
- PostgreSQL is the final capacity write guard. Browser and Deno preflight have
  an existing 12-test parity suite; runtime SQL parity and a true concurrent
  final-seat proof are missing.
- Staff rescheduling does not produce a durable customer notification intent.
- Notification logs are booking/trigger oriented, not one intent and attempt
  history per visit operation.
- PR CI reports a green E2E job while intentionally skipping Playwright;
  configured browser projects all use Chromium.
- There is a policy-specific runtime status, but no generic schema/application
  capability contract.

The repository evidence and provenance-limited prior aggregate observation are in
[`../../research/2026-08-09-issue-603-plan-reality-audit.md`](../../research/2026-08-09-issue-603-plan-reality-audit.md).

## Desired behaviour

One appointment operation has one authoritative visit identity, one
server-owned policy decision, one atomic command, one durable notification
intent, an observable delivery outcome and a compatible release contract.
Per-dog grooming status may remain on booking lines.

## Scope

- Evidence and safety work in Tranche A.
- A recorded human STOP/GO decision.
- If approved, a narrow serial Tranche B ending in one legacy-compatible staff
  reschedule slice.
- Durable repository knowledge, requirements, decisions and traceability for
  the programme.

## Non-goals

- Activating `previous_day_1500_v1`.
- A frontend, database or service rewrite.
- A generic queue or migration framework.
- Migrating every notification type in the first slice.
- Full booking-row authority retirement.
- Native apps, multi-tenancy, microservices, general CRM expansion or fully
  autonomous booking.
- Inspecting or repairing identifiable production customer records without
  separate authority.

## Settled programme decisions

1. PostgreSQL remains the final capacity authority.
2. Visit authority and customer-policy activation are separate decisions.
3. Existing receipts and the `V1_ONLY_COMMANDS` activation protocol are
   extended only when a real consumer needs them; they are not reinvented.
4. Appointment mutation and message delivery have separate outcomes.
5. `delivery_unknown` blocks automatic retry pending staff reconciliation.
6. Ambiguous legacy grouping fails closed with `visit_review_required`, no
   mutation, no notification intent and no UI fallback to a raw booking update.
7. Migration-bearing work is serial: `#607 -> #610 -> #608 -> #604/#609`.
8. Tranche A is a complete stopping point. Tranche B never starts by default.

See [`../../architecture/decisions/`](../../architecture/decisions/) for
context and consequences.

## Relevant code

The primary shared writers are `supabase/migrations/`,
`src/supabase/database.types.ts`, `src/supabase/rpc.ts`, visit receipt decoders,
booking/reschedule hooks, capacity implementations, notification functions,
`supabase/config.toml` and CI workflows. Exact symbols and baseline evidence
are catalogued in the [architecture overview](../../architecture/overview.md)
and [plan-versus-reality audit](../../research/2026-08-09-issue-603-plan-reality-audit.md).
Each PR-sized plan must name its narrower entry points and tests.

## Architecture

The programme preserves the React/Vite, Supabase Edge Function and PostgreSQL
modular monolith. PostgreSQL owns final transactions, permissions and capacity;
the browser and Deno layers are consumers/preflight. Visit authority, customer
policy activation, appointment outcome and provider delivery remain distinct
boundaries governed by the [ADRs](../../architecture/decisions/README.md).

## Data/database changes

Tranche A0–A3 and A4a are evidence, documentation, application or CI work. A4b
adds an executable target control, not a business migration. If authorised,
B1–B4 add ordered migrations for the minimal capability, intent/attempt,
capacity-reason and legacy-compatible command contracts. Each database unit is
serial, append-only, grant/RLS tested and followed by generated-type and caller
reconciliation. No migration in this plan is authorised for production merely
by merging it.

## API changes

Tranche B proposes a named runtime capability projection, delivery claim and
reconciliation commands, a structured capacity reason contract and one
legacy-compatible staff-reschedule command. The supplied programme fixes the
client command name `rescheduleLegacyStaffBookingVisit`; exact SQL/RPC names and
receipt additions belong to the PR-sized plan after predecessor contracts
merge. Existing receipt identity is extended only for a demonstrated consumer.

## UI changes

A2 makes unavailable and error states truthful. B4, only after GO, replaces
live staff reschedule callers and shows appointment outcome separately from
pending, sent, failed, retryable, unknown or manual-review delivery work.
Customer policy and current customer journeys do not change in this programme.

## Security/privacy considerations

Edge callers, server-side authorisation, explicit hosted targets, low-PII
projections, provider secrets and safe error/redaction contracts are release
boundaries. Tranche evidence uses synthetic or aggregate data. No work package
may inspect identifiable production rows, external provider configuration or
credentials unless a separate instruction grants that exact authority.

## Dependencies

Tranche A packages may run in parallel only across exclusive paths. The gate
depends on all A evidence at one SHA. Tranche B is blocked by an explicit GO and
then runs B1 → B2 → B3 → B4. The shared-writer list below is serial even when
issue dependencies would otherwise allow parallel work.

## Risks

The largest failure modes are accidental policy activation, wrong-project
migration, partial multi-dog mutation, duplicate/unknown customer delivery,
capacity drift, an empty green release check, unreviewed customer data and a UI
fallback to legacy row writes. The roadmap assigns each a negative control or
fail-closed outcome; absence of that proof blocks the dependent unit.

## Migration/rollout

Tranche A can complete with STOP. A GO authorises planning of the narrow serial
slice, not a production write. Every later release records exact SHA, target,
schema/application/Edge compatibility, feature state, external prerequisites,
negative controls, rollback/roll-forward path and post-release evidence.

## Implementation sequence

The work proceeds through the evidence tranche, an explicit default-STOP gate,
and only then the serial live slice. GitHub owns the live state of each unit.

### Tranche A: evidence and safety

#### A0 — measurement catalogue

**Parent:** [#612](https://github.com/leamonline/Smarter-dog-bookings/issues/612)
**Model fit:** bounded documentation/research model

Land the versioned metric catalogue, current-signal inventory, source/channel
taxonomy, privacy rules and decision measures as a documentation-only PR.
Instrumentation, schema changes and dashboards remain deferred until their
contracts stabilise.

**Exit evidence:** every Tranche decision measure has a definition, source,
privacy classification and explicitly unassigned owner where a human has not
yet been named. No fake baseline or threshold is invented.

#### A1 — PostgreSQL capacity behaviour and stale-write proof

**Parent:** [#608](https://github.com/leamonline/Smarter-dog-bookings/issues/608)
**Model fit:** strongest transactional PostgreSQL reasoning model

Treat `src/lib/whatsapp/capacityParity.test.ts` as accepted browser/Deno
coverage: one mirrored constant and 11 grouped-allocation cases. Do not create
another TypeScript fixture matrix, shared fixture language or engine rewrite.

Add focused runtime pgTAP behaviour not already covered by
`supabase/tests/030_extra_slots.test.sql`:

- canonical 2-2-1 enforcement;
- large-dog early close and permitted/conditional adjacency;
- the daily cap while a physical slot remains;
- a blocked seat plus an existing booking;
- atomic rollback of a two-dog group crossing the cap.

Add a local-only, two-session harness proving both a same-slot final-seat race
and a different-slot daily-cap race. In each case both sessions observe the
candidate as available, exactly one commits and the final state remains legal.

**Forbidden:** new reason-code architecture, UI race mocks, production writes,
or silently changing an expected result. A SQL divergence is a P1 defect and a
stop condition. Structured reason convergence belongs to B3.

#### A2 — interface and documentation truth

**Parent:** [#611](https://github.com/leamonline/Smarter-dog-bookings/issues/611)
**Model fit:** frontend/component model

Fix the behaviour that actually exists: the enabled-looking `Let's book!`
control currently reveals only that booking is not switched on. Prevent raw
exception content reaching user-facing error UI, avoid duplicate reporting,
expand approved redaction, and align capability/demo terminology with the
current implementation.

**Exit evidence:** component tests for safe recovery copy and unavailable
actions; capability documentation verified against flags, callers and routes.

#### A3 — Edge Function caller and authentication contract

**Parent:** [#605](https://github.com/leamonline/Smarter-dog-bookings/issues/605)
**Model fit:** security-focused Edge/Deno model

Create a complete machine-readable manifest for every deployable function and
positive/negative contract tests for each authentication family. Reconcile
`supabase/config.toml`, runtime checks and deployment flags. Discovery must fail
when a new function lacks a contract.

**Exit evidence:** no unclassified function and no unresolved high/critical
authentication finding.

#### A4a — pull-request browser gate

**Parent:** [#606](https://github.com/leamonline/Smarter-dog-bookings/issues/606)
**Model fit:** CI/Playwright/release model

Run a small PR-head critical suite against the production build in desktop
Chromium and mobile WebKit. The write-capable merge job must never execute PR
code and must recheck the exact SHA. Prove the gate with a temporary negative
control and retain failure artefacts. Direct web merge remains a documented
administrative bypass while the account cannot enforce branch rules.

#### A4b — explicit hosted Supabase target guard

**Parent:** [#607](https://github.com/leamonline/Smarter-dog-bookings/issues/607)
**Model fit:** release/database safety model

Add an executable hosted Supabase target guard. Commands supporting
`--project-ref` pass it directly. Linked-only
migration commands must first supply a named target and exact confirmation ref
to a read-only assertion that fails on missing, unknown or mismatched link
state. Repository checks reject new unguarded hosted `--linked` invocations.
Production operations still require separate authority.

### Tranche gate: default STOP

One decision record tied to one `main` SHA must prove all of the following
before B1 begins:

1. A0–A4 exit evidence is green at that SHA.
2. A named human owner has compared observed staff-reschedule need with a
   documented manual-contact procedure and explicitly chosen automation.
3. The Meta template route and an explicit fallback policy are feasible.
4. A fresh aggregate-only production check finds no broken visit linkage,
   ownership/date mismatch or duplicate membership. Ambiguous groupings may
   remain only because the B4 contract will exclude them fail-closed.
5. The proposed B scope still fits B1–B4 below. It must not require policy
   activation, full cutover, a generic queue or unapproved customer-data repair.

If any condition is absent, record **STOP**, keep the manual contact procedure,
and defer B1–B4 with a named resumption trigger. Tranche A remains complete and
valuable.

### Tranche B: narrow live convergence

Tranche B runs serially. After every database-bearing pull request: merge,
rebase, regenerate types, re-run the full applicable checks, and hand off the
new base SHA and frozen contract.

#### B1 — minimal runtime capability seam

**Parent:** [#607](https://github.com/leamonline/Smarter-dog-bookings/issues/607)

Add the smallest server-owned named capability projection needed by the slice,
typed decoders and fail-closed consumers. Preserve the existing
migration-applied check; do not build an append-only release platform.

#### B2 — reschedule-only notification intent and attempts

**Parent:** [#610](https://github.com/leamonline/Smarter-dog-bookings/issues/610)

Add a visit-level intent and append-only delivery attempts for staff
rescheduling only. Snapshot recipients/channel choice, preserve provider IDs,
separate retryable/permanent/unknown outcomes and expose staff-visible state.
Do not migrate other notification types in this unit.

#### B3 — canonical capacity evaluator

**Parent:** [#608](https://github.com/leamonline/Smarter-dog-bookings/issues/608)

Use the A1 evidence to introduce the authoritative evaluator and structured
reason contract without changing approved business rules. Migrate the
simplified AI preflight and prove quote/write equivalence; PostgreSQL remains
the final concurrency guard.

#### B4 — legacy-compatible staff reschedule slice

**Parents:** [#604](https://github.com/leamonline/Smarter-dog-bookings/issues/604),
[#609](https://github.com/leamonline/Smarter-dog-bookings/issues/609)

Introduce the separately named `rescheduleLegacyStaffBookingVisit` command and
route the live staff reschedule entry points through it without activating the
new customer policy. Return the existing visit receipt shape plus the concrete
delivery linkage B2 requires; do not invent speculative identity fields.

For unresolved membership or possible multi-dog grouping, return typed
`visit_review_required`. The command performs no booking/visit mutation and
creates no notification intent. The UI displays a review/manual-contact action
and must not fall back to `useBookings.updateBooking`.

**Exit evidence:** single- and multi-dog atomic moves, idempotent replay,
stale-revision rejection, one visit-level intent, pending/sent/failed/unknown
UI states, provider-failure staging evidence, and fail-closed ambiguity tests.

### Later work

Only after the narrow slice has operating evidence:

- expand the outbox one notification type at a time;
- migrate remaining visit reads/writes and compare shadows;
- activate a customer policy only through its separate approved protocol;
- enable the final direct booking-row write barrier; and
- retire compatibility triggers and obsolete RPCs after an observation period.

## Shared-writer boundaries

Only one active work package may own each of these at a time:

- `supabase/migrations/` ordering;
- `src/supabase/database.types.ts`;
- `src/supabase/rpc.ts` and visit receipt contracts;
- booking hooks and reschedule UI callers;
- `supabase/config.toml` and shared Edge auth helpers;
- capacity authority and reason contracts;
- notification intent/attempt schema;
- shared workflow and package-script integration.

Parallel workers receive a compact context pack containing the base SHA,
objective, acceptance criteria, exact invariant excerpts, owned/forbidden
paths, dependencies, commands and expected hand-off. They do not receive the
whole programme transcript.

## Testing and verification

Every package runs the smallest relevant checks while developing and the full
applicable gate before hand-off. At minimum this may include:

```text
npm run lint
npm run typecheck
npm run check:migrations
npm run test
npm run build
npm run check:edge-types
npm run test:db
npm run e2e
```

Database, provider and browser checks are required only where applicable, but
an omitted check must be explained. Production evidence uses explicit targets
and the authority boundaries in [`../../../AGENTS.md`](../../../AGENTS.md).

## Observability

- Database operation and delivery outcomes remain distinguishable.
- Capability mismatch, capacity denial, delivery unknown and staff retry have
  stable catalogue entries before rollout.
- Analytics failure never blocks customer or staff work.
- Evidence uses aggregate or synthetic data unless separately authorised.

## Documentation updates

Each package updates its requirements, ADR/specification, domain reference,
issue, plan, pull request evidence and changelog entry where behaviour changed.

## Definition of done

The programme is complete only when every child issue is closed or explicitly
deferred with rationale; the live authority and activation states are
unambiguous; required customer notification cannot become silently unknown;
capacity has one authoritative reason contract; incompatible deployments fail
closed; and the retirement path for direct booking-row authority is tested and
documented.

## Open decisions

- Whether observed reschedule need justifies Tranche B automation.
- Approved Meta wording and deterministic fallback channel.
- When, if ever, to activate `previous_day_1500_v1`.
- The thresholds for expanding from the narrow slice to full cutover.

These require recorded human decisions. An implementation agent must not infer
answers from the existence of this plan.
