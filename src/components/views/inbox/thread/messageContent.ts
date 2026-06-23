// ============================================================
// src/components/views/inbox/thread/messageContent.ts
//
// Pure parsing + presentation for the two "special" message shapes
// that would otherwise leak internal placeholder syntax into the
// staff thread:
//
//   • Template sends  — "[template:<id>] <args>"
//        WhatsApp: <args> are the {{N}} values joined with " · "
//                  (whatsapp-send/index.ts builds params.join(" · "))
//        SMS:      <args> are the already-rendered message text
//                  (sms-send/index.ts stores the final body)
//   • Reactions       — "[reaction message — no text content]"
//        Written by the external ingestion flow; no emoji or
//        parent-message id reaches the renderer today, so the emoji
//        is best-effort and usually null.
//
// No React, no Supabase — kept as a leaf helper so it's trivially
// unit-tested (see messageContent.test.ts) and reusable.
// ============================================================

import { WHATSAPP_TEMPLATES } from "../../../../constants/whatsappTemplates.js";

export type ParsedMessageContent =
  | { kind: "text"; text: string }
  | { kind: "template"; templateId: string; values: string[]; rawArgs: string }
  | { kind: "system"; tag: string; label: string; body: string }
  | { kind: "reaction"; emoji: string | null }
  | { kind: "media"; mediaType: string; icon: string; label: string };

// Outbound template sends are flattened to "[template:<id>] <args>"
// before they're stored. Capture the id and whatever trails it.
const TEMPLATE_RE = /^\[template:([^\]]+)\]\s*([\s\S]*)$/;

// Outbound interactive/system sends are stored as "[<tag>(:id)?] <body>"
// where <body> is the exact text the customer received. We render the body
// (never the bracket code) with a small friendly label. Only the known tags
// match; these are outbound-only, and the bubble only treats OUTBOUND
// messages as system sends — so an inbound message that literally starts
// with "[flow] …" still renders verbatim.
const SYSTEM_LABELS: Record<string, string> = {
  book_entry: "Booking",
  flow: "Booking link",
  manage_list: "Manage booking",
};
const SYSTEM_RE = /^\[(flow|book_entry|manage_list)(?::[^\]]+)?\]\s*([\s\S]*)$/;

// Reaction placeholders look like "[reaction message — no text content]".
// Match defensively on the "[reaction" prefix so minor wording drift in
// the upstream writer still renders as a reaction rather than raw text.
const REACTION_RE = /^\[reaction\b[\s\S]*\]$/i;

// Non-text inbound (photos, voice notes, etc.) are stored by the webhook
// ingestion (supabase/functions/_shared/inboundMessage.ts) as
// "[<type> message — no text content]". Capture the type so the thread
// and list show a friendly chip instead of that raw bracket text. The
// dash is matched loosely (em-dash / hyphen) to survive wording drift.
const MEDIA_RE = /^\[(\w+) message\b[\s\S]*\]$/i;

// Friendly icon + label per WhatsApp media type. Unknown types fall back
// to a generic "Attachment" so a new Meta type never leaks raw text.
const MEDIA_PRESENTATION: Record<string, { icon: string; label: string }> = {
  image: { icon: "📷", label: "Photo" },
  video: { icon: "🎬", label: "Video" },
  audio: { icon: "🎙️", label: "Voice message" },
  voice: { icon: "🎙️", label: "Voice message" },
  ptt: { icon: "🎙️", label: "Voice message" },
  document: { icon: "📄", label: "Document" },
  sticker: { icon: "🎨", label: "Sticker" },
  location: { icon: "📍", label: "Location" },
  contacts: { icon: "👤", label: "Contact card" },
};

// "reaction" also matches MEDIA_RE's shape, so reactions are checked
// first in parseMessageContent. These are the types we treat as media.
export function mediaPresentation(mediaType: string): { icon: string; label: string } {
  return MEDIA_PRESENTATION[mediaType.toLowerCase()] ?? { icon: "📎", label: "Attachment" };
}

// WhatsApp joins template params with this exact separator
// (params.join(" · ")), so splitting on it recovers the ordered values.
const PARAM_SEPARATOR = " · ";

/**
 * Classify a raw message body into text / template / reaction.
 * Never throws; anything that isn't a recognised placeholder falls
 * through to `text` with the original string preserved, so plain
 * messages render exactly as before.
 */
