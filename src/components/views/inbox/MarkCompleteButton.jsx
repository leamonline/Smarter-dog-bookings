// ============================================================
// src/components/views/inbox/MarkCompleteButton.jsx
//
// Header action that gives a conversation a terminal state.
// Two visual modes:
//
//   Active conversation  → "Mark complete" button. On click, resolves
//                          immediately (no confirm dialog — undo toast
//                          handles the "wait I didn't mean that" path
//                          for ~6 seconds, less friction than a modal).
//
//   Closed conversation  → "Reopen" button. Same one-click + undo
//                          model, mirrored.
//
// Keyboard: "E" anywhere in the inbox (when a conversation is selected
// and no input is focused) triggers the same action — Gmail convention.
// ============================================================

import { useEffect, useRef } from "react";

const CLOSURE_REASON_LABEL = {
  manual: null, // staff-driven; nothing to show
  booking_confirmed_quiet: "after booking + quiet",
  stale_30d: "after 30 days quiet",
  customer_cancelled: "after cancellation",
};

export function MarkCompleteButton({ conversation, onResolve, onReopen, disabled }) {
  const isClosed = !!conversation?.closed_at;
  const buttonRef = useRef(null);

  // Keyboard shortcut "E" — only fires when no input/textarea/select
  // has focus, so it doesn't hijack typing in the compose box.
  useEffect(() => {
    function handler(e) {
      if (e.key !== "e" && e.key !== "E") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const active = document.activeElement;
      if (active && ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName)) return;
      if (active && active.isContentEditable) return;
      if (disabled || !conversation) return;
      e.preventDefault();
      buttonRef.current?.click();
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [conversation, disabled]);

  if (!conversation) return null;

  const handleClick = () => {
    if (isClosed) onReopen?.();
    else onResolve?.();
  };

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={handleClick}
      disabled={disabled}
      title={
        isClosed
          ? `Bring this conversation back into the active queue${
              CLOSURE_REASON_LABEL[conversation.closure_reason]
                ? ` (was closed ${CLOSURE_REASON_LABEL[conversation.closure_reason]})`
                : ""
            }. Shortcut: E`
          : "Mark this conversation complete and remove it from the active queue. Shortcut: E"
      }
      className={[
        "inline-flex items-center gap-1 h-8 px-3 rounded-full text-xs font-semibold cursor-pointer motion-safe:transition-colors font-[inherit]",
        isClosed
          ? "bg-white border border-slate-200 text-brand-purple hover:border-brand-yellow/60"
          : "bg-emerald-50 border border-emerald-200 text-emerald-800 hover:bg-emerald-100",
        "disabled:opacity-50 disabled:cursor-not-allowed",
      ].join(" ")}
    >
      {isClosed ? (
        <>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
          </svg>
          Reopen
        </>
      ) : (
        <>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Mark complete
        </>
      )}
    </button>
  );
}
