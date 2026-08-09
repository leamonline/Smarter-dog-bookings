# Product requirements

**Status:** Active draft for programme review
**Authority:** Stable product requirement IDs and current-to-target state
**Scope:** issue #603 and child issues #604–#612
**Baseline:** `main@8eb8800fb345aeeba4887b266a4ff95a85fb7802`
**Last verified:** 9 August 2026

## Status vocabulary

- **Met:** repository evidence satisfies the requirement at the baseline.
- **Partial:** useful capability exists, but the complete product contract is
  not satisfied.
- **Gap:** the required contract does not yet exist on the live path.
- **Deferred:** intentionally belongs after the narrow live slice.

The target column names the earliest roadmap gate that can satisfy the gap. It
is not live delivery status; GitHub issues and pull requests own that.

## Requirement classes

Some requirements belong to more than one class because the same observable
contract protects both product behaviour and operation:

| Class | Governing requirements |
|---|---|
| Functional | `REQ-AUTH-001`, `REQ-OPS-001`, `REQ-OPS-002`, `REQ-NOT-001`, `REQ-NOT-002`, `REQ-NOT-003`, `REQ-CAP-002`, `REQ-UX-001`, `REQ-AI-001` |
| Non-functional | `REQ-CAP-001`, `REQ-REL-001`, `REQ-CI-001`, `REQ-A11Y-001`, `REQ-PERF-001` |
| Operational | `REQ-REL-002`, `REQ-GATE-001`, `REQ-RETIRE-001`, `REQ-MET-001` |
| Security and privacy | `REQ-SEC-001`, `REQ-REL-002`, `REQ-MET-002` |
| Accessibility | `REQ-A11Y-001` |
| Reliability | `REQ-OPS-001`, `REQ-OPS-002`, `REQ-NOT-001`, `REQ-NOT-002`, `REQ-NOT-003`, `REQ-CAP-001`, `REQ-REL-001`, `REQ-CI-001` |
| Performance | `REQ-PERF-001`; no numeric latency or throughput target is approved by this programme |

## Requirements

