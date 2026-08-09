# Implementation planning standard

Significant implementation plans are executable hand-offs: another competent contributor should be able to perform the work without rediscovering the problem or guessing at product policy.

Use a plan when work is cross-cutting, high-risk, migration-bearing, security-sensitive, expected to span more than one pull request, or likely to be handed between agents. A small, well-bounded issue can remain the plan.

## Location and lifecycle

- Active plans: `docs/plans/active/YYYY-MM-DD-short-title.md`
- Completed and verified plans: `docs/plans/completed/`
- GitHub Issues and Projects own status, assignment, priority and blockers; the plan owns durable implementation reasoning and sequence.
- Update a plan when discovery changes current facts, dependencies, risks or sequence. Mark the change and preserve the previous reasoning.
- Move the file after all acceptance criteria and release evidence are verified. Do not rewrite completed plans to make history look tidier.
- Abandoned or superseded plans remain historical records and must link to their replacement and state why work stopped.

## Required metadata

Begin with:

```markdown
Status: Draft | Active | Blocked | Completed | Superseded
Issue: #123
Base: branch and commit SHA used for discovery
Last verified: YYYY-MM-DD
Owners: paths or responsibilities, not invented people
Dependencies: #numbers or None
Related requirements: REQ-...
Related ADRs: ADR ... or None
```

For multi-agent work also list allowed paths, shared or forbidden paths, expected outputs and the merge order. Assign only one writer to each migration sequence, generated database type file, shared RPC wrapper, shared hook, configuration surface or integration point.

## Required sections

### Goal

State the observable end condition.

### Why

Explain the user, operational or risk outcome and the evidence that makes the work worthwhile now.

### Current behaviour

Describe verified current code, database and live behaviour. Cite paths, symbols, migrations and dated operational evidence. Separate confirmed facts from assumptions and unresolved questions.

### Desired behaviour

Describe the externally observable target without prescribing unnecessary implementation detail.

### Scope

List included behaviours, systems and owned paths.

### Non-goals

List tempting adjacent work and policies this plan does not authorise.

### Relevant code

Name exact entry points, shared writers, tests and historical migrations. Include why each is relevant.

### Architecture

Describe component boundaries, trust boundaries, source of authority and compatibility constraints. Link governing ADRs.

### Data/database changes

Describe schema, migration order, RLS, grants, backfill, idempotency, locking, generated types and rollback implications. Say `None` when genuinely absent.

### API changes

Describe RPC, Edge Function, webhook, client contract, error and compatibility changes.

### UI changes

Describe states, validation, accessibility, responsive behaviour and truthful unavailable/error messaging.

### Security/privacy considerations

Cover authentication, authorisation, secrets, personally identifiable information, data minimisation, logging and negative controls.

### Dependencies

Name prerequisite issues, migrations, decisions, external configuration and conflicts with concurrent work.

### Risks

List failure modes, likelihood/impact where useful, detection and mitigation. Include policy ambiguity and delivery uncertainty rather than silently choosing.

### Migration/rollout

Specify environment order, exact target selection, compatibility window, feature flags, evidence, rollback/roll-forward and approval points. Database-dependent application code does not merge before its production schema unless the plan proves compatibility.

### Implementation sequence

Use small, independently reviewable steps. For each step name the files, behaviour, tests and hand-off. Make serial dependencies and safe parallel branches explicit.

### Testing

List exact focused tests and full checks. Include database-runtime and concurrency tests where browser or unit tests cannot exercise authority.

### Observability

Define evidence that proves the change works, detects a regression and supports reconciliation. Avoid collecting customer data merely for convenience.

### Documentation updates

Name requirements, specifications, ADRs, runbooks, prompts, user-facing copy and changelog entries that must change.

### Definition of done

Use observable acceptance criteria. Include code review, checks, rollout dependencies, documentation, traceability and verified behaviour—not “code written”.

### Open questions

List decisions that require evidence or human judgement. Name the decision owner only when known. A product-policy question is a blocker, not licence for an agent to invent policy.

## Evidence discipline

- Positive source evidence can establish existence; a negative search only establishes what that search did not find.
- Include a commit SHA and observation date for volatile repository or production claims.
- Do not place secrets or identifiable customer rows in a plan.
- Record unavailable checks honestly. Never convert “not run” into “passed”.
- Link the final pull request, tests and release evidence before moving a plan to completed.
