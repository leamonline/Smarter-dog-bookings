// ============================================================
// src/components/views/inbox/thread/WindowClosedBanner.jsx
//
// A calm alert that sits directly under the conversation header,
// before the message thread, whenever the Meta 24-hour free-form
// reply window is closed. It tells staff *why* they can't just type
// a reply and points them at the template picker pinned below.
//
// Mirrors the window check ComposePanel uses (isWindowOpen against the
// conversation's last inbound message) and ticks each minute so it
// appears the moment the window lapses while a thread is open. When
// this banner shows, the template picker at the bottom hides its own
// duplicate notice (see ComposePanel `hideTemplateBanner`).
// ============================================================

import { useEffect, useState } from "react";
import { isWindowOpen } from "../helpers.js";

export function WindowClosedBanner({ conversation }) {
  const lastInboundAt = conversation?.last_inbound_at;
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    setNowMs(Date.now());
    const interval = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, [lastInboundAt]);

  if (!conversation) return null;
  if (isWindowOpen(lastInboundAt, nowMs)) return null;

  return (
    <div
      role="status"
      className="shrink-0 flex items-start gap-2 px-4 py-2 bg-amber-50 border-b border-amber-200 text-[12px] leading-snug text-amber-900"
    >
      <span aria-hidden="true" className="mt-px">⏱</span>
      <p className="m-0">
        <span className="font-bold">24-hour reply window closed.</span>{" "}
        <span className="text-amber-800">
          Choose an approved template below to reopen the chat.
        </span>
      </p>
    </div>
  );
}
