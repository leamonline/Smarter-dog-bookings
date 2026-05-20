// ============================================================
// src/components/views/inbox/thread/WhyHeldExplainer.jsx
//
// Tiny presentational component that narrates, in one sentence,
// why a particular draft is waiting for staff approval rather than
// being auto-sent. The decision logic lives in ./whyHeld.js so it
// can be unit-tested independently of the JSX render.
// ============================================================

import { whyHeld } from "./whyHeld.js";

export { whyHeld };

const TONE_STYLES = {
  high: "bg-red-50 border-red-200 text-red-900",
  medium: "bg-amber-50 border-amber-300 text-amber-900",
  info: "bg-slate-50 border-slate-200 text-slate-700",
};

function ToneIcon({ tone }) {
  if (tone === "high") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    );
  }
  if (tone === "medium") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

export function WhyHeldExplainer({ draft, conversation }) {
  const reason = whyHeld(draft, conversation);
  if (!reason) return null;
  return (
    <div
      role="note"
      aria-label="Why this draft is held"
      className={`flex items-start gap-2 text-[12px] leading-snug border rounded-lg p-2 mt-2 ${TONE_STYLES[reason.tone]}`}
    >
      <span className="shrink-0 mt-px" aria-hidden="true">
        <ToneIcon tone={reason.tone} />
      </span>
      <span>{reason.text}</span>
    </div>
  );
}
