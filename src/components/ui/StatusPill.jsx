// ============================================================
// src/components/ui/StatusPill.jsx
//
// Status-pill styling. Mirrors the conversation.state enum
// (whatsapp_conversations.state in migration 20260424001635):
//   ai_handling    — neutral default; the agent drafts replies
//   human_takeover — staff are driving; the agent stays out
//   snoozed        — paused without closing
//   closed         — archived
// Used in both the list row (replaces the bare "human" body text)
// and the detail header (replaces the raw enum subtitle).
//
// Lives in ui/ (moved from views/inbox/) so the conversation-state
// pill can be shared beyond the inbox. The old path re-exports this.
// ============================================================

const STATE_LABELS = {
  ai_handling: "AI handling",
  human_takeover: "Handled by staff",
  snoozed: "Snoozed",
  closed: "Closed",
};

const STATE_STYLES = {
  ai_handling: "bg-slate-100 text-slate-700 border-slate-200",
  human_takeover: "bg-brand-purple/10 text-brand-purple border-brand-purple/20",
  snoozed: "bg-sky-100 text-sky-800 border-sky-200",
  closed: "bg-slate-100 text-slate-500 border-slate-200",
};

export function StatusPill({ state, size = "sm" }) {
  if (!state) return null;
  const label = STATE_LABELS[state] ?? state.replace(/_/g, " ");
  const style = STATE_STYLES[state] ?? STATE_STYLES.ai_handling;
  const sizing =
    size === "xs"
      ? "text-[10px] px-1.5 py-0 leading-[1.4]"
      : "text-[11px] px-2 py-0.5";
  return (
    <span
      className={`inline-flex items-center font-bold uppercase tracking-wide rounded-full border ${sizing} ${style}`}
      title={`Conversation state: ${label}`}
    >
      {label}
    </span>
  );
}
