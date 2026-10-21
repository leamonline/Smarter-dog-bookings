# WhatsApp: a staff reply clears stale AI drafts and blocks auto-send

Status: Blocked
Issue: [#1063](https://github.com/leamonline/Smarter-dog-bookings/issues/1063)
Base: origin/main, 500ead13400334d0a3187aeb367f02e3c4b2a64e
Last verified: 2026-10-21
Owners: `supabase/functions/whatsapp-send/`, `supabase/functions/whatsapp-agent/`, their Deno tests and this document
Dependencies: The agent change (Step 2) touches the same area as #921 ([plan](2026-10-01-whatsapp-agent-review-drafts.md)); sequence it after, or coordinate with, that work. Step 0 needs a separately approved read-only production query.
Related requirements: WhatsApp inbox and agent sections of [PROJECT](../../../PROJECT.md); [docs/whatsapp-agent.md](../../whatsapp-agent.md)
Related ADRs: None identified

**Paused by the owner on 21 October 2026.** The plan was accepted, then paused once Step 0 showed no stale drafts today. It is Blocked only by that choice, not by any technical obstacle. See Open questions, "Priority", for what brings it back.

Replaces the goal that survives from [the Business app echoes plan](2026-10-19-whatsapp-business-app-echoes.md) (#1050, Superseded). That plan assumed staff reply from the WhatsApp Business app on the salon phone. Meta reports the salon number is not in coexistence mode, so that premise does not hold. The owner's wish to stop the AI sending unnecessary replies does hold, and applies to replies staff type in the inbox.

## Goal

After a staff member sends a text reply from the staff inbox (the compose box, or an approved draft), AI drafts written for earlier customer messages no longer wait for approval and no longer count as work for staff, and neither the agent's drafting nor auto-send (should it ever be enabled) answers a customer message that staff have already answered.

## Why

Owner preference (19 October 2026): stop the AI sending unnecessary replies. Owner decisions that carry over (20 October 2026): the AI-mode toggle stays in charge, so a staff reply does not switch a chat to "Handled by staff"; and auto-send must be blocked after a staff reply.

Without this, a draft that was written before a colleague answered the customer stays pending. Anyone can approve it afterwards and the customer then gets two overlapping replies. The dashboard "needs eyes" number also counts it. The review-draft work in #921 will create more pending drafts for known customers, so stale drafts will become more common, not less.

Step 0 measured the problem on 21 October 2026: none today. Production had 4 pending drafts and none had a later outbound message (details under Implementation sequence). That makes this preventive work, not a fix for an active problem, and it affects priority (see Open questions, "Priority").

## Current behaviour

Confirmed from code at the base commit, read 21 October 2026. Not observed live.

- **A reply typed in the inbox does not touch drafts.** `handleManualMode` in `supabase/functions/whatsapp-send/handler.ts` (about lines 753 to 828) checks the 24-hour window, sends through Meta, then calls `recordOutbound`. That inserts the outbound message and sets `last_outbound_at` (about lines 264 to 290). The conversation therefore counts as answered, but no draft is changed.
- **Approving a draft does not check for later replies.** `handleDraftMode` (about lines 637 to 746) requires only that the draft is `pending` (409 otherwise) and the window is open. It then claims the draft, sends, and records the outbound message. Nothing compares the draft with replies sent since it was written.
- **Drafts are superseded in only three cases:** the conversation is closed, or a newer customer message arrives (`supabase/migrations/20260520240000_auto_supersede_stale_drafts.sql`, triggers `supersede_drafts_on_conversation_close` and `supersede_drafts_on_new_inbound`), or the number is switched back on (`20261016120000_whatsapp_opt_out_followups.sql`, about line 382). A search of `supabase/` for `superseded` and `rejected_reason` found no path that supersedes drafts when staff reply. A negative search proves only what it searched.
- **The schema already allows this.** `whatsapp_drafts.state` already includes `superseded` (`20260424001635_whatsapp_schema.sql`, about line 156) and `rejected_reason` is free text (`20260424022138_whatsapp_draft_reject_reason.sql`). Reasons already in use: `conversation_closed`, `newer_inbound`, `whatsapp_reenabled`.
- **"A draft was approved" does not mean a person approved it.** The agent's own auto-send calls `whatsapp-send` in draft mode with the shared internal secret (`whatsapp-agent/handler.ts`, about lines 1466 to 1484). The router passes `auth.userId` to draft mode (`handler.ts`, about lines 1346 to 1347), and it is undefined for internal calls and set for a signed-in staff member (`authorise`, about lines 298 to 337). Manual mode is not given the auth result at all (about line 1349), so an internal caller could in principle use it too. The reliable test for "staff sent this" is therefore a signed-in staff user, not the mode.
- **The database cannot tell who sent a message.** Every outbound message is stored with `role = 'assistant'`, whether it came from the AI, a staff compose box or a system template (comment above `recordOutbound`). A blanket "any outbound message supersedes drafts" trigger would therefore also fire on reminders and confirmations, and could discard a draft that is still relevant. The signal has to come from the sender.
- **The dashboard counts pending drafts.** `src/supabase/hooks/useWhatsAppSummary.ts` (about lines 18 and 169) counts `whatsapp_drafts` rows with `state = 'pending'`. The inbox draft card is amber while a draft is pending (`DraftPanel.jsx`). `useWhatsAppInbox.ts` subscribes to `whatsapp_drafts` changes in realtime (about lines 279 and 435).
- **Booking proposals are separate rows.** `whatsapp_booking_actions` has its own state and a nullable `draft_id`. The inbox withholds reply controls until staff resolve every action attached to the pending draft (`useWhatsAppInbox.ts`, about lines 130 to 136). The existing newer-inbound trigger supersedes drafts without touching their booking actions.
- **Auto-send is already tightly gated.** `canAutoSend` (`supabase/functions/_shared/agentRisk.ts`, about line 420) is called from the agent handler (about line 3377) with `AI_AUTO_SEND_LOW_RISK` (default off) and the per-conversation opt-in. The handler already forces `autoSendEligible = false` in one case where the model saw an older snapshot (about lines 3397 to 3402), which is the pattern to follow. Booking-touching intents never auto-send, and the gate tests enforce it.

Not known, and not assumed:

- Whether stale drafts have happened before. Step 0 is a snapshot of one moment, not a history.
- What an open inbox draft card does at the moment it becomes superseded. The realtime subscription suggests it disappears; a stale approve returns `draft is superseded, not pending` with status 409. Neither has been exercised.
- Whether any caller other than the inbox compose box and draft approval sends staff-initiated text through `whatsapp-send`. Step 1 begins by searching the callers.
- Whether anything reads the `raw` column of outbound messages in a way an added key could break (Step 1 searches the readers).

## Desired behaviour

- A staff-initiated text, sent successfully, supersedes older pending plain-reply drafts on the same conversation, with `rejected_reason = 'staff_replied'`. The dashboard count falls and the draft card goes away.
- Drafts created after the reply are untouched.
- The agent does not draft for, or auto-send to, a customer message that staff have already answered.
- A failed send changes nothing.
- AI sends, templates, reminders and confirmations never supersede drafts.
- Opt-out acknowledgement drafts are never superseded by this. Drafts with a pending attached booking action are left alone (owner decision, 21 October 2026).

## Scope

- `whatsapp-send` manual mode and draft mode: supersede on success.
- A marker on staff-sent outbound messages so the agent can recognise them without a migration.
- `whatsapp-agent`: do not draft or auto-send when staff already answered the triggering message.
- Deno tests for both, and a UI check of the superseded-draft experience.

## Non-goals

- Meta, webhooks, the WhatsApp Business app and coexistence. Nothing here subscribes or changes anything at Meta.
- Switching a chat to "Handled by staff" or changing the AI-mode toggle.
- Enabling auto-send, changing its gates or the kill switch, or loosening any opt-out rule.
- A migration, a new `staff` message role, or visual differences between staff and AI messages (a possible later change, noted in the existing `recordOutbound` comment).
- Changing the review-draft design in #921.

## Relevant code

- `supabase/functions/whatsapp-send/handler.ts`: `handleManualMode`, `handleDraftMode`, `recordOutbound`. Where staff-initiated sends are known.
- `supabase/functions/whatsapp-send/__tests__/optOut.test.ts`: the model for a new test file in the same folder.
- `supabase/functions/whatsapp-agent/handler.ts` (about lines 3340 to 3405): where drafting, risk classification and auto-send eligibility are decided.
- `supabase/functions/_shared/agentRisk.ts`: `canAutoSend`. Its unit tests are `src/lib/ai/agentRisk.test.ts` (Vitest, run by `npm run test`); handler-level dispatch behaviour is covered by `supabase/functions/whatsapp-agent/__tests__/dispatch.test.ts`.
- `supabase/functions/whatsapp-agent/handler.ts` (about lines 1466 to 1484): the auto-dispatch call that reaches `whatsapp-send` with the internal secret, which must never count as staff.
- `supabase/migrations/20260520240000_auto_supersede_stale_drafts.sql`: the precedent for superseding, and the exact update shape.
- `src/supabase/hooks/useWhatsAppInbox.ts`, `src/supabase/hooks/useWhatsAppSummary.ts`, `src/components/views/inbox/thread/DraftPanel.jsx`: what staff see.

## Architecture

The sender is the source of authority. `whatsapp-send` knows when it is sending staff-initiated text; the database and the agent cannot infer it.

- **What counts as staff-initiated:** a manual-mode or draft-mode send made by a signed-in staff member (`auth.userId` set). Manual mode must be passed the auth result for this. Any call made with the internal secret never counts, including the agent's auto-send, so the AI cannot supersede drafts or mark its own messages as staff.
- **On a successful staff-initiated send:** after Meta accepts the message and `recordOutbound` has run, one conditional update sets `state = 'superseded'`, `rejected_reason = 'staff_replied'`, `decided_at = now()` for drafts on that conversation that are `pending`, were created before the send time, are not opt-out acknowledgement drafts (`tool_calls->>opt_out_acknowledgement = 'true'`, the same test `whatsapp-send` already uses), and have no pending `whatsapp_booking_actions` row attached through `draft_id`. Doing this as a short select, a filter in code, and an update by id (guarded by `state = 'pending'`) avoids SQL null-comparison traps and is easy to test. Re-running changes nothing. A failure of this update is logged and does not fail the send, because the message has already gone.
- **Marking the message:** the outbound row's `raw` is Meta's response today. Staff sends add a top-level `sent_by: "staff"` next to Meta's keys, so code that reads `raw.messages[0].id` still works. No migration. Older rows have no marker, so only new replies are protected.
- **In the agent:** before the model is called for an inbound message, and again before auto-send eligibility is final, check whether an outbound message with `raw->>'sent_by' = 'staff'` exists after that inbound message. If so: skip drafting (first check) or set `autoSendEligible = false` and save the draft as already superseded (second check, for a reply that lands while the model is thinking). It only ever removes sends.
- Booking actions are not touched by superseding, matching the existing newer-inbound trigger.

## Data/database changes

None expected. `superseded` is a valid state and `rejected_reason` is free text. If review finds that a column or role value is needed, stop and revise this plan, because that would add a migration and the production-apply workflow.

## API changes

None to the Edge Function contract. Successful responses are unchanged. A stale approve already returns 409; its message becomes reachable more often.

## UI changes

Probably none. Verify, with a component test if behaviour is wrong: the draft card clears when its draft becomes superseded, and a stale approve shows a clear message rather than a generic failure.

## Security/privacy considerations

- Runs inside the existing staff-authenticated send paths with the existing service client. No new endpoint, secret or public surface.
- Only tightens behaviour: it can remove a pending draft and prevent a send, never create one.
- Logs carry conversation and draft ids and counts only, never message text or phone numbers.
- Negative controls to test: AI auto-send does not supersede; template mode does not supersede; an opt-out acknowledgement draft survives; a failed Meta send leaves drafts pending; a draft created after the reply survives; a supersede failure does not fail the send.

## Dependencies

- #921 changes the same area of `whatsapp-agent/handler.ts` and adds review-only drafts. Step 1 touches different files and can go first. Step 2 should follow or be coordinated with it.
- Step 0 needs separate approval.

## Risks

- **Over-superseding.** A draft that is still useful is discarded. Mitigation: only older plain-reply drafts, never opt-out acknowledgements, booking-action handling per Open question 1, and every superseded row keeps its text and a reason for audit.
- **Under-superseding.** Replies sent before the marker exists, or by a path that skips it, are not protected. Mitigation: search the callers first; the agent check only covers marked replies, so state this in the docs.
- **Race.** A draft saved a moment after the reply for the same customer message. Mitigation: the second agent check.
- **Conflict with #921.** Both edit the agent's draft handling. Mitigation: sequence and a small, isolated change.
- **Surprise for staff.** A draft they had open disappears. Mitigation: the UI check, and a line in staff guidance.

## Migration/rollout

No database change. Edge Functions deploy from `main`. Order:

1. Merge Step 1 (`whatsapp-send`), after review. Deploy is automatic.
2. Live test with a staff-owned number: send a message in, wait for a pending draft, reply from the inbox, confirm the draft is superseded and the dashboard count drops; then confirm an approved draft supersedes its siblings.
3. Step 2 (agent) later, with the same live test.

Rollback: revert the pull request. Superseded rows are harmless and identifiable by `rejected_reason = 'staff_replied'`; a staff member can still send any text they like. No flag is needed because the change only removes sends, but say so explicitly in the pull request.

## Implementation sequence

0. **Evidence (done, owner-approved, 21 October 2026, production project `nlzhllhkigmsvrzduefz`).** One read-only query, aggregates only, no message text, numbers or names: count of `pending` drafts, and of those how many have an outbound message sent after the draft was created, and how many of those are older than 24 hours.
   **Result:** 4 pending drafts in total; 0 with a later outbound message; 0 older than 24 hours with one. Limits: it is a snapshot of one moment; and "any later outbound message" is an upper bound for staff replies, because the database cannot tell a staff reply from a system message (every outbound row is `assistant`), so the true number could only be lower. Zero is therefore a real zero for today.
1. **`whatsapp-send`.** Search callers of manual and draft mode (including any internal-secret callers of manual mode) and readers of outbound `raw`. Pass the auth result into manual mode. Add the `sent_by` marker, then the supersede update after a successful send, only when a signed-in staff member made the call. Tests first, in a new file beside `optOut.test.ts`.
2. **Agent guard.** The two checks above, after #921's agent changes or coordinated with them. Tests alongside `dispatch.test.ts`; the existing gate tests must stay green.
3. **UI check.** Exercise the superseded-draft states; add a component test only if something is wrong.
4. **Docs and live test.** Update the documents below, run the live test, record the result here.

Steps 1 and 2 are separate pull requests with one writer each.

## Testing

- `deno test` in `whatsapp-send/__tests__/` and `whatsapp-agent/__tests__/`, run by the `agent-tests` CI job.
- Step 1 cases: a staff manual send supersedes older pending drafts; a draft created after the send survives; a staff approval supersedes its older siblings but not itself; an internal-secret draft send (the agent's auto-send) supersedes nothing and is not marked as staff; an internal-secret manual send does the same; an opt-out acknowledgement draft survives; a failed Meta send changes nothing; a supersede failure still returns success; a repeat call is a no-op; template mode does not supersede.
- Step 2 cases: staff already replied, so no model call and no draft; staff reply during the model call, so the draft is saved superseded and not auto-sent; no staff reply, so behaviour is unchanged. The gate tests in `src/lib/ai/agentRisk.test.ts` must stay green and unchanged.
- `npm run check:edge-types`, `npm run lint`, `npm run check:docs`, `npm run typecheck`, `npm run test`, `npm run build`.
- Not coverable in tests: real Meta delivery. Covered by the live test.

## Observability

- Evidence it works: drafts with `rejected_reason = 'staff_replied'` appear after live replies, and the dashboard pending count falls.
- Regression signals: a customer receiving two replies close together; staff reporting a missing draft; a rise in stale-approve 409s.
- Reconciliation: superseded drafts keep their text, so a wrongly superseded draft can be read back.
- Log ids and counts only.

## Documentation updates

- `docs/whatsapp-agent.md`: a staff reply supersedes older pending drafts and blocks auto-send, and only marked replies count.
- Staff guidance: what happens to an open draft when a colleague replies.
- This plan: record Step 0 (if run) and the live-test result; move to `completed/` when verified.

## Definition of done

- A live test shows a pending draft superseded by an inbox reply, a draft approval superseding its siblings, and the dashboard count dropping.
- An AI send, a template and a failed send leave drafts untouched.
- No customer receives two replies because of a stale draft in the live test.
- Handler and agent tests pass, including the negative controls; full CI is green.
- Documentation updated; any `deno.lock` or generated-type drift kept out of the feature commit.

## Open questions

Decided by the owner on 21 October 2026:

1. A draft with a pending attached booking action is left alone when staff reply, so a staff reply never quietly changes what staff still have to resolve.
2. A staff member approving one draft also supersedes that conversation's other older pending drafts (never for the agent's own auto-send).
3. When staff already answered, the agent skips the model call entirely and logs the event id.
4. The Step 0 count was wanted before building. It was run (result under Implementation sequence).
5. Sequencing: land the `whatsapp-send` change first and the agent change after #921, or coordinated with it.
6. The marker is a `sent_by` key in `raw` now (no migration), not a `staff` message role.

The owner also accepted this plan and asked for Step 1 to be built on a separate branch. That instruction was given before the Step 0 result was known.

**Priority (decided by the owner, 21 October 2026): pause.** The count came back at zero, and Step 1 changes `whatsapp-send`, the function every customer message goes through, for no measured benefit today. The owner chose to pause rather than build Step 1 anyway or close the issue. Nothing has been built, and no code branch exists.

Resume when any of these happens:

- #921's review-draft path ships, or is enabled, so pending drafts for known customers become common.
- Auto-send or autonomous booking is being considered for switching on.
- A real double reply, or a stale draft that staff approved after a colleague had already answered, is reported.
- The owner asks.

On resuming: re-run the Step 0 count first (it is cheap and read-only, and needs fresh approval), then start at Step 1. The answers above still stand unless the owner changes them.
