# WhatsApp AI receptionist

The `whatsapp-agent` Edge Function is the brain of the WhatsApp
inbox. It calls Claude with the full conversation context (recent
messages, customer + dogs, availability windows, persisted agent
state) and writes a draft reply for staff to review. It never sends
a message to the customer directly and never mutates a booking —
both of those go through guarded paths (`whatsapp-send` and the
`apply_whatsapp_booking_action` RPC).

**Defaults are deliberately conservative.** Every draft is held for
human approval. Auto-send is plumbed but off everywhere unless you
explicitly opt in.

## Function secrets

Set with `supabase secrets set NAME=value`. **Never** put these in
`.env.local`.

| Variable | Default | What it does |
|---|---|---|
| `ANTHROPIC_API_KEY` | _required_ | Claude API key. Server-side only — never put behind a `VITE_` prefix. |
| `CLAUDE_MODEL` | `claude-sonnet-4-6` | Model used by the agent. |
| `AGENT_CALLBACK_SECRET` | _required_ | Shared secret between the `whatsapp_events` pg_net trigger and the function. |
| `AI_ASSISTANT_ENABLED` | `true` | Kill switch. Set to `false` to bypass Claude entirely; the agent writes a brand-voiced "I'll get someone to look at this" fallback draft tagged for handoff. Useful during incidents. |
| `AI_AUTO_SEND_LOW_RISK` | `false` | Global gate for auto-send. Even when `true`, all the per-draft gates below must also pass. |
| `WHATSAPP_SEND_URL` | `${SUPABASE_URL}/functions/v1/whatsapp-send` | Where the agent posts approved-for-auto-send drafts. Override only if you've moved the function. |
| `SEND_INTERNAL_SECRET` | _required for auto-send_ | Used by the agent to authenticate against `whatsapp-send` for auto-dispatch. Same value `whatsapp-send` already expects. |

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
