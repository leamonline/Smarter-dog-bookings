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
  // Media messages carry a Graph media id (downloadable for ~30 days
  // via GET /{media_id}) plus mime type; image/video/document may also
  // carry a customer-typed caption.
  image?: { id?: string; mime_type?: string; caption?: string };
  sticker?: { id?: string; mime_type?: string };
  video?: { id?: string; mime_type?: string; caption?: string };
  audio?: { id?: string; mime_type?: string };
  document?: { id?: string; mime_type?: string; caption?: string; filename?: string };
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
  // A captioned photo/video/document reads as its caption — the photo
  // itself is surfaced separately (media_path → inline image in the
  // thread), so the caption is the message's real text.
  const caption =
    msg.image?.caption?.trim() || msg.video?.caption?.trim() || msg.document?.caption?.trim();
  if (caption) return caption;
  if (msg.type) return `[${msg.type} message — no text content]`;
  return null;
}

/** Structured pointer to an inbound media attachment we download and store. */
export interface InboundMediaInfo {
  /** Meta message type — "image" or "sticker" (the types we fetch today). */
  mediaType: string;
  /** Graph media id, exchangeable for a short-lived download URL. */
  mediaId: string;
  mimeType: string | null;
  caption: string | null;
}

// The image mimes Meta actually delivers for inbound photos/stickers.
// Anything else is stored as .bin — the mime column, not the extension,
// is what the UI trusts.
const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** File extension for a stored media object, from its mime type. */
export function mediaFileExtension(mimeType: string | null | undefined): string {
  const bare = (mimeType ?? "").split(";")[0].trim().toLowerCase();
  return MIME_EXTENSIONS[bare] ?? "bin";
}

/**
 * Pull the downloadable-attachment pointer from an inbound message.
 * Only images and stickers (webp images) are fetched today; video,
 * audio and documents keep their placeholder-chip treatment, so this
 * returns null for them — and for anything with no media id at all.
 */
export function extractInboundMedia(msg: MetaInboundMessage): InboundMediaInfo | null {
  const media =
    msg.type === "image" ? msg.image : msg.type === "sticker" ? msg.sticker : null;
  if (!media?.id) return null;
  return {
    mediaType: msg.type as string,
    mediaId: media.id,
    mimeType: media.mime_type ?? null,
    caption: (msg.type === "image" && msg.image?.caption) || null,
  };
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
