# Smarter Dog project memory

**Status:** Active
**Authority:** Product North Star and durable programme boundaries
**Programme:** issue #603 and child issues #604–#612
**Repository baseline:** `main@8eb8800fb345aeeba4887b266a4ff95a85fb7802`
**Last verified:** 9 August 2026

> **North Star:** one appointment operation should have one authoritative
> identity, one server-owned decision, one atomic mutation, one durable customer
> communication intent, one observable outcome and one compatible release
> contract.

This document says what the project is trying to achieve and what must remain
true while it gets there. [ROADMAP.md](ROADMAP.md) owns programme order;
GitHub issues and pull requests own live delivery status.

## Project

Smarter Dog is the existing React, Supabase Edge Function and PostgreSQL system
used to manage customer appointments, the staff diary, messaging and related
operational work. The programme converges two architectural generations without
a rewrite: live booking-line workflows and the stronger, currently inactive,
visit-level model.

## Problem

Several important journeys cross inconsistent boundaries:

- live staff writes still mutate `bookings` rows while a richer
  `booking_visits` aggregate exists beside them;
- a successful appointment change does not necessarily create, send or prove a
  customer message;
- capacity is preflighted in browser and Deno code but finally enforced by
  PostgreSQL, so copies can drift;
- frontend and Edge code can deploy independently of manually applied database
  migrations;
- browser and Edge authentication evidence is incomplete at the pull-request
  boundary; and
- useful operational signals exist, but their definitions, confidence, privacy
  and ownership are not governed together.

The risk is not simply technical inconsistency. Staff can see success while a
customer has not been informed, a channel can offer work the database rejects,
or a deployment can be healthy in isolation but incompatible as a system.

## Users

- **Customers and trusted humans** who book, change or receive information
  about an appointment.
- **Staff** who create and move appointments, use the diary and Inbox, and
  resolve failed or uncertain work.
- **Product and release operators** who need truthful capability state,
  explicit deployment targets, reversible releases and decision-quality
  evidence.

## Goals

| ID | Goal |
|---|---|
| `GOAL-01` | Make appointment-level operations atomic, idempotent and unambiguous while keeping per-dog grooming state where it belongs. |
| `GOAL-02` | Make appointment success and customer-message delivery separate, observable outcomes with safe recovery. |
| `GOAL-03` | Keep PostgreSQL as the final capacity authority and align every preflight and rejection contract with it. |
| `GOAL-04` | Make incompatible or incorrectly targeted releases fail closed, with tested browser and Edge security gates. |
| `GOAL-05` | Support human decisions with governed, privacy-minimised measurements and guarded AI assistance. |

## Non-goals

- Activating `previous_day_1500_v1` or changing customer deadlines in this
  programme.
- A frontend, database or service rewrite; microservices; native applications;
  multi-tenancy; or general CRM expansion.
- Moving every notification type to a new outbox in one change.
- Retiring all booking-row authority in the first live slice.
- Fully autonomous AI booking or removing human review defaults.
- Applying production migrations, changing provider configuration, repairing
  identifiable customer records or contacting customers without separate
  authority.
- Inventing delivery dates, baselines or success thresholds before trustworthy
  evidence exists.

## Product principles

1. Preserve working behaviour unless an approved requirement explicitly changes
   it.
2. Put high-risk decisions and mutations behind server-owned, idempotent
   commands.
3. Prefer visit-level identity for appointment operations; retain booking lines
   for dog-specific work.
4. Keep database mutation and message delivery as distinct outcomes.
5. Keep PostgreSQL as the final capacity and concurrency authority.
6. Fail closed on missing capability, ambiguous visit membership, stale revision
   or unknown delivery; do not silently fall back to a weaker write path.
7. Keep AI assistance human-reviewed by default and require every automation
   flag and risk gate to agree.
8. Treat policy support and policy activation as separate decisions.
9. Use evidence from an exact revision and explicit environment. Historical
   plans and remembered production state are not current proof.
10. Prefer the smallest reversible slice; Tranche A is valuable even when the
    correct decision is to stop.

## Constraints

- The current React, Supabase and PostgreSQL architecture remains in place.
- PostgreSQL migrations are released separately from frontend and Edge code.
- Live staff booking creation and updates must keep working while visit-level
  capability is introduced.
- Migration ordering, generated types, RPC contracts, booking hooks, capacity
  authority, notification schema and Edge configuration are serial
  shared-writer surfaces.
- Provider templates and fallback channels are external prerequisites, not
  capabilities the repository can assume.
- Production evidence should be aggregate or synthetic unless a separately
  authorised task names customer data and the permitted operation.
- A hosted Supabase command must prove its exact target; local link state alone
  is not release authority.

## Current state

These are repository facts at the baseline above, not a claim that every
production environment has been freshly queried.

