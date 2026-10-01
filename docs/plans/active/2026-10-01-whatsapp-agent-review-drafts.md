# WhatsApp agent: review drafts for known customers and unanswered-request visibility

Status: Draft
Issue: [#921](https://github.com/leamonline/Smarter-dog-bookings/issues/921)
Base: origin/main, d9ba1736959ace028f64d089ee460ea92a335761
Last verified: 2026-10-01
Owners: `supabase/functions/whatsapp-agent/`, `supabase/functions/_shared/agentRisk.ts`, staff inbox ageing UI, agent tests and this document
Dependencies: None for steps 0–1a. Step 1c (data correction) requires separate production authorisation. Step 3 requires a separate release decision.
Related requirements: WhatsApp inbox and agent sections of [PROJECT](../../../PROJECT.md); [docs/whatsapp-agent.md](../../whatsapp-agent.md)
Related ADRs: [ADR 003](../../architecture/decisions/003-separate-operation-success-from-notification-delivery.md); proposed [ADR 012](../../architecture/decisions/012-review-drafts-for-known-customers.md)

Supersedes the step ordering of the "WhatsApp AI reassessment" brief (1 October 2026, not in repository); keeps its architecture principle (model understands and phrases; application decides facts, phase and outcome) and its acceptance cases.

## Goal

Known customers in `ai_handling` conversations who send a booking-intent WhatsApp message get a drafted reply waiting for staff review, and no customer request in any conversation state goes unnoticed past a working-hours threshold. The prompt stops contradicting the diary. No live sending or booking automation changes.

## Why

Evidence gathered on 1 October 2026 against production (`whatsapp-agent` v105, deployed 29 Sept 2026 15:33 UTC, matching the base commit) identifies an additional unanswered-request problem: the model drafting pass is skipped for known customers. This does not explain away the reported incorrect answers and repeated questions; existing booking fast paths may still run. Commit `1646e45d` (3 June 2026) deliberately stopped automatic known-customer drafts in every conversation state, following commit `3966928d` (20 May 2026) which made `human_takeover` the default. Neither commit records the operational reason.

Aggregate, redacted production reads (no customer rows copied):

| Measure | Value |
|---|---|
| Conversations | 397 |
| Conversations whose last message is an inbound request older than 24h | 14 (±3; heuristic classifier) |
| Of those, no draft created after the message | 8 |
| Of those, known customer with no draft | 7 — all explained by the known-customer skip |
| Request tails in the last 30 days | 5 (3 with no draft) |
| Split by conversation state | 7 `ai_handling`, 7 `human_takeover` |
| Monthly, Jun–Sep 2026 | 1 / 4 / 4 / 5 |
| Upcoming non-cancelled bookings beyond the agent's 14-day context window | 54 of 85 (64%) |
| Customers with two or more dogs | 203 of 894 (23%) |
| `lead_status = 'collecting'` rows whose customer has since completed onboarding elsewhere | 17 (sample of 3 read, all completed) |

Owner decision (1 October 2026, delegated judgement): Option C, limited to `booking_propose`; reschedule and cancellation stay on demand. Automatic review drafts resume for known customers in `ai_handling` only; `human_takeover` stays on demand; unanswered-request visibility is added for both. Missing replies first, factual corrections alongside, memory improvements after.

## Current behaviour

Confirmed in deployed source and the base commit (`supabase/functions/whatsapp-agent/handler.ts`):

- Known-customer skip (~L2766): `if (isKnownCustomer && !forceDraft) continue;` runs after the reminder-confirmation and `book_entry` fast paths and before the Claude call. Unknown customers get one agent pass.
- `AI_ASSISTANT_ENABLED` kill switch sits *after* the skip and writes a handoff fallback draft; it does not suppress drafts.
- `SYSTEM_PROMPT` states "Open days: Monday, Tuesday, Wednesday only", "Bank holidays: closed; they make up the day on the following Thursday", and "If a customer asks for Thursday/Friday/weekend, kindly point out we're Mon-Wed". Production `day_settings` and the `get_small_medium_availability` RPC are the authority and already drive the availability block; three sampled customer threads were booked on Thursdays (25 Jun, 6 Aug, 3 Sep 2026).
- `buildContext` queries bookings for `[today, today+14]`, selects `status` but renders only `confirmed`, does not exclude `Cancelled`, and labels a UTC `toISOString()` date as "UK time".
- `parseExtractedState` accepts only non-empty strings and non-empty alert arrays; explicit removal cannot be expressed.
- `persistAgentState` logs a warning and continues on failure.
- `AgentState` (`_shared/agentRisk.ts`) holds one dog.
- `callWhatsappSend` stamps `ai_initiated: true` on every call including `mode: "manual"` (`sendManageText`), so a log line `whatsapp-send manual returned 409` is an AI send correctly blocked by `ai_whatsapp_settings`, not a staff send. Staff manual sends are exempt: `checkAiMessagingPermission` in `whatsapp-send` allows any request without `ai_initiated === true`.

Production gates on 1 October 2026: `ai_whatsapp_settings.enabled = false` (since 27 Sept); 1 of 397 conversations opted into auto-send, 1 into autonomous booking; no draft has ever reached `auto_sent`; 7 `whatsapp_booking_actions` rows are `auto_applied` (17 Jun–22 Sep 2026); `whatsapp_ai_action_audit` has 0 rows. Edge secret values for `AI_AUTO_SEND_LOW_RISK`, `AI_AUTONOMOUS_BOOKING_ENABLED` and `WHATSAPP_MANAGE_BOOKING_ENABLED` were not readable and default to false in source.

Not supported by live data (limited negative evidence — one day of logs, three threads): `persistAgentState` failures (0 warnings in 24h); `lead_payload` vs `agent_state` drift (0 of 17 differ); repeated questions for supplied facts (none in 3 threads). These remain correctness items in step 2, not blockers.

Assumption: "no WhatsApp reply" may still have been answered by phone or in person. The metric measures channel silence, not service failure.

## Desired behaviour

| Conversation state | Known customer, new-booking intent (`booking_propose`) | Known customer, other | Unknown customer |
|---|---|---|---|
| `ai_handling` | Review draft created when no existing fast path consumes the inbound; staff send | On demand (unchanged) | One agent pass (unchanged) |
| `human_takeover` | On demand (unchanged) | On demand (unchanged) | One agent pass (unchanged) |

Precedence decision (1 October 2026, delegated judgement; refined after refusal evidence): retain book-entry first, but branch on its explicit send outcome. Accepted or uncertain attempts consume the inbound without a further response. Refused or conclusively unsent attempts fall through to eligible Option C processing, creating only a staff-review draft. Disabled/debounced paths also may reach Option C. No automatic resend is introduced. See ADR 012 for outcome classification and ADR 003 for acceptance versus delivery. Accepted/uncertain attempts are outside the review-draft denominator; eligible definite refusals are included. Do not enable or retire the fast path in this change.

Discovery correction: `dispatchBookEntry` at the base returns `Promise<void>` and the caller unconditionally continues; `callWhatsappSend` returns a boolean but conflates refusals with network errors. User-supplied live evidence reports a 409 `global_disabled` refusal followed by silence; that evidence has not been independently re-read here. Implementation must introduce an explicit accepted/definitely-not-sent/uncertain result and make it load-bearing at the caller.

Both states: the staff inbox shows how long a conversation has waited since its last unanswered inbound request, using working hours derived from `day_settings` and `salon_holidays`.

The prompt no longer asserts open days or Thursday rules; the availability block is the only source for open/closed/full, with the existing approved "further ahead" wording for dates outside its window. Bookings in context cover the configured horizon, exclude cancelled rows and show status. Dates are computed in Europe/London.

## Scope

- `supabase/functions/whatsapp-agent/handler.ts`: the known-customer skip, `SYSTEM_PROMPT` salon-basics lines, `buildContext` bookings query and date handling, `DraftPolicy`, logging.
- `supabase/functions/_shared/agentRisk.ts`: `AgentState` additions (step 2 only).
- Staff inbox: ageing indicator (read-only UI over existing `whatsapp_messages` / `whatsapp_drafts`).
- Tests under `src/lib/whatsapp/` and `supabase/functions/whatsapp-agent/` as they exist today.
- `docs/whatsapp-agent.md`, this plan, ADR 012.

## Non-goals

- Enabling auto-send, autonomous booking, or changing any of the five gates or the kill switch.
- Slack or any external alerting for unanswered requests. `slack-alerts` already has an "unanswered messages" alert class behind `SLACK_ALERTS_ENABLED`; reusing or tuning it needs separate authorisation.
- Booking policy, capacity rules, the booking write path, or the Flow endpoint.
- Changing brand-voice sections of the prompt.
- Reading customer message content beyond the three redacted samples already taken.

## Relevant code

- `handler.ts` known-customer skip (~L2766) — the behaviour being narrowed.
- `handler.ts` `book_entry` fast path (~L2755) and reminder-confirmation path (~L2719) — run before the skip; must be left unchanged or explicitly covered by tests.
- `handler.ts` `DraftPolicy`, `canAutoSend`, `dispatchIfEligible` (~L1133–1215) — dispatch sites that must honour a draft-only policy.
- `handler.ts` `parseExtractedState` (~L1024), `persistAgentState` (~L1191), `buildContext` (~L800–900), `buildAvailabilityBlock` (~L640).
- `_shared/agentRisk.ts` `AgentState`, `guessIntentFromText`.
- `whatsapp-send/index.ts` `checkAiMessagingPermission` and `_shared/aiMessagingGate.ts` — the send gate the review draft must stay behind if ever promoted.
- `apply-customer-confirm` Edge Function and `_shared/confirmButtons.ts` — the confirmation-button dispatch that a review draft must not trigger.
- Existing agent unit tests asserting "booking-touching intents never auto-send" (referenced in CLAUDE.md) — extend, do not weaken.

## Architecture

Unchanged: model phrases, application decides. Postgres remains capacity authority (ADR 001). Operation success and delivery stay separate (ADR 003). The new element is a `draftOnly` policy that every dispatch site checks, so "review only" is a single flag rather than a combination of existing ones. Trust boundary unchanged: the Edge Function uses the service role; the staff inbox reads through RLS.

## Data/database changes

Steps 0–1b: None.

Step 1c: one-off data correction clearing `lead_status = 'collecting'` for the 17 conversations whose `human_id` is bound or that have a booking. Production write; requires separate authorisation, verified target, SQL shown and reviewed, post-apply evidence recorded, per [docs/migrations.md](../../migrations.md). Not bundled with code.

Step 2 (design only in this plan): additive `agent_state_rev integer` on `whatsapp_conversations` for optimistic concurrency; additive per-dog array inside `agent_state` JSONB. Idempotent migration, no destructive change, RLS unchanged (service-role write path only).

## API changes

- `whatsapp-agent` request body unchanged. Response for `suggest_only` unchanged.
- `DraftPolicy` gains `draftOnly: boolean`. `whatsapp_drafts` rows created under Option C carry `requires_approval = true`, `auto_send_eligible = false`, and `handoff_required` per existing risk policy.
- New env flag `AI_KNOWN_CUSTOMER_REVIEW_DRAFTS` (default `false`) gating the narrowed skip, so the change is dark until enabled per environment.
- Warning logs from `callWhatsappSend` include `ai_initiated` so AI and staff sends are distinguishable.

## UI changes

Staff inbox: a per-conversation "waiting" indicator (elapsed working time since the last inbound request with no later outbound or explicit staff resolution; an unsent draft does not resolve it), a sort or badge above a threshold, and a truthful empty state when `day_settings` cannot be read ("waiting time unavailable", never a guessed number). Accessible as text, not colour alone. No customer-facing UI change.

## Security/privacy considerations

- No new secrets. The new flag is a boolean Edge secret.
- Review drafts are visible to staff only, as today. No new customer data is collected; the ageing indicator derives from timestamps already stored.
- Plan and ADR contain no customer names, phone numbers or message text. The three sampled threads were read redacted and are not reproduced.
- Negative control: a test must prove an Option C draft while `ai_whatsapp_settings.enabled = false` creates a draft and sends nothing.

## Dependencies

- Owner confirmation that the production values of `AI_AUTO_SEND_LOW_RISK`, `AI_AUTONOMOUS_BOOKING_ENABLED`, `WHATSAPP_MANAGE_BOOKING_ENABLED` and `WHATSAPP_BOOK_ENTRY_ENABLED` (record in the issue).
- Step 1c authorisation.
- No concurrent work touching `handler.ts` known at base; check open pull requests before starting.

## Risks

| Risk | Likelihood / impact | Detection | Mitigation |
|---|---|---|---|
| Review draft reaches a dispatch path and sends or books | Low / high | Test matrix in step 1b; `whatsapp_booking_actions` and `whatsapp_drafts.state` monitoring | `draftOnly` checked at every site; flag default off; master switch remains off during rollout |
| June restriction had a reason this plan reintroduces | Unknown / medium | Owner recall; ADR open question | Flag-gated, review-only, reversible by flag |
| Ageing indicator mis-states working hours during closures | Medium / low | Fixture tests with the Oct and Dec 2026 closures | Derive from `day_settings` + `salon_holidays`; truthful unavailable state |
| Prompt change alters tone or other replies | Medium / low | Before/after synthetic comparison (step 4) | Edit only salon-basics lines; version the prompt |
| Horizon-wide bookings query bloats context | Low / low | Token counts in logs | Cap rendered rows; summarise beyond N |
| Classifier counts closers as requests | Certain at the margin / low | Fixture review | Treat metric as ±3; refine with fixtures, never with customer text in the repo |

## Migration/rollout

All environment enablement, deployments, production observation and data writes below require separate release authority; this document records the proposed sequence, not permission.

1. Merge step 1a (UI, tests, logging) — no flag needed.
2. Merge step 1b with `AI_KNOWN_CUSTOMER_REVIEW_DRAFTS` unset (false). Deploys via the Edge Function GitHub Action on merge.
3. Enable the flag on staging (`btjnxvgkpdbfrrqxvkfj`) first; run synthetic conversations; confirm drafts, no sends, no actions.
4. Enable on production with `ai_whatsapp_settings.enabled` still false. Observe one working week. Roll back by unsetting the flag.
5. Step 1c data correction only after its own approval point.
6. Step 2 migrations follow [docs/migrations.md](../../migrations.md): applied to production by hand before dependent code merges; the `migrations-applied` check enforces this.

## Implementation sequence

### Step 0: Record

Files: `docs/architecture/decisions/012-review-drafts-for-known-customers.md`, `docs/architecture/decisions/README.md`, this plan's `Issue:` line.
Hand-off: issue number recorded; ADR status `Proposed` until step 1b merges.

### Step 1a: Visibility and diagnosis (no customer-visible change)

1. Inbox ageing indicator. Files: staff inbox conversation list component and its hook; a pure `workingHoursSince(lastInboundAt, daySettings, holidays, now)` helper in `src/engine/` with tests. Behaviour: elapsed working time since the last unanswered inbound. Tests: Mon–Wed open days; an open Thursday from `day_settings`; the 27–28 Oct 2026 closure; `salon_holidays` range; unreadable settings → unavailable state.
2. Request classifier fixtures. Files: `src/lib/whatsapp/unansweredRequest.ts` + test with synthetic fixtures reproducing the shapes of the 14 cases (no real text). Hand-off: the metric definition used in section "Observability".
3. Audit path check. File: `handler.ts` `saveBookingAction()`. Confirm it writes `whatsapp_ai_action_audit`; fix and test if not.
4. Log clarity. File: `handler.ts` `callWhatsappSend`. Include `ai_initiated` in warning text. Test: string assertion.
5. Flag confirmation. With separate authorised access, record production values of `AI_AUTO_SEND_LOW_RISK`, `AI_AUTONOMOUS_BOOKING_ENABLED`, `WHATSAPP_MANAGE_BOOKING_ENABLED` and `WHATSAPP_BOOK_ENTRY_ENABLED` in the issue; do not infer values from unanswered tails.

### Step 1b: Customer-visible corrections (flag-gated where behaviour changes)

1. Prompt. File: `handler.ts` `SYSTEM_PROMPT`. Remove the three open-day/Thursday lines; add "the Availability block is the only source for whether a date is open, closed or full". Bump the prompt version constant. Tests: snapshot of the salon-basics section; synthetic Thursday-open and closure-day conversations.
2. Bookings context. File: `handler.ts` `buildContext`. Window = `booking_policy_settings.booking_horizon_days` (fallback 180); exclude `Cancelled`; render status; distinguish empty from error. Tests: six-weeks-out booking rendered; cancelled booking omitted; query error renders "lookup unavailable".
3. Dates. File: `handler.ts` `buildContext` and `_shared` date helpers. Europe/London via `Intl.DateTimeFormat`. Test: 23:30 UTC on a BST date yields the next London date.
4. Review drafts (Option C). File: `handler.ts`. Narrow the skip: `if (isKnownCustomer && !forceDraft && !(REVIEW_DRAFTS_ENABLED && conversation.state === 'ai_handling' && guessIntentFromText(text) === "booking_propose")) continue;`. Set `policy.draftOnly = true` for these drafts; return through an isolated draft-save path before learned-state writes and customer-record creation/correction; check `draftOnly` in `dispatchIfEligible`, the booking-action staging path, and any confirm-button dispatch. Tests: the matrix in ADR 012 section "Verification"; test book-entry accepted or uncertain → no review draft or second response; validated 409 `global_disabled` or other documented definite non-send → eligible isolated review draft; flag off/Human only → no new draft; disabled or debounced → eligible isolated review draft; introduce an explicit outcome from `dispatchBookEntry` and branch at its call site, never use an ambiguous boolean to decide fallback; existing never-auto-send tests still pass; `human_takeover` unchanged; non-booking intents unchanged.

### Step 1c: Data correction (separate authorisation)

Code: clear `lead_status` on `human_id` bind and on booking creation (file: wherever `lead_status` is written in `handler.ts` onboarding loop; add tests). Data: one-off SQL for the 17 rows, run per [docs/migrations.md](../../migrations.md) with evidence.

### Step 2: Conversation state correctness

1. `parseExtractedState`: accept `null` for removal and `[]` to clear alerts; keep a `corrections` array. Tests for each.
2. Per-dog state: additive `dogs: DogState[]` in `agent_state`; readers prefer it when present.
3. Server-owned `phase`; `awaiting_confirmation` bound to the delivered summary message id.
4. Concurrency: `agent_state_rev` optimistic check (`UPDATE … WHERE agent_state_rev = $expected`); on mismatch re-read, re-merge, retry once, then fail safe (no persist, log, handoff flag). Confirmation checks revision and message id. A JSONB `||` merge alone is insufficient because competing writes to the same field still overwrite.
5. `lead_payload` / `agent_state` reconciliation — keep, low priority.

### Step 3: Booking completion (separate release decision)

Exact-proposal contract, expiry, stale-capacity recheck, duplicate webhook idempotency, multi-dog requests; new acceptance case "proposal differs from request is stated to the customer". Not started under this plan.

### Step 4: Evaluation

Version prompt, model and fixtures; compare current vs candidate on the same synthetic conversations; logic tests separate from model-quality review; promote through existing gates; compare rates over equivalent working-time windows and request volumes; investigate deterioration rather than treating a cumulative count as a release gate.

## Testing

Focused: `npm run test -- src/lib/whatsapp` and the agent tests named above; `deno test` for `supabase/functions/whatsapp-agent` if present. Full: `npm run lint && npm run check:docs && npm run typecheck && npm run check:migrations && npm run test && npm run build`. Database-runtime tests for step 2 migrations under `supabase/tests/`. Concurrency: two interleaved `agent_state` writes in a pgTAP or Deno test proving the second detects the revision mismatch.

## Observability

- Metric: count of conversations whose last message is an inbound request older than the working-hours threshold, split by state and by whether a draft exists. Historical evidence on 1 Oct 2026: 14 requests older than 24 elapsed hours, 5 in 30 days (±3). This is not a working-hours baseline. Establish a fresh baseline using the final threshold, classifier and resolution rules before release comparison.
- After step 1b enablement: `ai_handling` known-customer new-booking requests that reach Option C with no draft should trend to zero; track accepted/uncertain fast-path attempts separately from definite refusals eligible for draft fallback, without treating a sent button or unsent draft as a resolved request; `whatsapp_drafts.state` must show no `auto_sent`; `whatsapp_booking_actions` must show no new `auto_applied` rows attributable to review drafts.
- Logs: `ai_initiated` visible in send warnings.

## Documentation updates

- `docs/whatsapp-agent.md` "Drafting is on demand" paragraph: describe the Option C exception and the new flag.
- ADR 012 (new) and the ADR index.
- `.env.example` and the secrets table in `docs/whatsapp-agent.md`: add `AI_KNOWN_CUSTOMER_REVIEW_DRAFTS`.
- This plan: update `Last verified` and mark changes as discovery proceeds.

## Definition of done

- ADR 012 accepted; issue linked.
- Step 1a merged: ageing indicator live for staff with tests; classifier fixtures in repo; audit path verified; logs clarified; flag values recorded.
- Step 1b merged behind the flag; enabled on staging then production; one working week with zero sends or actions attributable to review drafts; metric for eligible requests reaching Option C with no draft at or near zero; fast-path handling accounted for separately.
- Step 1c applied with recorded evidence, or explicitly deferred with reason.
- `docs/whatsapp-agent.md` updated. Full CI bar green.
- Plan moved to `docs/plans/completed/` with pull request, test and release evidence linked.

## Open questions

Book-entry ordering resolved under delegated judgement: preserve precedence for accepted/uncertain attempts; definite non-send or no selected fast path may fall through to eligible Option C. Its production flag remains unknown and must be confirmed before rollout.

1. Operational reason behind commit `1646e45d` (3 June 2026). Owner.
2. Production values of `AI_AUTO_SEND_LOW_RISK`, `AI_AUTONOMOUS_BOOKING_ENABLED`, `WHATSAPP_MANAGE_BOOKING_ENABLED` and `WHATSAPP_BOOK_ENTRY_ENABLED`. Owner.
3. Whether `whatsapp_ai_action_audit` was ever expected to be populated. Owner.
4. Authorisation and timing for the step 1c data correction. Owner.
5. Working-hours threshold for the ageing indicator after a week of data. Owner.
6. Resolved on 1 October 2026 under delegated judgement: only `booking_propose` qualifies; reschedule and cancellation remain on demand.

## Appendix: aggregate queries

Safe to re-run; return counts only.

```sql
-- Upcoming bookings beyond the 14-day window
select count(*) filter (where booking_date > current_date + 14) as beyond_14d, count(*) as total
from bookings where booking_date >= current_date and status <> 'Cancelled';

-- Stale collecting rows
select count(*) from whatsapp_conversations where lead_status = 'collecting' and human_id is not null;

-- Known-customer request tails with no draft after, by state
with last_msg as (
  select distinct on (conversation_id) conversation_id, direction, sent_at
  from whatsapp_messages order by conversation_id, sent_at desc)
select c.state, count(*) from last_msg l join whatsapp_conversations c on c.id = l.conversation_id
where l.direction = 'inbound' and c.human_id is not null and l.sent_at < now() - interval '24 hours'
  and not exists (select 1 from whatsapp_drafts d where d.conversation_id = c.id and d.created_at >= l.sent_at)
group by c.state;
```

## Step 1a implementation evidence — 1 October 2026

Base revalidated after PR #922: `main@a154902603f5a7b568439acf6796fe1250d0f7c0`. Issue #921 governs this slice.

- Added pure London working-hours calculation (08:30–15:00 operational hours), normal Mon–Wed defaults, explicit opening exceptions, enabled holiday ranges and unioned partial-day closures. These are working hours, not free booking slots or staffing capacity.
- Added synthetic ask/closer fixtures and per-row staff inbox waiting labels. An unsent draft never resolves a request. The classifier is heuristic: no label is not proof that no help is needed. Done conversations are explicit resolution; failed sends remain waiting. The timestamp is the latest inbound request, not the oldest unhandled message in a sequence.
- Schedule reads use the staff holiday RPC and bounded operational date reads. Refresh each minute and on window focus. Incomplete/error reads display unavailable, including requests older than the one-year read window. Current schedule is used; there is no historical schedule snapshot, so past edits may change calculated waiting time.
- No threshold badge or ordering change yet: the final working-hours threshold remains an owner decision. Existing Awaiting reply filtering is preserved. Numeric working-time labels provide visibility without inventing a target.
- Source audit: `saveBookingAction` already calls `auditAiAction` for staged and rejected outcomes; it writes `whatsapp_ai_action_audit` and warns on insert failure. No duplicate audit writer added. Zero historical rows do not establish a missing source write; production cause remains unverified.
- AI manual-mode warning logs explicitly carry `ai_initiated=true`. No send, onboarding, proposal, fast-path or feature-gate behaviour changes.
- Production flag confirmation remains an external release dependency; no production credentials, message content or settings were accessed for this implementation. The plan stays active for step 1b and later stages.

Validation: full coverage passes (393 files, 4,126 tests, no unhandled errors); lint passes with existing warnings; typecheck, build, documentation and migration validation pass. Edge type checks and 14 agent Deno tests pass. Required PR CI and rendered device review remain release evidence, not established by these local checks.

## Step 1b implementation evidence — 1 October 2026

Base revalidated after PR #923: `main@c699e904506450ad346be50207866edc78f74d74`. New review drafts default off behind `AI_KNOWN_CUSTOMER_REVIEW_DRAFTS`. The isolated path saves a pending draft and exits before learned-state persistence, lead/record corrections, booking-action staging or confirmation dispatch. All three downstream dispatch/staging functions also check `draftOnly` defensively. Draft metadata records candidate prompt version `2026-10-01.1` and `review_only`; old drafts are not relabelled.

Discovery: the send endpoint's book-entry response distinguishes successful acceptance and known pre-send gate refusals. It does not preserve the difference between a Meta rejection and a network failure (both can become 502). Consequently, only validated 409 gate reasons or missing local send configuration are classified refused; generic HTTP failures/malformed responses and network errors remain uncertain. The caller uses this explicit outcome. Provider acceptance does not prove delivery.

Discovery: slot availability alone cannot establish closure. The Availability block now includes explicit date-specific `day_settings` exceptions within its 30-day window, independent of a slot RPC error. An open exception is not free capacity. Missing dates remain unverified. The walk-in fixed weekday phrase carried the same contradiction, so its weekday assertion was removed while leaving the brand-voice sections and service/price policy unchanged.

Known-customer appointment context uses the supported configured horizon (1–730 days; fallback context window 180), excludes Cancelled and renders status. Read failures have a distinct unavailable message. Forty records are rendered at most, with a fetched 41st signalling explicit omission. Dates and both availability endpoints use London calendar dates; no UTC label mismatch.

Synthetic Deno fixtures cover the review/fast-path matrix, persisted draft rows, no customer/state/booking writes, default-off/Human only/other intents, existing staff force/suggest modes, duplicate inbound, context exceptions and failures. The candidate [evaluation record](../../../prompts/evals/2026-10-01-whatsapp-review-drafts.md) separates server-contract proof from outstanding model-quality comparison.

Release dependencies remain: production flag confirmation, provider/model comparison using synthetic fixtures, staging and separately authorised promotion. No live secrets, customer message content, production settings or data correction were accessed/applied. ADR 012 remains Proposed until the reviewed implementation merges; this plan stays active.

Final context review: slot lists are rendered exactly as the RPC returns them. Ten returned slots do not establish that all ten canonical slots are free when extra slots exist; the previous count-based `(all open)` shortcut was removed and a synthetic regression added. Booking validation/capacity policy is unchanged.

## Model-comparison preparation — 1 October 2026

The [comparison runner](../../../scripts/whatsapp-eval/README.md) captures the real baseline and merged candidate handler requests using 14 fixed synthetic fixtures, a fixed London clock and intercepted database/provider fetches. Source revisions, fixture and request hashes are pinned; the paid run is bounded to 28 serial requests with no automatic retry. Blind scoring separates review from version identity. No customer data or provider credentials were used in preparation. Model-quality results remain pending the separately approved provider run; preparation does not satisfy the promotion gate.
