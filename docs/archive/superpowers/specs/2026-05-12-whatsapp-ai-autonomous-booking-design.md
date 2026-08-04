# WhatsApp AI agent — customer-confirmed autonomous booking

**Status:** draft, awaiting implementation plan
**Author:** Bleep (with Claude)
**Date:** 2026-05-12

## Purpose

> *"The WhatsApp messenger tool and AI agent needs a whole rethink. The AI agent needs to be able to book clients in, first identifying which registered human they are talking to. Then, finding out when they would like to book their dog in, what breed the dog is, and giving options of available appointments, and making the booking."* — user request, 2026-05-12

Today the AI does most of this **as a proposal** — it identifies the customer, remembers what it has learned, fetches real availability, and emits a `booking_action` row. But every booking sits in a `pending` queue waiting for staff to approve it via `BookingActionPanel`. The redesign closes that loop: **the AI books on its own**, with the customer providing the final tap-to-confirm instead of a member of staff.

## Decisions (locked)

These are the decisions the user made during brainstorming. They drive the rest of the spec.

| Decision | Choice |
| --- | --- |
| Approval model | AI books autonomously when all autonomy gates pass; staff only sees the result, not a pre-approval queue |
| Customer confirmation | Required. Tap-to-confirm via Meta interactive `[Yes]` / `[No, change]` button reply, or natural-language "yes". |
| New customers | AI gathers required info across turns, **creates `humans` + `dogs` records itself** once info is complete, then the normal booking flow runs. Staff sees a "new customer onboarded by AI" indicator on the first booking. |
| Slot UX | Plain-text slot offers, interactive buttons for the final confirm step. |
| Reschedules | AI handles them autonomously (subject to same gates). |
| Cancellations | AI handles them autonomously (subject to same gates). |
| Large dogs | Continue to use day-only availability and stay in the staff-approval queue. The AI does **not** auto-book large dogs. |
| Dog size | Derived from breed via `getSizeForBreed` ([src/constants/breeds.ts](../../../src/constants/breeds.ts)). AI never asks for size. Unknown breed defers to staff (matches existing precedent). |
| Confidence threshold | ≥ 0.85 |

## What stays as today

The redesign is additive. The following are unchanged:

- Inbound webhook flow ([supabase/functions/whatsapp-webhook/index.ts](../../../supabase/functions/whatsapp-webhook/index.ts)): Meta payload → `whatsapp_events` → DB trigger calls `whatsapp-agent`.
- Phone → human matching ([supabase/functions/whatsapp-agent/index.ts:345-366](../../../supabase/functions/whatsapp-agent/index.ts)): tries e164, digits, UK-local variants against `humans.phone`.
- Persistent `agent_state` on `whatsapp_conversations` — the existing memory mechanism. The redesign extends the fields it carries.
- Availability rendering — `get_small_medium_availability` + `get_large_dog_day_availability` RPCs.
- Risk classification ([supabase/functions/_shared/agentRisk.ts](../../../supabase/functions/_shared/agentRisk.ts)) — used as one of the autonomy gates.
- `BookingActionPanel` and the staff-approval path — remains the fallback whenever an autonomy gate fails.
- Outbound text sending via `whatsapp-send`.
- Auto-send-eligible drafts and the `auto_send_enabled` per-conversation flag — orthogonal to autonomous booking.

## The happy path (existing customer)

1. Customer messages: *"Can I book Alfie in for Monday morning?"*
2. `whatsapp-agent` runs as today: matches phone → loads human, dogs, upcoming bookings, availability → calls Claude.
3. Claude returns `proposed_text` + a `booking_action` (`action: "create"`, `dog_id`, `booking_date`, `slot`, `service`, `size`).
4. **New** — if all autonomy gates pass (see below), the agent:
   - Inserts a `whatsapp_booking_actions` row with `state = 'awaiting_customer_confirm'`, `customer_confirm_expires_at = now() + 24h`.
   - Saves the AI draft text (the "How about Mon 18 May 09:30?" message) — existing draft flow.
   - Calls `whatsapp-send` in a new `confirm_buttons` mode → Meta interactive button message: *"Confirm Mon 18 May at 09:30 — full groom for Alfie?"* with `[Yes, book it]` / `[No, different time]`.
   - Stores the returned Meta message id on `whatsapp_booking_actions.customer_confirm_message_id`.
