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

**A staff reply supersedes the drafts it answers (#1063).** When a signed-in
member of staff sends text from the inbox, by the compose box or by approving
a draft, and Meta accepts it, `whatsapp-send` supersedes that conversation's
older pending drafts (`rejected_reason = 'staff_replied'`), so nobody approves
a second, overlapping reply later. The draft just approved, STOP
acknowledgement drafts, drafts with a pending booking action attached and
drafts written after the reply are left alone. Only a signed-in staff member
counts: the agent's own sends and `apply-customer-confirm` use the internal
secret and never supersede, and templates and failed sends never do. A failure
to supersede is logged and never fails the send. The staff reply's outbound row
carries `sent_by: "staff"` beside Meta's keys in `raw`, the only way to tell it
from an AI or system message (all are `role = 'assistant'`). The agent does not
read that marker yet: blocking its drafting and auto-send for a message staff
already answered is Step 2 of the plan, sequenced after #921.

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
Trouble that is described rather than named ("struggling with your app",
"having problems booking online", "need help with the app") was added in
October 2026 after such a message went unanswered; the booking-page word must
follow closely and be pointed at ("the/your/this app") or be "online", so
everyday struggles ("struggling with his skin") keep their normal route.

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

### An unanswered request for a person carries forward

Every new inbound message supersedes the conversation's pending drafts
(trigger `supersede_drafts_on_new_inbound`), and a known customer's ordinary
follow-up writes no draft of its own. So a handoff draft (**I need help**,
**Not me**, a medical question) used to vanish the moment the customer wrote
again, and the thread no longer showed that anyone needed a person. Now
`openHandoffState` reads the newest draft once the message is stored. The
request is open when that draft is a handoff (not a STOP acknowledgement)
created within the last 14 days that is either still pending, or superseded
only by `newer_inbound` with no staff reply (`raw.sent_by = 'staff'`) since the
request's own message arrived (a reply sent while its draft was still being
saved counts).
The 14-day limit matters: staff replies sent before that marker existed (#1063,
21 October 2026) carry none, and on rollout six older threads would otherwise
have looked unanswered.

While it is open, every route that would end without a draft calls
`keepHandoff`:

- **Text** (right after `humanNeededKind`): a fresh `escalate` handoff draft
  (reason `carried_handoff`), and no tap-to-book prompt or manage picker. A
  message describing booking-page trouble gets the no-link `portal_trouble`
  text instead.
- **Button taps** (Yes/No booking confirm, **Book my dogs**, a reminder's
  **Confirm**): the tap does what the customer chose, then the handoff draft is
  carried as well.
