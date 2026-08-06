// ============================================================
// src/components/dashboard/WhatsAppInboxCard.jsx
//
// Right-rail inbox card. Stateless / presentational — `data` is the
// shape returned by useWhatsAppSummary (lifted up to the rail
// container). Tone comes from `resolveInboxTone`; the AI summary panel
// renders inside `aiBlock` only in active / attention. In calm we hide
// the AI panel entirely (the muted "Inbox clear" line says it all).
// ============================================================

import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { MessageCircle, RefreshCw } from "lucide-react";
import { useWhatsAppSummary } from "../../supabase/hooks/useWhatsAppSummary.js";
import { RightRailCard } from "./RightRailCard.jsx";
import { resolveInboxTone } from "./tone/inbox";

function formatTimeWaiting(isoStr) {
  if (!isoStr) return "";
  const diffMs = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function InboxAiSummary({ aiSummary, awaitingReply }) {
  return (
    <div className="bg-white rounded-xl p-3 border border-emerald-100 min-h-[44px]">
      {aiSummary?.loading && !aiSummary?.text ? (
        <div className="flex items-center gap-2 text-[12px] text-emerald-700/60 italic">
          <RefreshCw size={12} className="animate-spin" aria-hidden="true" />
          Summarising…
        </div>
      ) : aiSummary?.text ? (
        <p className="text-[12px] text-slate-700 leading-relaxed">
          {aiSummary.text}
        </p>
      ) : (
        <p className="text-[12px] text-slate-500 italic">
          {awaitingReply === 0
            ? "All sorted right now"
            : aiSummary?.error
              ? "Summary's not ready yet — open the inbox to see what's there"
              : "No summary yet"}
        </p>
      )}
    </div>
  );
}

function InboxActionableRow({ conv, onOpen }) {
  return (
    <div className="bg-white rounded-xl p-3 border border-slate-100 flex flex-col gap-1 shadow-sm">
      <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
        <span className="text-brand-purple font-extrabold">{conv.displayName}</span>
        <span className="text-slate-400 tabular-nums">{formatTimeWaiting(conv.lastAt)}</span>
      </div>
      <p className="text-[12px] text-slate-700 italic truncate max-w-full">
        &ldquo;{conv.lastText}&rdquo;
      </p>
      <button
        type="button"
        onClick={() => onOpen(conv.conversationId)}
        className="mt-1.5 self-start text-[11px] font-bold text-brand-purple hover:underline cursor-pointer bg-transparent border-none p-0"
      >
        Open conversation
      </button>
    </div>
  );
}

// `bare` keeps the existing UtilityTabs embedding working — when bare
// we drop the rounded card frame so the parent's tab styling shows.
// `onCreateBooking` is retained (unused) for backward compatibility
// with the UtilityTabs prop chain; the card itself doesn't expose a
// Create booking button (the inbox does).
export function WhatsAppInboxCard({ bare = false, data, onOpen, onCreateBooking: _onCreateBooking }) {
  const navigate = useNavigate();
  // Fall back to owning the hook when the caller doesn't pass data —
  // keeps UtilityTabs / standalone usages working without a refactor
  // of every parent. The right-rail container passes `data` to avoid
  // double-subscribing.
  const fallback = useWhatsAppSummary();
  const summarySource = data ?? fallback;
  const { awaitingReply, oldestUnansweredAt, aiSummary, recentConversations = [], loading } = summarySource;

  const tone = resolveInboxTone({ awaitingReply, oldestUnansweredAt });
  const openInbox = onOpen ?? (() => navigate("/whatsapp"));

  // Select up to 2 unread conversations awaiting reply
  const actionableItems = useMemo(() => {
    return (recentConversations || []).filter((c) => c.unreadCount > 0).slice(0, 2);
  }, [recentConversations]);

  const handleOpenConversation = (cid) => {
    navigate(`/inbox?conversation=${cid}`);
  };

  return (
    <RightRailCard
      tone={tone.tone}
      accent="emerald"
      heading="WhatsApp inbox"
      icon={MessageCircle}
      pillLabel={tone.pillLabel}
      primaryNumber={tone.primaryNumber}
      primaryLine={tone.primaryLine}
      subtitle={tone.subtitle}
      ariaLabel={tone.ariaSummary}
      loading={loading}
      bare={bare}
      aiBlock={
        tone.tone === "calm" ? null : (
          <div className="flex flex-col gap-2">
            {actionableItems.length > 0 ? (
              actionableItems.map((conv) => (
                <InboxActionableRow
                  key={conv.conversationId}
                  conv={conv}
                  onOpen={handleOpenConversation}
                />
              ))
            ) : (
              <InboxAiSummary aiSummary={aiSummary} awaitingReply={awaitingReply} />
            )}
          </div>
        )
      }
      cta={{ label: "Open inbox", onClick: openInbox }}
    />
  );
}
