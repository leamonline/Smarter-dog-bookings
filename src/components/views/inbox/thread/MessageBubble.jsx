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

import { formatWhen } from "../helpers.js";
import { parseMessageContent, presentTemplate } from "./messageContent.js";
import { ReactionLine } from "./ReactionLine.jsx";

const CHANNEL_LABEL = {
  whatsapp: "WA",
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

  const outboundColor = isSMS
    ? "bg-sky-100 text-slate-800 rounded-br-sm"
    : "bg-green-100 text-slate-800 rounded-br-sm";

  const channelChipColor = isSMS
    ? "bg-sky-200 text-sky-900"
    : "bg-emerald-200 text-emerald-900";

  const template =
    parsed.kind === "template"
      ? presentTemplate(parsed.templateId, parsed.values, parsed.rawArgs)
      : null;

  return (
    <div className={`flex ${isInbound ? "justify-start" : "justify-end"} mb-2`}>
      <div
        className={`max-w-[75%] rounded-2xl px-3 py-2 text-[14px] whitespace-pre-wrap ${
          isInbound
            ? "bg-white border border-slate-200 text-slate-800 rounded-bl-sm"
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
        ) : (
          message.content ?? <span className="italic text-slate-500">(non-text message)</span>
        )}
        <div className="flex items-center gap-1 mt-1 justify-end">
          <span
            className={`inline-flex items-center px-1 rounded text-[9px] font-bold tracking-wide ${channelChipColor}`}
            title={`Sent over ${channel === "sms" ? "SMS via Twilio" : "WhatsApp"}`}
            aria-label={`Channel: ${channel}`}
          >
            {CHANNEL_LABEL[channel] ?? channel.toUpperCase()}
          </span>
          <span className="text-[10px] text-slate-500">
            {formatWhen(message.sent_at)}
            {!isInbound && message.status && message.status !== "sent" && (
              <span className="ml-1">· {message.status}</span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