export function parseMessageContent(
  content: string | null | undefined,
): ParsedMessageContent {
  if (content == null || content.trim() === "") {
    return { kind: "text", text: content ?? "" };
  }

  const trimmed = content.trim();

  const template = trimmed.match(TEMPLATE_RE);
  if (template) {
    const templateId = template[1].trim();
    const rawArgs = template[2].trim();
    const values =
      rawArgs === "" ? [] : rawArgs.split(PARAM_SEPARATOR).map((v) => v.trim());
    return { kind: "template", templateId, values, rawArgs };
  }

  const system = trimmed.match(SYSTEM_RE);
  if (system) {
    const tag = system[1];
    return {
      kind: "system",
      tag,
      label: SYSTEM_LABELS[tag] ?? "Message",
      body: system[2].trim(),
    };
  }

  if (REACTION_RE.test(trimmed)) {
    return { kind: "reaction", emoji: extractEmoji(trimmed) };
  }

  // Reactions share the "[<word> message …]" shape, so they're matched
  // above first. Everything else of that shape is a media placeholder.
  const media = trimmed.match(MEDIA_RE);
  if (media) {
    const mediaType = media[1].toLowerCase();
    const { icon, label } = mediaPresentation(mediaType);
    return { kind: "media", mediaType, icon, label };
  }

  return { kind: "text", text: content };
}

/**
 * True when an inbound message is the customer tapping the "Confirm"
 * button on the appointment-reminder template — i.e. confirming they'll
 * attend. Rendered in the thread as a celebratory sticker rather than a
 * plain "Confirm" bubble. (The reminder's quick-reply button surfaces as
 * the literal text "Confirm".)
 */
export function isReminderConfirm(content: string | null | undefined): boolean {
  return (content ?? "").trim().toLowerCase() === "confirm";
}

/**
 * One-line preview text for the conversation list. Turns a media
 * placeholder into "📷 Photo" etc. and leaves plain text / friendly
 * reactions ("Reacted 👍") untouched. Used for last_customer_text so
 * the list never shows raw "[image message …]" bracket text.
 */
export function previewMessageText(content: string | null | undefined): string {
  if (content == null || content.trim() === "") return "";
  const parsed = parseMessageContent(content);
  switch (parsed.kind) {
    case "media":
      return `${parsed.icon} ${parsed.label}`;
    case "reaction":
      return parsed.emoji ? `Reacted ${parsed.emoji}` : "Reaction";
    case "template": {
      const t = presentTemplate(parsed.templateId, parsed.values, parsed.rawArgs);
      return t.body || t.label;
    }
    case "system":
      return parsed.body || parsed.label;
    default:
      return parsed.text ?? content;
  }
}

// Best-effort emoji pull for reactions. Today's placeholder carries no
// emoji (the ingestion flow drops it), so this returns null for the
// known string — but if a future "[reaction:👍]"-style body ever
// arrives, the glyph is surfaced. Extended_Pictographic avoids matching
// the digits and "—" that \p{Emoji} would.
function extractEmoji(reaction: string): string | null {
  const match = reaction.match(/\p{Extended_Pictographic}/u);
  return match ? match[0] : null;
}

export interface TemplatePresentation {
  /** Friendly title, e.g. "Ready for Collection" or "Template message". */
  label: string;
  /** Human-readable body — never the raw "[template:…]" string. */
  body: string;
  /** Whether the template id is one we have metadata for. */
  known: boolean;
}

// Lookup keyed by Meta template name. WHATSAPP_TEMPLATES is the single
// source of truth (it also drives the send picker), so a template added
// there renders nicely here for free.
const TEMPLATE_BY_NAME = new Map(WHATSAPP_TEMPLATES.map((t) => [t.name, t]));

/**
 * Turn a parsed template into display text using the registered
 * template metadata. Falls back tidily for unknown ids or arg shapes
 * that don't line up (e.g. SMS sends, whose args are already the full
 * rendered text rather than " · "-joined values). Never returns the
 * raw "[template:…]" placeholder.
 */
export function presentTemplate(
  templateId: string,
  values: string[],
  rawArgs: string,
): TemplatePresentation {
  const template = TEMPLATE_BY_NAME.get(templateId);

  if (!template) {
    return {
      label: "Template message",
      body: rawArgs || values.join(PARAM_SEPARATOR),
      known: false,
    };
  }

  // WhatsApp form: one value per registered param → render the exact
  // message the customer received via the template's own preview().
  if (values.length === template.params.length) {
    const named = Object.fromEntries(
      template.params.map((p, i) => [p.key, values[i]]),
    );
    return { label: template.label, body: template.preview(named), known: true };
  }

  // Arg-count mismatch (SMS pre-rendered text, or an unexpected shape):
  // show the args as-is under the friendly label.
  return {
    label: template.label,
    body: rawArgs || values.join(PARAM_SEPARATOR),
    known: true,
  };
}
