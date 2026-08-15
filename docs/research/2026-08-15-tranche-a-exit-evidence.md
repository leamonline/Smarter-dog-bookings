# Tranche A exit evidence at one `main` SHA

**Status:** Evidence pack only; no decision is recorded here
**Compiled:** 15 August 2026
**Evidence SHA:** `main@9e12bac0a96991089db6f5a55c2661e6c542f578`
**Tree:** `9b1176a8f099e63dcb58f15f4c0fbc6f4c329bd6`
**Decision authority:** [@leamonline](https://github.com/leamonline), named 15 August 2026
in the [go/no-go record](2026-08-09-reschedule-automation-go-no-go.md#required-decision-record)

## Purpose

Gate [#620](https://github.com/leamonline/Smarter-dog-bookings/issues/620)
requires A0–A4 exit evidence gathered at **one exact `main` SHA**. This pack
supersedes the [14 August pack](2026-08-14-tranche-a-exit-evidence.md), which
attested at `main@0ef06c1` and whose own re-read rule retired it the moment
`main` moved.

This document records evidence. It does not record `STOP` or `GO`, appoint an
owner, invent a threshold, or authorise any production operation. The
disposition remains the documented default `STOP` until a named human completes
the decision fields in the
[go/no-go record](2026-08-09-reschedule-automation-go-no-go.md#required-decision-record).

## Why `main` moved

The previous pack is not merely stale; the interval contains a red `main` that a
reader should be able to account for.

| SHA | What it was | CI |
|---|---|---|
| `0ef06c1` | The 14 August pack's evidence SHA | green |
| `dcc8827` | Merge of [#643](https://github.com/leamonline/Smarter-dog-bookings/pull/643), merge-control runtime | **red** |
| `898034f` | Merge of [#645](https://github.com/leamonline/Smarter-dog-bookings/pull/645), the fix | green |
| `9e12bac` | Merge of [#644](https://github.com/leamonline/Smarter-dog-bookings/pull/644), template status webhooks | green — this pack |

At `dcc8827`, `npm run test` failed in
[run 31871745922](https://github.com/leamonline/Smarter-dog-bookings/actions/runs/31871745922):
a wall-clock bound in the concurrency-driver guard test, breached because a lost
cancellation signal left a watchdog subshell holding the caller's output pipe for
its whole timeout. It reproduced at about 2.5% under parallel load and was fixed
in `60e9e2c`. The defect was in
[the shared driver](../../scripts/postgres-concurrency-driver.sh), which the A1
concurrency proof runs on — so A1's own evidence at any SHA before `898034f`
was produced by a driver carrying that defect. The runs recorded below post-date
the fix.

## Package evidence

| Package | Issue | Exit artefact in tree | Executed at this SHA |
|---|---|---|---|
| A0 measurement catalogue | [#615](https://github.com/leamonline/Smarter-dog-bookings/issues/615) | [Measurement catalogue](../specifications/measurement-catalogue.md) | `check:docs` green (documentation-only package) |
| A1 capacity behaviour and stale-write proof | [#614](https://github.com/leamonline/Smarter-dog-bookings/issues/614) | [Capacity behaviour pgTAP](../../supabase/tests/035_capacity_behaviour.test.sql), [multi-session race driver](../../scripts/verify-capacity-concurrency.sh) | `DB Tests (pgTAP)` green via explicit dispatch — see [below](#a1-required-a-separate-dispatch-again) |
| A2 interface, error and documentation truth | [#617](https://github.com/leamonline/Smarter-dog-bookings/issues/617) | [Interface capability truth](../interface-capability-truth.md) | `test` and `check:docs` green |
| A3 Edge authentication contract | [#616](https://github.com/leamonline/Smarter-dog-bookings/issues/616) | [Edge Function auth contract](../edge-function-auth.md), [`check-edge-function-auth.mjs`](../../scripts/check-edge-function-auth.mjs) | `check:edge-auth` green |
| A4a PR browser gate | [#619](https://github.com/leamonline/Smarter-dog-bookings/issues/619) | [`e2e/smoke.spec.ts`](../../e2e/smoke.spec.ts), `pr-production-smoke` job in [CI](../../.github/workflows/ci.yml) | Green on a byte-identical tree — see [below](#a4a-is-proven-through-an-identical-tree-not-by-a-main-sha-run) |
| A4b hosted Supabase target guard | [#618](https://github.com/leamonline/Smarter-dog-bookings/issues/618) | [Target guard](../hosted-supabase-target-guard.md), [`check-hosted-supabase-targets.mjs`](../../scripts/check-hosted-supabase-targets.mjs) | `lint` green — guard runs inside `npm run lint` |

## What executed at this SHA

[CI run 31875191813](https://github.com/leamonline/Smarter-dog-bookings/actions/runs/31875191813),
push to `main`, 15 August 2026:

| Job | Result | Covers |
|---|---|---|
| `build` | success | `lint` (incl. the A4b target guard), `check:docs`, `typecheck`, `check:migrations`, `test`, `build` |
| `agent-tests` | success | `check:edge-types`, `check:edge-auth` (A3), Deno Edge Function tests |
| `e2e` | success | full Playwright suite, production build |
| `pr-production-smoke` | **skipped** | pull-request-only by design (A4a) |

## Caveats a reader must not skip

Both are trigger mechanics, not failures, and both are the same two the previous
pack carried. They are structural: they will recur at every future SHA.

### A1 required a separate dispatch again

`DB Tests (pgTAP)` is path-filtered to `supabase/migrations/**`,
`supabase/tests/**`, `supabase/config.toml`, `package.json` and a named list of
scripts. The merge at this SHA changed only `docs/` and
`supabase/functions/**` — **no path in that filter** — so the workflow did not
run on the push.

This is worth recording precisely, because the previous SHA behaved the
opposite way and could mislead a reader into thinking the filter is reliable. At
`898034f` the merge touched
[`scripts/postgres-concurrency-driver.sh`](../../scripts/postgres-concurrency-driver.sh),
which *is* in the filter, so `DB Tests (pgTAP)` fired natively on the push. One
SHA later it did not. Whether A1 has native evidence is a property of what a
given merge happened to touch, never of the package.

It was therefore dispatched explicitly at this SHA and passed:
[run 31911620431](https://github.com/leamonline/Smarter-dog-bookings/actions/runs/31911620431)
(`workflow_dispatch`, 15 August 2026, conclusion `success`) — database rebuild,
pgTAP suite and concurrency proof all green. That run rebuilds the database from
every committed migration, executes the pgTAP suite, and then runs
`npm run test:db:concurrency` — which drives both the
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
| `e57287f6f12684d804be1a29a92efbcc8424c0e6` | PR [#644](https://github.com/leamonline/Smarter-dog-bookings/pull/644) head, where the gate ran | `9b1176a8f099e63dcb58f15f4c0fbc6f4c329bd6` |
| `9e12bac0a96991089db6f5a55c2661e6c542f578` | current `main`, the merge of that PR | `9b1176a8f099e63dcb58f15f4c0fbc6f4c329bd6` |

At `e57287f`,
[run 31874691119](https://github.com/leamonline/Smarter-dog-bookings/actions/runs/31874691119)
executed `pr-production-smoke` to `success`. Combined with the negative control
recorded in [#619](https://github.com/leamonline/Smarter-dog-bookings/issues/619)
— a deliberate regression went red, and its removal restored green — A4a's exit
condition holds at this SHA.

**This argument is specific to this SHA.** It works only because the merge
commit and the tested head share a tree. At a `main` SHA whose tree differs from
any gate-tested head, A4a would need re-establishing. The tree equality above
was read directly rather than inferred from the merge being a fast-forward.

## Residual limitations to carry into the decision record

Unchanged from the previous pack. Both are deliberate scope boundaries, not
oversights, and both should survive into the gate record rather than being
dropped:

1. **A3 does not prove runtime wiring.** The guard asserts each function
   *references* its declared auth primitive; it does not execute the handler,
   because importing an entrypoint starts an HTTP server. Proving it end-to-end
   would mean restructuring every deployable function.
2. **A4a is not enforced by native branch protection.** Private-repository
   branch/ruleset enforcement was unavailable, so the repository relies on the
   [human merge-control mechanism](../superpowers/runbooks/2026-08-11-human-merge-control.md)
   rather than GitHub technically preventing an unauthorised merge.

## What this pack does and does not establish

Per the [evidence rule](../traceability.md#evidence-rule), a green job proves
only what it executed. Mapped against #620's acceptance criteria:

| # | Criterion | Status |
|---|---|---|
| 1 | A0–A4 green at one named `main` SHA | **Met** at `9e12bac`, with the A1 dispatch and A4a tree-identity caveats above |
| 2 | A named human compares reschedule need with the manual-contact procedure and records STOP/GO | **Partly met.** The owner is named — [@leamonline](https://github.com/leamonline), 15 August 2026 — which satisfies "named". The comparison and the recorded STOP/GO are still outstanding, and are the owner's to make |
| 3 | Exact approved template route and deterministic fallback policy evidenced | **Not met.** Provider-console evidence for the exact Meta template and version, plus a recorded fallback channel decision. No fallback is assumed |
| 4 | Fresh aggregate-only, explicitly targeted production check | **Not met; needs separate authority.** #620 does not itself grant production-data access. The [9 August counts](2026-08-09-issue-603-plan-reality-audit.md#unverified-prior-aggregate-snapshot) are provenance-limited context, not gate evidence |
| 5 | Ambiguous legacy groupings classified or excluded by B4's fail-closed contract, no heuristic repair | **Met by design.** [B4 #624](https://github.com/leamonline/Smarter-dog-bookings/issues/624) already requires `visit_review_required` with zero mutation, zero intent and no raw-row fallback |
| 6 | Record confirms B1–B4 are the whole live scope | **Scope already settled; needs human adoption** into the decision record |
| 7 | Record names SHA, evidence, decision-maker, scope, rollback seam, unresolved risks | **Partly met.** SHA, evidence and decision-maker are recorded; scope, rollback seam and unresolved risks are written when the decision is |
| 8 | STOP names its reconsideration trigger; GO authorises sequencing only | **Outcome-dependent.** The human selects the outcome and writes the matching statement |

So criterion 1 is the part this pack closes. Criteria 3 and 4 are what block an
evidence-complete `GO`; a `STOP` remains available without them, since the
governing gate treats `STOP` as a valid completion outcome. **That is a
statement about gate mechanics, not a recommendation.**

`previous_day_1500_v1` remains inactive. This pack authorises no migration
application, provider change, customer contact or production write.

## Re-reading this pack later

Criterion 1 is attested against one exact SHA. Before the decision is recorded,
re-read `main`. If it is still `9e12bac0a96991089db6f5a55c2661e6c542f578`, this
pack applies as written. If `main` has moved, re-establish A0–A4 at the new SHA
rather than carrying this attestation forward — dispatching `db-tests.yml` at
that SHA, and re-checking whether the A4a tree-identity argument still holds.

Two open items will move `main` again and retire this pack when they land: a
`nanoid` advisory
([GHSA-2v37-7h3g-55p8](https://github.com/advisories/GHSA-2v37-7h3g-55p8),
transitive via vite → postcss, a lockfile-only patch bump) and the weekly
Dependabot group. Assembling a pack is cheap; assembling it against a SHA nobody
is about to decide on is the treadmill this rule exists to stop.
