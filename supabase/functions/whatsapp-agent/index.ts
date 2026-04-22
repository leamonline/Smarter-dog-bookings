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
// Deploy with:
//   supabase functions deploy whatsapp-agent --no-verify-jwt
//   --no-verify-jwt is fine because we authenticate the pg_net trigger
//   ourselves via the AGENT_CALLBACK_SECRET header. This stops random
//   hits on the public URL from processing events.
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Environment ─────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const CLAUDE_MODEL = Deno.env.get("CLAUDE_MODEL") ?? "claude-sonnet-4-6";
const AGENT_CALLBACK_SECRET = Deno.env.get("AGENT_CALLBACK_SECRET")!;

// ── Types ───────────────────────────────────────────────────
interface MetaMessage {
  id?: string;
  from?: string;
  type?: string;
  timestamp?: string;
  text?: { body?: string };
  button?: { text?: string; payload?: string };
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
}

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
  intent:
    | "faq"
    | "greeting"
    | "booking_query"
    | "booking_propose"
    | "booking_confirm"
    | "booking_change"
    | "booking_cancel"
    | "confirm_time"
    | "smalltalk"
    | "escalate"
    | "other";
  confidence: number; // 0..1
  proposed_text: string;
}

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
- Booking slots: every 30 minutes, from 08:30 to 13:00 (last booking at 13:00).
- Bank holidays: closed; they make up the day on the following Thursday.
- If a customer asks for Thursday/Friday/weekend, kindly point out we're Mon-Wed and offer to find a slot in the next open window.

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
- NEVER confirm, create, move, or cancel a booking. If the customer asks any of those, say you'll check the diary and get back to them ASAP. Set intent accordingly (booking_query, booking_propose, booking_change, booking_cancel) with a holding reply.
- NEVER quote a specific price. Route pricing questions to staff.
- NEVER invent appointment slots beyond what's in the context you've been given. If the context doesn't list availability, don't make up times — say "let me just check the diary and come back to you".
- NEVER promise same-day turnaround or specific groomer assignments.
- If the message sounds distressed, angry, or is a complaint → intent "escalate", short empathetic holding reply ("thanks for letting me know, I'll make sure one of the team sees this straight away"). Don't attempt to resolve.
- If a message seems medical or safety-related (dog unwell, injury, adverse reaction to grooming) → intent "escalate", brief holding reply, let staff handle.

────────────────────────────────────────────────────────
CONFIDENCE
────────────────────────────────────────────────────────
Report honestly. Staff reads this number.
- 0.90+ : routine, unambiguous, factually grounded in the context you were given.
- 0.60-0.89 : reasonable draft, small uncertainty.
- Below 0.60 : you're guessing. Prefer an escalate with a holding reply.

────────────────────────────────────────────────────────
OUTPUT FORMAT
────────────────────────────────────────────────────────
Reply with ONE JSON object, no prose, no markdown, no code fences:

