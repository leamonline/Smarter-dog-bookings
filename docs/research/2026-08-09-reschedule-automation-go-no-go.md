# Staff-reschedule automation go/no-go record

**Status:** Research complete; evidence refreshed 14 August 2026; default STOP
**Audited:** 9 August 2026
**Repository baseline:** `main@8eb8800fb345aeeba4887b266a4ff95a85fb7802`
**Evidence refreshed at:** `main@0ef06c1863578091f8b79264091bec9f468547e9`
**Decision authority:** Unassigned; this document does not appoint one

> **Evidence refresh, 14 August 2026.** Tranche A has since completed. The
> sections below are annotated where its findings have been superseded; the
> 9 August audit wording is preserved rather than rewritten. The assembled
> exit evidence is in the
> [Tranche A exit evidence pack](2026-08-14-tranche-a-exit-evidence.md).
> **The disposition is unchanged: `STOP`.** Completing Tranche A is not
> permission to begin Tranche B.

## Decision question

**RA-001 — Should Tranche B be authorised to automate live staff rescheduling
through one legacy-compatible visit command and one durable customer
notification intent?**

This is not a decision to activate `previous_day_1500_v1`, to repair customer
data, to migrate every notification or to retire every booking-row writer.
Those require separate authority.

## Current disposition: STOP

`STOP` is the safe default because the required human decision and operational
evidence have not been recorded. It is not a conclusion that automation has no
value. Tranche A evidence/safety work remains useful and may complete without
committing to Tranche B.

A `GO` must be an explicit, dated record by a named human decision-maker at a
named base SHA. An implementation agent must not infer approval from the
existence of issues, migrations, this research file or an empty owner field.

## Confirmed evidence

- Staff reschedule paths update booking rows in place and do not send a
  customer reschedule notification.
- The visit substrate, typed receipts, legacy dual-write and dark visit
  commands already exist.
- The customer-policy activation protocol is separate and must remain dark.
- The current notification model lacks visit-level intents, append-only
  attempts and `delivery_unknown`.
