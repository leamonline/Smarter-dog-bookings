# Working in Smarter Dog Bookings

These instructions apply to every human or AI agent working in this repository.
They complement narrower instructions in a task, issue or implementation plan.

## Read before significant work

1. Read [PROJECT.md](PROJECT.md) for product intent, boundaries and source-of-truth routing.
2. Read [ROADMAP.md](ROADMAP.md) and the linked GitHub issue for priority and dependencies.
3. Use [docs/README.md](docs/README.md) to find the governing requirement, specification, architecture decision and runbook.
4. For substantial or high-risk work, create or update an executable plan under `docs/plans/active/` using [.agent/PLANS.md](.agent/PLANS.md).
5. Verify claims against the current branch and code. A missing search result is not proof that a concept does not exist.

GitHub Issues and the repository Project own live status, assignment and blockers. Version-controlled documents own durable intent, decisions, contracts and verified history. Do not copy live checklists between them.

## Source precedence

When sources disagree, prefer:

1. current code, migrations and tests for what is implemented;
2. accepted product specifications and architecture decision records for intended policy;
3. `PROJECT.md` and stable requirements for project boundaries;
4. active implementation plans for the authorised route from current to desired behaviour;
5. issues and the GitHub Project for execution state;
6. archived and historical documents for context only.

Implementation does not silently overrule signed product policy. Record a material discrepancy and ask for a product decision where intent is ambiguous.

## Safe change workflow

- Work from an up-to-date branch off `main`; `main` deploys the frontend and changed Edge Functions.
- Find or create the corresponding issue. Check its blockers before implementation.
- Give each parallel agent exclusive ownership. Do not assign simultaneous writers to migrations, generated database types, shared RPC wrappers, hooks, configuration or the same UI integration point.
- Keep changes within the issue and plan. Preserve unrelated user changes in a dirty worktree.
- Do not introduce a major architectural pattern or change a settled boundary without an ADR.
- Do not silently change product policy, customer-facing promises, capacity rules, data-retention rules or notification semantics.
- Record implementation discoveries that invalidate a plan in the plan and issue before continuing.
- Link the issue, plan, requirements and ADRs in the pull request where they govern the change.

## Repository invariants

- PostgreSQL is the final capacity and booking-conflict authority. Browser and Deno checks are preflight only; keep all governed implementations and tests in parity.
- Database changes are append-only migrations under `supabase/migrations/`. Never edit applied migration history, use an implicit production link, or assume merge applies a migration.
- Use an explicit, verified Supabase project target for every production command. Production data reads or writes require the authority and data scope stated by the task.
- RLS, RPC grants and server-side validation define security boundaries. Client-side hiding or validation is never sufficient.
- Customer booking writes go through the authorised RPC path; do not restore raw customer inserts.
- The visit-based booking-policy substrate is deployed but inactive. Do not activate `previous_day_1500_v1`, remove a command from `V1_ONLY_COMMANDS`, or route a live caller to a dormant visit command unless the same reviewed change satisfies its activation, compatibility and rollback plan.
- Existing `CustomerVisitSuccessReceipt` identity fields are part of the current command contract. Extend receipts only for a demonstrated consumer; do not invent replacement identifiers from a planning sketch.
- Customer notification delivery must never be inferred from an attempted provider call. Ambiguous outcomes fail closed and require reconciliation before automated retry.
- Never commit credentials, `.env*`, private keys or identifiable customer data. Do not inspect `.env.local`, flow keys or `docs/private/` unless the task explicitly requires it.
- `VITE_` values are public browser configuration, never secrets.
- Tests run in deterministic sample-data mode. Local development otherwise connects to the live Supabase project when credentials are present; do not use real customer records for development or verification.

## Code and validation conventions

- Install with `npm ci`. Use `npm install` only when intentionally changing dependencies.
- Put new logic-heavy code in TypeScript where practical; keep database row transformations in repositories and raw SQL names out of components.
- Use constants for statuses and dog sizes, `resolveBookingDisplay()` for booking labels and `src/lib/logger.ts` instead of bare `console` calls in `src/`.
- Schema changes require pgTAP coverage and, for concurrency-sensitive behaviour, a database-level concurrency test.
- New behaviour requires proportionate automated tests. Test observable outcomes and failure paths, not only implementation details.
- A test covering a write path asserts the **row that was written**, not the arguments handed to the writer. See [CONTRIBUTING.md](CONTRIBUTING.md#two-standing-rules); this rule exists because a payment-destroying write shipped green under an assertion pinned to the exact value that caused it.
- Replacing a screen is not complete until every state the old screen displayed has been inventoried and checked off against the new one. Same reference; the worked example is a collected-but-unpaid booking, which the replacement made invisible.
- Investigate failures; never weaken or delete a test merely to make CI green.
- Before claiming completion run the relevant focused checks, then the repository bar where the change warrants it:

  ```bash
  npm run check:docs
  npm run lint
  npm run typecheck
  npm run check:migrations
  npm run test
  npm run build
  ```

- Edge Function changes also require `npm run check:edge-types` and the relevant Deno tests. Database changes require `npm run test:db`; capacity races also require `npm run test:db:concurrency`.
- A green build alone is not completion. Confirm acceptance criteria, migration/rollout readiness, documentation and observable behaviour.

## Documentation and prompts

- Update requirements, specifications, architecture, user flows and operations documentation when behaviour changes.
- Use relative repository links and run `npm run check:docs`.
- Move a verified implementation plan to `docs/plans/completed/` without rewriting its historical decisions or evidence.
- Reusable and runtime prompts are behaviour-bearing assets. Register them through [prompts/README.md](prompts/README.md), version material changes and provide an evaluation strategy.
- Use UK English in repository prose and customer-facing copy unless an external protocol requires exact wording.

## Stop and escalate

Stop rather than infer permission when work would require a production write, customer-data access, credential use, policy decision, external account change, destructive migration, bypass of a release control or an expansion beyond the issue's accepted scope.
