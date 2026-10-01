# ADR 012: Review drafts for known customers in AI-handled conversations

Status: Proposed
Date: 2026-10-01
Issue: [#921](https://github.com/leamonline/Smarter-dog-bookings/issues/921)
Plan: [docs/plans/active/2026-10-01-whatsapp-agent-review-drafts.md](../../plans/active/2026-10-01-whatsapp-agent-review-drafts.md)

## Context

Commit `3966928d` (20 May 2026) made `human_takeover` the default WhatsApp conversation state. Commit `1646e45d` (3 June 2026) stopped automatic Claude drafts for every known customer in every state; only staff pressing "Generate reply" produces one. Unknown customers still receive one automatic agent pass for onboarding. Neither commit records the operational reason.

Production evidence on 1 October 2026 (aggregate, redacted): of 14 conversations whose last message is an unanswered customer request older than 24 hours, 7 belong to known customers and none of those 7 has a draft. Every one is explained by the June skip. Half the 14 are in `human_takeover`, half in `ai_handling`. The owner wants dependable routine bookings for existing customers over WhatsApp; the current design cannot deliver that because the agent never runs for them.

Auto-send and autonomous booking are off (`ai_whatsapp_settings.enabled = false`; per-conversation opt-ins 1 of 397 each). Seven booking actions were `auto_applied` between June and September, so autonomous paths have fired on real customers after the June restriction; the review-only decision below does not depend on explaining that history, but the reason should be recorded here if recalled.

## Decision

For a known customer whose conversation state is `ai_handling` and whose inbound message is classified as `booking_propose` (new booking only), the agent creates a **draft for human review** automatically if no existing fast path has consumed the inbound. `human_takeover` conversations remain on demand. Unknown-customer handling is unchanged.

A review draft is **review-only by construction**: a `draftOnly` policy flag is checked at every dispatch site (`dispatchIfEligible`, booking-action staging, confirmation-button dispatch) so that no combination of existing flags can promote it. It carries `requires_approval = true`, `auto_send_eligible = false`, and the existing risk-based `handoff_required`. It may be created when `ai_whatsapp_settings.enabled = false`, because creation is not a send. The new path must also bypass customer-record creation/correction and learned-state writes; only the staff-review draft and existing inbound/event bookkeeping are allowed.

The behaviour ships behind `AI_KNOWN_CUSTOMER_REVIEW_DRAFTS` (default `false`) and is enabled per environment, staging first.

Ordering decision (1 October 2026, delegated judgement): preserve book-entry precedence. If the existing flag, eligibility and debounce checks select `book_entry`, that path consumes the inbound and no additional review draft is created. Option C runs when that path is disabled or debounced out. It is not a fallback after failed or uncertain delivery. Existing delivery failure handling is unchanged; no new retry or dual response is introduced. Confirm `WHATSAPP_BOOK_ENTRY_ENABLED` before rollout and account for fast-path requests separately in draft coverage.

Separately, the staff inbox shows elapsed working time since the last unanswered inbound request in every conversation state, derived from `day_settings` and `salon_holidays`. External alerting is not part of this decision.

Live sending and booking automation are not changed by this decision and require their own release decision.

## Consequences

Staff see a prepared reply instead of a blank row for routine `ai_handling` booking requests, at the cost of one Claude call per such inbound. The `human_takeover` half of unanswered requests is addressed only by visibility, not by drafting; that is deliberate and reversible later. The June restriction is partially reversed; because the reason is unrecorded, the flag is the rollback.

The system prompt's claim that "a human reviews every reply" becomes true again for these drafts. The prompt's open-day and Thursday assertions are removed in the same plan so that review drafts do not inherit a known contradiction with the diary.

## Verification

Tests must prove, for an Option C draft:

| Scenario | Required outcome |
|---|---|
| Known customer, `ai_handling`, `booking_propose`, review flag on, no fast path selected | Draft row created; `requires_approval = true`; no `whatsapp-send` call; no `whatsapp_booking_actions` row; no confirm-button dispatch |
| Known customer, `ai_handling`, reschedule or cancel, flag on | No automatic review draft; existing fast paths unchanged |
| Review-only model output includes extracted state or booking action | No learned-state/customer-record writes, no booking-action row, no dispatch |
| Same, flag off | No draft (current behaviour) |
| Known customer, `human_takeover`, `booking_propose`, flag on | No draft |
| Known customer, `ai_handling`, non-booking intent, flag on | No draft |
| Same as first row with `ai_whatsapp_settings.enabled = false` | Draft created; nothing sent |
| Same as first row with per-conversation `auto_send_enabled = true` and `AI_AUTO_SEND_LOW_RISK = true` | Still no send — `draftOnly` wins |
| Book-entry enabled and eligible, review flag on | Existing book-entry path wins; no Option C draft or second response |
| Book-entry disabled or debounced out, review flag on | Option C creates isolated review draft if otherwise eligible |
| Book-entry selected but delivery fails or is uncertain | Existing failure handling; no new retry, second send or Option C fallback |
| Reminder-confirmation fast path | Behaviour identical to base commit |
| Staff "Generate reply" (`force_draft`) | Behaviour identical to base commit |

Release evidence: one working week on production with the flag on, `whatsapp_drafts.state` showing no `auto_sent`, and no new `auto_applied` booking actions attributable to review drafts.

## Open questions

- Operational reason for commit `1646e45d`.
- Resolved on 1 October 2026 under delegated judgement: only `booking_propose` qualifies. Reschedule and cancellation remain on demand.
