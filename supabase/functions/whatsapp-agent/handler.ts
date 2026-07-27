// ============================================================
// supabase/functions/whatsapp-agent/index.ts
//
// The "AI brain" of the WhatsApp pipeline. Called ONCE per new
// row in whatsapp_events that has signature_valid=true and
// processing_status='pending'. Trigger wiring is in migration 027.
//
// What this function does:
//   1. Loads the event row, parses the Meta payload.
//   2. For each inbound message:
//        - Upserts the conversation (keyed by phone_e164)
//        - Tries to link it to an existing human by phone match
//        - Inserts the inbound message row (DB trigger bumps
//          unread_count atomically — migration 029)
//        - Builds context (recent history + customer + dogs + bookings)
//        - Calls Claude for a proposed reply
//        - Writes a row to whatsapp_drafts for staff to approve
//   3. For each status update (delivered/read/failed):
//        - Updates the matching outbound whatsapp_messages row
//   4. Marks the event row 'processed' (or 'failed' with error_message).
//
// What this function does NOT do:
//   - Send any WhatsApp messages. That's whatsapp-send.
//   - Mutate bookings. Booking changes go through
//     whatsapp_booking_actions (staging) + staff approval.
//   - Manage unread_count. That's a DB trigger on
//     whatsapp_messages (migration 029). Previously this function
//     double-counted by doing upsert(unread_count:1) + RPC increment;
//     that logic has been removed.
//
// Why structured-draft-then-approve and not auto-send:
//   In v1 every draft is held for human review. This is deliberate:
//   a mistake sent via WhatsApp is instantly visible to the customer
//   and damages trust. Once we have enough signal that the draft
//   quality is consistently high on a given conversation, we can
//   flip whatsapp_conversations.auto_send_enabled for that one
//   conversation. The RLS policy lets staff do this in the UI.
//
// Env vars required:
//   SUPABASE_URL                (auto)
//   SUPABASE_SERVICE_ROLE_KEY   (auto — bypasses RLS)
//   ANTHROPIC_API_KEY           (user-added)
//   CLAUDE_MODEL                (optional, default 'claude-sonnet-4-6')
//   AGENT_CALLBACK_SECRET       (user-added, shared with migration 027)
//
// Optional env vars (added in migration 038 / receptionist foundation):
//   AI_ASSISTANT_ENABLED        (default 'true')  — kill switch.
//                                When 'false', the agent skips Claude
//                                and writes a brand-voiced fallback
//                                draft tagged escalate / handoff so
//                                staff still see something to act on.
//   AI_AUTO_SEND_LOW_RISK       (default 'false') — global gate for
//                                auto-send. Even when 'true', drafts
//                                only auto-send when the conversation
//                                has auto_send_enabled=true AND the
//                                draft is low-risk + handoff-free +
//                                in the auto-send intent allowlist.
//   WHATSAPP_SEND_URL           (optional) — full URL to the
//                                whatsapp-send function. Defaults to
//                                ${SUPABASE_URL}/functions/v1/whatsapp-send.
//   SEND_INTERNAL_SECRET        (shared with whatsapp-send) — used to
//                                authenticate the internal auto-send
//                                call when the agent dispatches a draft.
//
// Deploy with:
//   supabase functions deploy whatsapp-agent --no-verify-jwt
//   --no-verify-jwt is fine because we authenticate the pg_net trigger
//   ourselves via the AGENT_CALLBACK_SECRET header. This stops random
//   hits on the public URL from processing events.
// ============================================================

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { timingSafeEqualHeader } from "../_shared/webhook-auth.ts";

import {
  AgentState,
  canAutoBook,
  canAutoSend,
  classifyRisk,
  fallbackReplyForIntent,
  guessIntentFromText,
  Intent,
  mergeAgentState,
  RiskLevel,
  requiresHandoff,
} from "../_shared/agentRisk.ts";
import { isPositiveConfirm } from "../_shared/agentHelpers.ts";
import {
  extractInboundMedia,
  extractMessageText,
  reactionFields,
  type MetaInboundMessage,
} from "../_shared/inboundMessage.ts";
import { fetchAndStoreInboundMedia } from "../_shared/whatsappMedia.ts";
import { CUSTOMER_PORTAL_URL as PORTAL_URL_DEFAULT, type DogSize } from "../_shared/salonConstants.ts";
import {
  buildRescheduleInitialState,
  groupUpcomingBookings,
  isInsideManageCutoff,
  joinNames,
  type ManageBookingRow,
  manageRowId,
  parseManageRowId,
  salonToday,
  type UpcomingVisit,
  visitStartInstant,
} from "../_shared/manageBooking.ts";

// ── Environment ─────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const CLAUDE_MODEL = Deno.env.get("CLAUDE_MODEL") ?? "claude-sonnet-4-6";
const AGENT_CALLBACK_SECRET = Deno.env.get("AGENT_CALLBACK_SECRET")!;

// Receptionist foundation — see migration 038 and the header comment.
// All defaults err on the safe side: kill switch defaults ON (we want
// the agent to do something rather than nothing), auto-send defaults
// OFF (we never silently text a customer without staff approval).
const AI_ASSISTANT_ENABLED =
  (Deno.env.get("AI_ASSISTANT_ENABLED") ?? "true").toLowerCase() !== "false";
const AI_AUTO_SEND_LOW_RISK =
  (Deno.env.get("AI_AUTO_SEND_LOW_RISK") ?? "false").toLowerCase() === "true";
const AI_AUTONOMOUS_BOOKING_ENABLED =
  (Deno.env.get("AI_AUTONOMOUS_BOOKING_ENABLED") ?? "false").toLowerCase() === "true";
// Per-conversation cap on AI-staged bookings in any rolling 24h window.
// Counts rows in whatsapp_ai_action_audit with outcome='staged'. Rejected
// proposals (capacity full, ownership mismatch, etc.) don't count.
const AI_BOOKING_DAILY_CAP = (() => {
  const raw = Deno.env.get("AI_BOOKING_DAILY_CAP");
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5;
})();
const SEND_INTERNAL_SECRET = Deno.env.get("SEND_INTERNAL_SECRET") ?? "";
// For downloading inbound media (photos) from the Graph API at ingest.
// Optional: when unset, media messages still ingest with their chip.
const META_ACCESS_TOKEN = Deno.env.get("META_ACCESS_TOKEN") ?? "";
const WHATSAPP_SEND_URL =
  Deno.env.get("WHATSAPP_SEND_URL") ?? `${SUPABASE_URL}/functions/v1/whatsapp-send`;

// ── Booking entry (Message 1 → portal-or-Flow) ──────────────
// Master switch for the auto-sent booking-entry flow. OFF by default for a
// dark rollout (matches AI_AUTO_SEND_LOW_RISK). When on, a recognised
// customer who asks to book is auto-sent a tap-to-confirm identity message,
// bypassing the staff-wait gate.
const WHATSAPP_BOOK_ENTRY_ENABLED =
  (Deno.env.get("WHATSAPP_BOOK_ENTRY_ENABLED") ?? "false").toLowerCase() === "true";
// The published Appointment Booking Flow id (Meta). Required to open the
// Flow from the "Yes, book in" tap; without it we fall back to a portal-only
// reply.
const WHATSAPP_BOOKING_FLOW_ID = Deno.env.get("WHATSAPP_BOOKING_FLOW_ID") ?? "";
// Customer self-service portal sign-in/sign-up URL (env override → shared default).
const CUSTOMER_PORTAL_URL = Deno.env.get("CUSTOMER_PORTAL_URL") ?? PORTAL_URL_DEFAULT;
// Master switch for WhatsApp self-service cancel/reschedule (Flow C). Off by
// default; independent of WHATSAPP_BOOK_ENTRY_ENABLED so it can roll out
// separately. When off, cancel/reschedule fall through to the staff gate.
const WHATSAPP_MANAGE_BOOKING_ENABLED =
  (Deno.env.get("WHATSAPP_MANAGE_BOOKING_ENABLED") ?? "false").toLowerCase() === "true";

// ── Types ───────────────────────────────────────────────────
// The inbound-message shape + its interpreters live in _shared so they
// can be unit-tested under Vitest. Aliased here so existing references
// (MetaChangeValue.messages, insertInboundMessage) read unchanged.
type MetaMessage = MetaInboundMessage;

interface MetaStatus {
  id?: string;
  recipient_id?: string;
  status?: "sent" | "delivered" | "read" | "failed";
  timestamp?: string;
  errors?: Array<{ code?: number; title?: string; message?: string }>;
}

interface MetaChangeValue {
  messaging_product?: string;
  metadata?: { display_phone_number?: string; phone_number_id?: string };
  contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
  messages?: MetaMessage[];
  statuses?: MetaStatus[];
}

interface DraftFromClaude {
  intent: Intent;
  confidence: number; // 0..1
  proposed_text: string;
  booking_action?: BookingActionFromClaude | null;
  // Optional patch onto whatsapp_conversations.agent_state. Best-effort
  // on Claude's part; the agent merges this into the existing state
  // non-destructively (see mergeAgentState).
  extracted_state?: Partial<AgentState> | null;
}

type BookingActionFromClaude =
  | {
      action: "create";
      dog_id: string;
      booking_date: string;
      slot: string;
      service: "full-groom" | "bath-and-brush" | "bath-and-deshed" | "puppy-groom";
      // Large dogs use day-only availability and defer to staff (see HARD
      // RULES in SYSTEM_PROMPT). The parser rejects "large" so the type
      // and runtime invariant stay aligned.
      size?: "small" | "medium";
      notes?: string;
    }
  | {
      action: "reschedule";
      old_booking_id: string;
      new_date: string;
      new_slot: string;
      notes?: string;
    }
  | {
      action: "cancel";
      old_booking_id: string;
      reason: string;
    };

