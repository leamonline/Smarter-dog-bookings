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

## Hosted staging execution — 12 October 2026

Owner-approved. Target verified by project listing as **Smarter-dog-grooming-staging** (`btjnxvgkpdbfrrqxvkfj`); production was not touched. Before the sitting the project had no Edge Functions, no secrets, and zero rows in `whatsapp_events`, `whatsapp_conversations`, `whatsapp_messages`, `whatsapp_drafts`, `whatsapp_ai_action_audit`, `whatsapp_booking_actions`, `salon_todos`, `bookings`, `humans` and `dogs`; `app.agent_url` was unset, so the database trigger could not fire the agent and every invocation below was a direct POST. Schema was applied through `20261005190000`.

**Configuration.** `whatsapp-agent` deployed once from `main@a32479a0b7a8821fc31c6909f2af1a394502ce07` (functions tree identical to the evaluated candidate `056676f5`) with `--no-verify-jwt`, as CI does. Secrets set: `AGENT_CALLBACK_SECRET` (random, synthetic), `AI_KNOWN_CUSTOMER_REVIEW_DRAFTS=true`, `ANTHROPIC_API_KEY` (owner-supplied, workspace-scoped). Deliberately absent: `SEND_INTERNAL_SECRET`, every Meta and Twilio credential, and the `whatsapp-send` function itself, so no outbound path existed. `WHATSAPP_BOOK_ENTRY_ENABLED` and `WHATSAPP_MANAGE_BOOKING_ENABLED` were unset (false), unlike production where both are true; accepted/uncertain transport cases therefore remain mocked-only, as this runbook already states.

**Fixtures.** Two synthetic humans on Ofcom reserved numbers (`+447700900111`, `+447700900222`), one small Cockapoo each, one conversation in `ai_handling` and one in `human_takeover`, both with empty `agent_state` at revision 0 and `lead_status = records_created`. Events carried Meta-shaped payloads with synthetic message ids.

| Scenario | Invocation | Result |
| --- | --- | --- |
| Wrong shared secret | POST with a bad `x-agent-secret` | 401, nothing written |
| Known customer, AI handling, "Can I book Pip for a full groom?", flag on | first attempt | `handled with error`: provider 401 because the secret had been set one character short; event marked `failed` with the provider error recorded, **no draft, no memory write, no retry** |
| Same, fresh event after the key was corrected | `ok` in 6.5 s | **one** `whatsapp_drafts` row: `state=pending`, `requires_approval=true`, `auto_send_eligible=false`, `handoff_required=false`, `risk_level=medium`, `intent=booking_propose`, `tool_calls.review_only=true`, `booking_action=null`, `prompt_version=2026-10-07.portal-trouble-1`, `model=claude-sonnet-4-6`, 6,382/129 tokens, `decided_by=null`, trigger linked to the inbound message |
| Duplicate inbound (second event, same Meta message id) | `ok (duplicate inbound, ignored)` | event `ignored`; no second message or draft |
| "Hello" in AI handling | `ok` | event `processed`; inbound stored; no draft |
| Booking request in Human only | `ok` | event `processed`; inbound stored; no draft |
| Booking request with `AI_KNOWN_CUSTOMER_REVIEW_DRAFTS=false` | `ok` | event `processed`; inbound stored; no draft |

**Persisted-row inspection after all scenarios**, restricted to the synthetic identifiers: both conversations still `agent_state_rev=0`, `agent_state={}`, `lead_payload=null`, `last_outbound_at=null`; `humans.updated_at` and `dogs.updated_at` unchanged from insert; zero rows in `whatsapp_ai_action_audit`, `whatsapp_booking_actions`, `salon_todos`, `bookings`; zero non-inbound `whatsapp_messages`; zero entries in `net.http_request_queue` and `net._http_response`. The draft text directed the customer to their account with no closure, slot or confirmation claim.

**Cleanup and restoration.** All synthetic drafts, messages, events, conversations, dogs and humans deleted; every table above back to zero. The three secrets were unset and the function deleted; the project again lists no functions. Supabase's platform-managed `SUPABASE_*` secret names now appear in the list because the first deploy provisioned them; no value was set by hand and none is a credential introduced by this sitting. Local temporary credential files were removed.

**What this does and does not establish.** The hosted handler, at the evaluated revision, saves exactly one held review draft for the eligible case and nothing for the ineligible cases, with no memory, lead, audit, action, to-do, booking or outbound write, and fails closed on a provider error. It does not exercise book-entry precedence (off here, on in production), real transport outcomes, or model quality, which is covered by the separate comparison record. Promotion still requires the owner's release approval.