- **A still-pending handoff** (an overlapping message's carried draft): nothing
  is added and no script is sent.
- **A lookup that fails** fails closed: a handoff draft is saved and no script
  is sent, because the message may already have hidden the only pending one.
- **A replayed event** (its inbound row already stored) resumes the carry, so a
  carried draft that failed to save is written on retry. A redelivery after
  success finds it pending and adds nothing.
- **Two messages handled at once** can both save a carried draft
  (`tool_calls.carried_handoff`). Each handler then keeps only the newest
  pending one and supersedes the rest (`duplicate_carry`), so they converge on
  one. A unique index would need a hand-applied migration.
- **Unknown numbers** are covered too: booking-page trouble and an unmatched
  **Book my dogs** leave them a handoff, and the onboarding pass waits until a
  person has answered.

Staff sending, rejecting or answering the draft ends the chain. Only while the
AI is handling the thread.

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
  be unticked, unless the record is linked (`whatsapp_conversations.human_id`)
  to a WhatsApp conversation that is stopped now.
- That link refusal (migration `20261016120000`) is refusal only: a link
  never flags a record. A stale link (staff changed the customer's number
  since) still holds the untick back; staff re-enable that conversation's
  number through the audited flow below, after which the record's own opt-out
  can be unticked.
- A merge (`merge_humans`) keeps a STOP label from either record: the winner
  ends opted out, reason `asked_on_whatsapp`, with the earliest STOP time.
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
  the number again over a re-enable made since. The agent applies a STOP
  through `apply_whatsapp_stop` (service role only), which records the Meta
  message id in `whatsapp_stop_applications` in the same transaction as the
  stamp, so a replay never applies the same message's STOP twice, even when
  the inbound row failed to store. A message with no Meta id applies every
  time. `inboundAlreadyStored` still guards messages stored before that
  migration, which have no marker. A replayed STOP queues no new
  acknowledgement.
- A re-enable supersedes any pending STOP acknowledgement draft on the
  re-enabled conversations, in the same transaction (a trigger on the
  conversation's update), so no stale acknowledgement is left in the queue.

**Switching it back on in the app.** Staff reach the re-enable from two
places, and nowhere else: there is no ordinary untick.
- The customer profile leads with a notice when WhatsApp is switched off
  (rose for a STOP, slate for any other reason), with **Switch WhatsApp back
  on…**. The header carries a "WhatsApp stopped" / "WhatsApp off" badge, and
  the "WA" wa.me link is hidden while it is off.
- The inbox thread shows a banner in place of the 24-hour banner when sends
  in the chat are refused, with the same button. It is keyed on the chat’s
  own number, so it also covers a number with no customer record. A linked
  customer switched off under a different number gets "Open {name}’s
  profile" instead, since this number’s re-enable cannot reach them. The
  Booking Desk shows the banner without buttons.

The dialog (`ReenableWhatsAppDialog`, state in `useWhatsappNumberReenable`)
reads the scope when it opens and lists the number’s first and latest STOP
and every switched-off record on it, with each record’s reason, before the
form. Staff write how and when the customer gave permission again (at least
10 characters); the note is sent trimmed, verbatim, never prefixed or
composed. The request carries exactly the scope’s records and the scope’s
latest STOP as the server’s own string (`whatsappOptOutRepo` takes the scope
object, so a subset or a reformatted time cannot be sent). Nothing is ever
retried automatically:
- If the scope changed since staff looked (`reenable_scope_changed`), or
  another write held the number’s lock (`40P01`, `55P03`, `40001`,
  `57014`), the dialog reads the scope again, shows what changed, and waits
  for staff to confirm again.
- If the number said STOP again since, the note is cleared too: the
  permission it recorded predates that STOP. In the inbox, a newer STOP on
  the live conversation row holds the button until staff reload. A STOP no
  later than one the dialog has shown is not newer, even once a re-enable
  has cleared it and the row has not caught up.
- If the connection drops, the outcome is unknown, so the dialog reads the
  scope and the audit to find out whether it went through, and says so
  either way. If either read fails, confirm stays held, and **Check again**
  repeats the same check against the scope staff were shown.
- The dialog stays on the number it opened with. If the profile’s number
  changes underneath it, or the profile’s own record is no longer switched
  off on the number, it says the profile is out of date and holds confirm
  until staff refresh (in the inbox, if the chat’s number changes, it says
  so and holds confirm too). If Confirm had focus, focus moves to that line.
  Not when an outcome has found that record proven back on, or no longer on
  file: the dialog has said so already, so nothing is held for it.

**Outcomes come from the audit log, never from absence.** A record also
leaves a number’s scope when its phone changes while it stays opted out:
nothing but the re-enable ever clears an opt-out. And an audit row shows a
re-enable that happened, not the record’s state now: it can have been
switched off again since (the number said STOP again) and then moved. So
whenever a re-read has lost records (or a request’s outcome is in doubt),
the dialog reads, through `whatsappOptOutRepo`:
1. `whatsapp_opt_out_reenables` for the scope’s own `phone_key` (the
   server’s, never one worked out in the browser) **and** for any row whose
   `human_ids` overlap the scope’s records, whatever number it was for (a
   record whose phone changed can be switched back on under its new number),
   with the signed-in user;
2. then `humans.whatsapp_opted_out` for each record that left, as it is now.

`attributeCleared` (`src/engine/whatsappReenable.ts`) then decides:
- A record is reported back on only if a row proves it was switched back on
  **and** it reads as on now. A row proves it if it lists the record and is
  strictly later, to the microsecond, than the record’s switch-off time
  (`humans.whatsapp_opted_out_at`, when recorded) and the latest STOP staff
  were shown. Only those records reach the host’s cache.
- **Our own request** is the row written by the signed-in member of staff,
  with the note this dialog sent, for exactly the records that request sent
  (the function refuses any other set) and later than every switch-off and
  STOP in it. That holds for a legacy record with no switch-off time too.
  Found after a dropped connection, it is treated exactly as a successful
  submit, but only when the re-read finds nothing switched off on the
  number: if anything is switched off there now (another record moved onto
  it, still opted out, say), the dialog says “Your change went through, but
  this number has changed since…” and shows the latest, and only the records
  proven back on reach the cache. A dropped request can land late, even
  after the dialog said it did not: a later refusal that finds our row
  reports it as ours, never as someone else’s. If our row is there but the
  number has said STOP again since, the dialog says “Your change went
  through, but this number said STOP again on {time}. WhatsApp is off
  again.” rather than “nothing was switched on”.
- A plain scope read does not wait for a re-enable still holding its locks,
  so it can be served just before our request commits while the audit read
  after it sees our row. When the scope still shows, no later than our row,
  something our row switched back on, it is read once more before anything
  is said (`scopePredatesRow`).
- Proven by any other row: “WhatsApp has already been switched back on for
  this number.” Neutral on purpose; who did it is in the audit, never guessed.
- **A record that left and reads as switched off now** is switched off
  wherever it is. The dialog names it (“Sarah Jones isn’t switched off on
  this number any more, but WhatsApp is switched off for them now. Their
  number may have changed — open their profile to check.”, with an **Open …
  profile** button; an unnamed one is “An unnamed record”), reports nothing
  for it, and the profile keeps its notice, badge and hidden WA link. It
  never says “still”: a row can show the record was switched back on (even
  by this request) and off again since. On that record’s own profile the
  out-of-date line says it instead, and the notice drops its “then confirm”
  while confirm is held (or while a newer STOP on the live list holds it).
  In the inbox, a linked customer the chat shows saved with another number
  is named only on its own “linked to this chat” line, which stays in an
  already-on outcome too (sends in the chat are still refused for them, so
  it never says there is nothing left to do). Any records still on the
  number are shown as the new scope.
- **A record the state read does not return** no longer exists (merged into
  another record, or deleted). It is named as such (“Sarah J isn’t on file
  any more — merged into another record, or deleted.”), with no profile
  button, and reported nothing for; on its own profile too, where it is
  never called out of date.
- A record that left with no row proving it back on, and that does not read
  as switched off either, is named as unconfirmed (“…but we can’t confirm
  WhatsApp was switched back on for them…”) and reported nothing for.
- If the audit, the signed-in user or the records cannot be read, nothing is
  reported: the dialog keeps what staff were shown and holds confirm behind
  **Check again**.

On sample data (`npm run dev`) the notice, badge and banner render from the
fixtures, but the dialog only explains that switching back on needs the live
database. Try the live flow on staging, never production: a test re-enable
changes a real customer’s consent and writes a permanent audit row.

Switching back on does not switch auto-send back on: the assistant stays on
drafts for staff to approve. A pending STOP acknowledgement draft is left in
the chat for staff to reject, since it tells the customer messages have
stopped; the dialog says so.

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
  from the request, and the stored text must still be the agent's own words:
  staff can update a draft row, so a row with the marker and other text is
  not the acknowledgement.
- `whatsapp-send` refuses it with different text, or from an AI or internal
  call, and refuses every other draft or manual reply.
- It may go only while a STOP stands, because it tells the customer their
  messages have stopped. Once the re-enable lifts the STOP, or when the
  number's opt-out was never a STOP, sending the acknowledgement's own words
  (unedited, or retyped in the editor) is refused for every caller with
  `409 stop_acknowledgement_stale`; staff reject the leftover draft. A
  genuinely edited reply is an ordinary message: refused while the number
  is stopped, sent once it is opted in.
- The unique index `whatsapp_drafts_one_pending_opt_out_ack` allows one
  pending acknowledgement per conversation, so a repeated or concurrent STOP
  cannot queue a second. The agent treats the refusal as expected.
- Two races are closed in the database and the agent (migration
  `20261017120000`, a follow-up to #1026's review):
  - **No acknowledgement after a re-enable.** The agent decides from a
    conversation snapshot read before the STOP was applied, so staff could
    re-enable the number between the STOP and the draft being saved.
    `trg_whatsapp_drafts_guard_stop_ack` refuses an acknowledgement draft
    (`P0001`, detail `whatsapp_stop_ack_not_stopped`) unless its conversation is
    stopped now, reading the row under `FOR SHARE` so the check is atomic with
    the re-enable: either the re-enable wins and the draft is refused, or the
    draft lands first and the re-enable's supersede trigger supersedes it. The
    agent treats the refusal as expected.
    The same check runs when an acknowledgement goes back to `pending` (the send
    path restores a claimed draft when the Meta call fails): on a number that is
    no longer stopped it becomes `superseded` instead.
  - **No lost acknowledgement after an ambiguous response.** If
    `apply_whatsapp_stop` commits but its answer is lost, the retry (or, after
    every retry has failed and staff reset the event, the next invocation)
    reports "already applied". The agent no longer tries to work out whose
    commit that was, which needed state that does not survive an invocation:
    every STOP the agent handles asks for its acknowledgement, whether it
    applied the STOP now or found it applied already, and the database decides.
    The draft records its STOP (`tool_calls.stop_meta_message_id`) and the
    partial unique index `whatsapp_drafts_one_opt_out_ack_per_stop` allows one
    acknowledgement per STOP message in any state, so asking again never
    queues a second, even after staff rejected or sent the first; and the guard
    above refuses it once the number has been re-enabled. The lookup functions
    `whatsapp_stop_marker_applied_at` and `whatsapp_stop_attempt_started_at`
    that the earlier design used are still in the database (`service_role`
    only) and are no longer called; dropping them is a later contract
    migration.
- One STOP gets one acknowledgement. The index cannot stop a second draft
  queued after the first was claimed or sent (a repeated STOP, or one racing
  staff's Send), so `whatsapp-send` refuses an acknowledgement with
  `409 stop_acknowledgement_already_sent` once another on the same
  conversation has been sent since the number's current STOP
  (`decided_at >= whatsapp_opted_out_at`; with no STOP time on the
  conversation, any sent before counts). Nothing is claimed or sent, and
  staff reject the draft. A failed lookup is the retryable
  `503 opt_out_check_failed`.
- Separately, staff may pass `override_opt_out: true` for the rare operational
  message a customer must still receive, but **never to a number that said
  STOP** (the number's suppression, or a record whose reason is
  `asked_on_whatsapp`): only the audited re-enable lifts a STOP. The override
  is ignored for AI-initiated sends and internal-secret calls.
- The `asked_on_whatsapp` label only ever sits on an opted-out record
  (constraint `humans_stop_label_means_opted_out`).

**Recognising a STOP.** The detector is deliberately narrow, because a false
positive silences the number until staff re-enable it. The message is split
into clauses (at `. ! ? , ;`, line breaks and dashes) and each clause is tested
on its own. Most patterns must reach the **end** of the clause, allowing only
politeness after them ("please", "thanks", "any more"). Each line below counts
as a STOP:
- The carrier words as a whole clause followed only by sign-offs (thanks,
  bye, wrong person): `STOP`, `STOP ALL`, "Stop promotions" (Meta's
  marketing button), `unsubscribe`, `opt out`, "stop please", "leave me
  alone". So "No thanks, stop", "Stop. Wrong person." and "Hi, STOP,
  thanks" count, and emoji are ignored.
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

## A booking confirmation completes the thread

When the `booking_confirmed_v1` template is sent (by `notify-booking-confirmed`,
or by staff from the inbox) and Meta accepts it, `whatsapp-send` marks that
conversation complete, so staff no longer press **Mark complete** on every
confirmed thread (`whatsapp-send/confirmationCompletes.ts`). It writes the same
columns as Mark complete: `closed_at`, `closure_reason`, the cleared closure
suggestion, and `closed_by`, left empty because no person closed it. The Reopen
button's tooltip says the thread closed automatically when the confirmation was
sent.

- **Reason:** the `closure_reason` CHECK allows only `manual`,
  `booking_confirmed_quiet`, `stale_30d` and `customer_cancelled`, so the
  booking reason is reused rather than adding a value by hand-applied
  migration. An empty `closed_by` is what tells this apart from staff accepting
  a "booking + quiet" suggestion.
- **Reopening:** the customer's next message reopens the thread through
  `reopen_on_new_inbound`, exactly as after a manual close.
- **A request for a person keeps it open.** Closing supersedes pending drafts as
  `conversation_closed`, which `openHandoffState` reads as settled, so the
  request would end silently. The thread therefore stays open while a handoff
  draft (not a STOP acknowledgement) is pending, or while the newest draft is a
  handoff that only a newer message superseded, under 14 days old, with no staff
  reply since.
- **Fails safe:** a failed lookup leaves the thread open, and a failed close is
  logged. Neither fails the send, because the confirmation has already gone.
- **Left alone:** a conversation that is already closed, every other template, a
  send Meta refused or named no message for, and SMS or email confirmations.
- **Known limits:** an unanswered customer message that is not a request for a
  person is closed with the thread, as Mark complete would close it, and
  reappears when the customer writes again. A handoff draft the agent saves just
  after the close lands on a closed thread; a manual close has the same race.

The database side is pinned by
`supabase/tests/257_booking_confirmation_completes_conversation.test.sql`.

## Staff unanswered-request waiting time

The inbox shows elapsed salon working time for open conversations whose latest customer text looks like a request and has no later outbound reply. Pending drafts do not clear the waiting label; failed sends remain waiting. Marking a conversation Done is explicit resolution. This is heuristic triage, not proof that a customer was ignored or that an outbound message was delivered.

Working time uses Europe/London, 08:30–15:00, normal Monday–Wednesday opening, diary opening exceptions, enabled holiday closures and partial-day closures. It uses the current schedule, not historical opening snapshots. Schedule reads refresh every minute and on focus. If required reads fail or the request predates the bounded one-year schedule window, the row says "Waiting time unavailable". No response-time threshold or automatic alert is enabled in this slice.

## Reply prompt and context revision

`WHATSAPP_REPLY_PROMPT_VERSION = 2026-10-01.1` is recorded in each new draft's `tool_calls.prompt_version`, alongside `review_only`. Historical drafts are not relabelled. Date-relative context is Europe/London, including tomorrow and all date-window endpoints. Upcoming appointments use the configured `booking_horizon_days` (validated range 1–730; context fallback 180), exclude Cancelled, show status and cap at 40 rendered records with an explicit omission notice. A failed lookup is not reported as no appointments.

The Availability block includes explicit diary opening/closure exceptions. An open exception is not free capacity. Missing dates remain unverified. Static Monday–Wednesday/Thursday refusals, including the walk-in weekday wording, are removed; brand-voice sections are unchanged. Review-draft enablement and production promotion remain separate release decisions. Synthetic server-contract tests do not establish model reply quality; see [the evaluation record](../prompts/evals/2026-10-01-whatsapp-review-drafts.md).
