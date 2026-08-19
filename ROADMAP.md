# Smarter Dog architecture convergence roadmap

**Status:** Active
**Authority:** Evidence gates and dependency order for issue #603
**Baseline:** `main@8eb8800fb345aeeba4887b266a4ff95a85fb7802`
**Last verified:** 9 August 2026

This roadmap has no promised dates. Movement is evidence-led: a tranche starts
only when its entry conditions are true and exits only with the named proof.
GitHub issues own live status, assignees and blockers; this file owns the durable
order and STOP/GO boundary.

## At a glance

| Horizon | Work | Decision |
|---|---|---|
| **Done** | Tranche A: A0 measurement, A1 capacity proof, A2 interface truth, A3 Edge authentication, A4 release and Supabase target gates | Complete. Evidence attested at `main@9e12bac`. |
| **Now** | Nothing. The gate is closed: **`STOP` recorded 15 August 2026** by [@leamonline](https://github.com/leamonline) | Manual contact retained. See the [decision record](docs/research/2026-08-09-reschedule-automation-go-no-go.md#required-decision-record). |
| **Deferred** | Tranche B: B1 #607 → B2 #610 → B4 #604/#609 remain serial and deferred by the `STOP`. **B3 #608 is rescoped and decoupled** (19 Aug 2026) — it carries no migration, so it is not part of that chain. | A future start for B1/B2/B4 needs a fresh **GO** against one exact `main` SHA, with A0–A4 re-established at that SHA. |
| **Later** | Expand notification types; migrate remaining visit reads/writes; consider separate policy activation; retire compatibility paths after observation | Each is a new decision, not implied by B4. |

## Programme invariants

- `previous_day_1500_v1` remains inactive throughout this roadmap.
- Existing live booking-row workflows remain authoritative until a named slice
  explicitly replaces a caller.
- PostgreSQL remains the final capacity and concurrency authority.
- Appointment mutation and customer-message delivery remain separate outcomes.
- Missing capability, stale revision, ambiguous visit membership and unknown
  delivery fail closed.
- No hosted Supabase operation proceeds without an explicit, verified target.
- No production write, customer-data repair, provider change or customer contact
  is authorised by this roadmap.

## Now — Tranche A: evidence and safety

Tranche A is a complete, useful stopping point. A0–A4 may progress independently
where their owned files do not overlap, but their exit evidence must be gathered
at one final `main` SHA.

### A0 — governed measurement catalogue

**Issue:** #612
**Work package:** [#615](https://github.com/leamonline/Smarter-dog-bookings/issues/615)
**Scope:** Documentation only; no schema, instrumentation, dashboard or
production query.

- **Entry:** Existing signals and their limitations can be identified from the
  repository.
- **Work:** Define stable metric IDs, questions, formulae, exclusions,
  dimensions, current source and confidence, owner, privacy, retention posture
  and decision use. Define a source/channel vocabulary without changing runtime
  values.
- **Exit:** [The catalogue](docs/specifications/measurement-catalogue.md) covers
  every tranche decision measure. Unknown owners read `Unassigned`; no baseline,
  threshold or routine cadence is invented.
- **Dependencies:** None.
- **Primary risk:** False precision from best-effort or row-level signals.

### A1 — PostgreSQL capacity behaviour and stale-write proof

**Issue:** #608
**Work package:** [#614](https://github.com/leamonline/Smarter-dog-bookings/issues/614)

- **Entry:** PostgreSQL is accepted as the final authority, and the existing
  browser/Deno parity suite is treated as prior evidence rather than rebuilt.
- **Work:** Add focused database behaviour tests for 2-2-1, large-dog adjacency
  and early close, daily cap, blocked seats and atomic multi-dog rollback. Add a
  local two-session proof for same-slot and cross-slot daily-cap races.
- **Exit:** Both sessions can observe apparent availability, exactly one legal
  commit wins, and the database never ends in an invalid state. Any SQL/approved
  rule divergence is resolved as a defect, not redefined as expected behaviour.
- **Dependencies:** A0 defines how capacity drift and denials will be reported;
  it need not block test development.
- **Primary risks:** Accidentally changing the approved rule; duplicating the
  existing TypeScript fixture matrix; testing only mocked races.

### A2 — interface, error and documentation truth

**Issue:** #611
**Work package:** [#617](https://github.com/leamonline/Smarter-dog-bookings/issues/617)

- **Entry:** Current controls, flags, routes, sample-data behaviour and error
  surfaces have been checked against code.
- **Work:** Pre-label or remove unavailable actions; stop raw exception content
  reaching users; keep a useful recovery action and reference ID; improve
  approved redaction; use `Demo` or `Sample data` for the non-live dataset; and
  document supported versus enabled capability.
- **Exit:** Component tests prove truthful unavailable states and safe recovery
  copy; documentation matches current flags, callers and routes.
- **Dependencies:** None; it must not enable Inbox booking.
- **Primary risks:** Turning a copy change into feature activation; reporting the
  same exception twice; claiming sample data is durable offline operation.

### A3 — Edge Function caller and authentication contract

**Issue:** #605
**Work package:** [#616](https://github.com/leamonline/Smarter-dog-bookings/issues/616)

- **Entry:** Every deployable `supabase/functions/*/index.ts` entry point is
  discoverable and local versus CI gateway behaviour is understood.
- **Work:** Create a machine-readable inventory covering caller, gateway
  `verify_jwt`, in-function authentication, role, replay/signature defence,
  service-role use, origin policy and unauthorised response. Add discovery and
  negative contract tests by authentication family.
- **Exit:** No deployable function is unclassified; local config, runtime checks
  and deployment flags cannot silently diverge; no high or critical finding is
  left unresolved.
- **Dependencies:** None, but shared auth helpers and `supabase/config.toml` have
  one writer.
- **Primary risks:** Treating blanket `--no-verify-jwt` as proof of safety;
  accepting an empty secret; overlooking origin or replay protection.

### A4 — executable release gates

**Issues:** #606 for A4a; #607 for A4b

#### A4a — pull-request browser gate

**Parent issue:** #606
**Work package:** [#619](https://github.com/leamonline/Smarter-dog-bookings/issues/619)

- **Entry:** The smallest existing critical journeys and deterministic fixtures
  are identified.
- **Work:** Run a production-build PR smoke suite in desktop Chromium and mobile
  WebKit; retain screenshot, trace and error context; prove the check with a
  temporary negative control. Any write-capable merge job must run trusted code
  and recheck the exact approved SHA.
- **Exit:** A deliberate regression fails the gate, ordinary critical journeys
  pass in both engines, and the full post-merge matrix remains intact. If branch
  rules cannot enforce the check, the documented human merge gate names that
  limitation.

#### A4b — explicit Supabase target guard

**Parent issue:** #607
**Work package:** [#618](https://github.com/leamonline/Smarter-dog-bookings/issues/618)

- **Entry:** Every repository command capable of touching a hosted Supabase
  project has been inventoried.
- **Work:** Commands that support `--project-ref` receive it explicitly. A
  linked-only migration command first requires a named environment and expected
  project ref, then runs a read-only assertion that rejects missing, unknown or
  mismatched link state. A repository check rejects new unguarded hosted
  `--linked` invocations.
- **Exit:** A wrong, absent or ambiguous target fails before any hosted write.
  The expected project ref is visible in the evidence record. Production still
  requires separate human authority.

**A4 dependencies:** A3 informs Edge deployment safety; the browser and target
guards can be developed separately.
**Primary risks:** A green job that skipped its real work; running PR code with
write credentials; trusting stale local link state.

## Tranche gate — default STOP

After A0–A4, do not drift into B1. Create one decision record tied to one exact
`main` SHA.

**Decision issue:** [#620](https://github.com/leamonline/Smarter-dog-bookings/issues/620)

An unverified prior observation reported 497 booking rows linked to 471 visits;
10 additional cancelled zero-child visits made 481 visits in total. Multi-line
visits add 26 booking rows, so `497 - 481 = 26 - 10 = 16`; 16 is not an orphan
count. If accurate, the ten reverse-direction zero-child visits and three
candidate visit pairs require classification rather than heuristic repair.
The target, query and execution record were not retained, so this is context,
not gate evidence. [The dated audit](docs/research/2026-08-09-issue-603-plan-reality-audit.md#unverified-prior-aggregate-snapshot)
records the full arithmetic and provenance limit.

### Gate entry

All A0–A4 exit evidence is green at that SHA.

### Evidence required for GO

1. A named human owner compares observed staff-reschedule need with the current
   manual-contact procedure and explicitly chooses automation.
2. The approved Meta template route and an explicit SMS/email fallback policy
   are feasible.
3. A fresh, aggregate-only, explicitly targeted production check finds no
   broken visit linkage, ownership/date mismatch or duplicate included
   membership. Ambiguous legacy groupings may remain only because B4 excludes
   them fail closed. Do not require the dated counts to remain unchanged, and do
   not treat a zero-child cancelled visit as a policy-activation signal.
4. B1–B4 still form the whole proposed live scope. The work does not require
   policy activation, full authority cutover, a generic queue or unapproved
   customer-data repair.
5. The decision record names the owner, exact SHA, evidence, scope, rollback
   seam and unresolved risks.

### Gate exit

- **STOP (default):** retain the manual-contact procedure, defer B1–B4 and name
  the evidence or external prerequisite that would justify reconsideration.
- **GO:** authorise only the serial B1–B4 slice below. GO does not authorise
  production migration application, provider changes or policy activation.

### Recorded outcome

**`STOP`, recorded 15 August 2026** by [@leamonline](https://github.com/leamonline)
against evidence at `main@9e12bac0a96991089db6f5a55c2661e6c542f578`. The
manual-contact procedure is retained, B1–B4 are deferred, and no implementation
is authorised. The reconsideration trigger and full decision fields are in the
[go/no-go record](docs/research/2026-08-09-reschedule-automation-go-no-go.md#required-decision-record);
the supporting evidence is the
[15 August exit evidence pack](docs/research/2026-08-15-tranche-a-exit-evidence.md).

The gate is closed on these terms. Reopening it means a fresh `GO` decision with
A0–A4 re-established at the SHA that decision names — this `STOP` does not carry
forward as entry evidence for a later `GO`.

## Next — Tranche B: narrow live convergence

Tranche B is serial because migrations, generated types, RPCs, receipts,
capacity authority and booking hooks are shared-writer surfaces. After every
database-bearing pull request: merge, rebase, regenerate types, re-run the
applicable checks and hand off the new base SHA and frozen contract.

### B1 — minimal runtime capability seam

**Issue:** #607
**Work package:** [#621](https://github.com/leamonline/Smarter-dog-bookings/issues/621)

- **Entry:** Recorded GO and A4 target/release guards are in force.
- **Work:** Add the smallest customer/staff-safe named capability projection,
  typed decoder and fail-closed app/Edge consumer needed by this slice.
- **Exit:** Current schema/current code succeeds; old schema/new code fails
  closed in a negative-control test; existing migration-applied checks remain;
  rollback cases are documented.
- **Dependencies:** A4 and the tranche GO.
- **Primary risk:** Building a release platform instead of the minimal seam, or
  silently falling back to legacy semantics.

### B2 — reschedule-only notification intent and attempts

**Issue:** #610
**Work package:** [#622](https://github.com/leamonline/Smarter-dog-bookings/issues/622)

- **Entry:** B1 is merged, types regenerated and the required capability name is
  frozen.
- **Work:** Add one visit-level intent for staff rescheduling and append-only
  delivery attempts. Snapshot recipients and channel choice; preserve provider
  IDs; distinguish retryable, permanent and unknown outcomes; expose safe staff
  recovery.
- **Exit:** Replay and concurrent claims cannot duplicate an intent or send;
  every attempt is auditable; `delivery_unknown` requires reconciliation rather
  than automatic retry. No other notification type is migrated.
- **Dependencies:** B1; provider template/fallback feasibility from the gate.
- **Primary risks:** Duplicate sends after worker failure; leaking provider
  payloads; coupling delivery failure to mutation rollback.

### B3 — guard capacity parity across runtimes

**Issue:** #608
**Work package:** [#623](https://github.com/leamonline/Smarter-dog-bookings/issues/623)

**Rescoped 19 August 2026.** The original package — a canonical PostgreSQL
evaluator, a structured reason contract and a booking-spine migration — is
superseded. Measurement across 129 cross-runtime cases showed the capacity
semantics do **not** diverge and the database was correct throughout, including
on the one allocation the browser engine got wrong. The single real defect was
an ordering bug in a TypeScript preflight (#664), fixed in one function with no
migration. Rejection-reason alignment moved out entirely to #665.

- **Entry:** A1 evidence green; approved capacity rules fixed.
- **Work:** Keep the browser engine, the Deno mirror and the PostgreSQL trigger
  provably in agreement, so no interface can offer a booking the database will
  refuse. The parity harness is the deliverable, not a stepping stone.
- **Exit:** Browser, Deno and database scenarios agree on eligibility for the
  governed set; every allocation the engine offers is one PostgreSQL accepts;
  the harness fails on a deliberate divergence; PostgreSQL still rejects stale
  races; low-PII reads expose no customer detail.
- **Dependencies:** A1 only. **B1 and B2 are decoupled** — that serialisation
  existed because the migration spine is serial, and the rescoped B3 adds no
  migration. Verified against the deliverable's actual imports and the tables
  its database half touches, all pre-existing.
- **Out of scope:** authoritative evaluator, booking-spine migration, any change
  to `validate_booking_capacity()` or the database capacity architecture,
  moving authority into shared TypeScript, and any capacity-policy change
  (including the approved 1–4 dog group limit).
- **Primary risks:** Rule change disguised as convergence; exposing operational
  data; weakening the final database guard.

### B4 — legacy-compatible staff reschedule slice

**Issues:** #604 and #609
**Work package:** [#624](https://github.com/leamonline/Smarter-dog-bookings/issues/624)

- **Entry:** B1–B3 are merged; template/fallback prerequisites remain valid;
  all live staff reschedule entry points are inventoried.
- **Work:** Route those entry points through a separately named,
  legacy-compatible server command. It moves one resolved appointment
  atomically, returns the existing visit receipt plus B2 delivery linkage and
  creates one intent. It does not activate the v1 customer policy.
- **Exit:** Single- and multi-dog moves, idempotent replay, stale-revision
  rejection and one-intent behaviour pass; staff see moved, pending, sent,
  failed, retryable and unknown states; provider-failure staging evidence is
  recorded. Ambiguous membership returns `visit_review_required`, performs no
  mutation or intent, and never falls back to `useBookings.updateBooking`.
- **Dependencies:** B1 → B2, plus issues #604/#609 contracts. (B3 is no longer in this chain — see its rescope above — and B4 remains stopped behind the `RA-001` STOP regardless.)
- **Primary risks:** Accidental policy activation; partial multi-dog moves;
  duplicate messages; a UI fallback that restores raw row authority.

## Later

Only after the B4 slice has operating evidence:

- expand the outbox one notification type at a time;
- reconcile and shadow remaining visit reads and writes;
- migrate customer and remaining staff operations to visit authority;
- consider `previous_day_1500_v1` activation through its separate approved
  policy protocol, Terms and rollback decision;
- block direct booking-row writes only after every known caller has migrated;
  and
- retire compatibility triggers and obsolete RPCs after an explicit observation
  period.

None of these follows automatically from a successful B4.

## Cross-programme risks and controls

| Risk | Control |
|---|---|
| Wrong Supabase project | A4b exact target guard; explicit project ref in evidence; separate production authority. |
| Incidental policy activation | Keep `effective_at` null, preserve `V1_ONLY_COMMANDS`, use a separately named legacy-compatible command. |
| Conflicting shared writers | Serial B1–B4; one owner for migrations, generated types, RPCs, booking hooks and shared contracts. |
| False delivery success | Separate operation receipt, intent state and attempt history; unknown is visible and unretryable without reconciliation. |
| Capacity semantic drift | A1 runtime/concurrency proof before B3; PostgreSQL remains final; no approved-rule changes. |
| Green-but-empty release check | Negative controls, production build, real WebKit engine and retained artefacts. |
| Weak measurement evidence | Confidence labels, operation-level deduplication, no invented baselines, named owner required before threshold decisions. |
| External template unavailable | STOP at the tranche gate and keep manual contact. |
| Unauthorised customer-data repair | Aggregate-only readiness check; separately authorise and review any identifiable repair. |

## Evidence and review

The [requirements](docs/product/requirements.md) define current gaps and target
states. [Traceability](docs/traceability.md) maps goals to issues and executable
evidence. A work package may claim completion only from evidence at its exact
head SHA; an omitted check is recorded with reason and consequence.
