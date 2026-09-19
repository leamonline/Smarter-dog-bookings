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

import { useCallback, useEffect, useRef, useState } from "react";
import { isWindowOpen, windowCountdown } from "../helpers.js";
import { TemplatePicker } from "./TemplatePicker.jsx";
import { GenerateReplyButton } from "./GenerateReplyButton.jsx";

export function ComposePanel({
  conversation,
  value = "",
  onChange = () => {},
  onSend,
  onSendTemplate,
  dogNames,
  inFlight,
  hasPendingDraft,
  hasInbound,
  onGenerateReply,
  // When true, the "24-hour reply window closed" notice is shown elsewhere
  // (the inbox hoists it above the thread), so the picker drops its own
  // copy to avoid a duplicate banner. Defaults to false so standalone use
  // still explains itself.
  hideTemplateBanner = false,
  // A changing value focuses the reply box — used when staff arrive from a
  // "Message owner" deep-link so they can start typing straight away. Only
  // meaningful inside the open window (there's no textarea to focus when the
  // template picker is shown).
  autoFocusSignal = null,
  textareaRef: externalTextareaRef,
}) {
  const [error, setError] = useState(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const internalTextareaRef = useRef(null);
  const lastInboundAt = conversation?.last_inbound_at;

  const setTextareaRef = useCallback((node) => {
    internalTextareaRef.current = node;
    if (typeof externalTextareaRef === "function") externalTextareaRef(node);
    else if (externalTextareaRef) externalTextareaRef.current = node;
  }, [externalTextareaRef]);

  const resizeTextarea = useCallback((textarea) => {
    if (!textarea) return;
    const style = window.getComputedStyle(textarea);
    const pixels = (value) => Number.parseFloat(value) || 0;
    const lineHeight = pixels(style.lineHeight) || 20;
    const padding = pixels(style.paddingTop) + pixels(style.paddingBottom);
    const border = pixels(style.borderTopWidth) + pixels(style.borderBottomWidth);
    const fiveLineHeight = lineHeight * 5 + padding + border;
    textarea.style.height = "auto";
    // scrollHeight includes padding but excludes borders; CSS uses border-box.
    const contentHeight = Math.max(lineHeight + padding, textarea.scrollHeight) + border;
    textarea.style.height = `${Math.min(contentHeight, fiveLineHeight)}px`;
    // CSS can cap the textarea further when the keyboard leaves little room.
    textarea.style.overflowY = "auto";
  }, []);

  useEffect(() => {
    setError(null);
  }, [conversation?.id]);

  useEffect(() => {
    resizeTextarea(internalTextareaRef.current);
  }, [resizeTextarea, value]);

  useEffect(() => {
    setNowMs(Date.now());
    if (!lastInboundAt) return undefined;
    const interval = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, [lastInboundAt]);

  // Focus the reply box when arriving from a "Message owner" deep-link. A
  // rAF lets the textarea mount first; if the window is closed the ref is
  // null (TemplatePicker is shown instead), so this safely no-ops.
  useEffect(() => {
    if (!autoFocusSignal) return;
    const raf = requestAnimationFrame(() => {
      const el = internalTextareaRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [autoFocusSignal]);

  const windowOpen = isWindowOpen(lastInboundAt, nowMs);
  const countdown = windowOpen ? windowCountdown(lastInboundAt, nowMs) : null;

  async function handleSend() {
    const trimmed = value.trim();
    if (!trimmed || inFlight) return;
    setError(null);
    const res = await onSend({ text: trimmed });
    if (!res?.ok) {
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
      onChange(res.replyText);
      requestAnimationFrame(() => {
        const el = internalTextareaRef.current;
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
      <div className="compose-fields min-h-0 p-3 bg-white border-t border-slate-200 max-h-[60%] overflow-y-auto">
        <TemplatePicker
          conversation={conversation}
          dogNames={dogNames ?? []}
          onSend={onSendTemplate}
          hideBanner={hideTemplateBanner}
        />
      </div>
    );
  }

  return (
    <div className="compose-fields shrink-0 p-3 bg-white border-t border-slate-200">
      {error && (
        <div role="alert" className="text-[12px] text-red-700 bg-red-50 border border-red-200 rounded p-2 mb-2">
          {error}
        </div>
      )}
      {/* Mobile: textarea spans the full width with the buttons on a row
          beneath it. Desktop (sm+): single row — textarea grows, buttons sit
          inline to the right (visually unchanged). min-w-0 lets the textarea
          shrink in the row instead of shoving Send off-screen. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <textarea
          ref={setTextareaRef}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            resizeTextarea(event.target);
          }}
          onKeyDown={handleKeyDown}
          aria-label="Write a reply"
          placeholder="Write a reply…"
          disabled={inFlight}
          rows={1}
          maxLength={2000}
          className="box-border max-h-[clamp(24px,calc(var(--fill-visible-height,600px)*0.25),138px)] w-full sm:flex-1 min-w-0 text-[14px] p-2 bg-white border border-slate-200 rounded-xl font-[inherit] resize-none disabled:opacity-50 focus:outline-none focus:border-brand-yellow"
        />
        <div className="flex min-h-9 gap-2 justify-end shrink-0 sm:self-stretch">
          <GenerateReplyButton
            hasPendingDraft={hasPendingDraft}
            hasInbound={hasInbound}
            inFlight={inFlight}
            onGenerate={handleGenerate}
          />
          <button
            onClick={handleSend}
            disabled={inFlight || !value.trim()}
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