{
  "intent": "faq" | "greeting" | "booking_query" | "booking_propose" | "booking_confirm" | "booking_change" | "booking_cancel" | "confirm_time" | "smalltalk" | "escalate" | "other",
  "confidence": 0.00..1.00,
  "proposed_text": "your drafted reply including the 🎓🐶❤️ X sign-off"
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
async function upsertConversation(
  supabase: SupabaseClient,
  phoneE164: string,
  humanId: string | null,
  lastInboundAt: string,
  lastCustomerText: string | null,
): Promise<{ id: string; state: string; human_id: string | null }> {
  // UPSERT by phone_e164 (which has a UNIQUE constraint in the schema).
  // We update the denormalised "inbox preview" fields on every inbound.
  //
  // IMPORTANT: do NOT write to unread_count here. Migration 029 adds a
  // DB trigger on whatsapp_messages that increments atomically when the
  // inbound message row is inserted below. Writing to unread_count from
  // here causes double-counting (the bug fixed in 029).
  const { data, error } = await supabase
    .from("whatsapp_conversations")
    .upsert(
      {
        phone_e164: phoneE164,
        human_id: humanId, // only used on insert; we don't clobber an existing link
        last_inbound_at: lastInboundAt,
        last_customer_text: lastCustomerText ?? undefined,
      },
      { onConflict: "phone_e164" },
    )
    .select("id, state, human_id")
    .single();

  if (error || !data) {
    throw new Error(`upsertConversation failed: ${error?.message}`);
  }

  return data as { id: string; state: string; human_id: string | null };
}

async function insertInboundMessage(
  supabase: SupabaseClient,
  conversationId: string,
  eventId: string,
  metaMsgId: string | null,
  text: string | null,
  raw: MetaMessage,
  sentAt: string,
) {
  const { error } = await supabase.from("whatsapp_messages").insert({
    conversation_id: conversationId,
    event_id: eventId,
    direction: "inbound",
    role: "user",
    meta_message_id: metaMsgId,
    content: text,
    raw,
    status: "delivered", // inbound from Meta is by definition already delivered to us
    sent_at: sentAt,
  });
  if (error) throw new Error(`insertInboundMessage failed: ${error.message}`);
  // The AFTER INSERT trigger whatsapp_messages_bump_unread (migration
  // 029) increments whatsapp_conversations.unread_count for us.
}

// ── Context for Claude ───────────────────────────────────────
// We inject this as the user-turn content so the model clearly sees
// it as data rather than instruction. Keep it compact — Claude does
// better with less noise and the cost is per input token.
async function buildContext(
  supabase: SupabaseClient,
  conversationId: string,
  humanId: string | null,
): Promise<string> {
  // Recent message history (last 20, oldest first)
  const { data: messages } = await supabase
    .from("whatsapp_messages")
    .select("direction, content, sent_at")
    .eq("conversation_id", conversationId)
    .order("sent_at", { ascending: false })
    .limit(20);

  const history = (messages ?? []).reverse().map(
    (m) => `${m.direction === "inbound" ? "Customer" : "Us"}: ${m.content ?? "(non-text)"}`,
  ).join("\n");

  const parts: string[] = [];

  // Give Claude today's date so it can interpret "tomorrow" / "next Monday"
  // in customer messages without needing a tool call.
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const dayName = today.toLocaleDateString("en-GB", { weekday: "long" });
  parts.push(`--- Today ---\n${dayName} ${todayIso} (UK time)`);

  parts.push(`--- Recent conversation (oldest first) ---\n${history || "(no prior messages)"}`);

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
      .select("name, breed, size, groom_notes, alerts")
      .eq("human_id", humanId);

    if (dogs?.length) {
      const dogLines = dogs.map((d) => {
        const alerts = Array.isArray(d.alerts) && d.alerts.length
          ? ` (alerts: ${d.alerts.join(", ")})`
          : "";
        const notes = d.groom_notes ? `\n    Notes: ${d.groom_notes}` : "";
        return `  - ${d.name} (${d.breed}, ${d.size ?? "size unknown"})${alerts}${notes}`;
      }).join("\n");
      parts.push(`--- Dogs ---\n${dogLines}`);
    }

    // Next 14 days of bookings for this customer's dogs
    const in14 = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString().slice(0, 10);

    const { data: bookings } = await supabase
      .from("bookings")
      .select("booking_date, slot, service, status, confirmed, dogs!inner(name, human_id)")
      .eq("dogs.human_id", humanId)
      .gte("booking_date", todayIso)
      .lte("booking_date", in14)
      .order("booking_date", { ascending: true });

    if (bookings?.length) {
      const bookingLines = bookings.map((b: any) =>
        `  - ${b.dogs?.name ?? "?"}: ${b.booking_date} at ${b.slot} — ${b.service}${
          b.confirmed ? " (confirmed)" : " (unconfirmed)"
        }`
      ).join("\n");
      parts.push(`--- Upcoming bookings (next 14 days) ---\n${bookingLines}`);
    } else {
      parts.push(`--- Upcoming bookings ---\n(none in next 14 days)`);
    }
  } else {
    parts.push(`--- Customer ---\nUnknown (phone not matched to any existing customer record). Do NOT address by name.`);
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

  const draft = parseClaudeJson(textBlock.text);

  return {
    draft,
    tokensIn: json.usage?.input_tokens ?? 0,
    tokensOut: json.usage?.output_tokens ?? 0,
    raw: json,
  };
}

// Best-effort JSON extractor. Claude occasionally wraps JSON in
// ```json fences despite being told not to — strip them before parse.
function parseClaudeJson(text: string): DraftFromClaude {
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
      return parsed as DraftFromClaude;
    }
  } catch {
    // fall through
  }

  // Fallback: something came back that we can't structure. Return a
  // low-confidence escalate draft so staff still get a poke.
  console.warn("parseClaudeJson: could not parse, returning escalate fallback. Raw:", text);
  return {
    intent: "escalate",
    confidence: 0.0,
    proposed_text:
      "Thanks for your message — I'll make sure one of the team sees this and gets back to you shortly. 🎓🐶❤️ X",
  };
}