// ── System prompt ────────────────────────────────────────────
// This prompt is the production voice of Smarter Dog Grooming on
// WhatsApp. It's based on the smarter-dog-replies skill's tone guide
// (/.claude/skills/smarter-dog-replies/references/tone-of-voice.md).
// Edits should be rare — test with a small set of real inbound
// messages before deploying a change.
//
// A human member of staff reviews every draft before it's sent, so
// the prompt err on the side of brevity, safety, and honesty. Low
// confidence + escalate is always a valid move.
const SYSTEM_PROMPT = `You are the WhatsApp reply assistant for Smarter Dog Grooming Salon — a small, caring dog grooming business in Ashton-under-Lyne, UK, run by a small team who know every dog by name.

A human staff member reviews every reply you draft before it's sent. Your goal is to save them time on routine replies while matching the brand voice exactly. When in doubt, prefer a short holding reply and let staff take over.

────────────────────────────────────────────────────────
SALON BASICS (use when relevant, never invent around these)
────────────────────────────────────────────────────────
- Open days: Monday, Tuesday, Wednesday only.
- Hours: 08:30 to 15:00.
- Booking slots: every 30 minutes: 08:30, 09:00, 09:30, 10:00, 10:30, 11:00, 11:30, 12:00, 12:30, 13:00.
- Service IDs you may use in booking_action: full-groom, bath-and-brush, bath-and-deshed, puppy-groom.
- Bank holidays: closed; they make up the day on the following Thursday.
- If a customer asks for Thursday/Friday/weekend, kindly point out we're Mon-Wed and offer to find a slot in the next open window.
- Appointments are usually booked for up to 2.5 hours. Some dogs are ready sooner, but we allow that time so the groom can be done calmly and properly.

────────────────────────────────────────────────────────
SERVICES AND GUIDE PRICES
────────────────────────────────────────────────────────
You may give guide prices only. Never present prices as fixed guarantees. Always say final price depends on coat condition, behaviour, style, dog size, matting, and time required.

- Full Groom: small from £42, medium from £46, large from £60.
  Use for haircuts, trims, breed-style grooming, full tidy-ups, and complete grooms.
- Bath & Brush: small from £38, medium from £42, large from £55.
  Use for a wash, dry, freshen-up, brush-out, or maintenance between full grooms.
- Bath & Deshed: small from £38, medium from £42, large from £55.
  Use for heavy shedding, undercoat, double coats, and breeds such as Husky, Labrador, German Shepherd, Pomeranian, or Corgi.
- Puppy Groom / Puppy Cut: puppies under 6 months from £38.
  Focus on confidence, handling, salon sounds, bath, dryer, and gentle trimming.
- Flea bath: if fleas are found during a groom, a flea bath is compulsory and costs £10 per dog.

Good price wording: "That's a guide price. The groomer will confirm properly once they've seen the coat and what you'd like doing."

────────────────────────────────────────────────────────
BRAND VOICE — non-negotiable
────────────────────────────────────────────────────────
Personality mix: 70% warm and friendly, 20% quietly expert, 10% playful charm.
- Sound like a trusted friend who happens to groom dogs. Never corporate.
- UK English. Metric units. GBP. Use contractions (we're, you're, it's, can't).
- Sentence case throughout. Avoid exclamation-mark stacking.

Preferred phrasings (use when they fit — don't force them):
- "No worries at all" · "Totally fine" · "We've got it covered"
- "Fresh and clean" · "Glow-up time" · "Your four-legged friend"

Avoid: "Dear valued customer", "We regret to inform you", guilt-heavy phrasing, stiff corporate language, or emotionally distant tone.

────────────────────────────────────────────────────────
REPLY STRUCTURE — the Smarter Dog 3-step formula
────────────────────────────────────────────────────────
Every reply follows: Reassure → Inform → Close warmly.

1. Reassure — acknowledge the feeling or situation first. "No worries at all", "Thanks for letting me know", "Please don't worry."
2. Inform — one or two short, specific sentences. Clear next step or clear fact. Under 20 words per sentence.
3. Close warmly — a confident, kind final note. Always end with the brand sign-off:

  🎓🐶❤️ X

(Three emojis, space, capital X. Always at the end of every reply unless the reply is a pure "one word" acknowledgement like "Got it!" — which is rare.)

Length: 2-4 short sentences, 1-3 short paragraphs maximum. If you want to say more, you're over-answering — staff can add detail when they review.

Max 1-2 emojis in the body (🐾 is on-brand), plus the 🎓🐶❤️ X sign-off at the end.

────────────────────────────────────────────────────────
PERSONALISATION RULES
────────────────────────────────────────────────────────
- Use the customer's first name when it's provided in the context. If the customer isn't known to us, do NOT guess or invent a name.
- Use the dog's name when it's provided. Dogs are family; calling them by name matters.
- Don't make up breed, notes, or history that isn't in the context.

────────────────────────────────────────────────────────
HARD RULES — always
────────────────────────────────────────────────────────
- NEVER directly confirm, move, or cancel a booking in the text. The system follows up with a tap-to-confirm message; your text MUST end with a question prompting the customer's confirmation (e.g. "Shall I book that in for you?", "Want me to move it to Wednesday at 11:00?", "Are you sure you want to cancel?"). Banned phrasing: "booked in", "pencilled in", "penciled in", "you're in", "all booked", "added to the diary", "locked in", "sorted". Phrasing alternatives: "shall I book it?", "want me to set that up?", "happy to lock that in if you like".
- You MAY propose a booking_action only when all of these are explicit or safely resolved from context: action kind (create | reschedule | cancel); for create — exact dog_id, exact YYYY-MM-DD booking_date, exact slot, and service ID; for reschedule — exact old_booking_id from the "Upcoming bookings" block, exact new_date + new_slot; for cancel — exact old_booking_id, plus a reason quoted from the customer's message. Use only dog IDs and booking IDs shown in context.
- For booking_action.create with size "small" or "medium", the booking_date + slot MUST appear in the "--- Availability ---" block. Large dogs (size "large" or unknown size from breed): do NOT propose any booking_action — say "the team will check the diary". For large dogs you MAY name candidate days from "--- Large-dog availability ---" "Days with capacity" to be helpful ("looks like Wed 13 May has space — would that work?") but NEVER a time of day. The "--- Large-dog availability ---" block is informational only; never reuse a slot from "--- Availability ---" for a large dog.
- For booking_action.reschedule, only propose if the original booking is at least 24 hours from today. Anything inside that window: hold and let staff handle (intent "booking_change", no booking_action).
- For booking_action.cancel, only propose if the booking is in "Booked" status (not yet checked in or finished). Mid-service or finished bookings: hold and let staff handle.
- If a breed is mentioned that you do not recognise (not a common UK breed name and not in the customer's "Dogs" context block), do NOT propose booking_action. Ask another natural question, populate extracted_state with the breed string for staff to confirm, and tell the customer "the team will confirm what size that breed is".
- Do not propose more than 3 candidate slots in a single message. If you want to offer more, ask the customer for a narrower preference first.
- NEVER quote prices as fixed guarantees. Guide prices labelled "starts from" or "guide price" are fine.
- NEVER invent appointment slots or days. SMALL/MEDIUM cite times only from "--- Availability ---"; LARGE cite days only from "--- Large-dog availability ---". If a block is missing or empty, say "let me just check the diary and come back to you".
- NEVER promise same-day turnaround or specific groomer assignments.
- If the message sounds distressed, angry, or is a complaint → intent "escalate", short empathetic holding reply, no booking_action.
- If a message seems medical or safety-related → intent "escalate", brief holding reply, no booking_action.

────────────────────────────────────────────────────────
POLICY GUIDANCE
────────────────────────────────────────────────────────
Matting:
- Explain gently that matting can be uncomfortable or painful.
- Say the groomer will check the coat in person.
- If matting is tight, the kindest option may be to go shorter because brushing out severe matting can hurt.
- Do not blame the owner.

Puppies:
- Frame puppy grooms around confidence and positive handling, not just appearance.
- If asked for a full adult-style haircut on a young puppy, say the groomer can advise what is suitable for their age, coat, and confidence.

Nervous, reactive, elderly, or difficult dogs:
- Gather details and hand over to the groomer when needed.
- Ask what they struggle with: handling, other dogs, dryer, feet, face, or being separated.
- Do not say "we can definitely groom them"; say the groomer needs to check what is safest and most comfortable.

Health and vet-related questions:
- Do not give veterinary advice.
- For skin infections, wounds, ear infections, limping, pain, recent surgery, pregnancy, seizures, sedation, medication, severe anxiety, or contagious conditions, recommend checking with a vet before booking.

Complaints:
- Stay calm. Do not argue. Do not admit fault.
- Ask for dog name, appointment date, a short explanation, and photos if relevant.
- Say you'll pass it to the team so they can look into it properly.

Booking enquiries:
- If details are missing, collect dog name, breed or size, age if puppy, service wanted, coat condition, matting/shedding, behaviour or health notes, preferred day/time, customer name, and phone number if not already known.
- Only ask for information needed to help. Do not ask for payment card details or unrelated sensitive personal information.

────────────────────────────────────────────────────────
CONFIDENCE
────────────────────────────────────────────────────────
Report honestly. Staff reads this number.
- 0.90+ : routine, unambiguous, factually grounded in the context you were given.
- 0.60-0.89 : reasonable draft, small uncertainty.
- Below 0.60 : you're guessing. Prefer an escalate with a holding reply.

────────────────────────────────────────────────────────
WALK-IN SERVICES
────────────────────────────────────────────────────────
Nail clips, gland expression, and ear cleans are walk-in only — no booking needed. If a customer asks about any of these, classify intent="faq" and answer with: "These are walk-in only — just pop in anytime between 08:30 and 13:00 (Mon, Tue or Wed), done while you wait 😊 🎓🐶❤️ X". Do NOT propose a booking_action for walk-in services.

────────────────────────────────────────────────────────
KNOWN-STATE / NO RE-ASKING
────────────────────────────────────────────────────────
When you receive a "--- Known so far ---" block, that is what we have already learned about this customer (dog name, breed, preferred day, etc.). Do NOT ask again for anything already in that block. Use those facts directly. If the customer corrects something (e.g. "actually it's a Cockapoo not a Cocker"), update via extracted_state.

After drafting your reply, include any newly-learned customer facts in the optional "extracted_state" field. Only include fields you are confident about from the latest message — leave a field out (or set null) if you don't know. The system merges your patch non-destructively.

────────────────────────────────────────────────────────
NEW CUSTOMER COLLECTION
────────────────────────────────────────────────────────
When --- Customer --- is "Unknown (...)", you are speaking to someone not on our records yet. Over the next few turns, gather:
- Customer first name + surname
- Dog name + breed
- Dog age (puppy if under 6 months)
- Any handling alerts (reactive, nervous, medical)
- Coat condition / matting state
- Preferred day

Use extracted_state to populate these on every turn. Ask for missing fields naturally — one or two per turn, never all in one go. Don't invent details.

Once you have ALL of the required fields above AND the breed is one you recognise, your next reply MUST be a single plain-text summary that asks the customer to confirm everything before we save it. Example shape:

  "Just to double-check — Sarah Lockwood, Alfie's a 3yo Cockapoo, nervous around dryers, coat in good condition, looking for a Wednesday — sound right? 🎓🐶❤️ X"

Do NOT propose a booking_action while customer is unknown. The system creates the records on the customer's next positive reply ("yes", "that's right", "perfect"); on the turn after, you'll see --- Customer --- populated and can move into the normal booking flow.

If the customer corrects a detail during the summary, update via extracted_state and re-summarise on the next turn.

────────────────────────────────────────────────────────
OUTPUT FORMAT
────────────────────────────────────────────────────────
Reply with ONE JSON object, no prose, no markdown, no code fences:

{
  "intent": "faq" | "greeting" | "booking_query" | "booking_propose" | "booking_confirm" | "booking_change" | "booking_cancel" | "confirm_time" | "smalltalk" | "escalate" | "other",
  "confidence": 0.00..1.00,
  "proposed_text": "your drafted reply including the 🎓🐶❤️ X sign-off",
  "booking_action": null | {
    "action": "create",
    "dog_id": "uuid from context",
    "booking_date": "YYYY-MM-DD",
    "slot": "HH:MM",
    "service": "full-groom" | "bath-and-brush" | "bath-and-deshed" | "puppy-groom",
    "size": "small" | "medium",
    "notes": "short reason, optional"
  } | {
    "action": "reschedule",
    "old_booking_id": "uuid from --- Upcoming bookings --- context",
    "new_date": "YYYY-MM-DD",
    "new_slot": "HH:MM",
    "notes": "short reason, optional"
  } | {
    "action": "cancel",
    "old_booking_id": "uuid from --- Upcoming bookings --- context",
    "reason": "quoted or paraphrased from the customer's message"
  },
  "extracted_state": null | {
    "customerName":      string | null,
    "customerSurname":   string | null,
    "dogName":           string | null,
    "breed":             string | null,
    "dogSize":           "small" | "medium" | "large" | "unknown" | null,
    "dogAge":            string | null,
    "alerts":            string[] | null,
    "coatCondition":     string | null,
    "service":           "full-groom" | "bath-and-brush" | "bath-and-deshed" | "puppy-groom" | null,
    "preferredDay":      string | null,
    "preferredTime":     string | null
  }
}

If you genuinely cannot draft something useful, return intent="escalate" with a short holding reply. Never return an empty proposed_text.`;

// ── Phone normalisation ──────────────────────────────────────
// Meta gives us wa_id like "447873329440". We store phone_e164 as
// "+447873329440" throughout. Keep one normaliser, used everywhere.
function normalisePhone(waId: string | null | undefined): string | null {
  if (!waId) return null;
  const digits = waId.replace(/\D/g, "");
  if (!digits) return null;
  return `+${digits}`;
}

// Match the inbound phone against humans.phone, which is NOT stored
// in a canonical form. Try a few sensible variants before giving up.
async function findHumanIdByPhone(
  supabase: SupabaseClient,
  phoneE164: string,
): Promise<string | null> {
  // "+447873329440"
  const digits = phoneE164.replace(/\D/g, ""); // 447873329440
  const ukLocal = digits.startsWith("44") ? "0" + digits.slice(2) : null; // 07873329440

  const candidates = [phoneE164, digits, ukLocal].filter(Boolean) as string[];

  const { data, error } = await supabase
    .from("humans")
    .select("id, phone")
    .in("phone", candidates)
    .limit(1);

  if (error) {
    console.error("findHumanIdByPhone error:", error);
    return null;
  }
  return data?.[0]?.id ?? null;
}

// ── Conversation + message writes ────────────────────────────
interface ConversationRow {
  id: string;
  state: string;
  human_id: string | null;
  phone_e164: string;
  auto_send_enabled: boolean;
  autonomous_booking_enabled: boolean;
  agent_state: AgentState;
  lead_status: "collecting" | "awaiting_summary_confirm" | "records_created" | null;
  lead_payload: AgentState | null;
}

async function upsertConversation(
  supabase: SupabaseClient,
  phoneE164: string,
  humanId: string | null,
  lastInboundAt: string,
  lastCustomerText: string | null,
): Promise<ConversationRow> {
  // UPSERT by phone_e164 (which has a UNIQUE constraint in the schema).
  // We update the denormalised "inbox preview" fields on every inbound.
  //
  // IMPORTANT: do NOT write to unread_count here. Migration 029 adds a
  // DB trigger on whatsapp_messages that increments atomically when the
  // inbound message row is inserted below. Writing to unread_count from
  // here causes double-counting (the bug fixed in 029).
  //
  // We also pull auto_send_enabled and agent_state on the same round
  // trip so the agent can read them without an extra select. Both
  // columns come from migrations 026 and 038 respectively.
  // Important: only include human_id in the upsert body when humanId is
  // non-null. Supabase upsert with onConflict updates every column in
  // the body, so writing human_id: null would silently clobber a value
  // previously set by createNewCustomerRecords (in which case the agent
  // would re-onboard the customer next turn). humanId is only ever set
  // from findHumanIdByPhone which already returns existing links.
  const upsertBody: Record<string, unknown> = {
    phone_e164: phoneE164,
    // Phase E added a channel column (whatsapp | sms) and replaced
    // the single-column unique constraint on phone_e164 with a
    // composite (phone_e164, channel). All inbound here is from
    // Meta's WhatsApp webhook, so the channel is always 'whatsapp'.
    // The composite ON CONFLICT target is required after that
    // migration — using "phone_e164" alone fails with "there is no
    // unique or exclusion constraint matching the ON CONFLICT
    // specification".
    channel: "whatsapp",
    last_inbound_at: lastInboundAt,
    last_customer_text: lastCustomerText ?? undefined,
  };
  if (humanId !== null) {
    upsertBody.human_id = humanId;
  }
  const { data, error } = await supabase
    .from("whatsapp_conversations")
    .upsert(
      upsertBody,
      { onConflict: "phone_e164,channel" },
    )
    .select("id, state, human_id, phone_e164, auto_send_enabled, autonomous_booking_enabled, agent_state, lead_status, lead_payload")
    .single();

  if (error || !data) {
    throw new Error(`upsertConversation failed: ${error?.message}`);
  }

  const row = data as {
    id: string;
    state: string;
    human_id: string | null;
    phone_e164: string;
    auto_send_enabled: boolean | null;
    autonomous_booking_enabled: boolean | null;
    agent_state: unknown;
    lead_status: string | null;
    lead_payload: unknown;
  };

  const validLeadStatuses = new Set(["collecting", "awaiting_summary_confirm", "records_created"]);

  return {
    id: row.id,
    state: row.state,
    human_id: row.human_id,
    phone_e164: row.phone_e164,
    auto_send_enabled: row.auto_send_enabled === true,
    autonomous_booking_enabled: row.autonomous_booking_enabled === true,
    agent_state: (row.agent_state && typeof row.agent_state === "object"
      ? (row.agent_state as AgentState)
      : {}) as AgentState,
    lead_status: (typeof row.lead_status === "string" && validLeadStatuses.has(row.lead_status)
      ? row.lead_status as "collecting" | "awaiting_summary_confirm" | "records_created"
      : null) ?? null,
    lead_payload: (row.lead_payload && typeof row.lead_payload === "object"
      ? (row.lead_payload as AgentState)
      : null) ?? null,
  };
}

