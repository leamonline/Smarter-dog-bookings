# Architecture convergence traceability

**Status:** Active
**Authority:** Compact map from product goals to requirements, issues and
evidence
**Baseline:** `main@8eb8800fb345aeeba4887b266a4ff95a85fb7802`
**Last verified:** 9 August 2026

GitHub owns current work status. This map owns durable relationships and should
change when a requirement, governing specification or proof changes.

| Goal | Requirements | Governing source | Issues | Current or planned executable evidence |
|---|---|---|---|---|
| `GOAL-01` coherent appointment authority | `REQ-AUTH-001`, `REQ-OPS-001`, `REQ-OPS-002`, `REQ-RETIRE-001` | [Visit/policy decision](architecture/decisions/002-separate-visit-authority-from-policy-activation.md), [ambiguity decision](architecture/decisions/005-fail-closed-on-ambiguous-legacy-visit-grouping.md), [staff reschedule flow](product/user-flows.md#flow-01--staff-reschedules-an-appointment) | #604, #609 | Current [receipt decoder](../src/supabase/bookingVisitReceipt.test.ts) and dark [staff visit command tests](../supabase/tests/170_staff_visit_write_commands.test.sql); B4 adds live caller, ambiguity, replay and multi-dog proofs. The [prior aggregate report](research/2026-08-09-issue-603-plan-reality-audit.md#unverified-prior-aggregate-snapshot) is provenance-limited context, not executable evidence. |
| `GOAL-02` truthful notification outcomes | `REQ-NOT-001`, `REQ-NOT-002`, `REQ-NOT-003`, `REQ-A11Y-001`, `REQ-PERF-001` | [Notification specification](specifications/notification-delivery.md), [operation/delivery decision](architecture/decisions/003-separate-operation-success-from-notification-delivery.md), [notification flow](product/user-flows.md#flow-04--notification-delivery-fails-or-becomes-uncertain) | #604, #610, #611 | Current booking-oriented evidence: [notification log migration](../supabase/migrations/20260403160647_notification_log.sql); A2 proves accessible truthful states, while B2/B4 add intent uniqueness, concurrent claim, failure, unknown and retry proofs without a provider call in the transaction. |
| `GOAL-03` consistent capacity | `REQ-CAP-001`, `REQ-CAP-002` | [Capacity authority decision](architecture/decisions/001-postgresql-capacity-authority.md), [capacity reference](capacity-engine.md), [capacity flow](product/user-flows.md#flow-03--a-channel-checks-capacity-and-commits) | #608, #614 | Existing [browser/Deno parity](../src/lib/whatsapp/capacityParity.test.ts), [trigger invariants](../src/engine/capacityTrigger.test.ts) and [extra-slot pgTAP](../supabase/tests/030_extra_slots.test.sql); A1 adds focused [PostgreSQL behaviour](../supabase/tests/035_capacity_behaviour.test.sql) and [real multi-session race](../scripts/verify-capacity-concurrency.sh) evidence, while B3 adds reason parity. |
| `GOAL-04` compatible, secure release | `REQ-REL-001`, `REQ-REL-002`, `REQ-SEC-001`, `REQ-CI-001`, `REQ-GATE-001` | [Serial capability decision](architecture/decisions/004-serial-schema-convergence-and-runtime-capabilities.md), [target-verification decision](architecture/decisions/006-manual-target-verified-database-rollout.md), [Roadmap A3/A4](../ROADMAP.md#now--tranche-a-evidence-and-safety) | #605, #606, #607 | Current [CI workflow](../.github/workflows/ci.yml), [Playwright config](../playwright.config.ts), [Supabase config](../supabase/config.toml) and [Edge deploy workflow](../.github/workflows/deploy-edge-functions.yml); A3/A4/B1 add discovery, negative controls and target/capability mismatch tests. |
| `GOAL-05` governed human decisions | `REQ-AI-001`, `REQ-MET-001`, `REQ-MET-002`, `REQ-POL-001` | [Booking-policy boundary](specifications/booking-policy.md), [measurement catalogue](specifications/measurement-catalogue.md), [AI flow](product/user-flows.md#flow-06--ai-assists-with-an-inbox-reply-or-booking-proposal) | #611, #612 | Current [inactive-policy guard](../src/security/bookingPolicyInactiveIsolation.test.ts), [AI controls pgTAP](../supabase/tests/132_ai_whatsapp_controls.test.sql), [funnel pgTAP](../supabase/tests/070_booking_funnel.test.sql) and [denial pgTAP](../supabase/tests/050_booking_denials.test.sql). |

## Requirement index

The canonical wording and current-to-target status for every `REQ-*` ID lives in
[product/requirements.md](product/requirements.md). Do not duplicate full
requirement text in an issue or test name; reference the ID and state the exact
behaviour under proof.

## Evidence rule

A link to a test proves only what that test executes. A migration in the tree
does not prove production application, a green PR job does not prove work it
skipped, and a feature flag does not prove enablement. Release evidence must name
the commit, environment, exact target and observed result.

## Tranche gate evidence

The STOP/GO gate ([#620](https://github.com/leamonline/Smarter-dog-bookings/issues/620))
requires A0–A4 exit evidence at one exact `main` SHA. That evidence is assembled
in the [Tranche A exit evidence pack](research/2026-08-15-tranche-a-exit-evidence.md)
at `main@9e12bac`, which the
[go/no-go record](research/2026-08-09-reschedule-automation-go-no-go.md)
references. Two packages carry trigger caveats recorded there: `DB Tests
(pgTAP)` is path-filtered and needs an explicit dispatch per SHA, and the A4a
`pr-production-smoke` gate is pull-request-only and can never be green on a
`main` SHA.

An attestation binds to its SHA and does not survive `main` moving. The
[14 August pack](research/2026-08-14-tranche-a-exit-evidence.md) at
`main@0ef06c1` is superseded and retained only as the record of that
attestation; read the current pack for the live position. The interval between
them contains a red `main` at `dcc8827`, accounted for in the current pack.

Verifying these packs did not re-verify the goal table above; its baseline and
`Last verified` date are unchanged. The recorded disposition remains `STOP`.
