# WhatsApp Business app replies: mirror them into the staff inbox

Status: Draft
Issue: None yet. Open one when this plan is accepted and put its number here.
Base: origin/main, 500ead13400334d0a3187aeb367f02e3c4b2a64e
Last verified: 2026-10-19
Owners: `supabase/functions/whatsapp-agent/`, `supabase/functions/whatsapp-webhook/`, `supabase/functions/_shared/` (new echo parser), the staff inbox message bubble, agent tests and this document
Dependencies: None in code. Two external prerequisites: confirmation that the salon's number is connected to Meta in coexistence mode, and an owner action in the Meta App Dashboard (subscribing one webhook field). Step 0 needs a separately approved read-only production query.
Related requirements: WhatsApp inbox and agent sections of [PROJECT](../../../PROJECT.md); [docs/whatsapp-agent.md](../../whatsapp-agent.md); [docs/meta-app-recovery.md](../../meta-app-recovery.md)
Related ADRs: None identified

## Goal

A message a staff member sends from the WhatsApp Business app on the salon phone (or a linked device) appears in the same conversation in the staff inbox, as an outbound message, within seconds. The conversation then counts as answered everywhere the system decides that: the inbox "needs reply" state, the unanswered-request triage, and the `#salon-today` "unanswered" alert.

## Why

Staff can reply to customers from the WhatsApp Business app on the salon phone as well as from the inbox; a customer thread seen on 19 October 2026 shows manual replies sent that way. The staff inbox has no record of them. Today a conversation answered from the phone still looks unanswered to the system, so staff and the Slack alert are told to answer it again, and the inbox is not a complete record of what customers were told. As long as both channels are used, this gap stays open.

Meta documents this exact case: for a business using the Business app alongside Cloud API, each message sent from the app or a linked device triggers an `smb_message_echoes` webhook "which you must digest and display in the contact message thread history in your app" ([Meta, onboarding Business app users](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users/), read 19 October 2026).

## Current behaviour

Confirmed from code at the base commit:

