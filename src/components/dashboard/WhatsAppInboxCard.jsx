// ============================================================
// src/components/dashboard/WhatsAppInboxCard.jsx
//
// Right-rail inbox card. Stateless / presentational — `data` is the
// shape returned by useWhatsAppSummary (lifted up to the rail
// container). Tone comes from `resolveInboxTone`; the AI summary panel
// renders inside `aiBlock` only in active / attention. In calm we hide
// the AI panel entirely (the muted "Inbox clear" line says it all).
// ============================================================

import { useNavigate } from "react-router-dom";
import { MessageCircle, RefreshCw } from "lucide-react";
import { useWhatsAppSummary } from "../../supabase/hooks/useWhatsAppSummary.js";
import { RightRailCard } from "./RightRailCard.jsx";
import { resolveInboxTone } from "./tone/inbox";

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
  const { awaitingReply, oldestUnansweredAt, aiSummary, loading } = data ?? fallback;

  const tone = resolveInboxTone({ awaitingReply, oldestUnansweredAt });
  const openInbox = onOpen ?? (() => navigate("/whatsapp"));

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
          <InboxAiSummary aiSummary={aiSummary} awaitingReply={awaitingReply} />
        )
      }
      cta={{ label: tone.tone === "calm" ? "Open inbox" : "Open inbox", onClick: openInbox }}
    />
  );
}
