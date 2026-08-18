# Contributing

Smarter Dog Bookings is a live operational system. Small changes should remain lightweight; changes that affect bookings, customer data, capacity, authentication, notifications or deployment need stronger evidence.

## Before starting

- Read [PROJECT.md](PROJECT.md), [AGENTS.md](AGENTS.md) and the relevant section of [docs/README.md](docs/README.md).
- Work from an issue with an observable outcome. Check dependencies and current implementation before choosing a design.
- Use an [implementation plan](.agent/PLANS.md) for substantial, cross-cutting, risky or migration-bearing work.
- Record a new architectural decision in an ADR when the change introduces or replaces a significant pattern.

## Make the change

- Branch from current `main`; do not push unverified work directly to it.
- Preserve existing conventions and unrelated worktree changes.
- Add or update automated tests for changed behaviour and failure cases.
- Use a new ordered migration for database changes. Never rewrite applied migration history.
- Keep product policy in requirements/specifications, implementation choices in plans/ADRs and live task state in GitHub.
- Update relevant documentation and prompt metadata in the same change.
- Use the canonical vocabulary in [docs/product/terminology.md](docs/product/terminology.md).
  It matters most where the words diverge: **appointment** is the user-facing
  whole visit and belongs in customer and staff copy, while **visit**, **booking
  line** and **booking row** are technical terms for schemas, RPCs and storage.
  Sample-data mode is **sample data** or **demo**, never "offline" — that word is
  reserved for a genuinely lost connection.

## Verify

Run focused tests while developing, then the checks relevant to the completed change. The normal repository bar is:

```bash
npm run check:docs
npm run lint
npm run typecheck
npm run check:migrations
npm run test
npm run build
```

Edge Function and database work have additional checks described in [AGENTS.md](AGENTS.md). If a required check cannot run, state exactly why, what substitute evidence exists and who or what must close the gap.

## Pull requests

Use the pull request template. A reviewable PR should:

- link its issue and implementation plan;
- explain the observable behaviour change and governing requirements;
- include exact validation evidence;
- identify migrations, security/privacy effects and rollout or rollback needs;
- update durable documentation;
- leave independently useful follow-ups as linked issues rather than hidden TODOs.

Code written is not the same as work completed. Completion means acceptance criteria are met, checks pass, release dependencies are satisfied and the change can be traced to its decision and intent.