5. Customer taps **Yes** → Meta delivers a `button_reply` event → `whatsapp-webhook` routes it → new handler `apply-customer-confirm`:
   - Look up the action by `customer_confirm_message_id`.
   - Re-check availability via the same RPC the agent uses (catches races).
   - Execute the booking (insert into `bookings`, `source = 'whatsapp_ai_auto'`).
   - Transition action to `auto_applied`.
   - Fire ack message via `whatsapp-send` text mode: *"You're booked in ✓ Mon 18 May at 09:30 for Alfie's full groom. 🎓🐶❤️ X"*.
6. Customer taps **No** → action moves to `rejected_by_customer`, agent fires *"No worries, what would work better?"* and re-engages on next inbound.

## Autonomy gates

The AI auto-books **only** when ALL of these are true. Any failure routes the action to today's `state = 'pending'` (staff-approval) path.

- `AI_AUTONOMOUS_BOOKING_ENABLED=true` (global env kill switch)
- `whatsapp_conversations.autonomous_booking_enabled=true` (per-conversation opt-in)
- Phone matches a `humans` row. New-customer first bookings always go to staff approval — even when the AI has just created the records, the *booking* on top of them follows the staff-approval (`pending`) path. Subsequent bookings on that conversation can use the autonomous path once staff has flipped `autonomous_booking_enabled`.
- Draft confidence ≥ 0.85
- Risk level = `low`
- Intent ∈ `{ booking_propose, booking_change, booking_cancel }`
- Dog size = `small` or `medium`
- Conversation `state = 'ai_handling'`
- For `create`: the proposed slot is currently free (re-checked at apply time)
- For `booking_change`: the original booking is ≥ 24h away (matches the `notify-booking-reminder` window) AND not in `Checked in` / `Ready for pick-up`
- For `booking_cancel`: the booking is not in `Checked in` / `Ready for pick-up`
- Breed is in `BREED_LIST` (i.e. `getSizeForBreed` returns a non-null value)

## Schema changes (additive)

### `whatsapp_booking_actions`

```sql
-- new action kinds
ALTER TYPE whatsapp_booking_action_kind ADD VALUE 'reschedule';
ALTER TYPE whatsapp_booking_action_kind ADD VALUE 'cancel';

-- new states
ALTER TYPE whatsapp_booking_action_state ADD VALUE 'awaiting_customer_confirm';
ALTER TYPE whatsapp_booking_action_state ADD VALUE 'confirmed';
ALTER TYPE whatsapp_booking_action_state ADD VALUE 'rejected_by_customer';
ALTER TYPE whatsapp_booking_action_state ADD VALUE 'auto_applied';

ALTER TABLE whatsapp_booking_actions
  ADD COLUMN customer_confirm_message_id text,
  ADD COLUMN customer_confirm_expires_at timestamptz;

CREATE INDEX whatsapp_booking_actions_confirm_msg_idx
  ON whatsapp_booking_actions (customer_confirm_message_id)
  WHERE customer_confirm_message_id IS NOT NULL;
```

**Payload shapes** (jsonb on `payload` column):

```jsonc
// create — same as today
{ "action": "create", "dog_id": "...", "booking_date": "...", "slot": "...",
  "service": "...", "size": "...", "notes": null }

// reschedule — new
{ "action": "reschedule", "old_booking_id": "...",
  "new_date": "...", "new_slot": "...", "notes": null }

// cancel — new
{ "action": "cancel", "old_booking_id": "...", "reason": "customer requested via WhatsApp" }
```

### `whatsapp_conversations`

```sql
CREATE TYPE whatsapp_lead_status AS ENUM ('collecting', 'awaiting_summary_confirm', 'records_created');
ALTER TABLE whatsapp_conversations
  ADD COLUMN lead_status whatsapp_lead_status,
  ADD COLUMN lead_payload jsonb,
  ADD COLUMN autonomous_booking_enabled boolean NOT NULL DEFAULT false;
```

### `humans`

