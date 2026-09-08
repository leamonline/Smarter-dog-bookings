# Documentation map

**Status:** Active
**Authority:** Navigation and source-precedence guide
**Last verified:** 2 September 2026 against
`main@e456aa00cdf2ff8b22fb8df473f7095a9f080a91`
(the map and its links; earlier baseline 11 August 2026 at `main@e01823e8`)

This repository contains years of useful design notes, implementation plans and
operational evidence. This page explains which source answers which question.
It does not duplicate those sources.

## Start here

| Question | Read |
|---|---|
| What is the product and what matters? | [`../PROJECT.md`](../PROJECT.md) |
| What is being done, and in what order? | [`../ROADMAP.md`](../ROADMAP.md) and [GitHub issue #603](https://github.com/leamonline/Smarter-dog-bookings/issues/603) |
| How should an AI agent work here? | [`../AGENTS.md`](../AGENTS.md) |
| How should a substantial change be planned? | [`../.agent/PLANS.md`](../.agent/PLANS.md) |
| What does the product currently do? | [`product/`](product/) and [`architecture/overview.md`](architecture/overview.md) |
| Which decisions are settled? | [`architecture/decisions/`](architecture/decisions/) |
| Which plan is active? | [`plans/active/`](plans/active/) |
| Where is the marketing website, and how is it published? | [`../website/`](../website/) — an independent application in this repository ([ADR 009](architecture/decisions/009-independent-applications-in-one-repository.md)); the [approved design](superpowers/specs/2026-09-07-website-repository-consolidation-design.md) records the boundary; publishing follows the [cutover runbook](superpowers/runbooks/2026-09-07-website-publisher-cutover.md) |
| How are hosted Supabase CLI targets guarded? | [`hosted-supabase-target-guard.md`](hosted-supabase-target-guard.md) |
| Which features are supported, enabled or deliberately unavailable? | [`interface-capability-truth.md`](interface-capability-truth.md) |
| Which facts remain uncertain? | [`research/`](research/) |
| Where are detailed behavioural contracts? | [`specifications/`](specifications/) and the domain references below |
| How are issues, pull requests and the Project organised? | [`project-management.md`](project-management.md) |
| Where are reusable AI prompts? | [`../prompts/README.md`](../prompts/README.md) |

## Source precedence

Different questions have different authorities:

1. **Actual current behaviour:** executable code, the latest migration that
   defines an object, configuration and passing tests. Documentation must not
   overrule observed implementation.
2. **Product policy and desired behaviour:** an approved specification or
   accepted architecture decision record (ADR). If implementation differs,
   record the discrepancy instead of silently changing either side.
3. **Current programme intent and ordering:** [`../ROADMAP.md`](../ROADMAP.md),
   the active programme plan and GitHub issues.
4. **Live status, ownership and blockers:** GitHub Issues and the repository
   Project. Markdown records durable intent, not a second task board.
5. **Historical reasoning:** completed plans, dated evidence and `docs/archive/`.
   These explain why something happened; they are not automatically current.

The signed booking cancellation and rescheduling policy is deliberately
preserved at
[`archive/superpowers/specs/2026-07-22-booking-cancellation-rescheduling-policy-design.md`](archive/superpowers/specs/2026-07-22-booking-cancellation-rescheduling-policy-design.md).
Its location under `archive/` records the implementation programme's history;
[`specifications/booking-policy.md`](specifications/booking-policy.md) is the
current routing document and must not become a second copy of that policy.

## Current programme

The active cross-cutting programme is the booking, notification and release
architecture convergence tracked by [issue #603](https://github.com/leamonline/Smarter-dog-bookings/issues/603).

- Programme plan:
  [`plans/active/2026-08-09-issue-603-architecture-convergence.md`](plans/active/2026-08-09-issue-603-architecture-convergence.md)
- Evidence audit:
  [`research/2026-08-09-issue-603-plan-reality-audit.md`](research/2026-08-09-issue-603-plan-reality-audit.md)
- Roadmap and stop/go gate: [`../ROADMAP.md`](../ROADMAP.md)
- Traceability: [`traceability.md`](traceability.md)

## Existing authoritative domain references

These files remain authoritative for their bounded topics:

- [`capacity-engine.md`](capacity-engine.md) — current 2-2-1, large-dog,
  blocked-seat, extra-slot and daily-cap behaviour.
- [`migrations.md`](migrations.md) — migration history, known tracking
  exceptions and database-function permission convention.
- [`edge-function-auth.md`](edge-function-auth.md) — caller and authentication
  contract for every deployable Edge Function, and what it does not prove.
- [`node-runtime.md`](node-runtime.md) — the supported Node version, where it is
  declared, and how a bump is kept consistent.
- [`supabase-advisors.md`](supabase-advisors.md) — the accepted Supabase advisor
  findings, why each is accepted, and the `check:advisors` diff against the baseline.
- [`whatsapp-agent.md`](whatsapp-agent.md) — AI receptionist operation and
  guarded rollout.
- [`whatsapp-flows.md`](whatsapp-flows.md) — interactive WhatsApp Flow setup and
  behaviour.
- [`booking-pane-actions-spec.md`](booking-pane-actions-spec.md) — current
  appointment-offer interaction; it is not the future visit notification
  authority.
- [`interface-capability-truth.md`](interface-capability-truth.md) — current
  user-facing capability, error and sample-data boundaries verified against
  code.
- [`today-command-centre.md`](today-command-centre.md) — Daily Brief and report
  behaviour.
- [`superpowers/runbooks/`](superpowers/runbooks/) — production and operational
  procedures. Treat embedded evidence as dated unless it is freshly rerun.
- [`.design-sync/`](../.design-sync/) — design system evidence. The early rebrand spec
  ([`archive/DESIGN.md`](archive/DESIGN.md)) is superseded; `src/index.css` and
  [`modal-standard.md`](modal-standard.md) are canonical.

## Document status vocabulary

| Status | Meaning |
|---|---|
| Draft | Under discussion; not an implementation authority |
| Proposed | A concrete decision awaiting acceptance |
| Accepted | The decision governs future work, even if implementation is incomplete |
| Active | Current operational, planning or reference material |
| Implemented | Verified in code; preserve as completion evidence |
| Superseded | Replaced by a named newer authority |
| Historical | Useful context, not current instruction |

When status changes, add the new status and the replacing source. Do not edit a
completed plan to make its history look cleaner.

## Archive and private material

- `docs/archive/` is retained history. Link to it when it explains a decision,
  but do not revive an archived task merely because its file exists.
  The dated root reports moved here on 2 September 2026 (assessment item 2.7):
  the May 2026 QA pass and security scan, the superseded launch plan, design
  spec and inbox plan, and the UX reviews under [`archive/ux-reviews/`](archive/ux-reviews/).
- `docs/private/`, `.env.local` and `flow-keys/` may contain sensitive or
  operational material. Do not inspect, quote, move or commit their contents
  unless the task explicitly requires it and the appropriate authority exists.
- Point-in-time production evidence must identify its observation date and
  environment. It must never include identifiable customer data in general
  project documentation.

## Keeping this map accurate

When behaviour changes:

1. update the governing requirement, specification or ADR if its contract
   changed;
2. update the relevant domain reference;
3. link the issue, implementation plan and pull request;
4. move the verified implementation plan to `plans/completed/` without
   rewriting it; and
5. add a meaningful entry to [`../CHANGELOG.md`](../CHANGELOG.md).

Run `npm run check:docs` before claiming documentation work is complete. The
check discovers repository Markdown rather than relying on a hand-maintained
allow-list, and validates local targets, heading anchors and reference-style
links. It excludes only `docs/archive/`, `docs/private/` and generated
`.design-sync/docs-stubs/`; the exclusions are negative-control tested.
