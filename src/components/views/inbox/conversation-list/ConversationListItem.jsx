// ============================================================
// src/components/views/inbox/conversation-list/ConversationListItem.jsx
//
// Compact conversation row. Competing operational signals collapse into one
// winning status; the WhatsApp reply-window constraint stays separate because
// it describes how staff may reply rather than what state the conversation is in.
// ============================================================

import {
  displayName,
  formatWhen,
  inboxWindowBadge,
} from "../helpers.js";
import { getConversationRowStatus } from "../workspace/inboxWorkspaceModel.js";
import { previewMessageText } from "../thread/messageContent";

const STATUS_TONES = {
  danger: "border-rose-200 bg-rose-50 text-rose-800",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  info: "border-brand-purple/20 bg-brand-purple/5 text-brand-purple",
  neutral: "border-slate-200 bg-slate-100 text-slate-700",
};

export function ConversationListItem({
  conv,
  isSelected,
  onSelect,
  isChecked = false,
  onToggleSelect,
}) {
  const unread = conv.unread_count > 0;
  const isClosed = !!conv.closed_at;
  const rowStatus = getConversationRowStatus(conv);
  const windowBadge = inboxWindowBadge(conv);

  // Preview the last message in EITHER direction (first line only). Falls
  // back to last_customer_text so a pre-migration front-end still works.
  const lastText = conv.last_message_text ?? conv.last_customer_text;
  const lastDirection =
    conv.last_message_direction ??
    // Fallback text (last_customer_text) is always the customer's, so pin
    // it inbound; only infer from timestamps when we actually have the
    // either-direction last_message_text.
    (conv.last_message_text == null
      ? "inbound"
      : conv.last_outbound_at &&
          (!conv.last_inbound_at || conv.last_outbound_at > conv.last_inbound_at)
        ? "outbound"
        : "inbound");
  const isOurs = lastDirection === "outbound";
  const preview = previewMessageText(lastText).split("\n")[0];
  const lastAt = isClosed
    ? conv.closed_at
    : conv.last_message_at ?? conv.last_inbound_at;
  const absoluteWhen = lastAt ? new Date(lastAt).toLocaleString("en-GB") : "";

  return (
    <div
      className={`relative flex min-h-16 max-h-[72px] items-stretch border-b border-slate-100 ${
        isChecked ? "bg-brand-yellow/30" : ""
      }`}
    >
      {onToggleSelect && (
        <label className="flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center">
          <input
            type="checkbox"
            checked={isChecked}
            onChange={() => onToggleSelect(conv.id)}
            aria-label={`Select conversation with ${displayName(conv)}`}
            className="h-4 w-4 cursor-pointer accent-brand-purple"
          />
        </label>
      )}

      <button
        type="button"
        onClick={() => onSelect(conv.id)}
        aria-current={isSelected ? "true" : undefined}
        className={`relative min-w-0 flex-1 cursor-pointer border-l-[3px] px-3 py-2 text-left font-[inherit] transition-colors ${
          isSelected
            ? "border-l-brand-yellow bg-brand-yellow/25 shadow-[inset_0_0_0_1px_rgba(254,204,19,0.35)]"
            : isClosed
              ? "border-l-transparent bg-slate-50 opacity-75 hover:bg-slate-100"
              : unread
                ? "border-l-transparent bg-brand-yellow/15 hover:bg-brand-yellow/25"
                : "border-l-transparent bg-white hover:bg-slate-50"
        }`}
      >
        <div className="flex min-w-0 items-start justify-between gap-2">
          <span
            className={`truncate text-[13px] ${
              unread
                ? "font-bold text-brand-purple"
                : isClosed
                  ? "font-semibold text-brand-purple/55"
                  : "font-semibold text-brand-purple/90"
            }`}
          >
            {displayName(conv)}
          </span>
          {lastAt && (
            <span
              className="shrink-0 tabular-nums text-[10px] text-slate-500"
              title={absoluteWhen}
              aria-label={absoluteWhen}
            >
              {formatWhen(lastAt)}
            </span>
          )}
        </div>

        <div className="mt-1 flex min-w-0 items-center gap-1.5">
          {preview ? (
            <span
              className={`min-w-0 flex-1 truncate text-[11px] ${
                isOurs ? "text-left" : "text-right"
              } ${unread ? "text-slate-700" : "text-slate-600"}`}
            >
              {preview}
            </span>
          ) : (
            <span className="min-w-0 flex-1" />
          )}

          <div className="flex shrink-0 items-center gap-1">
            {rowStatus && (
              <span
                className={`inline-flex h-5 items-center whitespace-nowrap rounded-full border px-1.5 text-[10px] font-semibold ${
                  STATUS_TONES[rowStatus.tone] ?? STATUS_TONES.neutral
                }`}
                title={rowStatus.title}
                aria-label={rowStatus.ariaLabel}
              >
                {rowStatus.label}
              </span>
            )}
            {windowBadge && (
              <span
                className={`inline-flex h-5 items-center whitespace-nowrap rounded-full border px-1.5 text-[10px] font-semibold ${
                  windowBadge.kind === "closing_soon"
                    ? "border-amber-200 bg-amber-50 text-amber-900"
                    : "border-slate-200 bg-slate-100 text-slate-700"
                }`}
                title={windowBadge.title}
                aria-label={windowBadge.title}
              >
                {windowBadge.label}
              </span>
            )}
          </div>
        </div>
      </button>
    </div>
  );
}