// ── Draft save ───────────────────────────────────────────────
async function saveDraft(
  supabase: SupabaseClient,
  conversationId: string,
  triggerMessageEventId: string | null,
  draft: DraftFromClaude,
  tokensIn: number,
  tokensOut: number,
  rawResponse: unknown,
) {
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

  const { error } = await supabase.from("whatsapp_drafts").insert({
    conversation_id: conversationId,
    trigger_message_id: triggerMessageId,
    proposed_text: draft.proposed_text,
    intent: draft.intent,
    confidence: Math.max(0, Math.min(1, draft.confidence)), // clamp
    requires_approval: true, // v1: always gated
    state: "pending",
    model: CLAUDE_MODEL,
    tokens_input: tokensIn,
    tokens_output: tokensOut,
    tool_calls: rawResponse as Record<string, unknown>,
  });
  if (error) throw new Error(`saveDraft failed: ${error.message}`);
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

// ── Main handler ─────────────────────────────────────────────
serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  // Shared-secret auth. Migration 027's trigger sends this header.
  // Without it we'd be processing whatever any random caller POSTs.
  const providedSecret = req.headers.get("x-agent-secret");
  if (!providedSecret || providedSecret !== AGENT_CALLBACK_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }

  let body: { event_id?: string } = {};
  try {
    body = await req.json();
  } catch {
    return new Response("bad json", { status: 400 });
  }

  if (!body.event_id) {
    return new Response("missing event_id", { status: 400 });
  }

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
  if (event.processing_status !== "pending") {
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

          await insertInboundMessage(
            supabase,
            conversation.id,
            event.id,
            msg.id ?? null,
            text,
            msg,
            sentAt,
          );

          // If staff has taken over, skip AI draft entirely.
          if (conversation.state !== "ai_handling") {
            continue;
          }

          // Generate draft
          const context = await buildContext(supabase, conversation.id, conversation.human_id ?? humanId);
          const { draft, tokensIn, tokensOut, raw } = await callClaude(
            context,
            text ?? "(customer sent a non-text message)",
          );
          await saveDraft(supabase, conversation.id, event.id, draft, tokensIn, tokensOut, raw);
        }

        // Status updates on our previously-sent messages
        for (const status of value.statuses ?? []) {
          await handleStatus(supabase, status);
        }
      }
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
});

// ── Text extractor ───────────────────────────────────────────
// Meta inbound messages come in several shapes. Pull the best
// plaintext representation for logging + Claude context.
function extractMessageText(msg: MetaMessage): string | null {
  if (msg.text?.body) return msg.text.body;
  if (msg.button?.text) return msg.button.text;
  if (msg.interactive?.button_reply?.title) return msg.interactive.button_reply.title;
  if (msg.interactive?.list_reply?.title) return msg.interactive.list_reply.title;
  if (msg.type) return `[${msg.type} message — no text content]`;
  return null;
}
