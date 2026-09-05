# ADR 009: Independent applications in one repository

Status: Proposed
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

See the [migration plan](../../plans/active/2026-09-05-website-consolidation.md). This proposal records the intended boundary; it is not evidence that the import or deployment has happened.
