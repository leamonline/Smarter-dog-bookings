// ============================================================
// src/components/views/inbox/thread/GenerateReplyButton.jsx
//
// Phase G — AI on demand. Sits above the compose box. Visible
// whenever a conversation has an inbound message and no pending
// draft. Clicking it fires whatsapp-generate-reply, which
// instructs whatsapp-agent to draft a fresh reply for this
// conversation with force_draft=true.
//
// Hidden when:
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
    <div className="px-4 pt-2 pb-1 border-t border-slate-100 bg-brand-paper">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        title="Ask the AI to draft a reply to this customer's most recent message. The draft will appear below for you to approve, edit, or reject."
        className={[
          "inline-flex items-center gap-2 h-9 px-4 rounded-full text-[13px] font-bold transition-colors font-[inherit] border",
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
            Asking the AI…
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
      <p className="text-[10px] text-slate-500 mt-1">
        AI is off by default for this conversation. Click to draft a reply on demand.
      </p>
    </div>
  );
}
