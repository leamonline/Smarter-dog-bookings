# ADR 009: Independent applications in one repository

Status: Accepted
Date: 2026-09-05
Issue: [#784](https://github.com/leamonline/Smarter-dog-bookings/issues/784)

## Context

The website and bookings system are separate React/Vite projects. Website CI publishes to Bluehost; bookings has Vercel configuration and Supabase function deployment. Consolidating ownership should preserve existing runtime and release boundaries. Their tooling versions differ and bookings release scripts rely on root paths.

## Decision

Retain bookings at the repository root and import the website under website/ with preserved history. Keep independent package manifests, lockfiles, installations, builds, tests and deployments. Do not introduce npm workspaces or a task orchestration framework for this first migration. Keep Supabase paths unchanged. Scope root tooling explicitly and place active workflows at the repository root.

Preserve hosting and public URLs. Switch website publishing only through a target-verified cutover with one active publisher and a retained rollback build. No credentials or customer data are imported.

## Consequences

Coordinated source changes become possible without merging applications or upgrading their tooling together. Some dependencies remain duplicated deliberately. Root discovery rules need tests and review. A symmetrical apps/ layout and shared packages may be considered later when there is a demonstrated benefit; they are not prerequisites for this consolidation.

## Alternatives

Moving both applications into apps/ would provide symmetry but disturb more booking and Supabase release assumptions. Combining both frontends into one build would couple routing, styles and releases without being necessary for repository consolidation. Keeping separate repositories would preserve current isolation but not meet the requested maintenance outcome.

## Execution

See the [migration plan](../../plans/active/2026-09-05-website-consolidation.md). The boundary was approved on 7 September 2026 in the [design specification](../../superpowers/specs/2026-09-07-website-repository-consolidation-design.md), recovered from `codex/website-repository-consolidation-spec`. Acceptance records the architectural decision, not publisher cutover.

Implementation note (7 September 2026): the import, tooling isolation and root website workflow were prepared on the boundary described here, with the website publisher left dark pending the [cutover runbook](../../superpowers/runbooks/2026-09-07-website-publisher-cutover.md). Existing required repository CI contexts must report on every PR, including website-only changes. Application build/test isolation does not imply skipping those workflows.