- ~~PR Playwright is skipped; all configured browser projects use Chromium.~~
  **Superseded 14 August 2026 by A4a (#619):** the `pr-production-smoke` job
  runs `e2e/smoke.spec.ts` against a production build in desktop Chromium and
  mobile WebKit on every non-documentation pull request, with a non-empty-suite
  assertion.
- ~~Edge caller authentication is distributed and lacks one complete
  contract.~~ **Superseded 14 August 2026 by A3 (#616):** `npm run
  check:edge-auth` classifies all 27 deployable functions against
  [one contract](../edge-function-auth.md) and fails on drift.

The first four bullets remain true; the strikethrough bullets described the
pre-Tranche-A baseline. See the
[full dated audit](2026-08-09-issue-603-plan-reality-audit.md) for
classification and repository evidence, and the
[exit evidence pack](2026-08-14-tranche-a-exit-evidence.md) for what executed
at the refreshed SHA.

## Unverified prior context

A preceding planning audit reported 497 booking rows linked to 471 visits,
plus ten cancelled zero-child visits, giving 481 total visit records. It also
reported three candidate pairs/six active visits. The exact target, query,
execution record and timestamp were not retained, and this pass did not rerun
the query. These figures explain the fail-closed concern but do not satisfy a
GO criterion or prove that any grouping currently exists.

## Current unknowns

| Unknown | Why it matters | What resolves it |
|---|---|---|
| Whether actual staff/customer impact justifies automation now | The code gap is real, but frequency, manual recovery burden and customer impact have not been recorded in a governed measure | A named human compares current evidence with a documented manual-contact procedure and records the judgement |
| Whether each of the three candidate pairs represents one appointment | A heuristic merge could move or notify the wrong visit | Authorised review/reconciliation evidence, or confirmed exclusion through `visit_review_required` |
| Exact Meta template wording and approval state | Business-initiated WhatsApp sends may require an approved template | Provider-console evidence for the exact template/version before enablement |
| Deterministic fallback policy | SMS/email/another WhatsApp route changes cost, consent, wording and duplicate risk | A recorded channel decision; no fallback is assumed here |
| Safe `delivery_unknown` operating procedure | Blind retry can duplicate a customer message | Staff reconciliation UI/process, provider correlation evidence and audited mark-delivered/authorise-retry actions |
| ~~Complete Edge Function caller/auth contract~~ **Resolved by A3 (#616)** | The new worker would handle privileged data and provider secrets | Done: `check:edge-auth` classifies 27 deployable functions with negative tests by authentication family |
| Old-schema/new-code failure behaviour | Frontend/Edge deploy separately from manual migrations | Minimal #607 named capability projection and a negative mismatch test — **still open; this is B1, not Tranche A** |
| ~~Critical browser behaviour in WebKit~~ **Resolved by A4a (#619)** | Current responsive emulation is Chromium-only | Done: `pr-production-smoke` runs Chromium and mobile WebKit on pull requests, proved with a negative control |
| ~~Exact hosted database target protection~~ **Resolved by A4b (#618)** | A correct migration against the wrong project is still a production incident | Done: [target guard](../hosted-supabase-target-guard.md) runs inside `npm run lint`; production application remains separate human authority |
| Rollback boundary after the first live command | Once a move commits and a message may have been accepted, rollback is not one operation | A rehearsed command/delivery rollback and recovery runbook for the narrow slice |

No quantitative success, error or discrepancy threshold has been agreed. This
record deliberately does not invent one.

## Evidence required before a GO can be considered

The decision-maker should have one evidence pack tied to one `main` SHA.
**Items 1–5 are assembled in the
[Tranche A exit evidence pack](2026-08-14-tranche-a-exit-evidence.md) at
`main@0ef06c1`, including two trigger caveats the decision-maker must read.
Items 6–9 remain outstanding and need authority this repository does not
grant.**

1. The documentation-first measurement catalogue defines the decision measures
   and explicitly leaves unassigned owners/thresholds visible.
2. Capacity SQL behaviour and stale-write races agree with the approved rules.
3. Interface/error truth work and the Edge authentication contract are green.
4. The PR-head Chromium/WebKit gate fails under a deliberate negative control
   and passes after its removal.
5. Hosted database commands are protected by exact target confirmation.
6. A fresh aggregate-only production check finds no broken booking-to-visit
   linkage, ownership/date mismatch or duplicate membership. Any remaining
   ambiguity is demonstrably excluded by the fail-closed contract.
7. The Meta template route is feasible and the fallback policy is explicit.
8. The proposed scope still fits a minimal capability seam, reschedule-only
   intent/attempt model, canonical capacity reason contract and one
   legacy-compatible staff reschedule command.
9. The implementation does not require customer-policy activation, broad data
   repair, a generic queue or full booking-row cutover.

These are evidence categories, not invented numeric thresholds.

## Required command contract if GO is recorded

- Resolve one unambiguous visit and all included booking lines.
- Apply the move atomically under an idempotency key and expected revision.
- Persist one logical customer notification intent in the same transaction.
- Return operation and notification linkage separately in the existing typed
  receipt family.
- On ambiguous membership/grouping, return `visit_review_required`, perform no
  mutation, create no intent and present manual review/contact.
- Never fall back to `useBookings.updateBooking` or repeat the appointment
  command to retry delivery.
- Represent provider ambiguity as `delivery_unknown` and require audited human
  reconciliation before a new attempt.

The governing details are in [ADR 003](../architecture/decisions/003-separate-operation-success-from-notification-delivery.md),
[ADR 005](../architecture/decisions/005-fail-closed-on-ambiguous-legacy-visit-grouping.md)
and the [notification specification](../specifications/notification-delivery.md).

## Required decision record

Complete these fields only when authorised evidence exists:

| Field | Required value |
|---|---|
| Decision ID | `RA-001` |
| Decision | `GO` or `STOP` |
| Named human decision-maker | Unassigned |
| Decision date/time | Unrecorded |
| Evidence/base SHA | Unrecorded |
| Approved scope | Unrecorded |
| Meta template evidence | Unrecorded |
| Fallback policy | Unresolved |
| Resumption trigger if STOP | Unrecorded |
| Links to issue/PR/release evidence | Unrecorded |

Until these fields are completed by an authorised human, the decision remains
`STOP` and implementation must not cross into live automation.

## Data-handling boundary

This record intentionally contains only inherited aggregate counts with the
provenance limit above. Reviewing or repairing any candidate visits would
involve identifiable operational data and requires separate explicit
authority, a named target and an audited outcome.
