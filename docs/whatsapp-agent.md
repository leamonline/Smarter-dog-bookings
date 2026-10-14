# WhatsApp AI receptionist

The `whatsapp-agent` Edge Function is the brain of the WhatsApp inbox. It
calls Claude with the full conversation context (recent messages, customer +
dogs, availability windows, persisted agent state) to classify intent/risk and
draft a reply. It never sends to the customer directly and never mutates a
booking — both go through guarded paths (`whatsapp-send` and the
`apply_whatsapp_booking_action` RPC).

## Staff approval integrity

Once the staff inbox has loaded an attached pending booking proposal, its AI
draft no longer exposes send controls. Staff must add or reject every attached
proposal in the booking panel, check the diary, and only then return to review
and send the reply.

This is a temporary integrity guard. The previous **Approve & Apply** control
performed the database write and customer send as two sequential client
requests, so a later failure could leave the diary and the customer message
disagreeing. A future server-owned, idempotent command may restore a combined
action only when both outcomes and retries have one authoritative contract.

**Known-customer drafting is on demand by default.** The default-off `AI_KNOWN_CUSTOMER_REVIEW_DRAFTS` flag allows a known customer's `booking_propose` message in `ai_handling` to create a held staff-review draft. Human only, changes, cancellations and other intents stay on demand. Unknown-customer onboarding and staff Generate reply retain their existing contracts.

An automatic review draft writes no learned state, customer records or booking actions and sends no confirmation buttons or reply. Existing book-entry handling runs first: accepted or uncertain attempts stop; a validated pre-send refusal can fall through to an eligible review draft. Generic 502/network failures are uncertain, never automatic retry permission. Draft creation does not require the durable AI send switch to be enabled. Existing send gates still govern any later AI send.

## Function secrets

Set with `supabase secrets set NAME=value`. **Never** put these in
`.env.local`.

| Variable | Default | What it does |
|---|---|---|
| `ANTHROPIC_API_KEY` | _required_ | Claude API key. Server-side only — never put behind a `VITE_` prefix. |
| `CLAUDE_MODEL` | `claude-sonnet-4-6` | Model used by the agent. |
| `AGENT_CALLBACK_SECRET` | _required_ | Shared secret between the `whatsapp_events` pg_net trigger and the function. |
| `AI_KNOWN_CUSTOMER_REVIEW_DRAFTS` | `false` | Opt-in review-only drafts for known customers in `ai_handling` with new-booking intent. No automatic sending, state corrections or booking-action staging. |
| `AI_ASSISTANT_ENABLED` | `true` | Kill switch. Set to `false` to bypass Claude entirely; the agent writes a brand-voiced "I'll get someone to look at this" fallback draft tagged for handoff. Useful during incidents. |
| `AI_AUTO_SEND_LOW_RISK` | `false` | Global gate for auto-send. Even when `true`, all the per-draft gates below must also pass. |
| `WHATSAPP_SEND_URL` | `${SUPABASE_URL}/functions/v1/whatsapp-send` | Where the agent posts approved-for-auto-send drafts. Override only if you've moved the function. |
| `SEND_INTERNAL_SECRET` | _required for auto-send_ | Used by the agent to authenticate against `whatsapp-send` for auto-dispatch. Same value `whatsapp-send` already expects. |
| `META_ACCESS_TOKEN` | _optional for media_ | Also read by the agent (and `whatsapp-media`) to download inbound photos/stickers from the Graph API at ingest. When unset, media messages still ingest — the inbox just shows the "📷 Photo" chip instead of the picture. |

## Inbound photos & stickers

Meta's webhook delivers only a *media id* for an attachment; the bytes stay on
the Graph API for ~30 days. At ingest the agent downloads images and stickers
(`_shared/whatsappMedia.ts`) into the private `whatsapp-media` Storage bucket
and stamps `whatsapp_messages.media_path` / `media_mime`; the staff thread
then renders the photo inline via a staff-only signed URL, with any caption as
the message text. The download is strictly best-effort — a failure never
blocks ingestion or drafting. To backfill or retry (e.g. a message that
predates this pipeline, while its media id is still alive on Meta), POST
`{ "message_id": "<uuid>" }` to the `whatsapp-media` function authenticated
with the webhook Bearer secret (`get_webhook_secret()` from SQL) or
`x-internal-secret`. Video, voice notes and documents are not downloaded
(chip only) — extend `extractInboundMedia` if that changes.

## Intent vocabulary

