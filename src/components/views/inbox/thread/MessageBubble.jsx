// ============================================================
// src/components/views/inbox/thread/MessageBubble.jsx
//
// WhatsApp-style bubble. Inbound: white card with grey border, left-
// aligned. Outbound: green-tinted card, right-aligned, plus the Meta
// delivery status when it's not the plain "sent" default.
// ============================================================

import { formatWhen } from "../helpers.js";

export function MessageBubble({ message }) {
  const isInbound = message.direction === "inbound";
  return (
    <div className={`flex ${isInbound ? "justify-start" : "justify-end"} mb-2`}>
      <div
        className={`max-w-[75%] rounded-2xl px-3 py-2 text-[14px] whitespace-pre-wrap ${
          isInbound
            ? "bg-white border border-slate-200 text-slate-800 rounded-bl-sm"
            : "bg-green-100 text-slate-800 rounded-br-sm"
        }`}
      >
        {message.content ?? <span className="italic text-slate-500">(non-text message)</span>}
        <div className="text-[10px] text-slate-500 mt-1 text-right">
          {formatWhen(message.sent_at)}
          {!isInbound && message.status && message.status !== "sent" && (
            <span className="ml-1">· {message.status}</span>
          )}
        </div>
      </div>
    </div>
  );
}