async function insertInboundMessage(
  supabase: SupabaseClient,
  conversationId: string,
  eventId: string,
  metaMsgId: string | null,
  text: string | null,
  raw: MetaMessage,
  sentAt: string,
): Promise<{ duplicate: boolean; id: string | null }> {
  const { reaction_emoji, in_reply_to_meta_id } = reactionFields(raw);
  const { data, error } = await supabase.from("whatsapp_messages").insert({
    conversation_id: conversationId,
    event_id: eventId,
    direction: "inbound",
    role: "user",
    meta_message_id: metaMsgId,
    content: text,
    raw,
    reaction_emoji,
    in_reply_to_meta_id,
    status: "delivered", // inbound from Meta is by definition already delivered to us
    sent_at: sentAt,
  }).select("id").single();
  if (error) {
    // 23505 = unique_violation on idx_whatsapp_messages_meta_msg: the inbound
    // row already exists — Meta redelivered the message, or a concurrent
    // invocation of this same event won the insert race. That's a no-op, not a
    // failure, so signal it instead of throwing; the caller stops here so we
    // don't draft/auto-send a second reply.
    if (error.code === "23505" || error.message?.includes("idx_whatsapp_messages_meta_msg")) {
      return { duplicate: true, id: null };
    }
    throw new Error(`insertInboundMessage failed: ${error.message}`);
  }
  // The AFTER INSERT trigger whatsapp_messages_bump_unread (migration
  // 029) increments whatsapp_conversations.unread_count for us.
  return { duplicate: false, id: data?.id ?? null };
}

// ── Availability block ───────────────────────────────────────
// Queries get_small_medium_availability (migration 034) and formats
// the result as a prompt section. See the spec at
// docs/superpowers/specs/2026-04-24-whatsapp-agent-availability-design.md
//
// Format example:
//   --- Availability (next 30 days, small/medium dogs only) ---
//   Mon 27 Apr: 08:30 09:00 10:30 11:00 12:30
//   Tue 28 Apr: (all open)
//   Wed 29 Apr: 09:00 10:30
//   Mon 04 May: (closed)
//
// - "(all open)" when all 10 slots in active_slots() are free
// - "(closed)" only for default-open days (Mon/Tue/Wed) where
//   day_settings marks them closed; other closed days are omitted.
// - On error, returns a block that tells the agent to defer to staff.
const ACTIVE_SLOT_COUNT = 10; // matches active_slots() from migration 006
const AVAILABILITY_WINDOW_DAYS = 30;

function isDefaultOpenDay(isoDate: string): boolean {
  // isoDate = "YYYY-MM-DD"; getUTCDay: Sun=0, Mon=1, ..., Sat=6
  const dow = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
  return dow === 1 || dow === 2 || dow === 3;
}

function formatShortDate(isoDate: string): string {
  // "Mon 27 Apr" — matches the UK audience's natural reading
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
}

async function buildAvailabilityBlock(
  supabase: SupabaseClient,
  todayIso: string,
): Promise<string> {
  const toIso = new Date(Date.now() + AVAILABILITY_WINDOW_DAYS * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);

  const { data, error } = await supabase.rpc("get_small_medium_availability", {
    p_from: todayIso,
    p_to: toIso,
  });

  if (error) {
    console.warn("buildAvailabilityBlock RPC error:", error.message);
    return `--- Availability ---\n(unavailable — tell the customer the team will check the diary)`;
  }

  // Group slots by date
  const byDate = new Map<string, string[]>();
  for (const row of (data ?? []) as Array<{ booking_date: string; slot: string }>) {
    const list = byDate.get(row.booking_date) ?? [];
    list.push(row.slot);
    byDate.set(row.booking_date, list);
  }

  // Walk every day in the window so we can render "(closed)" for default-open days
  const lines: string[] = [];
  for (let offset = 0; offset <= AVAILABILITY_WINDOW_DAYS; offset++) {
    const d = new Date(Date.now() + offset * 24 * 3600 * 1000);
    const iso = d.toISOString().slice(0, 10);
    const slots = byDate.get(iso);

    if (slots && slots.length > 0) {
      const label = formatShortDate(iso);
      const slotList = slots.length >= ACTIVE_SLOT_COUNT
        ? "(all open)"
        : slots.join(" ");
      lines.push(`${label}: ${slotList}`);
      continue;
    }

    // No slots returned → either closed or fully booked.
    // Only annotate "(closed)" for default-open days; otherwise skip as noise.
    if (isDefaultOpenDay(iso)) {
      const label = formatShortDate(iso);
      lines.push(`${label}: (closed)`);
    }
  }

  const header = `--- Availability (next ${AVAILABILITY_WINDOW_DAYS} days, small/medium dogs only) ---`;
  if (lines.length === 0) {
    return `${header}\n(no open days in the next ${AVAILABILITY_WINDOW_DAYS} days — tell the customer the team will check the diary)`;
  }
  return `${header}\n${lines.join("\n")}`;
}

// ── Large-dog availability block ──────────────────────────────
// Queries get_large_dog_day_availability (migration 035) and formats
// the result as a compact prompt section. Day-level only: the agent
// may name candidate days but never a time-of-day for a large dog.
// Spec: docs/superpowers/specs/2026-04-27-whatsapp-agent-large-dog-availability-design.md
//
// Format example:
//   --- Large-dog availability (next 30 days) ---
//   Days with capacity: Mon 27 Apr, Wed 29 Apr, Tue 05 May
//   Days fully booked: Tue 28 Apr, Mon 04 May, Wed 06 May
//
// - "Days fully booked" is omitted if every open day has capacity.
// - Body is a single "(no large-dog capacity ...)" line if no day has capacity.
// - On RPC error, returns an "(unavailable ...)" body and logs a warning.
async function buildLargeDogAvailabilityBlock(
  supabase: SupabaseClient,
  todayIso: string,
): Promise<string> {
  const toIso = new Date(Date.now() + AVAILABILITY_WINDOW_DAYS * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);

  const { data, error } = await supabase.rpc("get_large_dog_day_availability", {
    p_from: todayIso,
    p_to: toIso,
  });

  const header = `--- Large-dog availability (next ${AVAILABILITY_WINDOW_DAYS} days) ---`;

  if (error) {
    console.warn("buildLargeDogAvailabilityBlock RPC error:", error.message);
    return `${header}\n(unavailable — tell the customer the team will check the diary)`;
  }

  const daysWithCapacity: string[] = [];
  const daysFullyBooked: string[] = [];

  for (const row of (data ?? []) as Array<{ booking_date: string; has_capacity: boolean }>) {
    const label = formatShortDate(row.booking_date);
    if (row.has_capacity) {
      daysWithCapacity.push(label);
    } else {
      daysFullyBooked.push(label);
    }
  }

  if (daysWithCapacity.length === 0) {
    return `${header}\n(no large-dog capacity in the next ${AVAILABILITY_WINDOW_DAYS} days — tell the customer the team will check the diary)`;
  }

  // The "Days with capacity:" / "Days fully booked:" prefixes are anchors
  // that the system prompt's HARD RULES block references verbatim. Keep
  // them in sync with the rule for large-dog availability above.
  const lines = [`Days with capacity: ${daysWithCapacity.join(", ")}`];
  if (daysFullyBooked.length > 0) {
    lines.push(`Days fully booked: ${daysFullyBooked.join(", ")}`);
  }
  return `${header}\n${lines.join("\n")}`;
}

// ── Known-state renderer ─────────────────────────────────────
// Compact one-block view of whatsapp_conversations.agent_state so
// Claude can read what we have already collected. Empty/null fields
// are skipped — a sparse block beats a dense one full of "unknown".
function renderAgentStateBlock(state: AgentState | null): string | null {
  if (!state) return null;
  const labels: Array<[keyof AgentState, string]> = [
    ["customerName", "Customer first name"],
    ["customerSurname", "Customer surname"],
    ["dogName", "Dog name"],
    ["breed", "Breed"],
    ["dogSize", "Size"],
    ["dogAge", "Dog age"],
    ["coatCondition", "Coat condition"],
    ["service", "Service"],
    ["preferredDay", "Preferred day"],
    ["preferredTime", "Preferred time"],
  ];
  const lines: string[] = [];
  for (const [key, label] of labels) {
    const value = state[key];
    if (typeof value === "string" && value.trim()) {
      lines.push(`${label}: ${value}`);
    }
  }
  if (Array.isArray(state.alerts) && state.alerts.length > 0) {
    lines.push(`Alerts: ${state.alerts.join(", ")}`);
  }
  if (lines.length === 0) return null;
  return `--- Known so far ---\n${lines.join("\n")}`;
}

// ── Context for Claude ───────────────────────────────────────
// We inject this as the user-turn content so the model clearly sees
// it as data rather than instruction. Keep it compact — Claude does
// better with less noise and the cost is per input token.
async function buildContext(
  supabase: SupabaseClient,
  conversationId: string,
  humanId: string | null,
  agentState: AgentState | null,
  autonomousBookingEnabled: boolean,
): Promise<string> {
  // Recent message history (last 20, oldest first)
  const { data: messages } = await supabase
    .from("whatsapp_messages")
    .select("direction, content, sent_at")
    .eq("conversation_id", conversationId)
    .order("sent_at", { ascending: false })
    .limit(20);

  // Param annotated explicitly: the Supabase row type is resolved from a
  // remote (esm.sh) type and can intermittently widen to `any`, which trips
  // noImplicitAny in the Deno type-check. A local supertype keeps it stable.
  const history = (messages ?? []).reverse().map(
    (m: { direction: string | null; content: string | null }) =>
      `${m.direction === "inbound" ? "Customer" : "Us"}: ${m.content ?? "(non-text)"}`,
  ).join("\n");

  const parts: string[] = [];

  // Give Claude today's date so it can interpret "tomorrow" / "next Monday"
  // in customer messages without needing a tool call.
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const dayName = today.toLocaleDateString("en-GB", { weekday: "long" });
  parts.push(`--- Today ---\n${dayName} ${todayIso} (UK time)`);

  parts.push(`--- Recent conversation (oldest first) ---\n${history || "(no prior messages)"}`);

  // Persistent extracted state — what we already know. Lets Claude
  // skip re-asking for things it has already collected. Only render
  // non-null fields so the prompt stays tight.
  const knownLines = renderAgentStateBlock(agentState);
  if (knownLines) parts.push(knownLines);

  if (humanId) {
    const { data: human } = await supabase
      .from("humans")
      .select("name, surname, notes, history_flag")
      .eq("id", humanId)
      .single();

    if (human) {
      parts.push(
        `--- Customer ---\nName: ${human.name} ${human.surname}${
          human.history_flag ? ` (flag: ${human.history_flag})` : ""
        }${human.notes ? `\nNotes: ${human.notes}` : ""}`,
      );
    }

    const { data: dogs } = await supabase
      .from("dogs")
      .select("id, name, breed, size, groom_notes, alerts")
      .eq("human_id", humanId);

    if (dogs?.length) {
      const dogLines = dogs.map((d: {
        id: string | null;
        name: string | null;
        breed: string | null;
        size: string | null;
        groom_notes: string | null;
        alerts: unknown;
      }) => {
        const alerts = Array.isArray(d.alerts) && d.alerts.length
          ? ` (alerts: ${d.alerts.join(", ")})`
          : "";
        const notes = d.groom_notes ? `\n    Notes: ${d.groom_notes}` : "";
        return `  - ${d.name} [dog_id: ${d.id}] (${d.breed}, ${d.size ?? "size unknown"})${alerts}${notes}`;
      }).join("\n");
      parts.push(`--- Dogs ---\n${dogLines}`);
    }

    // Next 14 days of bookings for this customer's dogs
    const in14 = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString().slice(0, 10);

    const { data: bookings } = await supabase
      .from("bookings")
      .select("id, booking_date, slot, service, status, confirmed, dogs!inner(name, human_id)")
      .eq("dogs.human_id", humanId)
      .gte("booking_date", todayIso)
      .lte("booking_date", in14)
      .order("booking_date", { ascending: true });

    if (bookings?.length) {
      // booking_id rendered so the agent can populate old_booking_id for
      // reschedule / cancel booking_actions (see HARD RULES in SYSTEM_PROMPT).
      const bookingLines = bookings.map((b: any) =>
        `  - ${b.dogs?.name ?? "?"}: ${b.booking_date} at ${b.slot} — ${b.service}${
          b.confirmed ? " (confirmed)" : " (unconfirmed)"
        } [booking_id: ${b.id}]`
      ).join("\n");
      parts.push(`--- Upcoming bookings (next 14 days) ---\n${bookingLines}`);
    } else {
      parts.push(`--- Upcoming bookings ---\n(none in next 14 days)`);
    }
  } else {
    parts.push(`--- Customer ---\nUnknown (phone not matched to any existing customer record). Do NOT address by name.`);
  }

  // Availability applies whether or not the customer is matched — the agent
  // might still propose a slot for a matched dog attached to a different
  // conversation, and unmatched customers will see it via staff approval anyway.
  parts.push(await buildAvailabilityBlock(supabase, todayIso));
  parts.push(await buildLargeDogAvailabilityBlock(supabase, todayIso));

  // Self-service nudge: when the customer is a known human AND staff
  // have turned autonomous booking OFF (AI auto mode, booking sub-toggle
  // off in the AIModeSelector), the agent should still help — but
  // instead of proposing a booking_action, it should point the customer
  // at the customer portal so they can pick their own slot. This block
  // tells Claude to append a warm CTA on booking-intent turns. It's an
  // additive instruction; the rest of the system prompt still applies
  // (e.g. don't propose a booking_action for large dogs).
  if (humanId && !autonomousBookingEnabled) {
    parts.push(
      [
        `--- Self-service portal ---`,
        `This customer is recognised AND staff have turned autonomous booking off for this conversation.`,
        `When the latest message is booking-related (intents: booking_query, booking_propose, booking_confirm, booking_change), do NOT propose a booking_action. Instead, draft a warm, on-brand reply that:`,
        `  1. Acknowledges what the customer asked for.`,
        `  2. Tells them they can book themselves at ${CUSTOMER_PORTAL_URL} (it's quicker and they'll see live availability).`,
        `  3. Reassures them you'll happily handle it if they prefer — just ask.`,
        `Keep the brand sign-off (🎓🐶❤️ X) on the final line as normal. Don't paste the URL more than once. For non-booking intents (faq, greeting, smalltalk, escalate, etc.) this block doesn't apply — reply normally without the self-service link.`,
      ].join("\n"),
    );
  }

  // New-customer sign-up nudge: an unrecognised person asking to get started
  // can be pointed at the portal to set up their account ("Join the Pack"),
  // alongside the in-chat onboarding you're already running.
  if (!humanId) {
    parts.push(
      [
        `--- New customer sign-up ---`,
        `This person isn't on our records yet. If they're asking to book or get set up, you MAY include this sign-up link ONCE so they can create their account: ${CUSTOMER_PORTAL_URL}`,
        `Keep gathering their details conversationally as usual (see NEW CUSTOMER COLLECTION). Don't paste the link more than once, and don't use it for non-booking chit-chat.`,
      ].join("\n"),
    );
  }

  return parts.join("\n\n");
}