```sql
-- Lets the post-creation correction path know which humans rows are
-- safe to update from the AI flow. Existing rows get source=NULL.
ALTER TABLE humans ADD COLUMN source text;
```

`lead_payload` shape:

```jsonc
{
  "customerName": "Sarah",
  "customerSurname": "Lockwood",
  "dogName": "Mabel",
  "breed": "Cockapoo",
  "dogAge": "3 years",
  "alerts": ["nervous around dryer"],
  "coatCondition": "matted around the back legs",
  "preferredDay": "Wednesday"
}
```

## Customer-confirm pipeline

### `whatsapp-send` new mode: `confirm_buttons`

**Input:**

```ts
{
  mode: "confirm_buttons",
  conversation_id: string,
  booking_action_id: string,
  summary_text: string,           // e.g. "Confirm Mon 18 May at 09:30 — full groom for Alfie?"
  action_kind: "book" | "reschedule" | "cancel",
}
```

**Body:** Meta interactive button message with body=`summary_text` and two buttons:
- `{ id: `${booking_action_id}:yes`, title: "Yes, book it" }` (or "Yes, move it" / "Yes, cancel" by `action_kind`)
- `{ id: `${booking_action_id}:no`, title: "No, change" }`

**Side effects:** writes `whatsapp_messages` row for the outbound, stores Meta-returned message id on `whatsapp_booking_actions.customer_confirm_message_id`.

### `whatsapp-webhook` routing

Today the webhook ([supabase/functions/whatsapp-webhook/index.ts](../../../supabase/functions/whatsapp-webhook/index.ts)) writes raw events to `whatsapp_events` and that's it. The redesign keeps this — `button_reply` payloads are just another message kind in the existing inbound flow. The agent (`whatsapp-agent`) already runs per event and already extracts `interactive.button_reply.title` ([whatsapp-agent/index.ts:1273](../../../supabase/functions/whatsapp-agent/index.ts:1273)).

The change is: when the agent detects a `button_reply` whose id matches the `${action_id}:yes|no` shape, it routes to a new internal function `apply-customer-confirm` instead of (or before) calling Claude for a normal reply.

### `apply-customer-confirm` function

New supabase function `supabase/functions/apply-customer-confirm/index.ts`. Called from `whatsapp-agent` when a button reply is detected.

```ts
// Pseudocode
async function applyCustomerConfirm({ booking_action_id, choice }) {
  const action = await load(booking_action_id);
  if (!action || action.state !== 'awaiting_customer_confirm') return; // idempotent

  if (action.customer_confirm_expires_at < now()) {
    await transition(action, 'rejected_by_customer', { reason: 'expired' });
    await sendText("Sorry, that confirmation expired. Want me to find a slot again?");
    return;
  }

  if (choice === 'no') {
    await transition(action, 'rejected_by_customer');
    // Next AI turn picks up the re-engage signal from agent_state.
    return;
  }

  // choice === 'yes' — execute
  try {
    if (action.payload.action === 'create') {
      // Re-check slot still free
      const stillFree = await isSlotFree(action.payload);
      if (!stillFree) {
        await transition(action, 'rejected_by_customer', { reason: 'slot_gone' });
        await sendText("Ah, that slot just went — let me check what else is open.");
        return;
      }
      await insertBooking(action.payload, { source: 'whatsapp_ai_auto' });
    }
    if (action.payload.action === 'reschedule') {
      await updateBooking(action.payload.old_booking_id, {
        booking_date: action.payload.new_date,
        slot: action.payload.new_slot,
      });
    }
    if (action.payload.action === 'cancel') {
      await updateBooking(action.payload.old_booking_id, {
        status: 'Cancelled',
        cancel_reason: action.payload.reason,
      });
      // Existing notify-booking-cancelled trigger fires from this UPDATE.
    }
    await transition(action, 'auto_applied');
    await sendAckMessage(action);
  } catch (err) {
    await transition(action, 'pending', { reason: 'auto_apply_failed', error: err.message });
    // Falls back to staff approval queue — they'll see this in BookingActionPanel.
  }
}
```

## New-customer pipeline