Stored on `whatsapp_drafts.intent` (CHECK-constrained to exactly
these values). Documented in
[supabase/functions/_shared/agentRisk.ts](../supabase/functions/_shared/agentRisk.ts).

| Internal intent | What it means |
|---|---|
| `greeting` | "Hi", "Hey there", new-customer enquiry |
| `smalltalk` | Thanks, "on my way", chit-chat |
| `faq` | Prices, opening hours, walk-in services, payment methods |
| `booking_query` | "Are you free Tuesday?" (no specific time yet) |
| `booking_propose` | "Can I book Bella for Tuesday at 09:00?" |
| `booking_confirm` | Customer confirming a held slot |
| `booking_change` | Reschedule request |
| `booking_cancel` | Cancellation |
| `confirm_time` | "Confirming I'll be there at 11" |
| `escalate` | Medical, complaint, anything ambiguous |
| `other` | Couldn't classify |

The brief / external docs use an UPPERCASE vocabulary
(`BOOKING_REQUEST`, `HEALTH_OR_MEDICAL`, etc.) that maps via
`INTENT_ALIAS` to the internal set.

## Risk levels

| Risk | When | Behaviour |
|---|---|---|
| `low` | Routine FAQ, greeting, smalltalk, confirm_time | Eligible for auto-send when policy allows |
| `medium` | Booking proposals, reschedules, cancellations, unknown intents | Staff approves before sending |
| `high` | Medical / complaint keywords, escalate intent, very-low-confidence | Always requires a human; the inbox shows a red dot |

Medical / complaint keywords (`agentRisk.ts:MEDICAL_KEYWORDS`,
`COMPLAINT_KEYWORDS`) override the intent-based risk — a "greeting"
that mentions a wound is `high`, not `low`.

### Booking-page trouble

