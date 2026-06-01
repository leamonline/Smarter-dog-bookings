// ============================================================
// src/components/views/inbox/thread/ReactionLine.jsx
//
// Lightweight render for emoji "reactions" to a previous message.
// Reactions aren't real messages, so they don't get a bubble — just a
// small, muted line aligned to the side the reaction came from.
//
// The emoji is shown when the upstream data carries one; otherwise a
// neutral face icon stands in. Anchoring the chip to the exact message
// it reacts to isn't possible yet (the thread query doesn't fetch the
// reacted-to id), so we use the compact inline "Reacted" form.
// ============================================================

import { formatWhen } from "../helpers.js";

export function ReactionLine({ message, emoji }) {
  const isInbound = message.direction === "inbound";

  return (
    <div className={`flex ${isInbound ? "justify-start" : "justify-end"} mb-2`}>
      <span
        className="inline-flex items-center gap-1 text-[11px] text-slate-400"
        title="Reaction to a previous message"
        aria-label={emoji ? `Reacted with ${emoji}` : "Reacted"}
      >
        <span>Reacted</span>
        {emoji ? (
          <span aria-hidden="true" className="text-[13px] leading-none">
            {emoji}
          </span>
        ) : (
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M8 14s1.5 2 4 2 4-2 4-2" />
            <line x1="9" y1="9" x2="9.01" y2="9" />
            <line x1="15" y1="9" x2="15.01" y2="9" />
          </svg>
        )}
        <span className="text-slate-300">· {formatWhen(message.sent_at)}</span>
      </span>
    </div>
  );
}
