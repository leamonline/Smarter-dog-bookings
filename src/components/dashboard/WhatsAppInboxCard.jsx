// ============================================================
// src/components/dashboard/WhatsAppInboxCard.jsx
//
// Calm signal for the dashboard sidebar. Three blocks:
//   1. Single "needs attention" number (awaitingReply + drafts)
//   2. AI-written one-sentence summary of what's waiting (from
//      dashboard-summary edge function, cached server-side)
//   3. One CTA — Open inbox
//
// Replaces the previous busy card (Create booking, Reply, View
// messages) — those actions live inside /inbox itself now.
// ============================================================

import { useNavigate } from "react-router-dom";
import { MessageCircle, ArrowRight, RefreshCw } from "lucide-react";
import { useWhatsAppSummary } from "../../supabase/hooks/useWhatsAppSummary.js";

// `bare` keeps the existing UtilityTabs embedding working — when bare
// we drop the rounded card frame so the parent's tab styling shows.
// `onCreateBooking` is retained as a prop for backward compatibility
// with RightWorkflowSidebar / UtilityTabs; the new card doesn't
// expose a Create booking button (the inbox itself does), but
// removing the prop would force a refactor of every parent.
export function WhatsAppInboxCard({ bare = false }) {
  const navigate = useNavigate();
  const {
    awaitingReply,
    draftsPending,
    aiSummary,
    loading,
  } = useWhatsAppSummary();

  const needsAttention = (awaitingReply ?? 0) + (draftsPending ?? 0);

  return (
    <section
      aria-label="WhatsApp inbox"
      className={
        bare
          ? "overflow-hidden"
          : "rounded-2xl border border-emerald-200 shadow-[0_2px_8px_rgba(34,197,94,0.08)] overflow-hidden bg-gradient-to-br from-emerald-50 to-white"
      }
    >
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[10px] font-bold text-emerald-700/70 uppercase tracking-wider">
            WhatsApp inbox
          </h2>
          <span className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
            <MessageCircle size={14} strokeWidth={2.4} aria-hidden="true" />
          </span>
        </div>

        {/* Needs attention — single big number. Drops to a muted "all
            clear" tone when there's nothing waiting. */}
        <div className="mb-3">
          <div
            className={`text-3xl font-black font-display leading-none ${
              needsAttention > 0 ? "text-emerald-700" : "text-emerald-300"
            }`}
          >
            {loading ? "—" : needsAttention}
          </div>
          <div className="text-[11px] font-semibold text-emerald-700/70 uppercase tracking-wide mt-1">
            {needsAttention === 1 ? "message needs your eyes" : "messages need your eyes"}
          </div>
        </div>

        {/* AI summary sentence. Renders the cached summary when fresh,
            falls back to a muted "all clear" placeholder when empty,
            and shows a quiet "summarising…" while the function is in
            flight (only on first load — the cache hits after that). */}
        <div className="bg-white rounded-xl p-3 mb-3 border border-emerald-100 min-h-[44px]">
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
              {needsAttention === 0
                ? "Nothing waiting right now."
                : aiSummary?.error
                  ? "Summary unavailable — open the inbox to see what's waiting."
                  : "No summary yet."}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => navigate("/whatsapp")}
          className="w-full inline-flex items-center justify-between gap-2 text-[13px] font-bold text-emerald-100 bg-emerald-800 border-none rounded-full px-4 py-2 cursor-pointer transition-colors hover:bg-emerald-900 font-[inherit]"
        >
          Open inbox
          <ArrowRight size={14} strokeWidth={2.5} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
