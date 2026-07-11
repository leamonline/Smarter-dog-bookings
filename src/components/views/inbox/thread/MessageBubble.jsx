// ============================================================
// src/components/views/inbox/thread/MessageBubble.jsx
//
// WhatsApp-style bubble. Inbound: white card with grey border, left-
// aligned. Outbound: green-tinted card (WhatsApp) or sky-tinted card
// (SMS), right-aligned, plus the Meta/Twilio delivery status when
// it's not the plain "sent" default.
//
// Two "special" message shapes get richer treatment instead of leaking
// their raw placeholder syntax (see messageContent.js):
//   • Template sends — same bubble, with a small "Template" pill + the
//     friendly template name, and the actual message the customer
//     received as the body.
//   • Reactions — not a real message, so rendered as a lightweight
//     muted line (ReactionLine) rather than a bubble.
//
// The small channel chip in the bottom-right corner of every bubble
// distinguishes WA / SMS at a glance when both channels are in play
// for the same customer.
// ============================================================

import { formatWhen, formatDayToken, formatTime } from "../helpers.js";
import { parseMessageContent, presentTemplate, isReminderConfirm } from "./messageContent";
import { ReactionLine } from "./ReactionLine.jsx";
import { InboundMediaImage } from "./InboundMediaImage.jsx";

const CHANNEL_LABEL = {
  whatsapp: "WhatsApp",
  sms: "SMS",
};

export function MessageBubble({ message }) {
  const parsed = parseMessageContent(message.content);

  // Reactions aren't real messages — render a lightweight line, not a bubble.
  // Prefer the structured reaction_emoji column (populated at ingestion +
  // backfilled); fall back to the parsed "[reaction…]" string for any rows
  // predating that change.
  const reactionEmoji =
    message.reaction_emoji ?? (parsed.kind === "reaction" ? parsed.emoji : null);
  if (message.reaction_emoji != null || parsed.kind === "reaction") {
    return <ReactionLine message={message} emoji={reactionEmoji} />;
  }

  const isInbound = message.direction === "inbound";
  const channel = message.channel ?? "whatsapp";
  const isSMS = channel === "sms";
  const isFailed = !isInbound && message.status === "failed";

  // Reminder confirmation — the customer tapped "Confirm" on the
  // appointment-reminder. Show a celebratory sticker instead of a bare
  // "Confirm" bubble so staff can see at a glance the visit is confirmed.
  if (isInbound && isReminderConfirm(message.content)) {
    return (
      <div className="flex justify-start mb-2">
        <div className="inline-flex items-center gap-2 max-w-[75%] rounded-2xl rounded-bl-sm px-3.5 py-2.5 bg-emerald-50 border border-emerald-300 shadow-sm">
          <span aria-hidden="true" className="text-[20px] leading-none">🐾</span>
          <div className="min-w-0">
            <div className="text-[14px] font-bold text-emerald-900 leading-snug">
              I&apos;ll be there, see you soon!
            </div>
            <div className="text-[10px] text-emerald-800 font-semibold mt-0.5">
              Confirmed · {formatWhen(message.sent_at)}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const outboundColor = isSMS
    ? "bg-sky-100 text-slate-800 rounded-br-sm"
    : "bg-green-100 text-slate-800 rounded-br-sm";
  const failedColor = "bg-rose-50 border border-rose-200 text-rose-950 rounded-br-sm";

  // A stored customer photo (downloaded from Meta into the whatsapp-media
  // bucket at ingest). When present it replaces the "📷 Photo" chip; any
  // caption the customer typed is the message content and renders below.
  const storedImage =
    isInbound && message.media_path && (message.media_mime ?? "").startsWith("image/")
      ? { path: message.media_path, mediaType: parsed.kind === "media" ? parsed.mediaType : "image" }
      : null;

  const template =
    parsed.kind === "template"
      ? presentTemplate(parsed.templateId, parsed.values, parsed.rawArgs)
      : null;
  // System tags ([flow:…] etc.) are outbound-only, so don't pill-ify a
  // genuine inbound message that happens to start with "[flow]".
  const system = !isInbound && parsed.kind === "system" ? parsed : null;

  const channelLabel = CHANNEL_LABEL[channel] ?? channel.toUpperCase();
  const metaParts = [channelLabel, formatDayToken(message.sent_at), formatTime(message.sent_at)]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className={`flex ${isInbound ? "justify-start" : "justify-end"} mb-2`}>
      <div
        className={`max-w-[75%] rounded-2xl px-3 py-2 text-[14px] whitespace-pre-wrap ${
          isInbound
            ? "bg-white border border-slate-200 text-slate-800 rounded-bl-sm"
            : isFailed
              ? failedColor
              : outboundColor
        }`}
      >
        {template ? (
          <>
            <div className="flex items-center gap-1.5 mb-1">
              <span
                className="inline-flex items-center gap-1 px-1 rounded text-[9px] font-bold tracking-wide bg-amber-200 text-amber-900"
                title="Automated message sent from a saved template"
              >
                <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M13 2L3 14h7v8l10-12h-7z" />
                </svg>
                Template
              </span>
              <span className="text-[11px] font-semibold text-slate-600">
                {template.label}
              </span>
            </div>
            {template.body}
          </>
        ) : system ? (
          <>
            <div className="flex items-center gap-1.5 mb-1">
              <span
                className="inline-flex items-center gap-1 px-1 rounded text-[9px] font-bold tracking-wide bg-brand-purple/15 text-brand-purple"
                title="Automated interactive message"
              >
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                </svg>
                {system.label}
              </span>
            </div>
            {system.body}
          </>
        ) : storedImage ? (
          <>
            <InboundMediaImage path={storedImage.path} mediaType={storedImage.mediaType} />
            {parsed.kind === "text" && parsed.text ? parsed.text : null}
          </>
        ) : parsed.kind === "media" ? (
          <span className="inline-flex items-center gap-1.5 text-slate-600 italic">
            <span aria-hidden="true" className="not-italic text-[15px]">{parsed.icon}</span>
            {parsed.label}
          </span>
        ) : (
          message.content ?? <span className="italic text-slate-500">(non-text message)</span>
        )}
        <div className="mt-1 text-right text-[10px] text-slate-600">
          {metaParts}
          {!isInbound && message.status && message.status !== "sent" && (
            <span className={isFailed ? "font-bold text-rose-700" : ""}>
              {" · "}{message.status}
            </span>
          )}
        </div>
        {isFailed && (
          <div
            role="alert"
            className="mt-2 rounded-lg border border-rose-200 bg-white/80 px-2 py-1.5 text-[11px] leading-snug text-rose-800"
          >
            <span className="font-bold">Message failed</span>
            {message.error_message ? `: ${message.error_message}` : ". Check provider logs before relying on this reply."}
          </div>
        )}
      </div>
    </div>
  );
}
