// ============================================================
// supabase/functions/_shared/inboundMessage.ts
//
// Pure interpretation of an inbound Meta WhatsApp message, extracted
// from whatsapp-agent/index.ts so it can be unit-tested under Vitest
// (mirroring the agentRisk / agentHelpers / confirmButtons pattern).
//
//   - extractMessageText : the best plaintext representation for the
//                          thread, the conversation-list preview, and
//                          Claude context.
//   - reactionFields     : the structured columns we persist for
//                          reactions / quoted replies (emoji + the
//                          wamid being referenced).
//
// No Deno or Supabase imports — safe to import from both the Deno
// edge runtime (../_shared/inboundMessage.ts) and Vitest/Node
// (src/lib/ai/inboundMessage.test.ts).
//
// Imported by:
//   - supabase/functions/whatsapp-agent/index.ts  (Deno runtime)
//   - src/lib/ai/inboundMessage.test.ts            (Vitest / Node)
// ============================================================

/**
 * The subset of Meta's inbound message shape we read. We keep the
 * whole payload in whatsapp_messages.raw, so this only needs the
 * fields these helpers touch.
 */
export interface MetaInboundMessage {
  id?: string;
  from?: string;
  type?: string;
  timestamp?: string;
  text?: { body?: string };
  button?: { text?: string; payload?: string };
  // button_reply.id is the round-tripped payload set by whatsapp-send
  // confirm_buttons mode — e.g. "<booking_action_id>:yes".
  interactive?: {
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string };
  };
  // type=reaction carries the emoji + the wamid being reacted to.
  reaction?: { message_id?: string; emoji?: string };
  // Quoted text replies carry the quoted message's wamid in context.id.
  context?: { id?: string; from?: string };
}

/**
 * Pull the best plaintext representation of an inbound message.
 * Reactions get a friendly "Reacted 👍" (so the thread and the
 * conversation-list preview read naturally) rather than the old
 * "[reaction message — no text content]" placeholder.
 */
export function extractMessageText(msg: MetaInboundMessage): string | null {
  if (msg.text?.body) return msg.text.body;
  if (msg.button?.text) return msg.button.text;
  if (msg.interactive?.button_reply?.title) return msg.interactive.button_reply.title;
  if (msg.interactive?.list_reply?.title) return msg.interactive.list_reply.title;
  if (msg.type === "reaction") {
    const emoji = msg.reaction?.emoji?.trim();
    return emoji ? `Reacted ${emoji}` : "Reacted";
  }
  if (msg.type) return `[${msg.type} message — no text content]`;
  return null;
}

export interface ReactionFields {
  /** The emoji for a reaction message; null for everything else. */
  reaction_emoji: string | null;
  /** Meta wamid this message references (reaction target or quoted reply). */
  in_reply_to_meta_id: string | null;
}

/**
 * Derive the structured columns persisted alongside the raw payload.
 * For a reaction this is the emoji + the reacted-to wamid; for a quoted
 * reply it's the quoted wamid; otherwise both are null.
 */
export function reactionFields(msg: MetaInboundMessage): ReactionFields {
  return {
    reaction_emoji: msg.reaction?.emoji ?? null,
    in_reply_to_meta_id: msg.reaction?.message_id ?? msg.context?.id ?? null,
  };
}
