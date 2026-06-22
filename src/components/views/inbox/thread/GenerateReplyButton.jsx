// ============================================================
// src/components/views/inbox/thread/GenerateReplyButton.jsx
//
// Phase G — AI on demand. A compact button that sits INSIDE the
// compose row, between the reply textarea and the Send button.
// Visible whenever a conversation has an inbound message and no
// pending draft. Clicking it fires whatsapp-generate-reply, which
// instructs whatsapp-agent to draft a fresh reply for this
// conversation with force_draft=true.
//
// Renders nothing when:
//   - There's already a pending draft (DraftPanel renders that)
//   - The conversation has no inbound messages yet
//   - A send is in flight (avoids stacked Claude calls)
// ============================================================

import { useState } from "react";

export function GenerateReplyButton({
  hasPendingDraft,
  hasInbound,
  inFlight,
  onGenerate,
}) {
  const [busy, setBusy] = useState(false);

  if (hasPendingDraft) return null;
  if (!hasInbound) return null;

  const disabled = busy || inFlight;

  const handleClick = async () => {
    setBusy(true);
    try {
      await onGenerate?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      title="AI is off by default for this conversation. Click to ask the AI to draft a reply to the customer's most recent message — it'll appear below for you to approve, edit, or reject."
      className={[
        "self-stretch inline-flex items-center gap-1.5 px-3 rounded-full text-[13px] font-bold transition-colors font-[inherit] border shrink-0 whitespace-nowrap",
        "bg-brand-purple text-white border-brand-purple",
        "hover:bg-brand-purple-light hover:border-brand-purple-light",
        "disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer",
      ].join(" ")}
    >
      {busy ? (
        <>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="animate-spin">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          Asking…
        </>
      ) : (
        <>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          </svg>
          Generate reply
        </>
      )}
    </button>
  );
}