// ── Claude call ──────────────────────────────────────────────
async function callClaude(
  context: string,
  latestMessage: string,
): Promise<{ draft: DraftFromClaude; tokensIn: number; tokensOut: number; raw: unknown }> {
  const body = {
    model: CLAUDE_MODEL,
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content:
          `${context}\n\n--- Customer's latest message ---\n${latestMessage}\n\nDraft a reply now, reply with the JSON object only.`,
      },
    ],
  };

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${errText}`);
  }

  const json: any = await res.json();
  const textBlock = json.content?.find((c: any) => c.type === "text");
  if (!textBlock) throw new Error("Claude returned no text block");

  const draft = parseClaudeJson(textBlock.text, latestMessage);

  return {
    draft,
    tokensIn: json.usage?.input_tokens ?? 0,
    tokensOut: json.usage?.output_tokens ?? 0,
    raw: json,
  };
}

// Best-effort JSON extractor. Claude occasionally wraps JSON in
// ```json fences despite being told not to — strip them before parse.
function parseClaudeJson(text: string, latestMessage: string): DraftFromClaude {
  let t = text.trim();
  // Strip leading/trailing code fences
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();

  try {
    const parsed = JSON.parse(t);
    if (
      typeof parsed?.intent === "string" &&
      typeof parsed?.confidence === "number" &&
      typeof parsed?.proposed_text === "string"
    ) {
      return {
        intent: parsed.intent as Intent,
        confidence: parsed.confidence,
        proposed_text: parsed.proposed_text,
        booking_action: parseBookingAction(parsed.booking_action),
        extracted_state: parseExtractedState(parsed.extracted_state),
      };
    }
  } catch {
    // fall through
  }

  // Fallback: something came back that we can't structure. Pick a
  // brand-voiced template based on a regex sniff of the inbound — at
  // least the customer gets a relevant holding reply rather than a
  // generic apology.
  // Truncate: the raw output can quote customer message content, which
  // must not be echoed wholesale into the function logs.
  console.warn(
    "parseClaudeJson: could not parse, returning fallback. Raw (first 200 chars):",
    text.slice(0, 200),
  );
  const guessedIntent = guessIntentFromText(latestMessage);
  return {
    intent: "escalate",
    confidence: 0.0,
    proposed_text: fallbackReplyForIntent(guessedIntent),
    extracted_state: null,
  };
}

// Whitelist of state-patch keys we accept from Claude's JSON. Anything
// else is silently dropped — keeps the column clean if a model decides
// to invent fields.
function parseExtractedState(value: unknown): Partial<AgentState> | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const out: Partial<AgentState> = {};
  const stringKeys: (keyof AgentState)[] = [
    "customerName",
    "customerSurname",
    "dogName",
    "breed",
    "dogAge",
    "coatCondition",
    "service",
    "preferredDay",
    "preferredTime",
  ];
  for (const key of stringKeys) {
    const raw = v[key];
    if (typeof raw === "string" && raw.trim()) {
      (out as Record<string, unknown>)[key] = raw.trim().slice(0, 200);
    }
  }
  if (typeof v.dogSize === "string") {
    const ds = v.dogSize.toLowerCase();
    if (ds === "small" || ds === "medium" || ds === "large" || ds === "unknown") {
      out.dogSize = ds;
    }
  }
  if (Array.isArray(v.alerts)) {
    const alerts = v.alerts
      .filter((a): a is string => typeof a === "string" && a.trim().length > 0)
      .map((a) => a.trim().slice(0, 100))
      .slice(0, 10);
    if (alerts.length > 0) out.alerts = alerts;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function parseBookingAction(value: unknown): BookingActionFromClaude | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  const action = obj.action;

  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (action === "create") {
    const validServices = new Set([
      "full-groom",
      "bath-and-brush",
      "bath-and-deshed",
      "puppy-groom",
    ]);
    // Large dogs go through the day-only availability + staff path —
    // see HARD RULES in SYSTEM_PROMPT. Reject "large" at the parser so
    // a model that ignores the prompt can't sneak a large-dog booking
    // through to apply.
    const validSizes = new Set(["small", "medium"]);
    if (typeof obj.dog_id !== "string" || !uuidRe.test(obj.dog_id)) return null;
    if (typeof obj.booking_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(obj.booking_date)) return null;
    if (typeof obj.slot !== "string" || !/^\d{2}:\d{2}$/.test(obj.slot)) return null;
    if (typeof obj.service !== "string" || !validServices.has(obj.service)) return null;
    return {
      action: "create",
      dog_id: obj.dog_id,
      booking_date: obj.booking_date,
      slot: obj.slot,
      service: obj.service as "full-groom" | "bath-and-brush" | "bath-and-deshed" | "puppy-groom",
      ...(typeof obj.size === "string" && validSizes.has(obj.size)
        ? { size: obj.size as "small" | "medium" }
        : {}),
      ...(typeof obj.notes === "string" && obj.notes.trim()
        ? { notes: obj.notes.trim().slice(0, 300) }
        : {}),
    };
  }

  if (action === "reschedule") {
    if (typeof obj.old_booking_id !== "string" || !uuidRe.test(obj.old_booking_id)) return null;
    if (typeof obj.new_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(obj.new_date)) return null;
    if (typeof obj.new_slot !== "string" || !/^\d{2}:\d{2}$/.test(obj.new_slot)) return null;
    return {
      action: "reschedule",
      old_booking_id: obj.old_booking_id,
      new_date: obj.new_date,
      new_slot: obj.new_slot,
      ...(typeof obj.notes === "string" && obj.notes.trim()
        ? { notes: obj.notes.trim().slice(0, 300) }
        : {}),
    };
  }

  if (action === "cancel") {
    if (typeof obj.old_booking_id !== "string" || !uuidRe.test(obj.old_booking_id)) return null;
    // reason must be a meaningful explanation (>= 3 chars after trim) so the
    // cancel_reason column carries something legible, not just punctuation.
    if (typeof obj.reason !== "string" || obj.reason.trim().length < 3) return null;
    return {
      action: "cancel",
      old_booking_id: obj.old_booking_id,
      reason: obj.reason.trim().slice(0, 300),
    };
  }

  return null;
}

// ── Draft save ───────────────────────────────────────────────
interface DraftPolicy {
  riskLevel: RiskLevel;
  handoffRequired: boolean;
  autoSendEligible: boolean;
}

async function saveDraft(
  supabase: SupabaseClient,
  conversationId: string,
  triggerMessageEventId: string | null,
  draft: DraftFromClaude,
  policy: DraftPolicy,
  tokensIn: number,
  tokensOut: number,
  rawResponse: unknown,
): Promise<string> {
  // Find the whatsapp_messages.id for the inbound message we just
  // inserted — trigger_message_id on the draft is a nice-to-have
  // for the admin UI to show "in response to this message".
  let triggerMessageId: string | null = null;
  if (triggerMessageEventId) {
    const { data } = await supabase
      .from("whatsapp_messages")
      .select("id")
      .eq("event_id", triggerMessageEventId)
      .eq("direction", "inbound")
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    triggerMessageId = data?.id ?? null;
  }

  // requires_approval is the legacy v1 flag (always true). The new
  // handoff_required column is stricter — true only when human review
  // is mandatory, not just preferred. They're orthogonal: high-risk
  // sets both; routine medium-risk sets requires_approval=true and
  // handoff_required=false (staff approves but it's not urgent).
  const { data, error } = await supabase.from("whatsapp_drafts").insert({
    conversation_id: conversationId,
    trigger_message_id: triggerMessageId,
    proposed_text: draft.proposed_text,
    intent: draft.intent,
    confidence: Math.max(0, Math.min(1, draft.confidence)), // clamp
    requires_approval: true, // v1: always gated; auto-send fast-path runs after this row exists
    state: "pending",
    risk_level: policy.riskLevel,
    handoff_required: policy.handoffRequired,
    auto_send_eligible: policy.autoSendEligible,
    model: CLAUDE_MODEL,
    tokens_input: tokensIn,
    tokens_output: tokensOut,
    tool_calls: rawResponse as Record<string, unknown>,
  }).select("id").single();
  if (error) throw new Error(`saveDraft failed: ${error.message}`);
  return data.id as string;
}

// Persist a merged agent_state patch onto whatsapp_conversations.
// Errors here are non-fatal — if state persistence fails, the draft
// has already been saved and staff can act on it. The next inbound
// will just see the previous state.
async function persistAgentState(
  supabase: SupabaseClient,
  conversationId: string,
  state: AgentState,
): Promise<void> {
  const { error } = await supabase
    .from("whatsapp_conversations")
    .update({ agent_state: state })
    .eq("id", conversationId);
  if (error) {
    console.warn("persistAgentState failed (non-fatal):", error.message);
  }
}

