---
id: runtime-prompt-evaluation-standard
status: testing
version: 1
purpose: Define repeatable evaluation for prompts that affect production behaviour
related_requirements: []
related_issues:
  - 611
last_reviewed: 2026-08-09
---

# Evaluation set

Use version-controlled synthetic cases covering:

- common valid requests and ordinary conversational variation;
- ambiguous identity, date, service, dog size and multi-dog cases;
- unsupported capabilities and unavailable dependencies;
- prompt injection, requests for secrets and malicious quoted content;
- high-risk medical, complaint, cancellation and reschedule language;
- empty, malformed, excessively long and duplicate input;
- provider timeout or non-parseable output.

Never build the fixture set from identifiable production conversations without a separate approved privacy process.

# Measures

For each prompt define exact pass criteria for schema validity, factual grounding, prohibited action rate, escalation/abstention, tone and deterministic fallback. Booking or policy actions must also pass independent server-side contract tests; prompt success alone cannot authorise a write.

# Comparison protocol

1. Pin the current and candidate prompt versions, model/configuration and fixture-set revision.
2. Run both on the same inputs with stable settings where the provider permits.
3. Score deterministic assertions automatically and review subjective cases blind to version.
4. Investigate every prohibited action or privacy failure; averages cannot hide a critical failure.
5. Record regressions, accepted trade-offs and the promotion decision in the linked issue.
6. Roll out behind existing gates and monitor only the minimum operational evidence needed.

# Promotion gate

A prompt may be marked `production` only when critical safety assertions all pass, the candidate has no unexplained regression against the current version, output parsing and server enforcement pass independently, and a rollback or kill-switch route is known.
