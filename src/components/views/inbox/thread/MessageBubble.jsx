// ============================================================
// src/components/views/inbox/thread/MessageBubble.jsx
//
// WhatsApp-style bubble. Inbound: white card with grey border, left-
// aligned. Outbound: green-tinted card (WhatsApp) or sky-tinted card
// (SMS), right-aligned, plus the Meta/Twilio delivery status when
// it's not the plain "sent" default.
//
// The small channel chip in the bottom-right corner of every bubble
// distinguishes WA / SMS at a glance when both channels are in play
// for the same customer.
// ============================================================

import { formatWhen } from "../helpers.js";

const CHANNEL_LABEL = {
  whatsapp: "WA",
  sms: "SMS",
};

export function MessageBubble({ message }) {
  const isInbound = message.direction === "inbound";
  const channel = message.channel ?? "whatsapp";
  const isSMS = channel === "sms";

  const outboundColor = isSMS
    ? "bg-sky-100 text-slate-800 rounded-br-sm"
    : "bg-green-100 text-slate-800 rounded-br-sm";

  const channelChipColor = isSMS
    ? "bg-sky-200 text-sky-900"
    : "bg-emerald-200 text-emerald-900";

  return (
    <div className={`flex ${isInbound ? "justify-start" : "justify-end"} mb-2`}>
      <div
        className={`max-w-[75%] rounded-2xl px-3 py-2 text-[14px] whitespace-pre-wrap ${
          isInbound
            ? "bg-white border border-slate-200 text-slate-800 rounded-bl-sm"
            : outboundColor
        }`}
      >
        {message.content ?? <span className="italic text-slate-500">(non-text message)</span>}
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