// Auto-dispatch hook. Calls whatsapp-send with mode:'draft' so the
// existing pipeline handles the Meta call, the outbound message row,
// and updating the draft state to 'auto_sent'. We do NOT short-circuit
// any of that here — keeping a single send code path.
async function dispatchIfEligible(
  draftId: string,
  policy: DraftPolicy,
): Promise<void> {
  if (!policy.autoSendEligible) return;
  if (!SEND_INTERNAL_SECRET) {
    console.warn("dispatchIfEligible: SEND_INTERNAL_SECRET is not set; skipping auto-send");
    return;
  }
  try {
    const res = await fetch(WHATSAPP_SEND_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-secret": SEND_INTERNAL_SECRET,
      },
      body: JSON.stringify({
        mode: "draft",
        draft_id: draftId,
        ai_initiated: true,
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.warn(`dispatchIfEligible: whatsapp-send returned ${res.status}: ${errText}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("dispatchIfEligible failed (non-fatal):", message);
  }
}

// ── Booking-entry dispatch helpers ───────────────────────────

/** True if we've recently sent a booking-entry or Flow message on this
 *  conversation — used only to swallow accidental rapid-repeat "book" texts
 *  (e.g. the same message sent twice). Kept short (3 min) so a genuine new
 *  booking request a few minutes later still gets a fresh entry. */
async function recentlySentBookEntry(
  supabase: SupabaseClient,
  conversationId: string,
): Promise<boolean> {
  const since = new Date(Date.now() - 3 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("whatsapp_messages")
    .select("id, content")
    .eq("conversation_id", conversationId)
    .eq("direction", "outbound")
    .gte("sent_at", since)
    .or("content.ilike.[book_entry]%,content.ilike.[flow:%");
  if (error) {
    console.warn("recentlySentBookEntry query failed (treating as not-recent):", error.message);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

/** Message 1: the tap-to-confirm identity message (book_entry send mode). */
async function dispatchBookEntry(
  conversationId: string,
  humanId: string,
  phoneE164: string,
): Promise<void> {
  if (!SEND_INTERNAL_SECRET) {
    console.warn("dispatchBookEntry: SEND_INTERNAL_SECRET not set; skipping");
    return;
  }
  try {
    const res = await fetch(WHATSAPP_SEND_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-secret": SEND_INTERNAL_SECRET },
      body: JSON.stringify({
        mode: "book_entry",
        to: phoneE164,
        conversation_id: conversationId,
        human_id: humanId,
        ai_initiated: true,
      }),
    });
    if (!res.ok) {
      console.warn(`dispatchBookEntry: whatsapp-send returned ${res.status}: ${await res.text()}`);
    }
  } catch (err) {
    console.warn("dispatchBookEntry failed (non-fatal):", err instanceof Error ? err.message : String(err));
  }
}

/** Message 2: portal link in the body + a "Book on WhatsApp" Flow CTA. Sent
 *  when the customer taps "Yes, book in" on Message 1. */
async function dispatchBookingFlow(
  conversationId: string,
  humanId: string,
  phoneE164: string,
): Promise<void> {
  if (!SEND_INTERNAL_SECRET) {
    console.warn("dispatchBookingFlow: SEND_INTERNAL_SECRET not set; skipping");
    return;
  }
  if (!WHATSAPP_BOOKING_FLOW_ID) {
    console.warn("dispatchBookingFlow: WHATSAPP_BOOKING_FLOW_ID not set; cannot open the Flow");
    return;
  }
  const bodyText =
    `Lovely 🐾 The quickest way is to manage everything yourself in your account: ` +
    `${CUSTOMER_PORTAL_URL} — just log in with this number.\n\n` +
    `Or tap below to book right here on WhatsApp.`;
  try {
    const res = await fetch(WHATSAPP_SEND_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-secret": SEND_INTERNAL_SECRET },
      body: JSON.stringify({
        mode: "flow",
        to: phoneE164,
        conversation_id: conversationId,
        human_id: humanId,
        flow_id: WHATSAPP_BOOKING_FLOW_ID,
        flow_type: "appointment_booking",
        body_text: bodyText,
        cta: "Book on WhatsApp",
        ai_initiated: true,
      }),
    });
    if (!res.ok) {
      console.warn(`dispatchBookingFlow: whatsapp-send returned ${res.status}: ${await res.text()}`);
    }
  } catch (err) {
    console.warn("dispatchBookingFlow failed (non-fatal):", err instanceof Error ? err.message : String(err));
  }
}

// ── Manage-booking (Flow C): cancel & reschedule ─────────────
// A recognised customer can cancel or reschedule their own upcoming visit.
// Whole-visit granularity; 24h cut-off → staff; reschedule reuses the booking
// Flow; multiple upcoming → a nonce-backed list. Cancellation reuses the
// existing confirm-buttons + apply-customer-confirm machinery; the actual
// destructive write is the group-aware cancel RPC.

/** POST to whatsapp-send; true on 2xx. */
async function callWhatsappSend(body: Record<string, unknown>): Promise<boolean> {
  if (!SEND_INTERNAL_SECRET) {
    console.warn("callWhatsappSend: SEND_INTERNAL_SECRET not set; skipping");
    return false;
  }
  try {
    const res = await fetch(WHATSAPP_SEND_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-secret": SEND_INTERNAL_SECRET },
      body: JSON.stringify({ ...body, ai_initiated: true }),
    });
    if (!res.ok) console.warn(`whatsapp-send ${body.mode} returned ${res.status}: ${await res.text()}`);
    return res.ok;
  } catch (err) {
    console.warn(`whatsapp-send ${body.mode} failed:`, err instanceof Error ? err.message : String(err));
    return false;
  }
}

function sendManageText(conversationId: string, text: string): Promise<boolean> {
  return callWhatsappSend({ mode: "manual", conversation_id: conversationId, text });
}

/** Debounce: a manage *picker list* sent on this convo in the last 3 min.
 *  Deliberately does NOT match `[flow:…]` sends — those include the ordinary
 *  booking Flow (Message 2), which must not swallow a later reschedule. */
async function recentlySentManageBooking(supabase: SupabaseClient, conversationId: string): Promise<boolean> {
  const since = new Date(Date.now() - 3 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("whatsapp_messages")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("direction", "outbound")
    .gte("sent_at", since)
    .ilike("content", "[manage_list]%");
  return (data?.length ?? 0) > 0;
}

/** A live (awaiting confirm, unexpired) cancel already staged on this convo. */
async function hasLiveCancelAction(supabase: SupabaseClient, conversationId: string): Promise<boolean> {
  const { data } = await supabase
    .from("whatsapp_booking_actions")
    .select("id, customer_confirm_expires_at")
    .eq("conversation_id", conversationId)
    .eq("action", "cancel")
    .eq("state", "awaiting_customer_confirm")
    .order("created_at", { ascending: false })
    .limit(1);
  const row = data?.[0] as { customer_confirm_expires_at?: string } | undefined;
  if (!row) return false;
  const exp = row.customer_confirm_expires_at ? new Date(row.customer_confirm_expires_at) : null;
  return !exp || exp > new Date();
}

interface ResolvedUpcoming {
  visits: UpcomingVisit[];
  dogSizes: Record<string, DogSize>;
}

/** Fetch + group a customer's upcoming Booked visits (ownership via dogs join). */
async function resolveUpcomingGroupsForHuman(
  supabase: SupabaseClient,
  humanId: string,
  now: Date,
): Promise<ResolvedUpcoming> {
  const today = salonToday(now);
  const { data, error } = await supabase
    .from("bookings")
    .select("id, group_id, booking_date, slot, service, dog_id, dogs!inner(human_id, name, size)")
    .eq("status", "Booked")
    .eq("dogs.human_id", humanId)
    .gte("booking_date", today)
    .order("booking_date")
    .order("slot");
  if (error) {
    console.error("resolveUpcomingGroupsForHuman failed:", error.message);
    return { visits: [], dogSizes: {} };
  }
  const dogSizes: Record<string, DogSize> = {};
  const rows: ManageBookingRow[] = ((data as Array<Record<string, unknown>>) ?? []).map((r) => {
    const dog = r.dogs as { name?: string; size?: DogSize } | null;
    if (dog?.size) dogSizes[r.dog_id as string] = dog.size;
    return {
      id: r.id as string,
      group_id: (r.group_id as string | null) ?? null,
      booking_date: r.booking_date as string,
      slot: r.slot as string,
      service: (r.service as string | null) ?? null,
      dog_id: r.dog_id as string,
      dog_name: dog?.name ?? "your dog",
      size: dog?.size ?? null,
    };
  });
  return { visits: groupUpcomingBookings(rows), dogSizes };
}

function dispatchManageList(
  conversationId: string,
  humanId: string,
  phoneE164: string,
  nonce: string,
  visits: UpcomingVisit[],
): Promise<boolean> {
  const rows = visits.slice(0, 10).map((v) => ({
    id: manageRowId(nonce, v.key),
    title: joinNames(v.dogs.map((d) => d.name)),
    description: v.label.replace(/^.*groom on /, ""), // "Wed 24 Jun at 9:30"
  }));
  return callWhatsappSend({
    mode: "list",
    to: phoneE164,
    conversation_id: conversationId,
    human_id: humanId,
    body_text: "You've got a few grooms coming up — which one would you like to manage? 🐾",
    button_text: "Choose a groom",
    section_title: "Upcoming grooms",
    rows,
  });
}

async function dispatchManageCancel(
  supabase: SupabaseClient,
  conversationId: string,
  visit: UpcomingVisit,
): Promise<boolean> {
  // Single active: supersede any prior pending/awaiting cancel on this convo.
  await supabase
    .from("whatsapp_booking_actions")
    .update({ state: "rejected_by_customer", rejection_reason: "superseded_by_new_manage" })
    .eq("conversation_id", conversationId)
    .eq("action", "cancel")
    .in("state", ["pending", "awaiting_customer_confirm"]);

  const { data, error } = await supabase
    .from("whatsapp_booking_actions")
    .insert({
      conversation_id: conversationId,
      action: "cancel",
      target_booking_id: visit.bookingIds[0],
      payload: {
        reason: "Customer cancelled via WhatsApp",
        cancel_whole_group: true,
        enforce_24h_cutoff: true,
        visit_start_at: visit.startAt,
        booking_ids: visit.bookingIds,
        group_id: visit.groupId,
      },
      state: "pending",
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("dispatchManageCancel: stage failed:", error?.message);
    return false;
  }
  return callWhatsappSend({
    mode: "confirm_buttons",
    conversation_id: conversationId,
    booking_action_id: (data as { id: string }).id,
    summary_text: `Just checking — do you want to cancel ${visit.label}?`,
    action_kind: "cancel",
  });
}

function dispatchRescheduleFlow(
  conversationId: string,
  humanId: string,
  phoneE164: string,
  visit: UpcomingVisit,
  dogSizes: Record<string, DogSize>,
): Promise<boolean> {
  if (!WHATSAPP_BOOKING_FLOW_ID) {
    console.warn("dispatchRescheduleFlow: WHATSAPP_BOOKING_FLOW_ID not set; cannot open the Flow");
    return Promise.resolve(false);
  }
  const initialState = buildRescheduleInitialState(visit, dogSizes);
  // Open on WELCOME (rendered inline) with the dogs/services pre-seeded; the
  // endpoint routes WELCOME→SELECT_DATE for reschedule mode, skipping the pet
  // + per-dog screens. (SELECT_DATE can't be the opening screen — its dates
  // data is computed by the endpoint, not carried in the flow message.)
  return callWhatsappSend({
    mode: "flow",
    to: phoneE164,
    conversation_id: conversationId,
    human_id: humanId,
    flow_id: WHATSAPP_BOOKING_FLOW_ID,
    flow_type: "cancel_reschedule",
    initial_state: initialState,
    initial_data: {
      greeting: "Let's move your groom 🐾",
      intro: "Same dogs and service — just pick a new day and time on the next screens.",
    },
    body_text: `No worries — let's move ${visit.label}. Tap below to pick a new day and time 🐾`,
    cta: "Pick a new time",
  });
}

/** 24h cut-off: tell the customer warmly + flag the conversation for staff. */
async function manageCutoffHandoff(
  supabase: SupabaseClient,
  conversationId: string,
  eventId: string | null,
  action: "cancel" | "reschedule",
): Promise<void> {
  const msg = action === "cancel"
    ? "This one's within 24 hours, so I can't cancel it automatically here. I've flagged it for the team and someone will pick it up as soon as they can. 🐾"
    : "This appointment is within 24 hours, so I can't move it automatically here. I've flagged it for the team so they can help you properly. 🐾";
  await sendManageText(conversationId, msg);
  const policy: DraftPolicy = { riskLevel: "high", handoffRequired: true, autoSendEligible: false };
  const draft: DraftFromClaude = {
    intent: "escalate",
    confidence: 0,
    proposed_text:
      `[Within 24h ${action}] Customer asked to ${action} within 24h of their groom — needs the team. They've already been told you'll be in touch.`,
    extracted_state: null,
  };
  await saveDraft(supabase, conversationId, eventId, draft, policy, 0, 0, { reason: `manage_24h_cutoff:${action}` });
}

/** Run the chosen action against a resolved visit; re-applies the 24h cut-off. */
async function executeManageAction(
  supabase: SupabaseClient,
  conversationId: string,
  humanId: string,
  phoneE164: string,
  eventId: string | null,
  action: "cancel" | "reschedule",
  visit: UpcomingVisit,
  dogSizes: Record<string, DogSize>,
): Promise<void> {
  if (isInsideManageCutoff(new Date(visit.startAt), new Date())) {
    await manageCutoffHandoff(supabase, conversationId, eventId, action);
    return;
  }
  if (action === "cancel") {
    await dispatchManageCancel(supabase, conversationId, visit);
  } else {
    await dispatchRescheduleFlow(conversationId, humanId, phoneE164, visit, dogSizes);
  }
}

/**
 * Handle a manage-booking (cancel/reschedule) message for a recognised
 * customer. Returns true if it owned the message (agent should `continue`).
 * Triggers: a manage:* list tap, a Cancel/Reschedule template button, or typed
 * booking_cancel/booking_change intent. Client ids are hints — everything is
 * re-resolved + re-checked server-side.
 */
async function handleManageBooking(
  supabase: SupabaseClient,
  conversation: ConversationRow,
  msg: MetaInboundMessage,
  text: string | null,
  phoneE164: string,
  eventId: string | null,
): Promise<boolean> {
  const humanId = conversation.human_id;
  if (!humanId) return false;
  const now = new Date();

  // (a) List selection — a tap on a manage:<nonce>:<key> row.
  const parsed = parseManageRowId(msg.interactive?.list_reply?.id);
  if (parsed) {
    const { data: session } = await supabase
      .from("whatsapp_manage_sessions")
      .select("id, human_id, action, status, expires_at")
      .eq("id", parsed.nonce)
      .maybeSingle();
    const s = session as
      | { id: string; human_id: string; action: string; status: string; expires_at: string }
      | null;
    if (!s || s.human_id !== humanId || s.status !== "pending_selection" || new Date(s.expires_at) < now) {
      await sendManageText(
        conversation.id,
        'That selection has expired — just send "cancel" or "reschedule" again and I\'ll pull your bookings up. 🐾',
      );
      return true;
    }
    // Re-resolve live, re-validate, consume the nonce (single-use).
    const { visits, dogSizes } = await resolveUpcomingGroupsForHuman(supabase, humanId, now);
    await supabase
      .from("whatsapp_manage_sessions")
      .update({ status: "consumed", selected_key: parsed.visitKey })
      .eq("id", s.id);
    const visit = visits.find((v) => v.key === parsed.visitKey);
    if (!visit) {
      await sendManageText(
        conversation.id,
        'That booking is no longer available to manage — send "cancel" or "reschedule" again and I\'ll show you what\'s booked. 🐾',
      );
      return true;
    }
    await executeManageAction(
      supabase,
      conversation.id,
      humanId,
      phoneE164,
      eventId,
      s.action === "reschedule" ? "reschedule" : "cancel",
      visit,
      dogSizes,
    );
    return true;
  }

  // (b)/(c) Fresh intent — Cancel/Reschedule template button or typed text.
  const btn = msg.button?.text?.trim().toLowerCase();
  let action: "cancel" | "reschedule" | null = null;
  if (btn === "cancel") action = "cancel";
  else if (btn === "reschedule" || btn === "rebook") action = "reschedule";
  else if (text) {
    const intent = guessIntentFromText(text);
    if (intent === "booking_cancel") action = "cancel";
    else if (intent === "booking_change") action = "reschedule";
  }
  if (!action) return false;

  // Debounce: a live cancel confirm already out, or a recent list/flow send.
  if (action === "cancel" && (await hasLiveCancelAction(supabase, conversation.id))) {
    await sendManageText(
      conversation.id,
      'You\'ve already got a cancellation waiting — just tap "Yes, cancel" or "No" on the message above. 🐾',
    );
    return true;
  }
  if (await recentlySentManageBooking(supabase, conversation.id)) return true;

  const { visits, dogSizes } = await resolveUpcomingGroupsForHuman(supabase, humanId, now);
  if (visits.length === 0) {
    await sendManageText(
      conversation.id,
      "I can't see any upcoming grooms booked in for you just now. Want to book one in? 🐾",
    );
    return true;
  }
  if (visits.length === 1) {
    await executeManageAction(supabase, conversation.id, humanId, phoneE164, eventId, action, visits[0], dogSizes);
    return true;
  }

  // Multiple upcoming → nonce-backed list. Supersede any prior pending pick.
  await supabase
    .from("whatsapp_manage_sessions")
    .update({ status: "superseded" })
    .eq("human_id", humanId)
    .eq("status", "pending_selection");
  const { data: sess, error: sessErr } = await supabase
    .from("whatsapp_manage_sessions")
    .insert({
      human_id: humanId,
      conversation_id: conversation.id,
      action,
      candidate_visits: visits,
      status: "pending_selection",
    })
    .select("id")
    .single();
  if (sessErr || !sess) {
    console.error("handleManageBooking: manage session insert failed:", sessErr?.message);
    await sendManageText(
      conversation.id,
      "Sorry — something went wrong pulling your bookings up. Please try again in a moment. 🐾",
    );
    return true;
  }
  await dispatchManageList(conversation.id, humanId, phoneE164, (sess as { id: string }).id, visits);
  return true;
}

// Slot values the autonomous create path will write. Used as a final
// guard in case parseBookingAction lets through a parseable-but-not-real
// HH:MM. Reschedule's new_slot is validated against the same set.
const VALID_SLOTS = new Set([
  "08:30", "09:00", "09:30", "10:00", "10:30",
  "11:00", "11:30", "12:00", "12:30", "13:00",
]);

// Write a row to whatsapp_ai_action_audit for every saveBookingAction
// invocation, regardless of outcome. Inserts that fail are warned but
// not thrown — audit must never block a staging decision.
async function auditAiAction(
  supabase: SupabaseClient,
  conversationId: string,
  draftId: string,
  actionKind: "create" | "reschedule" | "cancel",
  outcome:
    | "staged"
    | "rejected_capacity"
    | "rejected_rate_limit"
    | "rejected_ownership"
    | "rejected_invalid",
  payload: unknown,
  reason: string | null = null,
) {
  const { error } = await supabase.from("whatsapp_ai_action_audit").insert({
    conversation_id: conversationId,
    draft_id: draftId,
    action_kind: actionKind,
    outcome,
    reason,
    payload,
  });
  if (error) {
    console.warn("auditAiAction insert failed:", error.message);
  }
}

// Count rows in whatsapp_ai_action_audit where outcome='staged' for this
// conversation in the last 24h. Drives the AI_BOOKING_DAILY_CAP gate.
async function countRecentStagedActions(
  supabase: SupabaseClient,
  conversationId: string,
): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from("whatsapp_ai_action_audit")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId)
    .eq("outcome", "staged")
    .gte("created_at", since);
  if (error) {
    // Fail closed-ish: log and treat as 0 so we don't deadlock the AI on
    // an audit-table outage, but the warn signals the operator.
    console.warn("countRecentStagedActions failed:", error.message);
    return 0;
  }
  return count ?? 0;
}

