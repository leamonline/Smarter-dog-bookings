# Tranche A exit evidence at one `main` SHA

**Status:** Evidence pack only; no decision is recorded here
**Compiled:** 14 August 2026
**Evidence SHA:** `main@0ef06c1863578091f8b79264091bec9f468547e9`
**Decision authority:** Unassigned; this document does not appoint one

## Purpose

Gate [#620](https://github.com/leamonline/Smarter-dog-bookings/issues/620)
requires A0–A4 exit evidence gathered at **one exact `main` SHA**. Tranche A
landed across several commits between 10 and 13 August 2026, and `main` has
moved since. This pack fixes one SHA, records what executed there, and states
plainly what did **not** execute there and why.

This document records evidence. It does not record `STOP` or `GO`, appoint an
owner, invent a threshold, or authorise any production operation. The
disposition remains the documented default `STOP` until a named human completes
the decision fields in the
[go/no-go record](2026-08-09-reschedule-automation-go-no-go.md#required-decision-record).

## Package evidence

| Package | Issue | Exit artefact in tree | Executed at this SHA |
|---|---|---|---|
| A0 measurement catalogue | [#615](https://github.com/leamonline/Smarter-dog-bookings/issues/615) | [Measurement catalogue](../specifications/measurement-catalogue.md) | `check:docs` green (documentation-only package) |
| A1 capacity behaviour and stale-write proof | [#614](https://github.com/leamonline/Smarter-dog-bookings/issues/614) | [Capacity behaviour pgTAP](../../supabase/tests/035_capacity_behaviour.test.sql), [multi-session race driver](../../scripts/verify-capacity-concurrency.sh) | `DB Tests (pgTAP)` green via explicit dispatch — see [below](#a1-required-a-separate-dispatch) |
| A2 interface, error and documentation truth | [#617](https://github.com/leamonline/Smarter-dog-bookings/issues/617) | [Interface capability truth](../interface-capability-truth.md) | `test` (2791 tests) and `check:docs` green |
| A3 Edge authentication contract | [#616](https://github.com/leamonline/Smarter-dog-bookings/issues/616) | [Edge Function auth contract](../edge-function-auth.md), [`check-edge-function-auth.mjs`](../../scripts/check-edge-function-auth.mjs) | `check:edge-auth` green — 27 deployable functions classified and consistent; see [the closure correction](#a3-was-closed-before-one-criterion-was-met) |
| A4a PR browser gate | [#619](https://github.com/leamonline/Smarter-dog-bookings/issues/619) | [`e2e/smoke.spec.ts`](../../e2e/smoke.spec.ts), `pr-production-smoke` job in [CI](../../.github/workflows/ci.yml) | Green on a byte-identical tree — see [below](#a4a-is-proven-through-an-identical-tree-not-by-a-main-sha-run) |
| A4b hosted Supabase target guard | [#618](https://github.com/leamonline/Smarter-dog-bookings/issues/618) | [Target guard](../hosted-supabase-target-guard.md), [`check-hosted-supabase-targets.mjs`](../../scripts/check-hosted-supabase-targets.mjs) | `lint` green — guard runs inside `npm run lint` |

## What executed at this SHA

[CI run 31803630654](https://github.com/leamonline/Smarter-dog-bookings/actions/runs/31803630654),
push to `main`, 14 August 2026:

| Job | Result | Covers |
|---|---|---|
| `build` | success | `lint` (incl. A4b target guard), `check:docs`, `typecheck`, `check:migrations`, `test`, `build` |
| `agent-tests` | success | `check:edge-types`, `check:edge-auth` (A3), Deno Edge Function tests |
| `e2e` | success | full Playwright suite, production build |
| `pr-production-smoke` | **skipped** | pull-request-only by design (A4a) |

[Migrations Applied Check run 31803630652](https://github.com/leamonline/Smarter-dog-bookings/actions/runs/31803630652)
was green at the same SHA.

Independently reproduced at this SHA on Node 24: `lint` (0 errors, 122
pre-existing `no-explicit-any` warnings), `typecheck` clean, `test` 2791 passed
across 282 files, `check:docs`, `check:migrations`, `check:edge-auth` and
`build` all green.

## Caveats a reader must not skip

Two packages cannot be evidenced by a `main` push alone — both because of how
their checks are triggered, not because anything failed — and one package was
closed before it was actually complete.

### A1 required a separate dispatch

`DB Tests (pgTAP)` is path-filtered to `supabase/**`, `package.json` and named
scripts. The head commit is a `js-yaml` dev-dependency bump, so the workflow did
not run at this SHA; its most recent push-triggered run was at
`80a105f`. A1's exit evidence — capacity behaviour, the daily cap, blocked
seats, atomic multi-dog rollback and the real two-session races — lives entirely
in that workflow.

It was therefore dispatched explicitly at this SHA and passed:
[run 31805822970](https://github.com/leamonline/Smarter-dog-bookings/actions/runs/31805822970)
(`workflow_dispatch`, 14 August 2026, conclusion `success`). That run rebuilds
the database from every committed migration, executes the pgTAP suite, and then
runs `npm run test:db:concurrency` — which drives both the
[WhatsApp reschedule](../../scripts/verify-whatsapp-reschedule-concurrency.sh)
and [capacity](../../scripts/verify-capacity-concurrency.sh) two-session races.
The job holds no hosted credentials and never links, queries or dumps
production.

**Anyone re-assembling this pack at a different SHA must dispatch
`db-tests.yml` at that SHA rather than assume the path filter fired.**

### A4a is proven through an identical tree, not by a main-SHA run

`pr-production-smoke` is guarded by `if: github.event_name == 'pull_request'`
and rechecks the pull-request head SHA by design, so it is always `skipped` on a
push to `main`. No `main` SHA can carry a green result for it directly, and
reading the criterion as "this job must be green on the `main` SHA" would block
the gate permanently.

It is nonetheless satisfied in substance at this SHA, because the content the
gate tested is byte-identical to the content on `main`:

| Commit | Role | Tree |
|---|---|---|
| `9120e0b1364d6a9a3ada764c4a7efad98e9b384d` | PR [#641](https://github.com/leamonline/Smarter-dog-bookings/pull/641) head, where the gate ran | `6f212c212d721a0e39ebe3b83b96d585da81a351` |
| `0ef06c1863578091f8b79264091bec9f468547e9` | current `main`, the merge of that PR | `6f212c212d721a0e39ebe3b83b96d585da81a351` |

At `9120e0b`,
[run 31772465267](https://github.com/leamonline/Smarter-dog-bookings/actions/runs/31772465267)
executed `pr-production-smoke` to `success` with every substantive step
green — head verification, the non-empty-suite assertion, the production-build
Chromium and WebKit journeys, and the skipped/incomplete-result rejection. The
job did real work; it was not a no-op pass.

Because the merge commit introduced no tree change, that run exercised exactly
the repository contents present at the gate SHA. Combined with the negative
control recorded in [#619](https://github.com/leamonline/Smarter-dog-bookings/issues/619)
— a deliberate regression went red, and its removal restored green — A4a's exit
condition holds at this SHA.

**This argument is specific to this SHA.** It works only because the merge
commit and the tested head share a tree. At a `main` SHA whose tree differs from
any gate-tested head, A4a would need re-establishing.

### A3 was closed before one criterion was met

Issue closure is not evidence, and A3 is the case that proves it. #616 was
closed on 12 August with one acceptance criterion **explicitly unticked** —
*local configuration, runtime checks and deployment flags cannot silently
diverge*. At closure the `config.toml` versus CI divergence was visible and
pinned by the manifest, but not fixed: 5 functions had no `[functions.*]` block
and 3 declared one without `verify_jwt`, so a local `supabase functions deploy`
would have applied `verify_jwt = true` while CI forces `false`.

[PR #639](https://github.com/leamonline/Smarter-dog-bookings/pull/639), merged
as `c8b8f5162083a8a99a8bd94c84c03f159eaaf67b`, closed all 8 divergences. The
follow-up evidence re-derived the position from primary sources rather than
trusting the manifest: 27 deployable functions, 27 `[functions.*]` blocks, 0
entries not `declared-false`, 0 manifest/config mismatches, and no
`verify_jwt = true` anywhere in `config.toml`. That is an alignment, not a
weakening — CI already deployed all 27 with `--no-verify-jwt`, so gateway
behaviour is unchanged.

The criterion is met at this SHA. It is recorded here because a reader checking
only the issue state would have counted A3 as complete a day before it was.

## Residual limitations to carry into the decision record

Both are deliberate scope boundaries, not oversights, and both should survive
into the gate record rather than being dropped:

1. **A3 does not prove runtime wiring.** The guard asserts each function
   *references* its declared auth primitive; it does not execute the handler,
   because importing an entrypoint starts an HTTP server. Proving it end-to-end
   would mean restructuring all 27 functions.
2. **A4a is not enforced by native branch protection.** Private-repository
   branch/ruleset enforcement was unavailable, so the repository relies on the
   [human merge-control mechanism](../superpowers/runbooks/2026-08-11-human-merge-control.md)
   rather than GitHub technically preventing an unauthorised merge.

## What this pack does and does not establish

Per the [evidence rule](../traceability.md#evidence-rule), a green job proves
only what it executed. Mapped against #620's acceptance criteria:

| # | Criterion | Status |
|---|---|---|
| 1 | A0–A4 green at one named `main` SHA | **Met** at `0ef06c1`, with the A1 dispatch and A4a tree-identity caveats above |
| 2 | A named human compares reschedule need with the manual-contact procedure and records STOP/GO | **Needs the human.** #620 currently has no decision comment of any kind |
| 3 | Exact approved template route and deterministic fallback policy evidenced | **Not met.** Provider-console evidence for the exact Meta template and version, plus a recorded fallback channel decision. No fallback is assumed |
| 4 | Fresh aggregate-only, explicitly targeted production check | **Not met; needs separate authority.** #620 does not itself grant production-data access. The [9 August counts](2026-08-09-issue-603-plan-reality-audit.md#unverified-prior-aggregate-snapshot) are provenance-limited context, not gate evidence |
| 5 | Ambiguous legacy groupings classified or excluded by B4's fail-closed contract, no heuristic repair | **Met by design.** [B4 #624](https://github.com/leamonline/Smarter-dog-bookings/issues/624) already requires `visit_review_required` with zero mutation, zero intent and no raw-row fallback. Criterion 4 would quantify how much ambiguity exists; it does not reopen the policy |
| 6 | Record confirms B1–B4 are the whole live scope | **Scope already settled; needs human adoption** into the decision record |
| 7 | Record names SHA, evidence, decision-maker, scope, rollback seam, unresolved risks | **Needs the human.** This pack supplies the SHA and evidence; the decision-maker cannot be manufactured |
| 8 | STOP names its reconsideration trigger; GO authorises sequencing only | **Outcome-dependent.** The human selects the outcome and writes the matching statement |

So criterion 1 is the part this pack closes. Criteria 3 and 4 are what block an
evidence-complete `GO`; a `STOP` remains available without them, since the
governing gate treats `STOP` as a valid completion outcome. **That is a
statement about gate mechanics, not a recommendation.**

`previous_day_1500_v1` remains inactive. This pack authorises no migration
application, provider change, customer contact or production write.

## Re-reading this pack later

Criterion 1 is attested against one exact SHA. Before the decision is recorded,
re-read `main`. If it is still `0ef06c1863578091f8b79264091bec9f468547e9`, this
pack applies as written. If `main` has moved, re-establish A0–A4 at the new SHA
rather than carrying this attestation forward — dispatching `db-tests.yml` at
that SHA, and re-checking whether the A4a tree-identity argument still holds.
