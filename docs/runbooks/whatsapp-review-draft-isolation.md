# WhatsApp review-draft isolation verification

Issue: [#921](https://github.com/leamonline/Smarter-dog-bookings/issues/921). Governing [ADR 012](../architecture/decisions/012-review-drafts-for-known-customers.md) and [plan](../plans/active/2026-10-01-whatsapp-agent-review-drafts.md). Prepared 2 October 2026. This runbook does not authorise hosted writes or flag changes.

## Offline verification

From the repository root:

```sh
deno test --no-config --no-lock --allow-env supabase/functions/whatsapp-agent/__tests__ supabase/functions/_shared/agentContext.test.ts
node --test scripts/whatsapp-eval/compare.test.mjs
```

The actual handler runs against intercepted synthetic database/provider responses. Unexpected endpoints fail the test. Credentials are placeholders; no `.env` file is loaded. Captured draft/event writes are checked. This does not prove deployed permissions, triggers, configuration or model quality.

| Scenario | Required evidence |
| --- | --- |
| Known customer, AI handling, new booking, review flag on | One pending draft; approval required; auto-send ineligible; review_only metadata |
| Automation opt-ins plus model-proposed actions/corrections | Held draft; no booking action/audit, customer-record, agent-state or lead correction |
| Validated book-entry 409 refusal | One attempt then isolated draft; no second send |
| Accepted book-entry, pending receipt | No fallback draft or second send; acceptance is not delivery |
| Timeout, ambiguous 502 or malformed acceptance | No retry, second send or fallback draft |
| Disabled/debounced book-entry or missing local configuration | Eligible held draft |
| Flag off, Human only, other intent | No new automatic review draft |
| Duplicate inbound | No second model request or draft |
| Truncated output | One model call; failed event; no draft/action/send/state writes |
| Staff Generate reply/suggestion | Existing contracts preserved |

Draft creation does not read the durable send gate. A mocked 409 proves refusal handling; it does not verify current hosted gate values.

## Hosted staging prerequisites

Freshly verify target **Smarter-dog-grooming-staging** (`btjnxvgkpdbfrrqxvkfj`), exact source SHA, deployed function version and schema compatibility. Do not infer target from CLI linkage. Production (`nlzhllhkigmsvrzduefz`) is excluded.

Separately approve staging deployment/configuration changes and synthetic fixture writes. Record original boolean flags: `AI_KNOWN_CUSTOMER_REVIEW_DRAFTS`, `AI_AUTO_SEND_LOW_RISK`, `AI_AUTONOMOUS_BOOKING_ENABLED`, `WHATSAPP_MANAGE_BOOKING_ENABLED`, `WHATSAPP_BOOK_ENTRY_ENABLED`, plus the durable master gate. Never record provider credentials.

Use only synthetic customer/conversation identifiers that cannot reach real recipients. Disable real outbound-provider access. The handler has no deployable mock-provider switch: accepted/uncertain transport cases remain mocked until a separately reviewed staging adapter exists. Do not change the security boundary or send to real customers to satisfy this checklist.

For approved hosted scenarios, inspect before/after rows restricted to synthetic identifiers: held draft fields, inbound/event bookkeeping, unchanged customer/agent/lead state, zero booking actions/audits and zero outbound attempts. Inspect persisted rows rather than API responses alone. Agree fixture cleanup before writing; clean only approved synthetic records, restore original flag values and verify restoration. No real booking or customer message is allowed.

A local mocked pass is readiness evidence, not a hosted staging pass. Hosted execution remains pending fixture/transport preparation and approval. Paid model-quality evaluation is separately paused for API credit. Promotion requires both quality and isolation acceptance, then owner release approval. Roll back through the review-draft flag; retain existing send/booking safeguards.
