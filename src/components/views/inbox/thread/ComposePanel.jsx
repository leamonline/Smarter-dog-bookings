// ============================================================
// src/components/views/inbox/thread/ComposePanel.jsx
//
// Compose box for free-form staff replies. Always visible when a
// conversation is selected. Inside the Meta 24h window, this is a
// plain textarea. Outside the window, this defers to TemplatePicker
// so staff can reopen the conversation with an approved template.
//
// Enter = send, Shift+Enter = newline. Matches WhatsApp.
// ============================================================

import { useEffect, useRef, useState } from "react";
import { isWindowOpen, windowCountdown } from "../helpers.js";
import { TemplatePicker } from "./TemplatePicker.jsx";
import { GenerateReplyButton } from "./GenerateReplyButton.jsx";

export function ComposePanel({
  conversation,
  onSend,
  onSendTemplate,
  dogNames,
  inFlight,
  hasPendingDraft,
  hasInbound,
  onGenerateReply,
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const textareaRef = useRef(null);
  const lastInboundAt = conversation?.last_inbound_at;

  // Reset input when the user switches to a different conversation,
  // so a half-typed message doesn't get sent to the wrong person.
  useEffect(() => {
    setText("");
    setError(null);
  }, [conversation?.id]);

  useEffect(() => {
    setNowMs(Date.now());
    if (!lastInboundAt) return undefined;
    const interval = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, [lastInboundAt]);

  const windowOpen = isWindowOpen(lastInboundAt, nowMs);
  const countdown = windowOpen ? windowCountdown(lastInboundAt, nowMs) : null;

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || inFlight) return;
    setError(null);
    const res = await onSend({ text: trimmed });
    if (res?.ok) {
      setText("");
    } else {
      setError(res?.reason ?? "Send failed");
    }
  }

  function handleKeyDown(e) {
    // Enter = send, Shift+Enter = newline. Matches WhatsApp.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // Generate reply: ask the AI for a suggestion and type it into the box.
  // It never sends — the staff member reviews, edits, and sends. Replaces
  // the current contents (the button is normally used on an empty box),
  // then focuses the textarea with the cursor at the end so it's ready
  // to edit.
  async function handleGenerate() {
    const res = await onGenerateReply?.();
    if (res?.ok && res.replyText) {
      setText(res.replyText);
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (el) {
          el.focus();
          el.setSelectionRange(el.value.length, el.value.length);
        }
      });
    }
    return res;
  }

  if (!windowOpen) {
    // Bound the template picker so its banner + fields + preview can't push
    // the thread off-screen on short viewports — it scrolls internally
    // instead of overflowing the detail pane.
    return (
      <div className="compose-fields p-3 bg-white border-t border-slate-200 max-h-[50dvh] overflow-y-auto">
        <TemplatePicker
          conversation={conversation}
          dogNames={dogNames ?? []}
          onSend={onSendTemplate}
        />
      </div>
    );
  }

  return (
    <div className="compose-fields p-3 bg-white border-t border-slate-200">
      {error && (
        <div className="text-[12px] text-red-700 bg-red-50 border border-red-200 rounded p-2 mb-2">
          {error}
        </div>
      )}
      {/* Mobile: textarea spans the full width with the buttons on a row
          beneath it. Desktop (sm+): single row — textarea grows, buttons sit
          inline to the right (visually unchanged). min-w-0 lets the textarea
          shrink in the row instead of shoving Send off-screen. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Write a reply…"
          disabled={inFlight}
          rows={2}
          maxLength={2000}
          className="w-full sm:flex-1 min-w-0 text-[14px] p-2 bg-white border border-slate-200 rounded-xl font-[inherit] resize-y disabled:opacity-50 focus:outline-none focus:border-brand-yellow"
        />
        <div className="flex gap-2 justify-end shrink-0 sm:self-stretch">
          <GenerateReplyButton
            hasPendingDraft={hasPendingDraft}
            hasInbound={hasInbound}
            inFlight={inFlight}
            onGenerate={handleGenerate}
          />
          <button
            onClick={handleSend}
            disabled={inFlight || !text.trim()}
            className="self-stretch inline-flex items-center px-3 sm:px-4 rounded-full bg-brand-yellow text-brand-purple text-[13px] font-bold cursor-pointer disabled:opacity-50 hover:bg-brand-yellow-dark transition-colors shrink-0 font-[inherit]"
          >
            Send
          </button>
        </div>
      </div>
      <div className="flex justify-between items-center gap-2 mt-1">
        {/* Keyboard hint is desktop-only guidance — hide on touch so the
            countdown has room and never clips on a phone. */}
        <span className="hidden sm:inline text-[11px] text-slate-500">
          Enter to send · Shift+Enter for new line
        </span>
        {countdown && (
          <span className="ml-auto shrink-0 text-[11px] text-slate-500" title="When this window closes, you'll need to send a Meta-approved template to reopen the chat.">
            {countdown}
          </span>
        )}
      </div>
    </div>
  );
}
