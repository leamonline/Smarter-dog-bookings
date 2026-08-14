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
| A3 Edge authentication contract | [#616](https://github.com/leamonline/Smarter-dog-bookings/issues/616) | [Edge Function auth contract](../edge-function-auth.md), [`check-edge-function-auth.mjs`](../../scripts/check-edge-function-auth.mjs) | `check:edge-auth` green — 27 deployable functions classified and consistent |
| A4a PR browser gate | [#619](https://github.com/leamonline/Smarter-dog-bookings/issues/619) | [`e2e/smoke.spec.ts`](../../e2e/smoke.spec.ts), `pr-production-smoke` job in [CI](../../.github/workflows/ci.yml) | Structurally cannot run on a `main` SHA — see [below](#a4a-cannot-run-on-a-main-sha) |
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

## Gaps at this SHA

Two packages cannot be evidenced by a `main` push alone. Both are properties of
how the checks are triggered, not failures.

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

### A4a cannot run on a main SHA

`pr-production-smoke` is guarded by `if: github.event_name == 'pull_request'`
and rechecks the pull-request head SHA by design, so it is always `skipped` on a
push to `main`. No `main` SHA can carry a green result for it.

A4a's proof is therefore necessarily tied to a pull-request head SHA: the
negative control demonstrated in [#619](https://github.com/leamonline/Smarter-dog-bookings/issues/619),
plus the gate running on every subsequent non-documentation pull request. The
gate wording "green at one exact `main` SHA" cannot be satisfied literally for
this package, and reading it strictly would block the gate permanently. The
decision-maker should accept the per-pull-request evidence for A4a, or restate
the criterion.

## What this pack does not establish

Per the [evidence rule](../traceability.md#evidence-rule), a green job proves
only what it executed. Four of the gate's criteria cannot be satisfied from the
repository at any SHA, and none of them is addressed here:

1. **The human judgement.** Comparing observed staff-reschedule need against
   the current manual-contact procedure, and explicitly recording `STOP` or
   `GO`. No owner is appointed by this document.
2. **Meta template route and fallback policy.** Requires provider-console
   evidence for the exact template and version, plus a recorded SMS/email
   fallback decision. No fallback is assumed.
3. **The fresh aggregate-only production check.** Requires separately
   authorised access to an explicitly verified production target. The
   [9 August aggregate counts](2026-08-09-issue-603-plan-reality-audit.md#unverified-prior-aggregate-snapshot)
   remain provenance-limited context and are not gate evidence.
4. **Scope reconfirmation.** That B1–B4 remain the whole proposed live scope and
   require no policy activation, full cutover, generic queue or unapproved data
   repair.

`previous_day_1500_v1` remains inactive. This pack authorises no migration
application, provider change, customer contact or production write.