A customer saying the website or app has failed them ("it won't let me log
in", "your website isn't working", "it's asking me to contact you about his
size") is matched by `agentRisk.ts:isPortalTrouble`. Without it, such a message
read as a booking request and got the tap-to-book prompt followed by the
portal link, sending the customer straight back to what had just failed. Now
the agent skips that prompt, saves a no-link `portal_trouble` reply as a
pending draft with `handoff_required=true`, and stops. It never auto-sends,
and it writes nothing once staff have set the thread to Human only. When staff
ask for a generated reply on such a message, the prompt drops both portal-link
instructions and tells the model to offer to book it in WhatsApp. That prompt
block is part of `WHATSAPP_REPLY_PROMPT_VERSION = 2026-10-07.portal-trouble-1`;
see the [evaluation record](../prompts/evals/2026-10-07-whatsapp-portal-trouble.md).
The patterns are taken from real customer messages and were checked against
the full inbound history (17 matches, no false positives) before release.

### Messages that need a person, not a script

The 12 October 2026 inbox review found four kinds of message the heuristic
answered with the wrong script, because it only knew booking words. Each now
has a detector in `agentRisk.ts`, built from the shape of what customers sent
(synthetic wording in the tests; no customer text in the repository):

| Message | Was | Now |
|---|---|---|
| "I'm at the salon and it's closed" | Tap-to-book prompt (the word "appointment") | `isServiceRecovery` → escalate; no-link `service_recovery` draft while the AI handles the thread; staff to-do `arrived_salon_closed` in every state |
| "I already messaged about moving her" | The automated 24-hour cutoff reply, a second time | `isChasing` → escalate; `handoff` draft while the AI handles the thread; staff to-do `chasing_reply` |
| "If you have a cancellation, can you squeeze her in?" | Read as a cancel attempt: "I can't see any upcoming grooms" | `isCancellationSpaceRequest` → `booking_query`; left for staff, who see it as an unanswered request |
| "Do you do weekends / after 5pm?" | Tap-to-book prompt | `isOutOfHoursRequest` → `faq`; a person explains the hours |
| "Can I book him for a groom and nail trim?" | Walk-in FAQ (the word "nail"), so no draft at all | The walk-in short-circuit yields when a groom-type service word is present |

`humanNeededKind` combines the first two and runs in the agent **before** the
manage-booking and booking-entry paths, which is the point: those paths act on
the booking words such a message contains. It sends nothing to the customer
and never auto-sends. The to-do is raised with `reply: "none"`, so its wording
says the customer is still waiting rather than claiming a reply went out.
Known customers only; an unknown number still takes the onboarding pass, where
Claude's own prompt escalates complaints.

Separately, the turned-away-demand report (2F) now groups reason codes into
capacity, account restriction and calendar/policy (`DENIAL_REASON_GROUP` in
`src/engine/denials.ts`) and leads with the capacity count, so a customer the
salon has deliberately blocked from a time no longer reads as lost capacity.

### Dead ends raise a staff to-do

Some automated paths cannot finish what the customer asked: a cancel or move
inside the 24-hour window (or after the groom has started), a manage menu or
a tap-to-confirm that timed out, a booking that changed while the customer was
choosing, or a reschedule the booking form had to refuse. Each one now tells
the customer the team will sort it with them in WhatsApp. Each one also adds
a to-do through `_shared/staffFollowUp.ts:raiseFollowUpTodo`, so that promise
appears on the staff dashboard rather than only in the inbox thread.

- **Kind:** the to-do is `general`, so staff tick it off like any other task.
- **Duplicates:** one open follow-up per customer per 12 hours, so repeated
  taps on an expired button leave one task.
- **Content:** the customer's name and what happened, never their message text.
  It says "we replied" only when our reply was accepted for sending, and
  otherwise tells staff to contact the customer directly. It never claims the
  customer received anything.
- **Failures:** best effort. A failed write is logged and never affects the
  reply the customer already received.

## Auto-send allowlist

A draft only auto-sends when **all** of these are true:

1. `AI_AUTO_SEND_LOW_RISK=true` on the function (global kill switch).
2. The conversation row has `auto_send_enabled=true` (per-customer opt-in).
3. The draft's `risk_level` is `low`.
4. The draft does not require handoff (`handoff_required=false`).
5. The draft's intent is in `AUTO_SENDABLE_INTENTS`:
   `faq`, `greeting`, `smalltalk`, `confirm_time`.

Booking-touching intents (`booking_propose`,
`booking_change`, `booking_cancel`, etc.) are **never** auto-sent
regardless of opt-in. The list is locked down by a unit test
(`src/lib/ai/agentRisk.test.ts`).

Two further gates sit inside `whatsapp-send` itself and apply to every
AI-initiated send that passes the five above:

6. `ai_whatsapp_settings.enabled` (Settings → AI Messaging, the durable
   master switch for AI sends) must be `true`.
7. `humans.ai_whatsapp_allowed` must be `true` for the customer.

## Customer opt-out

A WhatsApp opt-out belongs to the **number**. The contract (#990, #1016):

**Where it is stored.** A STOP is stored in two places, and both are read
back before the agent reports the event processed. The agent records it
**before** it stores the inbound message, and retries twice on a transient
error. If it still cannot be stored or confirmed, the event fails and shows
as an agent failure, with nothing half-done: the inbound message has not been
de-duplicated yet, so resetting the event to `pending` replays it in full.
- `whatsapp_conversations.whatsapp_opted_out_at` holds the number's own
  suppression. It is the whole suppression for a number with no customer
  record, and a repeat STOP keeps the first time.
- `humans.whatsapp_opted_out` is set (reason `asked_on_whatsapp`) on **every**
  customer record whose phone is that number, including one the conversation
  never linked because its phone is stored formatted. It is **never** set
  through the conversation's `human_id` link alone. Staff may have changed
  that customer's number since, and a STOP from the old number must not
  silence the new one. The old number stays refused through its conversation
  whatever it is linked to.

Migration `20261014120000_whatsapp_number_opt_out` keeps the two in step in
the database, always by number:
- a record created with, or changed to, a stopped number is flagged as it is
  written;
- a STOP and a customer write on the same number in flight together are
  serialised by an advisory lock on the number, so neither misses the other.
  The lock can also meet `merge_humans` or a phone edit in the opposite order;
  PostgreSQL then aborts one side as a deadlock. Nothing is lost: the agent
  retries the STOP, and the merge or edit fails back to staff to retry.

**Switching it back on.** A STOP is never undone by an ordinary edit, and
never automatically:
- A customer who said STOP stays opted out if staff change their number.
- Refused (`P0001`, detail `whatsapp_reenable_needs_permission`):
  unticking `humans.whatsapp_opted_out` when the opt-out came from a STOP or
  the record's old or new number is still stopped (an untick hidden in a save
  that also changes the number included); relabelling a STOP's reason;
  clearing `whatsapp_conversations.whatsapp_opted_out_at` directly; and
  moving a stopped conversation to another number or channel. An opt-out
  staff set for another reason, on a number that never said STOP, can still
  be unticked.
- A record already opted out for another reason is marked as a STOP (keeping
  its own time) when its number says STOP, so a later number change cannot
  hide the STOP.
- The one way back is `staff_reenable_whatsapp_number(phone, human_ids,
  last_stop_at, permission_note)`, staff only. Staff first read
  `staff_whatsapp_number_opt_out_scope(phone)`: when the number first and
  last said STOP (`whatsapp_last_stop_at` records repeats) and every
  opted-out record on it, with each record's reason. The re-enable must name
  **exactly** those records, whatever their reasons, and the latest STOP it
  showed, so a STOP sent after staff looked is never cleared unseen; and record how
  the customer gave permission again (at least ten characters). It locks the
  number's conversations and every customer record on the number before it
  reads the scope, so an opt-out in flight is waited for. If anyone was
  flagged since staff read the scope, nothing changes (`reenable_scope_changed`).
  All or nothing per number, so `whatsapp-send` (which folds every record) and
  the Twilio paths (which read one record) never disagree.
- Each re-enable is audited in `whatsapp_opt_out_reenables`: the number, the
  records and conversations it switched back on, who did it and the
  permission note. Staff can read it; only the function writes it.
- A redelivered STOP, or an event replayed after it was stored, does not stop
  the number again over a re-enable made since.

There is no staff screen for this yet. Until there is, the functions are
called with a member of staff's session; they refuse every other caller.

Numbers are matched however they were typed ("07700 900123",
`+44 (0)7700 900 123`, "+33 6 12 34 56 78"). In code this is `phoneMatchKey`
in `_shared/optOut.ts`; in SQL it is `public.whatsapp_phone_key`, pinned to
the same cases.

**Where it is enforced.** Every WhatsApp send path checks it:
- `whatsapp-send`, in every mode (draft, manual, template, confirm_buttons,
  flow, book_entry, list) and for every caller (inbox, agent, reminders,
  confirmations, broadcast, apply-customer-confirm). It refuses with
  `409 whatsapp_opted_out` if the number's conversation is suppressed or
  **any** customer record found by `human_id`, through the conversation, or by
  the destination phone has opted out. A failed lookup refuses with a retryable
  `503 opt_out_check_failed` instead of sending unchecked.
- The notify functions that send WhatsApp through Twilio (booking ready,
  booking cancelled) never reach `whatsapp-send`. They choose a channel with
  `_shared/recipients.ts`, which never picks WhatsApp for an opted-out
  customer. That is why the database keeps `humans.whatsapp_opted_out` in step
  with the number.

**The one exception.** When the AI is handling the thread, the agent leaves
staff one acknowledgement draft for the STOP (`fallbackReplyForIntent("opt_out")`,
marked `tool_calls.opt_out_acknowledgement`).
- Only a signed-in member of staff pressing Send on that stored draft,
  **unedited**, may send it. The marker is read from the stored draft, never
  from the request.
- `whatsapp-send` refuses it with different text from the stored draft, or
  from an AI or internal call, and refuses every other draft or manual reply.
  (Staff can still change the stored draft row itself; that is no wider than
  the staff override below.)
- The unique index `whatsapp_drafts_one_pending_opt_out_ack` allows one
  pending acknowledgement per conversation, so a repeated or concurrent STOP
  cannot queue a second. The agent treats the refusal as expected.
- Separately, staff may pass `override_opt_out: true` for the rare operational
  message a customer must still receive. It is ignored for AI-initiated sends
  and internal-secret calls.

**Recognising a STOP.** The detector is deliberately narrow, because a false
positive silences the number until staff re-enable it. The message is split
into clauses (at `. ! ? , ;`, line breaks and dashes) and each clause is tested
on its own. Most patterns must reach the **end** of the clause, allowing only
politeness after them ("please", "thanks", "any more"). Each line below counts
as a STOP:
- The carrier words as a whole first or last clause: `STOP`, `STOP ALL`,
  "Stop promotions" (Meta's marketing button), `unsubscribe`, `opt out`,
  "stop please", "leave me alone". So "No thanks, stop" and "Stop. Wrong
  person." count, and emoji are ignored.
- Requests aimed at our messages: "please stop all messages", "stop
  messaging", "please stop sending messages", "how do I stop these
  messages?", "why won't you stop messaging me?", "don't ever message me
  again", "can you not message me any more", "don't send me any more
  messages", "please do not send any more messages", "I don't want you to
  message me anymore", "I don't want any more messages", "I no longer want to receive
  messages", "no more messages please", "take me off your list". Curly
  apostrophes count.

Each of these must not count, and is tested:
- Negated requests: "please don't stop messaging me", "please do not
  unsubscribe me", "don't opt me out". Only filler words ("want", "you",
  "to", "please"…) may sit between the negation and the verb, so "I don't
  use WhatsApp much, please stop messaging me" is still a stop.
- Questions about a stop: "why did you stop messaging me?", "have you stopped
  sending reminders?".
- A stop aimed at something narrower, which staff should read instead: "stop
  texting me at 6am", "please stop sending me reminders for Max, he passed
  away", "stop messaging me at work, text my husband instead". A clause
  followed by one that only qualifies it is not a stop either: "please don't
  message me, until Bella is ready".
- Salon phrases that share the words: "opt me out of the nail clip",
  "unsubscribe me from the waiting list", "don't message me before 9", "I
  don't want messages before 9".
- Reports about messages: "I received the reminder but no more messages came
  through".

**Ordering.** One webhook can carry several messages, across several entries
or changes. They are handled as one batch, and a STOP anywhere in it is
handled first, so no earlier message is answered after it. The
inbox preview still shows the batch's newest message. A message already
stored (a redelivery) is skipped without dropping the newer messages after
it; the event is marked `ignored` only when every message was already stored. A staff re-generate
(`force_draft`) never acts on a STOP.

In the inbox, a refused send shows its reason ("This customer has opted out of
WhatsApp messages"), not a generic error.

## Kill switch

Two ways to stop the AI mid-incident:

1. **Function-level** — `supabase secrets set AI_ASSISTANT_ENABLED=false`.
   The agent stops calling Claude and writes a brand-voiced handoff
   draft for every inbound. Drafts still queue for staff review.
2. **Per-conversation** — staff hit "Take over" on a single thread,
   which sets `whatsapp_conversations.state='human_takeover'`.
   The agent stops drafting for that thread only.

## Safe rollout for auto-send

When you're ready (a few weeks of monitoring drafts is the floor):

1. Set `AI_AUTO_SEND_LOW_RISK=true` on the function.
2. Pick a single trusted conversation in the inbox and flip its
   "Auto-send off" toggle to on
   (column: `whatsapp_conversations.auto_send_enabled`). The toggle
   prompts for confirmation before turning auto-send on; turning it
   off is one click.
3. Watch the drafts panel. Drafts that auto-send transition to
   state `auto_sent` and skip the approval step.
4. Roll out to more conversations over time.

`auto_send_enabled` defaults to `false` at the column level
(set in migration `20260424001635_whatsapp_schema.sql`, re-asserted
in `20260513130000_whatsapp_auto_send_default_off.sql`). The inbox
UI reads its initial state from the row — never defaulting to on
in the component.

## Booking → WhatsApp link

When `apply_whatsapp_booking_action` inserts a booking, it
populates `bookings.whatsapp_conversation_id` and
`bookings.whatsapp_message_id` so the booking detail modal can
render a "Created from WhatsApp · open thread" link. The inbox
thread renders the inverse: inline "Booking created" cards at
`applied_at`, sorted into the message timeline. See migration
`20260513140000_link_bookings_to_whatsapp.sql`.

## Staff unanswered-request waiting time

The inbox shows elapsed salon working time for open conversations whose latest customer text looks like a request and has no later outbound reply. Pending drafts do not clear the waiting label; failed sends remain waiting. Marking a conversation Done is explicit resolution. This is heuristic triage, not proof that a customer was ignored or that an outbound message was delivered.

Working time uses Europe/London, 08:30–15:00, normal Monday–Wednesday opening, diary opening exceptions, enabled holiday closures and partial-day closures. It uses the current schedule, not historical opening snapshots. Schedule reads refresh every minute and on focus. If required reads fail or the request predates the bounded one-year schedule window, the row says "Waiting time unavailable". No response-time threshold or automatic alert is enabled in this slice.

## Reply prompt and context revision

`WHATSAPP_REPLY_PROMPT_VERSION = 2026-10-01.1` is recorded in each new draft's `tool_calls.prompt_version`, alongside `review_only`. Historical drafts are not relabelled. Date-relative context is Europe/London, including tomorrow and all date-window endpoints. Upcoming appointments use the configured `booking_horizon_days` (validated range 1–730; context fallback 180), exclude Cancelled, show status and cap at 40 rendered records with an explicit omission notice. A failed lookup is not reported as no appointments.

The Availability block includes explicit diary opening/closure exceptions. An open exception is not free capacity. Missing dates remain unverified. Static Monday–Wednesday/Thursday refusals, including the walk-in weekday wording, are removed; brand-voice sections are unchanged. Review-draft enablement and production promotion remain separate release decisions. Synthetic server-contract tests do not establish model reply quality; see [the evaluation record](../prompts/evals/2026-10-01-whatsapp-review-drafts.md).
