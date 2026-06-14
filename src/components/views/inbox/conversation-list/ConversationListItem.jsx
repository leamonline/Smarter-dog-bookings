// ============================================================
// src/components/views/inbox/conversation-list/ConversationListItem.jsx
//
// Single row in the conversation list. Carries the unread badge,
// pending-draft / pending-booking-action / needs-human-review dots,
// the new-customer pill (when lead_status === records_created),
// the human-takeover state pill, the auto-suggest-close pill, and
// the "closed" subdued styling for the Done filter.
// ============================================================

import {
  displayName,
  formatWhen,
  formatSnoozedUntil,
  inboxWindowBadge,
  isConversationSnoozed,
} from "../helpers.js";
import { StatusPill } from "../StatusPill.jsx";

const SUGGESTED_REASON_LABEL = {
  booking_confirmed_quiet: "Suggest closing — booking confirmed, quiet 7d",
  stale_30d: "Suggest closing — no reply 30d",
  customer_cancelled: "Suggest closing — booking cancelled",
};

export function ConversationListItem({ conv, isSelected, onSelect }) {
  const unread = conv.unread_count > 0;
  const isClosed = !!conv.closed_at;
  const isSnoozed = isConversationSnoozed(conv);
  const suggestedReason = !isClosed && conv.closure_suggested_at
    ? SUGGESTED_REASON_LABEL[conv.closure_suggested_reason] ?? null
    : null;
  const windowBadge = inboxWindowBadge(conv);
  const failedTitle = conv.latest_failed_message?.error_message
    ? `Latest failed send: ${conv.latest_failed_message.error_message}`
    : "Latest send failed. Open the thread to check the delivery state.";

  // Decode the red dot into a specific reason. fetchConversationsList
  // pulls draft.handoff_required + draft.risk_level so we can name the
  // exact gate that pinned this conversation as "needs review".
  const pendingDrafts = Array.isArray(conv.whatsapp_drafts)
    ? conv.whatsapp_drafts.filter((d) => d.state === "pending")
    : [];
  const hasHandoffDraft = pendingDrafts.some((d) => d.handoff_required === true);
  const hasHighRiskDraft = pendingDrafts.some((d) => d.risk_level === "high");
  const reviewTitle = hasHandoffDraft && hasHighRiskDraft
    ? "Needs review: AI flagged a handoff AND the draft is high-risk. Open to see the reason."
    : hasHandoffDraft
      ? "Needs review: the AI explicitly flagged this conversation for human handoff. Open to see why."
      : hasHighRiskDraft
        ? "Needs review: the draft is rated high-risk (bookings, refunds, complaints, medical). Open to read it."
        : "Needs review: draft is awaiting your approval.";

  return (
    <button
      onClick={() => onSelect(conv.id)}
      aria-current={isSelected ? "true" : undefined}
      className={`relative w-full text-left px-3 py-2.5 border-b border-slate-100 transition-colors cursor-pointer font-[inherit] border-l-[3px] ${
        isSelected
          ? "bg-brand-yellow/20 border-l-brand-yellow shadow-[inset_0_0_0_1px_rgba(254,204,19,0.35)]"
          : isClosed
            ? "bg-slate-50 hover:bg-slate-100 border-l-transparent opacity-75"
            : isSnoozed
              ? "bg-sky-50 hover:bg-sky-100 border-l-sky-200"
            : "bg-white hover:bg-slate-50 border-l-transparent"
      }`}
    >
      <div className="flex justify-between items-start gap-2 mb-0.5">
        <span
          className={`text-[13px] truncate ${
            unread ? "font-bold text-brand-purple" : "font-semibold text-brand-purple/90"
          } ${isClosed ? "line-through decoration-slate-400 decoration-1" : ""}`}
        >
          {displayName(conv)}
        </span>
        <span className="text-[10px] text-slate-500 shrink-0 tabular-nums">
          {formatWhen(isClosed ? conv.closed_at : conv.last_inbound_at)}
        </span>
      </div>
      <div className="flex justify-between items-center gap-2">
        <span className={`text-[11px] truncate ${unread ? "text-slate-700" : "text-slate-600"}`}>
          {conv.last_customer_text ?? "(no text)"}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {conv.needs_human_review && (
            <span
              className="inline-block w-2 h-2 rounded-full bg-rose-500"
              title={reviewTitle}
              aria-label={reviewTitle}
            />
          )}
          {conv.has_pending_draft && !conv.needs_human_review && (
            <span
              className="inline-block w-2 h-2 rounded-full bg-amber-400"
              title="AI has drafted a reply for this conversation — open to read it and approve, edit, or reject."
              aria-label="AI draft pending review"
            />
          )}
          {conv.has_pending_booking_action && (
            <span
              className="inline-block w-2 h-2 rounded-full bg-emerald-500"
              title="The AI is proposing a booking (create / reschedule / cancel) — open to review the proposed dog, date, and slot before applying."
              aria-label="Booking proposal pending approval"
            />
          )}
          {conv.lead_status === "records_created" && !isClosed && (
            <span
              className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-sky-100 text-sky-800 border border-sky-200"
              title="New customer — the AI created the human + dog records on its own (autonomous onboarding). Spot-check the details before approving the first booking, then this pill fades after the next inbound message."
              aria-label="New customer onboarded by AI"
            >
              🆕 New
            </span>
          )}
          {unread && (
            <span
              className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-brand-purple text-white text-[10px] font-bold"
              aria-label={`${conv.unread_count} unread`}
            >
              {conv.unread_count}
            </span>
          )}
          {conv.state === "human_takeover" && !isClosed && (
            <StatusPill state="human_takeover" size="xs" />
          )}
          {isSnoozed && (
            <StatusPill state="snoozed" size="xs" />
          )}
        </div>
      </div>

      {/* Suggested-close pill: amber chip under the preview row when
          the daily background pass flagged this conversation. */}
      {suggestedReason && (
        <div className="mt-1.5">
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-900 border border-amber-200"
            title="The daily auto-suggest pass thinks this conversation looks done. Press 'E' (or use Mark complete) to close it, or just keep messaging to clear the suggestion."
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path d="M9 12l2 2 4-4" />
            </svg>
            {suggestedReason}
          </span>
        </div>
      )}

      {(isSnoozed || windowBadge || conv.has_failed_message) && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {isSnoozed && (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-sky-50 text-sky-800 border border-sky-200"
              title="This conversation is paused until the follow-up time."
            >
              {formatSnoozedUntil(conv.snoozed_until)}
            </span>
          )}
          {windowBadge && (
            <span
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                windowBadge.kind === "closing_soon"
                  ? "bg-amber-50 text-amber-900 border-amber-200"
                  : "bg-slate-100 text-slate-700 border-slate-200"
              }`}
              title={windowBadge.title}
            >
              {windowBadge.label}
            </span>
          )}
          {conv.has_failed_message && (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-800 border border-rose-200"
              title={failedTitle}
            >
              Failed send
            </span>
          )}
        </div>
      )}
    </button>
  );
}