| Area | Confirmed current state | Evidence |
|---|---|---|
| Appointment writes | Live staff creation and update paths use `bookings` rows. `useBookings.updateBooking` directly updates one row. | [useBookings.js](src/supabase/hooks/useBookings.js) |
| Visit foundation | `booking_visits`, lineages, read projections, atomic command SQL and a typed `CustomerVisitSuccessReceipt` exist in the repository. The legacy paths remain authoritative. | [migrations.md](docs/migrations.md), [bookingVisitReceipt.ts](src/supabase/bookingVisitReceipt.ts) |
| Policy state | `previous_day_1500_v1` is defined with no effective instant. V1 mutation commands are deliberately dark and have no production caller. | [bookingPolicyInactiveIsolation.test.ts](src/security/bookingPolicyInactiveIsolation.test.ts) |
| Capacity | Browser and Deno preflights exist; the PostgreSQL trigger is the final write guard. Rule copies and some rejection semantics can still drift. | [capacity-engine.md](docs/capacity-engine.md) |
| Staff reschedule messaging | A staff move can update the diary without creating a durable visit-level customer notification. | [useBookings.js](src/supabase/hooks/useBookings.js), issue #604 |
| Notifications | `notification_log` tracks booking/trigger-oriented delivery, but there is no governed visit-operation intent plus append-only attempt history. | [notification_log migration](supabase/migrations/20260403160647_notification_log.sql), issue #610 |
| Release compatibility | The migration-applied check exists, but there is no generic runtime capability projection joining app, Edge and schema support. | issue #607 |
| Browser gate | Pull requests intentionally skip Playwright; all configured desktop, tablet and mobile projects run Chromium. | [CI workflow](.github/workflows/ci.yml), [Playwright config](playwright.config.ts) |
| Edge authentication | CI deploys functions with `--no-verify-jwt`; in-function checks are the boundary. The complete caller/authentication inventory and discovery guard do not yet exist. | [Supabase config](supabase/config.toml), [Edge deployment workflow](.github/workflows/deploy-edge-functions.yml) |
| AI assistance | Known-customer generation is staff-invoked; auto-send and autonomous booking require global and per-conversation gates that default off, plus risk checks. | [WhatsApp agent](supabase/functions/whatsapp-agent/handler.ts), [AI mode controls](src/supabase/hooks/inbox/useAIModeControls.ts) |
| Measurement | Funnel, denial, notification and AI audit signals exist, but operation identity, ownership and decision use are incomplete. | [measurement catalogue](docs/specifications/measurement-catalogue.md) |

### Unverified prior aggregate observation

A preceding planning audit reported that a read-only, aggregate-only check on
9 August 2026 found **497 booking rows**, all linked to **471 distinct visits**,
plus **10 cancelled visits with no remaining booking children**, giving **481
total visit records**. The arithmetic is:

- `446 × 1 + 24 × 2 + 1 × 3 = 497` booking rows across the 471 referenced visits;
- multi-line visits contribute 26 rows beyond one line per referenced visit;
- `471 + 10 = 481` total visits; therefore
- `497 - 481 = 26 - 10 = 16` — the 16 is **not** an orphan count.

If the report is accurate, “no orphan bookings” applies only from booking row to
visit in that dated snapshot. The reverse direction contains ten zero-child
cancelled visits, which is not automatically an error. The exact target, query,
execution record and timestamp were not retained in the repository, so these
counts are **unverified prior context**, not release or gate evidence. They do
not prove semantic grouping, current counts, automation readiness or policy
readiness. See the [reality audit and provenance limit](docs/research/2026-08-09-issue-603-plan-reality-audit.md#unverified-prior-aggregate-snapshot).

## Target state

- A visit is the appointment-level identity for customer and staff operations;
  booking lines retain dog-specific grooming and allocation state.
- One command commits an appointment operation and one idempotent notification
  intent; delivery attempts are auditable and never redefine mutation success.
- Staff can distinguish moved, pending, sent, failed, retryable and unknown
  customer-contact states and can recover without repeating the move.
- Every channel receives the same capacity eligibility and structured reason;
  PostgreSQL still rejects stale races at commit.
- Runtime capability checks disable incompatible features before privileged work,
  and releases record the application, Edge and schema generation together.
- Every Edge Function has an explicit caller/authentication contract, and a
  production-build PR smoke suite covers desktop Chromium and mobile WebKit.
- Measurement supports rollout and rollback decisions without collecting
  customer free text or blocking product work.

## Success criteria

The programme succeeds when every child issue is completed or explicitly
deferred with rationale, and the evidence shows that:

- no required customer notification can be silently unknown;
- critical appointment rules have one authoritative server boundary;
- incompatible deployment combinations fail closed;
- multi-dog and replayed operations produce one coherent appointment outcome;
- staff can see and recover partial delivery failure;
- current capabilities and enablement state are described truthfully; and
- the path to retire direct booking-row authority is tested and documented.

Success does **not** require Tranche B to begin. A complete Tranche A followed by
an evidence-backed STOP is a valid outcome.

## Source of truth

Different questions have different authorities:

| Question | Authority |
|---|---|
| Product intent and boundaries | This file, then [product vision](docs/product/vision.md) and [requirements](docs/product/requirements.md) |
| Programme sequence and project timeline | [ROADMAP.md](ROADMAP.md); it records dependencies and gates without invented dates |
| Terminology and journeys | [terminology](docs/product/terminology.md) and [user flows](docs/product/user-flows.md) |
| Metric definitions | [measurement catalogue](docs/specifications/measurement-catalogue.md) |
| Current architecture | [architecture overview](docs/architecture/overview.md), then code/migrations/tests at an exact SHA |
| Architectural decisions and bounded contracts | [decision records](docs/architecture/decisions/README.md) and active [specifications](docs/specifications/) |
| Live active work, priority and blockers | GitHub Issues/Project, routed through [project management](docs/project-management.md) |
| Significant implementation plans | [active plans](docs/plans/active/) using [.agent/PLANS.md](.agent/PLANS.md) |
| Reusable and runtime-prompt governance | [prompt library](prompts/README.md) and its [runtime inventory](prompts/product/runtime-prompt-inventory.md) |
| Technical behaviour | Code, migrations and executable tests at an exact commit |
| Production state | A fresh, read-only, explicitly targeted check; never repository inference alone |
| Completed history | [CHANGELOG.md](CHANGELOG.md), [completed plans](docs/plans/completed/), merged pull requests and Git history |
| Historical rationale | Dated specifications and runbooks, only where not superseded by an active source |

When sources disagree, stop and reconcile them. Do not choose the source that
makes a release easiest.