1. Inbound from an unknown phone → `findHumanIdByPhone` returns null → conversation gets `lead_status = 'collecting'`.
2. AI's first reply asks for the first field naturally: *"Lovely to hear from you! Can I grab your name and your dog's name to get started?"*. Each turn extracts new fields into `lead_payload` via the existing `extracted_state` mechanism (extended schema below).
3. Required fields:
   - `customerName` (first name)
   - `customerSurname`
   - `dogName`
   - `breed` (must resolve to a known size via `getSizeForBreed`)
   - `dogAge`
   - `alerts`
   - `coatCondition`
   - `preferredDay`
4. **Summary-confirm step** — once all required fields are present AND breed resolves, the AI's next reply is a single plain-text summary asking the customer to confirm: *"Just to double-check — Sarah Lockwood, Alfie's a 3yo Cockapoo, nervous around dryers, coat in good condition, looking for a Wednesday — sound right?"*. AI sets `lead_status = 'awaiting_summary_confirm'`. No records are created yet.
5. Customer corrects something → AI updates `lead_payload` via `extracted_state` next turn and re-summarises. Loop until customer says "yes / that's right / perfect" or similar.
6. Customer confirms summary → on the *next* inbound turn, `whatsapp-agent` detects `lead_status = 'awaiting_summary_confirm'` + a positive confirmation token in the message → inserts records atomically:
   - `humans` row (`phone` = conversation's `phone_e164`, name, surname, notes from coat/alerts merged into `humans.notes`)
   - `dogs` row (`human_id` = the new human, name, breed, derived size, alerts as a string array, `groom_notes` from coat condition)
   - `whatsapp_conversations.human_id` updated to the new human, `lead_status = 'records_created'`
7. From here, the conversation is a "known customer" and the AI runs the normal booking flow. The first booking emits a `pending` action (staff approval) — autonomous booking is only enabled by staff after the records have been vetted. Subsequent bookings on the same conversation can run autonomously once staff flips `autonomous_booking_enabled`.
8. If breed is unknown (`getSizeForBreed` returns null), AI tells customer *"I'll need someone from the team to confirm the size for that breed — they'll be in touch shortly"* and `lead_status` stays at `collecting`. Staff sees the conversation flagged and can manually finish.
9. Inbox marker: a "🆕 New customer onboarded by AI" badge appears on the conversation list row whenever `lead_status = 'records_created'` AND the customer hasn't yet had a real (non-pending) booking applied. Staff can spot-check the records before approving the first booking.

### Correcting records after creation

If the customer corrects details after records are created (e.g. *"actually it's Lockwood with an O not Lochwood"*), the AI emits an `extracted_state` patch as today, and a small post-creation update path applies the diff to the `humans` / `dogs` rows. This update path is only allowed when:
- Records were created by the AI in the current conversation (`humans.id` is the conversation's `human_id` AND the human was inserted with `source = 'whatsapp_ai'` — new column on `humans` from this migration).
- The correction is to a whitelisted column set: `humans.name`, `humans.surname`, `humans.notes`, `dogs.name`, `dogs.age`, `dogs.alerts`, `dogs.groom_notes`. Breed is NOT in this set — a breed change re-runs `getSizeForBreed` and is staff-only.

## AI system prompt edits

The `SYSTEM_PROMPT` at [whatsapp-agent/index.ts:165-331](../../../supabase/functions/whatsapp-agent/index.ts:165) needs the following edits. **No edits to brand voice / tone sections.** Edits target the HARD RULES, OUTPUT FORMAT, and a new NEW-CUSTOMER section.

### HARD RULES additions

- *"You MAY propose `booking_action` with `action: "create" | "reschedule" | "cancel"`. For reschedule and cancel, payload includes `old_booking_id` from the `--- Upcoming bookings ---` context block (the booking_date and slot from that block let you identify which row)."*
- *"Your `proposed_text` MUST end with a question prompting the customer's confirmation — e.g. 'Shall I book that in for you?', 'Want me to move it to Wednesday at 11:00?', 'Are you sure you want to cancel?'. The system follows up with a tap-to-confirm message. Banned: any phrasing that implies the booking is already done."* (replaces the existing banned-phrases rule, which already covered "booked in" / "pencilled in" / etc.)
- *"For reschedules, only propose if the original booking is at least 24 hours away. Anything closer goes to staff — write a holding reply with `intent = "booking_change"`."*
- *"For cancellations, only propose if the booking status is `Booked`. Bookings that have been checked in or are ready for pickup go to staff."*
- *"For an unknown breed (one not in the breed list we know about), do NOT propose `booking_action`. Continue collecting other facts; tell the customer the team will confirm the breed's size."*

### OUTPUT FORMAT — booking_action shape

Replace the current single-shape with three shapes:

```jsonc
"booking_action": null | {
  "action": "create",
  "dog_id": "uuid from context",
  "booking_date": "YYYY-MM-DD",
  "slot": "HH:MM",
  "service": "full-groom" | "bath-and-brush" | "bath-and-deshed" | "puppy-groom",
  "size": "small" | "medium",  // large dogs handled separately; never propose action for large
  "notes": "short reason, optional"
} | {
  "action": "reschedule",
  "old_booking_id": "uuid from context",
  "new_date": "YYYY-MM-DD",
  "new_slot": "HH:MM",
  "notes": "short reason, optional"
} | {
  "action": "cancel",
  "old_booking_id": "uuid from context",
  "reason": "from customer message, required"
}
```

### NEW-CUSTOMER section (new)

```
────────────────────────────────────────────────────────
NEW CUSTOMER COLLECTION
────────────────────────────────────────────────────────
When `--- Customer ---` is "Unknown (...)", you are speaking to someone not on our records yet. Your job over the next few turns is to gather:
- Customer first name + surname
- Dog name + breed
- Dog age (puppy if under 6 months)
- Any handling alerts (reactive, nervous, medical)
- Coat condition / matting
- Preferred day

Use `extracted_state` to populate these on every turn. Ask for missing fields naturally, one or two per turn — never all in one go. Don't invent details.

When you have ALL required fields AND the breed is one you recognise, your next reply MUST be a single plain-text summary that asks the customer to confirm everything before we save it. Example shape:

  "Just to double-check — Sarah Lockwood, Alfie's a 3yo Cockapoo, nervous around dryers, coat in good condition, looking for a Wednesday — sound right? 🎓🐶❤️ X"

The system will create the records on the customer's next "yes" / "that's right" / "perfect" / "all good" reply. Do not propose a `booking_action` until records exist (you'll see `--- Customer ---` populated on the turn after).

If the customer corrects a detail during the summary, update via `extracted_state` and re-summarise on the next turn.
```

### `extracted_state` schema additions

Add `customerSurname`, `dogAge`, `alerts: string[]`, `coatCondition`, `preferredDay` to the existing extracted-state whitelist in `parseExtractedState` ([whatsapp-agent/index.ts:829-854](../../../supabase/functions/whatsapp-agent/index.ts:829)).

## Open-question calls

These are choices I've made; flag any that need flipping in implementation:

- **TTL on `awaiting_customer_confirm`**: 24h. Matches Meta's customer-service window — once the window closes, plain-text replies are blocked anyway.
- **Max candidate slots in a single AI offer**: 3. Keeps the message scannable; the customer narrows down before the confirm step.
- **Reschedule cutoff**: 24h before the original appointment. Anything inside that window goes to staff.
- **Mid-service cancel**: deferred to staff (`Checked in` and `Ready for pick-up` bookings).
- **Unknown breed**: defers to staff (matches the existing `breeds.ts` comment).
- **`auto_applied` vs `applied`**: distinct states — staff can filter "AI-driven bookings" reports easily.
- **Source field on `bookings`**: `whatsapp_ai_auto` for autonomous bookings, distinct from today's `whatsapp_ai` (which means "staff approved an AI proposal").

## Testing

Targeted tests for each new state transition. The existing test files are good starting points — extend rather than create new.

| Test | Coverage |
| --- | --- |
| Happy path (existing customer create) | inbound → AI → button send → button-reply → bookings row inserted, source=`whatsapp_ai_auto` |
| Happy path (existing customer reschedule) | inbound *"can we move Alfie to Wed?"* → AI proposes → confirm → original bookings row updated |
| Happy path (existing customer cancel) | inbound *"need to cancel"* → AI proposes → confirm → bookings row Cancelled, cancel_reason populated, notify-booking-cancelled trigger fires |
| New-customer summary-confirm | 5+ turns of collection → AI summarises → customer corrects a field → AI re-summarises → customer says yes → humans + dogs rows created with `humans.source = 'whatsapp_ai'` |
| New-customer first booking | Records exist (from summary-confirm above) → AI proposes booking → action lands in `pending` (staff approval), NOT `awaiting_customer_confirm` |
| New-customer post-creation correction | After records exist, customer says "actually surname is X" → AI updates `humans.surname` via the whitelisted post-creation update path |
| Unknown breed | `getSizeForBreed` returns null → AI does NOT emit booking_action, lead_payload partially populated, lead_status stays `collecting` |
| Slot-gone race | slot becomes unavailable between propose and confirm → action transitions to `rejected_by_customer` with reason `slot_gone`, re-engage message fired |
| Expired confirm | `customer_confirm_expires_at` < now → action transitions to `rejected_by_customer` with reason `expired`, re-engage message fired |
| Customer tap No | Meta sends `confirm_no` → action moves to `rejected_by_customer`, no booking row written |
| Reschedule cutoff | original booking < 24h away → AI does NOT propose, falls back to staff |
| Mid-service cancel | booking in `Checked in` state → AI does NOT propose, falls back to staff |
| Auto-apply failure | bookings insert errors → action transitions back to `pending`, surfaces in BookingActionPanel |
| Regression: legacy staff path | existing `pending → applied/rejected` still works when autonomy gates fail |
| Regression: existing `supabaseSecurityReview.test.ts` | unchanged green |

## Rollout

- Add `AI_AUTONOMOUS_BOOKING_ENABLED` env var to `whatsapp-agent` (default `false`).
- Add `autonomous_booking_enabled` boolean to `whatsapp_conversations` (default `false`).
- Both must be true for the new path to run; otherwise legacy behaviour.
- Migration order:
  1. Migration adds the new enum values, new columns, new index.
  2. Deploy updated `whatsapp-agent` with feature flag off — verify no regression in existing flows.
  3. Deploy new `apply-customer-confirm` function.
  4. Flip per-conversation flag for one trusted customer; watch one full booking land via the new path.
  5. Watch for a week; if clean, document the staff process for flipping the flag per customer.
  6. Set `AI_AUTONOMOUS_BOOKING_ENABLED=true` globally only after the per-conversation rollout has been stable for ~2 weeks.

## Files touched (estimated)

| File | Change |
| --- | --- |
| `supabase/migrations/<n>_whatsapp_autonomous_booking.sql` | New migration: enum values, columns, index |
| `supabase/functions/whatsapp-agent/index.ts` | System prompt edits, button_reply routing, new-customer record creation, autonomy-gate checks, extracted-state schema extensions |
| `supabase/functions/whatsapp-send/index.ts` | New `confirm_buttons` mode |
| `supabase/functions/apply-customer-confirm/index.ts` | New function — confirm handler |
| `supabase/functions/_shared/agentRisk.ts` | Possibly extend `canAutoSend` semantics — clarify auto-book vs auto-send |
| `src/components/views/WhatsAppInboxView.jsx` | New customer badge, source=`whatsapp_ai_auto` indicator on bookings |
| `src/supabase/hooks/useWhatsAppInbox.js` | Subscribe to new states; surface `lead_status` and `lead_payload` |
| `src/security/supabaseSecurityReview.test.ts` | Add regression assertions for the new state machine + RLS on new columns |
| `docs/superpowers/specs/2026-05-12-whatsapp-ai-autonomous-booking-design.md` | This file |

## Out of scope (explicitly)

- Large-dog autonomous booking — stays day-only + staff queue.
- AI proposing services or sizes that the customer didn't mention (e.g. "do you want to add a bath?"). The AI still only proposes what the customer asked for.
- Reschedules within 24h of the original appointment.
- Cancellations of bookings already in service (`Checked in` / `Ready for pick-up`).
- Multi-dog bookings in a single confirm step. Each dog is its own booking with its own confirm.
- Migrating existing `pending` actions to the new state machine — they live out their life on the legacy path.
- Replacing `BookingActionPanel`. It stays for the fallback path and gives staff a kill switch.