// Re-validate slot capacity at stage time using the SECURITY DEFINER
// helpers added in 20260519055000_capacity_helpers_security_definer.
// The model's availability data may be a few minutes stale; this catches
// races where another booking landed between the model's read and now.
// Mirror of engine/capacity.ts + the validate_booking_capacity trigger:
// total slot capacity = 2 seats, large dog seats vary by slot, max one
// large dog per slot.
async function checkSlotCapacity(
  supabase: SupabaseClient,
  dogSize: string,
  date: string,
  slot: string,
  excludeBookingId: string | null = null,
): Promise<{ ok: boolean; reason: string | null }> {
  const { data: seatsUsed, error: usedErr } = await supabase.rpc(
    "get_seats_used",
    { p_date: date, p_slot: slot, p_exclude_id: excludeBookingId },
  );
  if (usedErr) {
    return { ok: false, reason: `get_seats_used failed: ${usedErr.message}` };
  }
  const seatsNeeded =
    dogSize === "large"
      ? slot === "08:30" || slot === "09:00" || slot === "12:00"
        ? 1
        : 2
      : 1;
  const SLOT_CAPACITY = 2;
  const used = typeof seatsUsed === "number" ? seatsUsed : 0;
  if (used + seatsNeeded > SLOT_CAPACITY) {
    return {
      ok: false,
      reason: `seats_used=${used} + seats_needed=${seatsNeeded} > ${SLOT_CAPACITY}`,
    };
  }
  if (dogSize === "large") {
    const { data: hasLarge, error: lgErr } = await supabase.rpc(
      "has_large_dog",
      { p_date: date, p_slot: slot, p_exclude_id: excludeBookingId },
    );
    if (lgErr) {
      return { ok: false, reason: `has_large_dog failed: ${lgErr.message}` };
    }
    if (hasLarge) {
      return { ok: false, reason: "slot already has a large dog" };
    }
  }
  return { ok: true, reason: null };
}

async function saveBookingAction(
  supabase: SupabaseClient,
  conversationId: string,
  draftId: string,
  draft: DraftFromClaude,
) {
  const action = draft.booking_action;
  if (!action) return;

  // Rate-limit gate. Counts STAGED actions in the last 24h for this
  // conversation; rejected attempts don't count, so a confused model
  // burning the same slot 10 times in a row won't lock the customer out.
  const recentStaged = await countRecentStagedActions(supabase, conversationId);
  if (recentStaged >= AI_BOOKING_DAILY_CAP) {
    await auditAiAction(
      supabase,
      conversationId,
      draftId,
      action.action,
      "rejected_rate_limit",
      action,
      `staged count in last 24h (${recentStaged}) >= cap (${AI_BOOKING_DAILY_CAP})`,
    );
    return;
  }

  if (action.action === "create") {
    if (!VALID_SLOTS.has(action.slot)) {
      await auditAiAction(
        supabase,
        conversationId,
        draftId,
        "create",
        "rejected_invalid",
        action,
        `slot "${action.slot}" not in VALID_SLOTS`,
      );
      return;
    }

    const { data: dog } = await supabase
      .from("dogs")
      .select("id, size, human_id")
      .eq("id", action.dog_id)
      .maybeSingle();
    if (!dog) {
      await auditAiAction(
        supabase,
        conversationId,
        draftId,
        "create",
        "rejected_invalid",
        action,
        `dog ${action.dog_id} not found`,
      );
      return;
    }

    const { data: conversation } = await supabase
      .from("whatsapp_conversations")
      .select("human_id")
      .eq("id", conversationId)
      .maybeSingle();
    if (conversation?.human_id && conversation.human_id !== dog.human_id) {
      await auditAiAction(
        supabase,
        conversationId,
        draftId,
        "create",
        "rejected_ownership",
        action,
        `conversation.human_id=${conversation.human_id} dog.human_id=${dog.human_id}`,
      );
      return;
    }

    // The dog's recorded size is authoritative — never let the model-supplied
    // action.size under-size a large dog (capacity + pricing bypass). The RPC
    // also reads dogs.size at insert; this keeps the capacity pre-check honest.
    const effectiveSize = dog.size ?? action.size ?? "small";

    const capacity = await checkSlotCapacity(
      supabase,
      effectiveSize,
      action.booking_date,
      action.slot,
    );
    if (!capacity.ok) {
      await auditAiAction(
        supabase,
        conversationId,
        draftId,
        "create",
        "rejected_capacity",
        action,
        capacity.reason,
      );
      return;
    }

    const payload = {
      dog_id: action.dog_id,
      booking_date: action.booking_date,
      slot: action.slot,
      service: action.service,
      size: effectiveSize,
      addons: [],
      payment: "Due at Pick-up",
      confirmed: true,
      source: "whatsapp_ai",
      notes: action.notes ?? null,
    };

    const { error } = await supabase.from("whatsapp_booking_actions").insert({
      conversation_id: conversationId,
      draft_id: draftId,
      action: "create",
      payload,
      state: "pending",
    });
    if (error) throw new Error(`saveBookingAction(create) failed: ${error.message}`);

    await auditAiAction(
      supabase,
      conversationId,
      draftId,
      "create",
      "staged",
      payload,
      null,
    );
    return;
  }

  if (action.action === "reschedule" || action.action === "cancel") {
    if (action.action === "reschedule" && !VALID_SLOTS.has(action.new_slot)) {
      await auditAiAction(
        supabase,
        conversationId,
        draftId,
        "reschedule",
        "rejected_invalid",
        action,
        `new_slot "${action.new_slot}" not in VALID_SLOTS`,
      );
      return;
    }

    const { data: booking } = await supabase
      .from("bookings")
      .select("id, size, dogs!inner(human_id)")
      .eq("id", action.old_booking_id)
      .maybeSingle();
    if (!booking) {
      await auditAiAction(
        supabase,
        conversationId,
        draftId,
        action.action,
        "rejected_invalid",
        action,
        `booking ${action.old_booking_id} not found`,
      );
      return;
    }

    const bookingHumanId = (booking as { dogs?: { human_id?: string } | null })
      .dogs?.human_id ?? null;
    const bookingSize = (booking as { size?: string }).size ?? "small";

    const { data: conversation } = await supabase
      .from("whatsapp_conversations")
      .select("human_id")
      .eq("id", conversationId)
      .maybeSingle();
    if (
      conversation?.human_id &&
      bookingHumanId &&
      conversation.human_id !== bookingHumanId
    ) {
      await auditAiAction(
        supabase,
        conversationId,
        draftId,
        action.action,
        "rejected_ownership",
        action,
        `conversation.human_id=${conversation.human_id} booking.dogs.human_id=${bookingHumanId}`,
      );
      return;
    }

    if (action.action === "reschedule") {
      const capacity = await checkSlotCapacity(
        supabase,
        bookingSize,
        action.new_date,
        action.new_slot,
        action.old_booking_id,
      );
      if (!capacity.ok) {
        await auditAiAction(
          supabase,
          conversationId,
          draftId,
          "reschedule",
          "rejected_capacity",
          action,
          capacity.reason,
        );
        return;
      }
    }

    const payload =
      action.action === "reschedule"
        ? {
            old_booking_id: action.old_booking_id,
            new_date: action.new_date,
            new_slot: action.new_slot,
            notes: action.notes ?? null,
          }
        : {
            old_booking_id: action.old_booking_id,
            reason: action.reason,
          };

    const { error } = await supabase.from("whatsapp_booking_actions").insert({
      conversation_id: conversationId,
      draft_id: draftId,
      action: action.action,
      payload,
      target_booking_id: action.old_booking_id,
      state: "pending",
    });
    if (error) throw new Error(`saveBookingAction(${action.action}) failed: ${error.message}`);

    await auditAiAction(
      supabase,
      conversationId,
      draftId,
      action.action,
      "staged",
      payload,
      null,
    );
    return;
  }
}

// ── Delivery status handler ─────────────────────────────────
async function handleStatus(supabase: SupabaseClient, status: MetaStatus) {
  if (!status.id || !status.status) return;

  const patch: Record<string, unknown> = { status: status.status };
  if (status.status === "delivered" && status.timestamp) {
    patch.delivered_at = new Date(Number(status.timestamp) * 1000).toISOString();
  }
  if (status.status === "read" && status.timestamp) {
    patch.read_at = new Date(Number(status.timestamp) * 1000).toISOString();
  }
  if (status.status === "failed") {
    patch.error_message = JSON.stringify(status.errors ?? []);
  }

  const { error } = await supabase
    .from("whatsapp_messages")
    .update(patch)
    .eq("meta_message_id", status.id)
    .eq("direction", "outbound");

  if (error) console.error("handleStatus update failed:", error);
}

// ── Autonomous booking helpers ───────────────────────────────
function inferDogSize(
  breed: string | null,
  bookingAction: BookingActionFromClaude,
): "small" | "medium" | "large" | "unknown" | null {
  // For create actions, the action carries an explicit size — use it.
  if (bookingAction.action === "create" && bookingAction.size) return bookingAction.size;
  // Otherwise resolve from breed. Reschedule/cancel actions don't carry
  // size — we trust that the original booking already had the right
  // size and the gate doesn't need to redo the check at this stage.
  if (!breed) return null;
  // Mirror src/constants/breeds.ts. Edge functions can't import from
  // src/, so this is a curated inline subset of the most common UK
  // breeds. Unknown breed returns "unknown" → canAutoBook fails.
  const small = ["king charles cavalier","cavalier king charles spaniel","maltese","bichon frise","shih tzu","yorkshire terrier","yorkie","pomeranian","chihuahua","mini dachshund","miniature dachshund","toy poodle","lhasa apso","french bulldog","frenchie","pug","boston terrier","havanese","papillon","italian greyhound","japanese chin","brussels griffon","affenpinscher","miniature pinscher","min pin","chinese crested","pekingese","scottish terrier","scottie","west highland terrier","west highland white terrier","westie","cairn terrier","norfolk terrier","norwich terrier","toy fox terrier","silky terrier","dandie dinmont terrier","english toy terrier"];
  const medium = ["cocker spaniel","cockapoo","spaniel","springer spaniel","english springer spaniel","border collie","bearded collie","standard poodle","poodle","sheltie","shetland sheepdog","whippet","corgi","welsh corgi","pembroke welsh corgi","cardigan welsh corgi","staffordshire bull terrier","staffy","jack russell","jack russell terrier","beagle","basset hound","border terrier","bichon","tibetan terrier","schnauzer","miniature schnauzer","standard schnauzer","keeshond","american eskimo","brittany","wheaten terrier","soft coated wheaten terrier"];
  const large = ["husky","siberian husky","alaskan malamute","labrador","labrador retriever","golden retriever","german shepherd","alsatian","rottweiler","doberman","doberman pinscher","great dane","newfoundland","bernese mountain dog","saint bernard","st bernard","irish setter","english setter","gordon setter","dalmatian","weimaraner","vizsla","rhodesian ridgeback","akita","mastiff","old english sheepdog","bullmastiff","leonberger","greater swiss mountain dog","standard bernedoodle","bernedoodle","goldendoodle","labradoodle"];
  const b = breed.toLowerCase().trim();
  if (small.includes(b)) return "small";
  if (medium.includes(b)) return "medium";
  if (large.includes(b)) return "large";
  return "unknown";
}

function buildConfirmSummary(action: BookingActionFromClaude): string {
  if (action.action === "create") {
    return `Confirm ${formatDateShort(action.booking_date)} at ${action.slot} — ${serviceLabel(action.service)}?`;
  }
  if (action.action === "reschedule") {
    return `Confirm move to ${formatDateShort(action.new_date)} at ${action.new_slot}?`;
  }
  // cancel
  return `Cancel this booking? (${action.reason.slice(0, 60)})`;
}

function formatDateShort(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
}

function serviceLabel(s: string): string {
  const map: Record<string, string> = {
    "full-groom": "full groom",
    "bath-and-brush": "bath & brush",
    "bath-and-deshed": "bath & deshed",
    "puppy-groom": "puppy groom",
  };
  return map[s] ?? s;
}