- **The webhook stores the raw event and does nothing else with messages.** `supabase/functions/whatsapp-webhook/index.ts` verifies the signature, inserts a `whatsapp_events` row, and applies template-status events. Its header says it does not touch conversations or messages. Its `summarise()` reads only `value.messages`, `value.statuses` and `value.contacts` (about lines 140 to 165), so an echo event is stored with a null `phone_e164` and null `meta_message_id`.
- **A database trigger passes every valid event to the agent.** `fire_whatsapp_agent()` (migration `20260424001657`) posts the event id to `whatsapp-agent` after each valid-signature insert, whatever the event type.
- **The agent only understands `messages` and `statuses`.** `whatsapp-agent/handler.ts` (about lines 2857 to 2867) merges those two arrays across all changes. For an event with neither, it loops zero times and marks the event `processed`. From code reading, not observed live: an echo event would be silently marked processed with nothing written to `whatsapp_messages` or `whatsapp_conversations`.
- **Outbound messages from the dashboard are recorded by `recordOutbound`** (`whatsapp-send/handler.ts`, about lines 259 to 290): one `whatsapp_messages` row (`direction = 'outbound'`, `role = 'assistant'`, Meta's message id, text, `raw`) and `last_outbound_at` set on the conversation. The comment there says all outbound uses role `assistant`, whether from the AI or staff.
- **Several systems key off `last_outbound_at`.** The `slack-alerts` sweep raises an "unanswered" alert when `last_outbound_at` is older than `last_inbound_at` for 30 minutes (`UNANSWERED_AFTER_MINUTES`, `_shared/slackAlertThresholds.ts`, used at `slack-alerts/index.ts` about lines 523 to 560). `src/lib/whatsapp/unansweredRequest.ts` uses it with `last_message_direction`. A phone reply never advances it.
- **Existing triggers on `whatsapp_messages` already behave correctly for outbound rows.** `trg_whatsapp_last_message` keeps the inbox preview fields in step, monotonically (migration `20260623120000`). `bump_conversation_unread` increments only for inbound (`20260424021708`). The staff push trigger fires only for inbound (`20260625140000`, `when (new.direction = 'inbound')`).
- **Duplicates are blocked by the database.** A unique index on `(direction, meta_message_id)` exists (`idx_whatsapp_messages_meta_msg`); the inbound path already treats `23505` as "already stored".
- **The inbox bubble needs no change to show an echo.** `MessageBubble.jsx` decides inbound versus outbound from `direction` only.
- **Pending AI drafts are superseded only by a new inbound message or by closing the conversation** (`20260520240000`), not by any outbound message. `whatsapp_drafts.rejected_reason` is free text with no constraint.

Confirmed from Meta's documentation (read 19 October 2026):

- The event is webhook field `smb_message_echoes`. Its value carries a `message_echoes` array; each item has `from` (the business number), `to` (the customer), `id` (the WhatsApp message id), `timestamp` (a Unix timestamp of when the webhook was triggered), `type`, and a content object keyed by that type ([reference](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/smb_message_echoes/), updated 22 October 2025 on the page).
- Four fields must be subscribed for a coexistence number: `account_update`, `history`, `smb_app_state_sync` and `smb_message_echoes`.
- Messages sent from the app are not subject to the 24-hour customer-service window and stay free. A number used on both the app and Cloud API has a fixed throughput of 20 messages per second.
- Up to four linked devices work. Messages from unsupported linked devices (WhatsApp for Windows and WearOS) do not produce webhooks, so they cannot be mirrored.
- If the phone app is inactive for about 14 days, Meta sends `account_update` with `PARTNER_REMOVED` and reason `PRIMARY_INACTIVITY` (about 30 days, `COMPANION_INACTIVITY`, for a linked device).

Not known, and not assumed:

- Whether the salon's number is connected in coexistence mode. The customer-thread screenshot suggests it, but that is inference. The repository has no mention of coexistence.
- Whether `smb_message_echoes` is already subscribed, and whether echo events are already arriving in `whatsapp_events`. Step 0 answers this.
- Whether Meta also echoes messages sent through Cloud API (it should not per the reference, but the docs list a separate "Message echoes" page that was not reviewed).
- Whether edits or revokes of an app-sent message produce any webhook.

## Desired behaviour

- A reply sent from the phone appears in the right conversation as an outbound bubble, in order, with the right time, with its text (or the same placeholder text inbound media gets).
- The conversation's preview, `last_outbound_at` and "answered" state update. The `#salon-today` unanswered alert stops firing for it.
- No customer-facing message is ever sent by this feature; it is read-only with respect to WhatsApp.
- The AI assistant does not respond to an echo, and does not answer a customer after staff already did (see Open questions).
- Replaying or redelivering the same event changes nothing.
- An echo for a number with no conversation yet creates the conversation so the thread is not lost.
- Staff can tell a phone-sent message from a dashboard-sent one (small label; optional).

## Scope

- Parse `smb_message_echoes` events and record them in `whatsapp_messages` / `whatsapp_conversations`.
- Let `summarise()` index echo events (phone and message id) so they can be searched and de-duplicated.
- Supersede pending AI drafts made stale by a staff reply from the phone.
- A defensive guard so an auto-send cannot answer a customer after a newer staff message exists.
- Tests, documentation, and the Meta configuration step.

## Non-goals

- Importing past chat history (`history`) or contacts (`smb_app_state_sync`). Meta allows each sync once, within 24 hours of onboarding; that window has almost certainly passed. These events are stored raw and ignored.
- Changing how the dashboard sends messages, or letting staff send from the phone through the dashboard.
- Changing opt-out handling. `whatsapp-send` refuses sends to a stopped number; the phone app is outside that control and stays so.
- Mirroring edits and revokes, group chats, calls, or messages from unsupported linked devices.
- Changing `role` check constraints or adding a staff role.
- Turning on AI auto-send or changing any of its seven existing gates.

## Relevant code

- `supabase/functions/whatsapp-webhook/index.ts`: raw event intake; `summarise()` needs echo awareness (small, tested change).
- `supabase/functions/whatsapp-agent/handler.ts`: event intake and per-message handling; where echoes are processed (after the existing `messages` / `statuses` merge), plus `upsertConversation`, `normalisePhone`, `findHumanIdByPhone`, `insertInboundMessage` (the model for the duplicate handling).
- `supabase/functions/_shared/inboundMessage.ts`: `extractMessageText`, reused for echo text.
- New: `supabase/functions/_shared/messageEcho.ts` (pure parser) and tests.
- `supabase/functions/whatsapp-send/handler.ts`: `recordOutbound`, the row shape to match.
- Migrations `20260623120000` (last-message sync), `20260424021708` (unread), `20260625140000` (push), `20260520240000` (draft supersession): existing behaviours to preserve.
- `supabase/functions/slack-alerts/index.ts`, `src/lib/whatsapp/unansweredRequest.ts`: consumers that start behaving correctly once `last_outbound_at` advances.
- `src/components/views/inbox/thread/MessageBubble.jsx`: renders outbound by `direction`.
- `supabase/functions/whatsapp-agent/__tests__/dispatch.test.ts` and siblings: the harness for handler tests.

## Architecture

Keep the existing shape: the webhook stays thin and signature-gated; the agent (the existing downstream job) interprets events. Echoes are processed in the agent beside inbound messages and statuses, not in the webhook.

- Authority: the signed Meta event. Echoes are trusted only from valid-signature events (the agent already skips invalid ones).
- Idempotency: the Meta message id is the key. Insert the outbound row; a `23505` on `idx_whatsapp_messages_meta_msg` means already stored and is a no-op that must not overwrite the existing row.
- Order-independence: `last_outbound_at` only ever moves forward (conditional update); the existing last-message trigger is already monotonic.
- An echo never reaches the drafting or auto-send path. It does not count as `freshInbound`.
- Provenance without a migration: `raw` stores the echo object with an added `source: "business_app"` at the top level, so code reading `raw.type` / `raw.text` still works and the optional UI label can read `raw.source`.
- Conversation lookup: by the customer number in `to` (normalised like inbound), channel `whatsapp`, creating it if missing, with `human_id` from `findHumanIdByPhone`. Do not write `human_id: null` over an existing link (the comment in `upsertConversation` explains why).

## Data/database changes

None required. The unique index, the last-message trigger, the unread and push triggers, and a free-text `rejected_reason` already support this. Confirm with a characterisation pgTAP test (Testing) rather than assuming. If review prefers a column for provenance (`whatsapp_messages.sent_via`), that is an additive, nullable migration applied to production by hand first; this plan recommends against it for v1.

## API changes

- Webhook: `summarise()` reads `message_echoes[0].to` and `.id` when present. Response behaviour is unchanged (200 after storing).
- Agent: accepts events whose `value` has `message_echoes`; no change to its request or response contract.
- Meta: one webhook field subscription (`smb_message_echoes`), plus `account_update` if not already subscribed.

## UI changes

- None required: echoes render as ordinary outbound bubbles.
- Optional: a small "Sent from phone" label on a bubble whose `raw.source === "business_app"`, with a component test. Recommended, because it explains why a message has no AI or dashboard history.

## Security/privacy considerations

- Authentication: unchanged. Only signature-verified events are processed; invalid ones are already logged and ignored.
- Personal data: echoes contain customer numbers and message text, the same categories already stored. No new logging of message bodies; log event ids and counts only.
- Opt-out: a staff phone message to a number that sent STOP cannot be prevented by this system and will now be visible in the inbox. This is a policy and training point, noted under Risks, not something this change loosens or tightens.
- The feature performs no outbound WhatsApp call, so it cannot message a customer.
- Negative controls to test: invalid signature, echo with a missing or malformed `to`, unknown message type, oversized text, replayed event.

## Dependencies

- Owner confirms the number is in coexistence mode (WhatsApp Manager / Meta Business Suite) before the subscription step.
- Owner subscribes `smb_message_echoes` (and `account_update`) in the Meta App Dashboard. Nothing in this repository can do that.
- Step 0 needs an approved read-only production query (aggregates only).

## Risks

- **Coexistence may not be active.** Then no echoes will ever arrive and this plan delivers nothing. Mitigation: confirm first (Open question 1); the code is harmless without the subscription.
- **Phone app inactivity drops coexistence.** After about 14 days of no use of the phone app Meta removes the Cloud API link (`PARTNER_REMOVED`), which could stop dashboard sending too. This risk exists today and is bigger than this plan. Mitigation: record `account_update` events and, as a separate small change, raise a staff-visible alert (Open question 8).
- **Duplicate rows if Meta echoes Cloud API sends.** Not expected; a database-level duplicate guard exists, but the race (echo before `recordOutbound`) could mislabel one row. Mitigation: verify with a dashboard-sent test message in Step 5.
- **Stale AI drafts or a double reply.** A pending draft could still be approved after staff replied; if auto-send is later enabled the AI could answer after staff. Mitigation: supersede pending drafts and add the auto-send guard (Steps 3 and 4).
- **Edits and revokes are not mirrored.** The inbox could show text the customer no longer sees. Accepted for v1 and documented.
- **Throughput.** 20 messages per second per number is far above this salon's volume.
- **Unknown conversation creation** adds threads with no inbound message; the inbox list must handle a null `last_inbound_at` (tested).

## Migration/rollout

Order, with approval points:

1. Step 0: owner approves and runs the read-only evidence query.
2. Merge and deploy the code (Edge Functions deploy automatically from `main`). Safe before the subscription, because no echoes arrive until Meta is told to send them.
3. Owner subscribes `smb_message_echoes` and `account_update` in the Meta App Dashboard.
4. Test with a phone message to a staff-owned number, then a dashboard-sent message to check for duplicates.
5. Watch for a week (Observability).

Rollback: unsubscribe the field in Meta, or revert the pull request. Rows already stored are harmless and can be identified by `raw->>'source' = 'business_app'`. No migration, so no database rollback.

## Implementation sequence

0. **Evidence (no code).** Run the read-only query below once, with approval, and record the result in this plan:
   `select event_type, count(*), min(received_at), max(received_at) from whatsapp_events where received_at > now() - interval '30 days' group by 1 order by 2 desc;`
   Aggregates only, no customer data. Tells us whether echoes already arrive and which Meta fields are subscribed. Also confirm coexistence (Open question 1).
1. **Parser.** `_shared/messageEcho.ts`: pure function turning a webhook `value` into normalised echoes (`to` as E.164, id, sent-at ISO, text via `extractMessageText`-compatible shape, raw with `source`). Tests first: text, media with caption, unsupported type, missing or malformed fields, number normalisation, timestamp parsing.
2. **Webhook indexing.** Teach `summarise()` echoes. Tests.
3. **Agent ingestion.** In the handler, after the existing merge, process echoes: find or create the conversation, insert the outbound row, advance `last_outbound_at` monotonically, treat `23505` as a no-op, supersede pending drafts older than the echo (reason `answered_from_phone`). Never call the model or the dispatch gates for an echo. Tests in `__tests__/messageEcho.test.ts`.
4. **Auto-send guard (recommended).** Skip auto-send when an outbound message newer than the triggering inbound exists. Tests; the seven-gate unit tests must stay green.
5. **Optional UI label.** "Sent from phone", component test.
6. **Docs and rollout.** Update docs (below), then the Meta subscription and live test.

Steps 1 to 4 are one pull request with one writer; step 5 can be a separate small pull request.

## Testing

- Focused: `deno test` for the new parser and the handler tests (these run in the `agent-tests` CI job); webhook `summarise()` test; `MessageBubble` component test if the label ships.
- Handler cases: echo-only event inserts one outbound row and advances `last_outbound_at`; older echo does not move it backwards; same event twice is a no-op; same wamid delivered as a message and an echo stays one row; echo for an unknown number creates a conversation linked to the right human; mixed payload (inbound message plus echo) handles both and drafts only for the inbound; statuses still handled; invalid-signature event ignored; model and dispatch are never called for an echo.
- Database characterisation test (pgTAP): inserting an outbound row with `raw.source = 'business_app'` updates the last-message fields, does not bump unread, and does not trigger a staff push.
- Full checks: `npm run lint`, `check:docs`, `typecheck`, `test`, `build`, `check:edge-types`; the full pgTAP suite in CI.
- Not coverable in tests: real Meta delivery. Covered by the live test in Rollout step 4.

## Observability

- Evidence it works: after the live test the message is in the thread within seconds and `last_outbound_at` advanced; the `#salon-today` unanswered alert does not fire for a conversation answered from the phone.
- Detect regressions: echo events whose `processing_status` is `failed` or that produced no message row (a query over `whatsapp_events` with `event_type = 'smb_message_echoes'`); count of echoes per day against phone replies observed.
- Reconciliation: because the event row keeps the raw payload, a failed echo can be replayed safely (idempotent by message id).
- Log event ids and counts only, not message text or numbers.
- Watch `account_update` events for `PARTNER_REMOVED`.

## Documentation updates

- `docs/whatsapp-agent.md`: how echoes are handled and that the AI never reacts to them.
- `docs/meta-app-recovery.md`: the webhook fields that must be subscribed, including `smb_message_echoes` and `account_update`.
- This plan: record Step 0 evidence and the live-test outcome; move to `completed/` when verified.
- Staff guidance: replies from the phone now appear in the inbox; how to read the "Sent from phone" label.

## Definition of done

- A phone-sent reply appears in the correct conversation within seconds in the live test, with correct time and text.
- The conversation shows as answered; no `#salon-today` unanswered alert fires for it.
- No AI draft or auto-send is produced by an echo; pending drafts made stale by the reply are superseded.
- Replayed and duplicate events change nothing; an unknown number creates one conversation.
- Handler, parser and webhook tests pass, including the negative controls; the full CI is green.
- A dashboard-sent test message produces no duplicate.
- Documentation updated; Step 0 evidence and the live-test result are recorded here.

## Open questions

Decisions needed from the owner unless noted:

1. Is the salon's number connected in coexistence mode? (Blocks the Meta subscription step. Check WhatsApp Manager under the number's settings.)
2. Are echo events already arriving? (Step 0 will show.)
3. Does Meta echo messages sent through Cloud API? (Verify in the live test; no action if it does not.)
4. If staff message a number we have never had a conversation with, should the inbox create the thread? Recommended: yes.
5. After a phone reply, supersede pending AI drafts (recommended: yes), and block auto-send when staff already replied (recommended: yes, even though auto-send is off today)?
6. Should a phone reply switch the conversation to "Handled by staff"? Recommended: no, so the explicit AI-mode toggle stays authoritative; the label tells staff what happened.
7. Is a "Sent from phone" label wanted? Recommended: yes.
8. Should phone-app inactivity (`PARTNER_REMOVED`) raise a staff-visible alert? Recommended: yes, as a separate small change, because losing coexistence would also affect dashboard sending.
9. Edits and revokes in the phone app: accept that v1 does not mirror them? (Meta's documentation did not clearly say whether a webhook is sent; check in the live test.)
10. Staff policy: messaging a customer who has sent STOP from the phone bypasses the system's opt-out protection. Does the salon want guidance or a visible warning?
