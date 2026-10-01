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