async function dispatchConfirmButtons(
  supabase: SupabaseClient,
  conversationId: string,
  draftId: string,
  bookingAction: BookingActionFromClaude,
): Promise<void> {
  // The action row was just inserted by saveBookingAction. Find it by
  // draft_id + state='pending' (the staging state). After whatsapp-send
  // succeeds, the action row transitions to 'awaiting_customer_confirm'.
  const { data: actionRow } = await supabase
    .from("whatsapp_booking_actions")
    .select("id")
    .eq("draft_id", draftId)
    .eq("state", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!actionRow) return;

  const summaryText = buildConfirmSummary(bookingAction);
  const actionKind =
    bookingAction.action === "create"
      ? "book"
      : bookingAction.action === "reschedule"
      ? "reschedule"
      : "cancel";

  if (!SEND_INTERNAL_SECRET) {
    console.warn("dispatchConfirmButtons: SEND_INTERNAL_SECRET not set; skipping");
    return;
  }

  try {
    const res = await fetch(WHATSAPP_SEND_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-secret": SEND_INTERNAL_SECRET,
      },
      body: JSON.stringify({
        mode: "confirm_buttons",
        conversation_id: conversationId,
        booking_action_id: actionRow.id,
        summary_text: summaryText,
        action_kind: actionKind,
        ai_initiated: true,
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.warn(`dispatchConfirmButtons: whatsapp-send returned ${res.status}: ${errText}`);
    }
  } catch (err) {
    console.warn("dispatchConfirmButtons failed (non-fatal):", err);
  }
}

// ── New-customer lead state machine helpers ──────────────────

// New-customer onboarding fields. AI must populate these via
// extracted_state before we can transition to summary-confirm.
const REQUIRED_LEAD_FIELDS: (keyof AgentState)[] = [
  "customerName",
  "customerSurname",
  "dogName",
  "breed",
  "dogAge",
  "coatCondition",
  "preferredDay",
];

function isLeadComplete(payload: AgentState | null): boolean {
  if (!payload) return false;
  for (const key of REQUIRED_LEAD_FIELDS) {
    const value = payload[key];
    if (typeof value !== "string" || !value.trim()) return false;
  }
  return true;
}

// isPositiveConfirm + POSITIVE_TOKENS now live in ../_shared/agentHelpers.ts
// so they can be exercised from src/lib/ai/agentHelpers.test.ts.

async function createNewCustomerRecords(
  supabase: SupabaseClient,
  conversationId: string,
  phoneE164: string,
  payload: AgentState,
): Promise<{ ok: true; humanId: string; dogId: string } | { ok: false; reason: string }> {
  const notesParts: string[] = [];
  if (payload.coatCondition) notesParts.push(`Coat (at signup): ${payload.coatCondition}`);
  if (payload.preferredDay) notesParts.push(`Preferred day: ${payload.preferredDay}`);

  // Idempotency check: if a previous attempt left a humans row for this
  // phone tagged source='whatsapp_ai' (because the dogs insert or
  // rollback failed last time), reuse it instead of inserting a second.
  // The partial unique index from migration 20260512160000 is the DB-
  // level backstop that catches the concurrent-retry race between
  // this SELECT and the INSERT below.
  const { data: existingHuman } = await supabase
    .from("humans")
    .select("id")
    .eq("phone", phoneE164)
    .eq("source", "whatsapp_ai")
    .maybeSingle();

  let humanId: string;
  if (existingHuman?.id) {
    humanId = existingHuman.id;
  } else {
    const { data: humanRow, error: humanErr } = await supabase
      .from("humans")
      .insert({
        name: payload.customerName,
        surname: payload.customerSurname,
        phone: phoneE164,
        notes: notesParts.length > 0 ? notesParts.join(" · ") : null,
        source: "whatsapp_ai",
      })
      .select("id")
      .single();
    if (humanErr || !humanRow) {
      return { ok: false, reason: `humans insert failed: ${humanErr?.message}` };
    }
    humanId = humanRow.id;
  }

  const dogSize = payload.dogSize ?? "unknown";
  const { data: dogRow, error: dogErr } = await supabase
    .from("dogs")
    .insert({
      human_id: humanId,
      name: payload.dogName,
      breed: payload.breed,
      size: dogSize === "unknown" ? null : dogSize,
      groom_notes: payload.coatCondition ?? null,
      alerts: Array.isArray(payload.alerts) ? payload.alerts : null,
    })
    .select("id")
    .single();
  if (dogErr || !dogRow) {
    // Rollback only the humans row we just created (not a pre-existing
    // reused row from the idempotency SELECT). If existingHuman matched,
    // we don't own the row and shouldn't delete it.
    if (!existingHuman?.id) {
      const { error: rollbackErr } = await supabase
        .from("humans")
        .delete()
        .eq("id", humanId)
        .eq("source", "whatsapp_ai");
      if (rollbackErr) {
        console.warn(`createNewCustomerRecords rollback failed (non-fatal): ${rollbackErr.message}`);
      }
    }
    return { ok: false, reason: `dogs insert failed: ${dogErr?.message}` };
  }

  const { error: convUpdateErr } = await supabase
    .from("whatsapp_conversations")
    .update({ human_id: humanId, lead_status: "records_created" })
    .eq("id", conversationId);
  if (convUpdateErr) {
    // Records exist (humans + dogs) but the conversation didn't get
    // linked. Surface the inconsistency loudly — next inbound turn
    // would re-enter the onboarding FSM (still sees human_id as null
    // on the conversation row) and the idempotency SELECT above would
    // reuse the same humans row, but the dogs row would conflict on
    // duplicate. Staff need to fix the link manually.
    console.error(
      `createNewCustomerRecords: humans+dogs created but conversation update failed for conv ${conversationId}: ${convUpdateErr.message}`,
    );
    return { ok: false, reason: `conversation link failed: ${convUpdateErr.message}` };
  }

  return { ok: true, humanId, dogId: dogRow.id };
}

// ── Post-creation correction helper ─────────────────────────
// Columns the AI is allowed to update on humans/dogs after onboarding.
// Breed is deliberately excluded — changing breed re-derives size and
// needs staff review. Service / preferredDay / preferredTime aren't
// stored on humans or dogs (they're agent_state only).
const HUMAN_UPDATE_WHITELIST: (keyof AgentState)[] = ["customerName", "customerSurname"];
const DOG_UPDATE_WHITELIST: (keyof AgentState)[] = ["dogName", "dogAge", "coatCondition"];

async function applyPostCreationCorrections(
  supabase: SupabaseClient,
  humanId: string,
  current: AgentState | null,
  patch: Partial<AgentState>,
): Promise<void> {
  // Only apply when the humans row is the one the AI itself created.
  // Manually-entered customers (source NULL or other) must never be
  // edited by the AI — staff use the dashboard for those.
  const { data: human, error: humanErr } = await supabase
    .from("humans")
    .select("id, source, name, surname")
    .eq("id", humanId)
    .single();
  if (humanErr || !human) return;
  if (human.source !== "whatsapp_ai") return;

  // AgentState key → humans column mapping. Iterating the whitelist
  // gives the constant its intended effect: removing an entry from
  // HUMAN_UPDATE_WHITELIST genuinely suppresses writes for that key.
  const HUMAN_KEY_TO_COLUMN: Partial<Record<keyof AgentState, string>> = {
    customerName: "name",
    customerSurname: "surname",
  };
  const humanUpdate: Record<string, string> = {};
  for (const key of HUMAN_UPDATE_WHITELIST) {
    const column = HUMAN_KEY_TO_COLUMN[key];
    if (!column) continue;
    const newValue = patch[key];
    if (typeof newValue !== "string" || !newValue) continue;
    if (newValue === current?.[key]) continue;
    humanUpdate[column] = newValue;
  }
  if (Object.keys(humanUpdate).length > 0) {
    const { error: updateErr } = await supabase
      .from("humans")
      .update(humanUpdate)
      .eq("id", humanId)
      .eq("source", "whatsapp_ai"); // defence-in-depth — still scoped
    if (updateErr) {
      console.warn(`applyPostCreationCorrections(humans) failed: ${updateErr.message}`);
    }
  }

  // Dogs — find the AI-owned dog(s) for this human and apply the diff.
  // Multi-dog new-customer onboarding is out of scope (the lead flow
  // captures one dog only), so we operate on the first dog row.
  const { data: dogs } = await supabase
    .from("dogs")
    .select("id, name")
    .eq("human_id", humanId)
    .order("created_at", { ascending: true });
  if (!dogs || dogs.length === 0) return;

  const dogId = dogs[0].id;

  // dogAge has no DB column today — the lead flow doesn't persist it
  // into dogs. Whitelisted for forward-compat but produces no write.
  // dogs.alerts is jsonb (string[]); handled separately below.
  // Note on groom_notes: at onboarding-time createNewCustomerRecords
  // writes the coat condition string into groom_notes verbatim, so the
  // column starts as exactly the coat value. A subsequent correction
  // here OVERWRITES that value. If staff have manually appended notes
  // to an AI-onboarded dog before a correction lands, those notes will
  // be lost. Acceptable trade-off given source='whatsapp_ai' rows are
  // primarily owned by the AI's onboarding pipeline; a richer schema
  // (separate coat_condition column) would solve this properly.
  const DOG_KEY_TO_COLUMN: Partial<Record<keyof AgentState, string>> = {
    dogName: "name",
    coatCondition: "groom_notes",
  };
  const dogUpdate: Record<string, unknown> = {};
  for (const key of DOG_UPDATE_WHITELIST) {
    const column = DOG_KEY_TO_COLUMN[key];
    if (!column) continue;
    const newValue = patch[key];
    if (typeof newValue !== "string" || !newValue) continue;
    if (newValue === current?.[key]) continue;
    dogUpdate[column] = newValue;
  }
  // Alerts (string[]) — non-string-keyed; only fires when patch differs
  // from the current value by structure. parseExtractedState already
  // drops empty arrays so patch.alerts === [] is unreachable via the
  // normal AI path; if a future caller bypasses the parser the diff
  // still catches no-op patches.
  if (Array.isArray(patch.alerts) && JSON.stringify(patch.alerts) !== JSON.stringify(current?.alerts ?? [])) {
    dogUpdate.alerts = patch.alerts;
  }

  if (Object.keys(dogUpdate).length > 0) {
    // Ownership belt-and-braces: filter on human_id at UPDATE time so
    // even a stale dogId can't land a write on the wrong dog.
    const { error: updateErr } = await supabase
      .from("dogs")
      .update(dogUpdate)
      .eq("id", dogId)
      .eq("human_id", humanId);
    if (updateErr) {
      console.warn(`applyPostCreationCorrections(dogs) failed: ${updateErr.message}`);
    }
  }
}

// ── Main handler ─────────────────────────────────────────────
// Exported (rather than passed straight to serve()) so the dispatch
// contract can be tested under `deno test` without starting a server —
// index.ts is the entrypoint shim that binds this to serve().
export async function handleAgentRequest(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  // Shared-secret auth. Migration 027's trigger sends this header.
  // Without it we'd be processing whatever any random caller POSTs.
  if (
    !timingSafeEqualHeader(
      req.headers.get("x-agent-secret"),
      AGENT_CALLBACK_SECRET,
    )
  ) {
    return new Response("unauthorized", { status: 401 });
  }

  let body: { event_id?: string; force_draft?: boolean; suggest_only?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    return new Response("bad json", { status: 400 });
  }

  if (!body.event_id) {
    return new Response("missing event_id", { status: 400 });
  }

  // Phase G — AI on demand. The default mode for conversations is
  // human_takeover; the agent normally short-circuits and just
  // persists the inbound message. Callers (the "Generate reply"
  // button on the inbox) can override by sending { force_draft: true }
  // alongside event_id — that bypasses the human-only skip and runs
  // the full Claude path for this one turn.
  //
  // suggest_only is the staff "Generate reply" button: it wants the
  // SAME full Claude path (so it implies force_draft), but instead of
  // persisting a draft / booking action / auto-sending, the handler
  // returns the drafted text so the inbox can type it into the compose
  // box. The human owns the send.
  const suggestOnly = body.suggest_only === true;
  const forceDraft = body.force_draft === true || suggestOnly;

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Load the event row
  const { data: event, error: eventError } = await supabase
    .from("whatsapp_events")
    .select("id, signature_valid, processing_status, payload")
    .eq("id", body.event_id)
    .single();

  if (eventError || !event) {
    console.error("event not found:", eventError);
    return new Response("event not found", { status: 404 });
  }

  // Idempotency: if someone calls us twice, don't reprocess.
  // Exception: when force_draft is set (the "Generate reply" button
  // on the inbox), staff explicitly want a fresh draft for an event
  // that's already been processed — usually because they want to
  // re-prompt the AI after editing the conversation context.
  if (event.processing_status !== "pending" && !forceDraft) {
    return new Response(`already ${event.processing_status}`, { status: 200 });
  }
  if (!event.signature_valid) {
    await supabase
      .from("whatsapp_events")
      .update({
        processing_status: "ignored",
        processed_at: new Date().toISOString(),
        error_message: "signature_valid=false, ignored by agent",
      })
      .eq("id", event.id);
    return new Response("ignored (invalid signature)", { status: 200 });
  }

  try {
    const payload = event.payload as {
      entry?: Array<{ changes?: Array<{ value?: MetaChangeValue }> }>;
    };

    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value ?? {};

        // Inbound messages
        for (const msg of value.messages ?? []) {
          const phoneE164 = normalisePhone(msg.from);
          if (!phoneE164) continue;

          const humanId = await findHumanIdByPhone(supabase, phoneE164);
          const sentAt = msg.timestamp
            ? new Date(Number(msg.timestamp) * 1000).toISOString()
            : new Date().toISOString();

          const text = extractMessageText(msg);

          const conversation = await upsertConversation(
            supabase,
            phoneE164,
            humanId,
            sentAt,
            text,
          );

          // On a re-draft (forceDraft — the staff "Generate reply" /
          // "regenerate" buttons re-invoke this for an already-ingested
          // event) the inbound message is already in whatsapp_messages, so
          // re-inserting it violates the unique constraint on
          // meta_message_id and throws before we ever reach Claude. The
          // draft path reads the message from the in-memory `inboundText`
          // (and conversation history from the DB), not from this insert,
          // so skip it. The webhook path (forceDraft=false) is unchanged —
          // there its duplicate-key throw still usefully guards against Meta
          // redelivering a message and triggering a second draft/auto-send.
          if (!forceDraft) {
            const { duplicate, id: insertedId } = await insertInboundMessage(
              supabase,
              conversation.id,
              event.id,
              msg.id ?? null,
              text,
              msg,
              sentAt,
            );
            // Photo/sticker attachments: pull the bytes from Meta into
            // Storage so the inbox can show the actual picture. Strictly
            // best-effort — a download hiccup must never fail ingestion or
            // block the draft; the whatsapp-media function can retry later
            // (the media id stays valid on Meta for ~30 days).
            if (!duplicate && insertedId && META_ACCESS_TOKEN && extractInboundMedia(msg)) {
              try {
                await fetchAndStoreInboundMedia(
                  supabase,
                  META_ACCESS_TOKEN,
                  conversation.id,
                  insertedId,
                  msg,
                );
              } catch (mediaErr) {
                console.error("inbound media fetch failed (message kept):", mediaErr);
              }
            }
            if (duplicate) {
              // The inbound row already exists (Meta redelivery, or a
              // concurrent invocation of this same event won the insert race).
              // Record this run as ignored — not failed, so it drops off the
              // "AI agent issues" card — and stop before drafting a second
              // reply. Guard on still-pending so we never downgrade the winning
              // run's terminal status (it sets processed/failed unconditionally
              // at the end of the try).
              await supabase
                .from("whatsapp_events")
                .update({
                  processing_status: "ignored",
                  processed_at: new Date().toISOString(),
                  error_message: null,
                })
                .eq("id", event.id)
                .eq("processing_status", "pending");
              return new Response("ok (duplicate inbound, ignored)", { status: 200 });
            }
          }

          // Button-reply routing: if this inbound is a Yes/No tap on a
          // confirm_buttons message we sent (id matches <uuid>:yes|no),
          // dispatch to apply-customer-confirm and skip the Claude draft
          // for this turn. The apply function fires its own ack text via
          // whatsapp-send.
          const buttonReply = msg.interactive?.button_reply;
          if (buttonReply?.id) {
            const buttonReplyMatch = buttonReply.id.match(/^([0-9a-f-]{36}):(yes|no)$/i);
            if (buttonReplyMatch) {
              const [, actionId, choice] = buttonReplyMatch;
              const applySecret = Deno.env.get("APPLY_CONFIRM_INTERNAL_SECRET") ?? "";
              if (!applySecret) {
                console.warn("button_reply received but APPLY_CONFIRM_INTERNAL_SECRET not set; skipping");
              } else {
                const applyUrl = `${SUPABASE_URL}/functions/v1/apply-customer-confirm`;
                try {
                  const res = await fetch(applyUrl, {
                    method: "POST",
                    headers: {
                      "content-type": "application/json",
                      "x-internal-secret": applySecret,
                    },
                    // Pass caller_conversation_id so apply-customer-confirm
                    // can assert the action belongs to the sender's
                    // conversation — guards against a customer crafting
                    // a button_reply for another customer's action id.
                    body: JSON.stringify({
                      booking_action_id: actionId,
                      choice,
                      caller_conversation_id: conversation.id,
                    }),
                  });
                  if (!res.ok) {
                    const errText = await res.text();
                    console.warn(`apply-customer-confirm returned ${res.status}: ${errText}`);
                  }
                } catch (err) {
                  console.warn("apply-customer-confirm dispatch failed:", err);
                }
              }
              continue; // skip Claude draft for this turn
            }
          }

          // Booking-entry taps (Message 1 of the booking flow). "Yes, book in"
          // opens the Flow (with the portal link in the body); "Not me" is the
          // identity safety valve — hand to staff, never auto-book.
          if (buttonReply?.id?.startsWith("bookentry:")) {
            const choice = buttonReply.id.slice("bookentry:".length);
            if (choice === "start" && conversation.human_id) {
              await dispatchBookingFlow(conversation.id, conversation.human_id, phoneE164);
            } else if (choice === "notme") {
              const policy: DraftPolicy = {
                riskLevel: "high",
                handoffRequired: true,
                autoSendEligible: false,
              };
              const draft: DraftFromClaude = {
                intent: "escalate",
                confidence: 0,
                proposed_text: fallbackReplyForIntent("handoff"),
                extracted_state: null,
              };
              await saveDraft(supabase, conversation.id, event.id, draft, policy, 0, 0, {
                reason: "book_entry: customer tapped 'Not me'",
              });
            }
            continue; // handled — no Claude draft for a booking-entry tap
          }

          // Reminder confirm: customer tapped the "Confirm" Quick Reply on
          // their appointment_reminder template. This arrives as a
          // *template button reply* (msg.button.text), NOT an interactive
          // button_reply. It is its own path because the matching is
          // looser — we stamp every recent, sent WhatsApp reminder for
          // this customer's active bookings in one atomic RPC.
          if (msg.button?.text?.trim().toLowerCase() === "confirm" && conversation.human_id) {
            try {
              const { data: stampedIds, error: stampErr } = await supabase
                .rpc("mark_reminder_confirmed", { p_human_id: conversation.human_id });
              if (stampErr) {
                console.warn("mark_reminder_confirmed rpc failed:", stampErr.message);
              } else {
                const count = Array.isArray(stampedIds) ? stampedIds.length : 0;
                console.log(`mark_reminder_confirmed: stamped ${count} booking(s) for human ${conversation.human_id}`);
              }
            } catch (err) {
              console.warn("mark_reminder_confirmed dispatch failed:", err);
            }
            continue; // quiet acknowledgement — no AI draft for a bare Confirm tap
          }

          // Manage-booking (Flow C): a recognised customer cancelling or
          // rescheduling their own upcoming visit. MUST run before the
          // known-customer staff gate below — otherwise "cancel"/"reschedule"
          // map to booking_cancel/booking_change, which the booking-entry
          // fast path ignores, and the message is silently swallowed (the live
          // bug this fixes). Gated, and only acts when it recognises the
          // intent; otherwise it returns false and we fall through.
          if (WHATSAPP_MANAGE_BOOKING_ENABLED && conversation.human_id && !forceDraft) {
            const handled = await handleManageBooking(supabase, conversation, msg, text, phoneE164, event.id);
            if (handled) continue;
          }

          // Booking-entry fast path: a recognised customer asking for a NEW
          // booking gets the auto-sent identity confirm (Message 1), which
          // bypasses the staff-wait gate below. Only new-booking intent
          // qualifies — cancel/reschedule/faq fall through to the normal
          // path. Debounced so a customer mid-flow isn't re-prompted.
          if (
            WHATSAPP_BOOK_ENTRY_ENABLED &&
            conversation.human_id &&
            !forceDraft &&
            guessIntentFromText(text ?? "") === "booking_propose" &&
            !(await recentlySentBookEntry(supabase, conversation.id))
          ) {
            await dispatchBookEntry(conversation.id, conversation.human_id, phoneE164);
            continue;
          }

          // AI on demand. AI replies are generated ONLY on an explicit
          // staff click (force_draft via the "Generate reply" button). A
          // KNOWN customer never gets an automatic draft regardless of
          // conversation state — the inbound is persisted and waits.
          // Unknown customers (human_id IS NULL) still get one agent pass
          // so the onboarding state machine can collect their details —
          // staff don't have to babysit every cold inbound.
          const isKnownCustomer = conversation.human_id != null;
          if (isKnownCustomer && !forceDraft) {
            continue;
          }

          const inboundText = text ?? "(customer sent a non-text message)";

          // Kill switch — write a fallback draft tagged for handoff so
          // staff still see a row in the inbox, but don't burn a
          // Claude call when the assistant is intentionally off.
          if (!AI_ASSISTANT_ENABLED) {
            // Suggest-only never persists a draft; tell staff why the
            // box stayed empty instead.
            if (suggestOnly) {
              return new Response(
                JSON.stringify({
                  ok: false,
                  reason: "The AI assistant is currently turned off.",
                }),
                { status: 200, headers: { "content-type": "application/json" } },
              );
            }
            const policy: DraftPolicy = {
              riskLevel: "high",
              handoffRequired: true,
              autoSendEligible: false,
            };
            const draft: DraftFromClaude = {
              intent: "escalate",
              confidence: 0,
              proposed_text: fallbackReplyForIntent("handoff"),
              extracted_state: null,
            };
            await saveDraft(
              supabase,
              conversation.id,
              event.id,
              draft,
              policy,
              0,
              0,
              { reason: "AI_ASSISTANT_ENABLED=false" },
            );
            continue;
          }

          // Generate draft. autonomous_booking_enabled gates the
          // self-service nudge inside buildContext — when it's false
          // and the customer is recognised, the prompt tells Claude
          // to point them at the customer portal instead of proposing
          // a booking_action.
          const context = await buildContext(
            supabase,
            conversation.id,
            conversation.human_id ?? humanId,
            conversation.agent_state,
            conversation.autonomous_booking_enabled === true,
          );
          const { draft, tokensIn, tokensOut, raw } = await callClaude(context, inboundText);

          // Suggest-only (the staff "Generate reply" button): hand the
          // drafted text straight back so the inbox can type it into the
          // compose box. No draft row, no booking action, no learned-state
          // write, no auto-send — the human reviews and sends it.
          if (suggestOnly) {
            return new Response(
              JSON.stringify({ ok: true, reply_text: draft.proposed_text }),
              { status: 200, headers: { "content-type": "application/json" } },
            );
          }

          // Compute policy AFTER Claude returns so we can use the real
          // intent + confidence. classifyRisk also looks at message
          // content for medical/complaint keywords as a safety net.
          const riskLevel = classifyRisk(draft.intent, inboundText, draft.confidence);
          const handoffRequired = requiresHandoff(draft.intent, riskLevel, draft.confidence);
          const autoSendEligible = canAutoSend(draft.intent, riskLevel, handoffRequired, {
            envFlagEnabled: AI_AUTO_SEND_LOW_RISK,
            conversationOptedIn: conversation.auto_send_enabled,
          });
          const policy: DraftPolicy = { riskLevel, handoffRequired, autoSendEligible };

          // Persist learned state first — even if downstream writes
          // fail, the next turn benefits.
          if (draft.extracted_state) {
            const merged = mergeAgentState(conversation.agent_state, draft.extracted_state);
            await persistAgentState(supabase, conversation.id, merged);
          }

          // New-customer onboarding state machine. Runs only when the
          // conversation is unknown (no human_id). On positive-confirm
          // turns we promote the lead_payload into humans/dogs rows;
          // otherwise we keep collecting.
          if (!conversation.human_id) {
            const mergedPayload = mergeAgentState(
              conversation.lead_payload ?? conversation.agent_state,
              draft.extracted_state ?? {},
            );

            if (
              conversation.lead_status === "awaiting_summary_confirm" &&
              text &&
              isPositiveConfirm(text)
            ) {
              if (isLeadComplete(mergedPayload)) {
                const result = await createNewCustomerRecords(
                  supabase,
                  conversation.id,
                  conversation.phone_e164,
                  mergedPayload,
                );
                if (!result.ok) {
                  console.warn(`createNewCustomerRecords failed: ${result.reason}`);
                }
              }
            } else if (
              isLeadComplete(mergedPayload) &&
              conversation.lead_status !== "awaiting_summary_confirm" &&
              conversation.lead_status !== "records_created"
            ) {
              await supabase
                .from("whatsapp_conversations")
                .update({
                  lead_status: "awaiting_summary_confirm",
                  lead_payload: mergedPayload,
                })
                .eq("id", conversation.id);
            } else {
              await supabase
                .from("whatsapp_conversations")
                .update({
                  lead_status: conversation.lead_status ?? "collecting",
                  lead_payload: mergedPayload,
                })
                .eq("id", conversation.id);
            }
          }

          // Post-creation corrections: when the conversation is linked
          // (records created) and the AI extracted a patch, apply the
          // diff to humans/dogs. Restricted to AI-onboarded records via
          // applyPostCreationCorrections's source guard. Non-blocking
          // (warns on failure, doesn't fail the turn).
          if (
            conversation.human_id &&
            draft.extracted_state &&
            conversation.lead_status === "records_created"
          ) {
            await applyPostCreationCorrections(
              supabase,
              conversation.human_id,
              conversation.agent_state,
              draft.extracted_state,
            );
          }

          const draftId = await saveDraft(
            supabase,
            conversation.id,
            event.id,
            draft,
            policy,
            tokensIn,
            tokensOut,
            raw,
          );
          await saveBookingAction(supabase, conversation.id, draftId, draft);
          // Autonomous booking: if every gate passes (env flag, per-conv
          // opt-in, known customer, low risk, high confidence, small/medium
          // recognised breed, booking-related intent, ai_handling state),
          // send the confirm-buttons message. Otherwise the action stays
          // at 'pending' and the staff inbox handles it via the legacy
          // BookingActionPanel.
          if (draft.booking_action) {
            const breed = conversation.agent_state?.breed ?? null;
            const dogSize = inferDogSize(breed, draft.booking_action);
            const breedKnown = dogSize !== "unknown" && dogSize !== null;
            const eligible = canAutoBook({
              intent: draft.intent,
              riskLevel,
              confidence: draft.confidence,
              dogSize,
              customerIsKnown: !!conversation.human_id,
              conversationState: conversation.state,
              envFlagEnabled: AI_AUTONOMOUS_BOOKING_ENABLED,
              conversationOptedIn: conversation.autonomous_booking_enabled,
              breedKnown,
            });
            if (eligible) {
              await dispatchConfirmButtons(supabase, conversation.id, draftId, draft.booking_action);
            }
          }
          // A staff-clicked (force_draft) draft always waits for approval —
          // never auto-send it, regardless of env/conversation flags.
          if (!forceDraft) {
            await dispatchIfEligible(draftId, policy);
          }
        }

        // Status updates on our previously-sent messages
        for (const status of value.statuses ?? []) {
          await handleStatus(supabase, status);
        }
      }
    }

    // Suggest-only safety net: if we reach here in suggest mode we never
    // hit the post-callClaude early return — i.e. the event held no
    // draftable customer message (status callback, reaction, button tap,
    // etc.). Return JSON so the bridge always gets a parseable response,
    // and don't mutate the event's processing_status.
    if (suggestOnly) {
      return new Response(
        JSON.stringify({
          ok: false,
          reason: "Couldn't find a recent customer message to reply to.",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    await supabase
      .from("whatsapp_events")
      .update({
        processing_status: "processed",
        processed_at: new Date().toISOString(),
      })
      .eq("id", event.id);

    return new Response("ok", { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("whatsapp-agent failed:", message);
    await supabase
      .from("whatsapp_events")
      .update({
        processing_status: "failed",
        processed_at: new Date().toISOString(),
        error_message: message,
      })
      .eq("id", event.id);
    // Return 200 even on failure — we don't want pg_net to retry
    // forever on a bug. The row is already marked failed for debugging.
    return new Response("handled with error", { status: 200 });
  }
}

// ── Text extractor ───────────────────────────────────────────
// extractMessageText now lives in ../_shared/inboundMessage.ts (with
// reactionFields) so the reaction/quoted-reply handling is unit-tested.
