# Staff-reschedule automation go/no-go record

**Status:** **Decided — `STOP` recorded 15 August 2026.** Gate [#620](https://github.com/leamonline/Smarter-dog-bookings/issues/620) is complete
**Audited:** 9 August 2026
**Repository baseline:** `main@8eb8800fb345aeeba4887b266a4ff95a85fb7802`
**Evidence reviewed at:** `main@9e12bac0a96991089db6f5a55c2661e6c542f578`
**Decision authority:** [@leamonline](https://github.com/leamonline), named 15 August 2026

> **Decision, 15 August 2026.** The named decision-maker recorded **`STOP`**.
> The manual-contact procedure is retained; B1–B4 remain deferred; no live
> automation is authorised. `STOP` is a valid completion outcome of the gate,
> and it defers a `GO` rather than foreclosing one. The
> [resumption trigger](#resumption-trigger) records what would justify
> revisiting it. Full fields are in the
> [required decision record](#required-decision-record).

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
`main@0ef06c1`, including two trigger caveats and a closure correction the
decision-maker must read. Items 6 and 7 are outstanding and need authority this
repository does not grant — they are what block an evidence-complete `GO`.
Items 8 and 9 are settled in substance by the programme scope and need only
explicit adoption in the decision record.**

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
| Decision | **`STOP`** |
| Named human decision-maker | [@leamonline](https://github.com/leamonline), named 15 August 2026 |
| Decision date/time | 15 August 2026 (UTC) |
| Evidence/base SHA | `main@9e12bac0a96991089db6f5a55c2661e6c542f578` — see [SHA note](#note-on-the-evidence-sha) |
| Approved scope | **None.** `STOP` authorises no implementation. B1–B4 stay deferred |
| Meta template evidence | Not supplied; not required for `STOP` |
| Fallback policy | Unresolved; not required for `STOP` |
| Resumption trigger if STOP | See [resumption trigger](#resumption-trigger) below |
| Links to issue/PR/release evidence | [#620](https://github.com/leamonline/Smarter-dog-bookings/issues/620), [Tranche A exit evidence pack](2026-08-15-tranche-a-exit-evidence.md), [PR #646](https://github.com/leamonline/Smarter-dog-bookings/pull/646) |

`STOP` is a valid completion outcome of the gate, not a failure to decide. The
manual-contact procedure is retained unchanged, and implementation must not
cross into live automation.

### Note on the evidence SHA

The evidence reviewed is the pack attested at
`main@9e12bac0a96991089db6f5a55c2661e6c542f578`. `main` has since advanced to
`e7438dc` by merging that pack. The delta between the two is exactly three
files — `docs/research/2026-08-09-reschedule-automation-go-no-go.md`,
`docs/research/2026-08-15-tranche-a-exit-evidence.md` and
`docs/traceability.md` — with no code, schema, migration or workflow change, so
the evidence reviewed describes the code at current `main` without gaps.

The pack's re-read rule requires re-establishing A0–A4 at a new SHA before
relying on the attestation. That rule guards against authorising live work
against unverified code. `STOP` authorises no work, so it is not re-run here.
**A later `GO` may not inherit this**: it must re-establish A0–A4 at whatever
SHA it names.

### Resumption trigger

Reconsider when **both** hold:

1. The named decision-maker observes that manually contacting customers about
   staff-initiated reschedules has become burdensome in practice. No threshold
   is set here; the governing gate forbids inventing one, and the owner judges
   this from the salon's own experience.
2. The two evidence items that block an evidence-complete `GO` can actually be
   supplied — the exact approved Meta template route with a deterministic
   fallback/manual-contact policy, and a separately authorised aggregate-only
   check against an explicitly verified production target.

Item 2 is the binding constraint: neither was available at the time of this
decision, so `GO` was not reachable on the evidence regardless of preference.
Nothing about this record forecloses a later `GO`; it defers one.

## Data-handling boundary

This record intentionally contains only inherited aggregate counts with the
provenance limit above. Reviewing or repairing any candidate visits would
involve identifiable operational data and requires separate explicit
authority, a named target and an audited outcome.
