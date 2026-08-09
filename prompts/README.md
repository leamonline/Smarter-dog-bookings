# Prompt library

This directory stores reusable instructions that affect how people or agents plan, build, review or operate Smarter Dog Bookings. It also indexes production prompts that remain beside the code that executes them.

Prompts are behaviour-bearing assets: material changes need review, a version increment, examples or tests where practical, and an explicit evaluation strategy.

## What belongs here

- reusable agent work briefs and review prompts;
- development and release-verification prompts used more than once;
- product prompt contracts, inventories and evaluation cases;
- evaluation rubrics and failure cases;
- deprecated prompt history when it explains a live contract.

One-off chat messages, credentials, customer conversations, generated output and issue-specific implementation plans do not belong here. Put implementation reasoning in `docs/plans/`, live work in GitHub Issues and secrets in the approved external secret store.

## Layout

- `agents/` — bounded implementation and review roles;
- `development/` — planning, diagnosis and engineering workflows;
- `product/` — production prompt inventory and product-level contracts;
- `operations/` — deploy, rollout and reconciliation workflows;
- `evals/` — rubrics and fixtures for prompt behaviour;
- `archive/` — deprecated prompts retained only for traceability.

## Naming and metadata

Use lowercase kebab-case filenames. Reusable prompts begin with YAML frontmatter:

```yaml
id: stable-unique-id
status: draft | testing | production | deprecated
version: 1
purpose: Short description
related_requirements: []
related_issues: []
last_reviewed: YYYY-MM-DD
```

Increment `version` when instructions, constraints or output contracts change materially. Small spelling or link repairs may retain the version. Preserve superseded prompts in `archive/` only when an issue, decision or production history still depends on them.

## Runtime prompts

Keep a runtime prompt next to the code that assembles and sends it so code review can see inputs, security controls and output parsing together. Register it in [the runtime prompt inventory](product/runtime-prompt-inventory.md) rather than copying the text here. A production prompt change should link its governing requirements, tests or evaluation cases and rollout evidence.

Prompt text never overrides server-side authorisation, booking policy, capacity enforcement or data minimisation. Treat untrusted customer content as data, not instructions.

## Evaluation

Before promoting a prompt to `production`:

1. define observable success and prohibited behaviour;
2. include normal, ambiguous, adversarial and degraded-dependency cases;
3. test output parsing and server-side enforcement independently of model prose;
4. compare the candidate against the current version on a fixed, synthetic fixture set;
5. record model/version, evaluator, date and decision without including real customer data;
6. keep a kill switch or deterministic fallback for customer-affecting automation.

Use [the runtime evaluation standard](evals/runtime-prompt-evaluation.md) as the baseline.
