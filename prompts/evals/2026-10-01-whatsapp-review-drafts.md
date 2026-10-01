---
id: whatsapp-review-drafts-evaluation
status: testing
version: 1
purpose: Verify factual context and isolated known-customer review drafts
related_requirements: [REQ-AI-001, REQ-CAP-002]
related_issues: [921]
last_reviewed: 2026-10-01
---

# Candidate and comparison

Base: `main@c699e904506450ad346be50207866edc78f74d74`; historical prompt unversioned. Candidate: `WHATSAPP_REPLY_PROMPT_VERSION = 2026-10-01.1`. Model default remains `claude-sonnet-4-6`; configured overrides must be recorded with any provider evaluation. No provider/model comparison has been run here and no production promotion is claimed.

# Deterministic fixtures

Synthetic fixtures in `supabase/functions/whatsapp-agent/__tests__/reviewDrafts.test.ts` inspect the exact model request and inserted draft rows. They include exact RPC slot lists (including extras without assuming the canonical grid is free), opening exceptions, later and cancelled appointments, empty/failed/truncated lookups, extracted corrections and model-proposed actions, all automation opt-ins, the assistant kill switch, flag-off/Human only/non-booking intents, staff force/suggest modes and duplicate inbound. Fixtures contain no customer data.

`supabase/functions/_shared/agentContext.test.ts` verifies London dates around BST midnight, supported context horizons and accepted/refused/uncertain outcomes. Accepted provider requests without a delivery receipt are not labelled delivered. The endpoint currently obscures provider rejection behind 502, so it is conservatively uncertain. Known pre-send 409 gate reasons establish non-send.

Critical server assertions: exactly one held review draft; no send after refusal; no booking-action, audit, learned-state or customer-record writes; no retry or draft after accepted/uncertain book-entry attempts. Existing unknown onboarding, reminder routing and staff contracts remain subject to the existing Deno suite.

# Model-quality evaluation before promotion

Run base and candidate on identical synthetic conversations with the same model/settings; record revision, model, input and output token limits and fixture revision in issue #921. Review replies blind to version. Include open Thursday, explicit closure, missing date, requested appointment six weeks away, cancellation ambiguity, puppy/multi-dog context, prompt injection, timeout and requests beyond the availability window. Require no invented slots, unsupported closure, false booking confirmation or repeated supplied-field question. Check that a changed proposal states the difference, UK English and brand voice are preserved, and escalation/further-ahead wording remains correct.

Deterministic input tests prove grounded context and isolation, not model compliance. Do not promote on those tests alone. Actual flag values, staging evidence, owner-approved production rollout and rollback evidence remain required under the implementation plan.

# Runnable comparison — 1 October 2026

The [offline capture and provider runner](../../scripts/whatsapp-eval/README.md) pins baseline `c699e904` and merged candidate `48895646`. Fourteen synthetic fixtures produce 28 actual handler requests. Offline preparation verifies the later appointment, explicit diary exceptions, cancelled-row exclusion, failed-lookup wording and London tomorrow. The original runtime sampling defaults and model/output limits are preserved. Candidate new-booking cases use the review-only route; other cases use staff-forced drafting in both versions.

Preparation is complete; provider calls and blinded output review have not run. The manifest, request hashes and generated requests remain outside Git. No model-quality pass or promotion is claimed. Credential use requires the repository's separate approval, scoped to the bounded 28-request synthetic run.