| ID | Requirement | Current state | Target |
|---|---|---|---|
| `REQ-AUTH-001` | Appointment-level customer and staff operations use one authoritative visit identity; dog-specific grooming state remains on booking lines. | **Gap.** Live staff writes still use booking rows. The visit foundation and compatibility linkage exist. | **Later / #609.** B4 migrates staff reschedule only; full authority cutover remains later. |
| `REQ-OPS-001` | A staff reschedule is one atomic, idempotent server command using expected revision and returning a verified appointment receipt. | **Gap.** Live `updateBooking` directly updates one booking row. Typed receipts and dark visit commands are prior foundation. | **B4 / #604 and #609.** |
| `REQ-OPS-002` | Ambiguous or incomplete visit membership fails with a typed manual-review outcome, no mutation, no intent and no weaker fallback. | **Gap.** No live reschedule boundary owns this contract. | **B4 / #604 and #609.** |
| `REQ-NOT-001` | One committed appointment operation creates at most one active notification intent per recipient, event and payload version. | **Gap.** Current notification identity is booking/trigger oriented. | **B2 then B4 / #610 and #604.** |
| `REQ-NOT-002` | Appointment outcome and delivery outcome are separately visible; retry never repeats the appointment mutation. | **Partial.** `notification_log` has delivery state, but staff reschedule creates no durable visit-level intent and the UI cannot present the complete split. | **B2 then B4 / #610 and #604.** |
| `REQ-NOT-003` | Retryable, permanent and unknown delivery outcomes have distinct recovery rules; unknown delivery cannot auto-retry. | **Gap.** No visit-operation attempt history owns this distinction. | **B2 / #610.** |
| `REQ-CAP-001` | PostgreSQL is the final capacity and concurrency authority. | **Met.** Browser/Deno preflight cannot override the database trigger. | **Preserve through A1 and B3 / #608.** |
| `REQ-CAP-002` | Browser, Flow, AI and database capacity decisions share approved grouped-allocation semantics and structured rejection reasons. | **Partial.** Browser/Deno parity exists; SQL runtime/concurrency evidence and full AI/reason convergence are incomplete. | **A1 evidence, B3 convergence / #608.** |
| `REQ-REL-001` | Features check named server-owned runtime capabilities and fail closed before incompatible privileged work. | **Gap.** Policy-specific status exists, but no generic schema/application capability contract. | **B1 / #607.** |
| `REQ-REL-002` | Every hosted Supabase command proves a named target and expected project ref before write-capable execution. | **Gap.** Link and explicit-ref use are not governed by one executable contract. | **A4b / #607 release compatibility.** |
| `REQ-SEC-001` | Every deployable Edge Function has a discovered, machine-readable caller and authentication contract with negative tests. | **Gap.** In-function checks exist, but the complete inventory and discovery guard do not. | **A3 / #605.** |
| `REQ-CI-001` | A production-build pull-request smoke gate runs critical journeys in desktop Chromium and mobile WebKit and proves failure with a negative control. | **Gap.** PR E2E is skipped and all configured projects use Chromium. | **A4a / #606.** |
| `REQ-UX-001` | Enabled-looking controls are genuinely usable or pre-labelled unavailable; user-facing errors contain safe recovery copy and optional reference ID, never raw exception text. | **Gap.** Inbox booking looks enabled before revealing it is unavailable; `ErrorBoundary` renders `error.message`. | **A2 / #611.** |
| `REQ-A11Y-001` | Every control or state changed by this programme remains keyboard operable, has a programmatic name, manages focus appropriately, communicates status without colour alone and works in the supported responsive layout. | **Partial.** Accessible modal/focus foundations exist, while the dated UX audit records wider gaps. | **A2 for unavailable/error states; preserve and verify again in B4.** |
| `REQ-PERF-001` | Appointment transactions never wait for an external messaging provider or analytics sink; delivery and measurement run asynchronously without blocking the core customer/staff operation. | **Partial.** Existing notifications and analytics use asynchronous/best-effort paths, but the reschedule slice has no durable intent boundary yet. | **Preserve in A0; enforce in B2/B4.** |
| `REQ-AI-001` | AI output remains human-reviewed by default; auto-send and autonomous booking require global, conversation and risk gates that fail closed. | **Met as a guarded default.** Relevant global and per-conversation flags default off; staff-invoked known-customer drafting remains reviewable. | **Preserve.** B3 may align capacity preflight but must not widen enablement. |
| `REQ-POL-001` | `previous_day_1500_v1` remains inactive and v1 mutation commands have no production caller until a separate activation decision. | **Met by guard.** The policy has no effective instant and `V1_ONLY_COMMANDS` enforces the dark-caller protocol. | **Preserve through every tranche.** No activation in this roadmap. |
| `REQ-MET-001` | A versioned catalogue defines decision questions, formulae, exclusions, dimensions, current source/confidence, owner, privacy and stop/go use. | **Gap at baseline.** Useful sources exist without one governed catalogue. | **A0 / #612:** [measurement catalogue](../specifications/measurement-catalogue.md). |
| `REQ-MET-002` | Analytics failure cannot block customer or staff work; customer free text and unnecessary personal data are excluded. | **Partial.** Funnel and denial logging are best-effort; a programme-wide privacy and quality contract is new. | **A0 definition, then preserve in later instrumentation / #612.** |
| `REQ-GATE-001` | Tranche B begins only after a named human records GO against one exact `main` SHA and all gate evidence. | **Gap until the decision occurs.** | **Default STOP gate in [ROADMAP.md](../../ROADMAP.md).** |
| `REQ-RETIRE-001` | Direct booking-row writes are blocked only after every known caller has migrated and an observation/rollback period has completed. | **Deferred.** Compatibility writes remain necessary. | **Later / #609.** |

## Explicit exclusions

These requirements do not authorise customer-policy activation, a full
notification migration, a database/frontend rewrite, microservices,
multi-tenancy, native applications, fully autonomous booking, production data
repair, provider-console changes, invented release dates or unverified
numerical performance targets. The complete non-goal boundary is in
[PROJECT.md](../../PROJECT.md#non-goals).

## Evidence rules

- A current status must cite code, a migration, a test or explicitly targeted
  operational evidence at an exact revision.
- `Implemented`, `deployed`, `feature-flagged` and `enabled in production` are
  different claims. One must not stand in for another.
- Existing visit commands are not live capability merely because their SQL and
  TypeScript wrappers exist.
- A requirement is not met by documentation alone when its target includes
  runtime behaviour.
- Changes to a requirement keep its ID, record the changed wording in review and
  update [traceability](../traceability.md).
