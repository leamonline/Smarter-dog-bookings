import { useNavigate } from "react-router-dom";
import { MessageCircle, Plus, Reply, ArrowRight } from "lucide-react";
import { useWhatsAppSummary } from "../../supabase/hooks/useWhatsAppSummary.js";

function formatRelative(iso) {
  if (!iso) return "";
  const sent = new Date(iso).getTime();
  const diffMs = Date.now() - sent;
  if (Number.isNaN(diffMs) || diffMs < 0) return "";
  const m = Math.floor(diffMs / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function WhatsAppInboxCard({ onCreateBooking, bare = false }) {
  const navigate = useNavigate();
  const {
    awaitingReply,
    draftsPending,
    recentConversations,
    loading,
  } = useWhatsAppSummary();

  const top = recentConversations?.[0];
  const hasAwaiting = awaitingReply > 0;

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
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-[10px] font-bold text-emerald-700/70 uppercase tracking-wider">
            WhatsApp inbox
          </h2>
          <span className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
            <MessageCircle size={14} strokeWidth={2.4} aria-hidden="true" />
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <div className={`text-2xl font-black font-display leading-none ${
              hasAwaiting ? "text-emerald-700" : "text-emerald-300"
            }`}>
              {loading ? "—" : awaitingReply}
            </div>
            <div className="text-[10px] font-semibold text-emerald-700/70 uppercase tracking-wide mt-1">
              Awaiting reply
            </div>
          </div>
          <div>
            <div className={`text-2xl font-black font-display leading-none ${
              draftsPending > 0 ? "text-emerald-700" : "text-emerald-300"
            }`}>
              {loading ? "—" : draftsPending}
            </div>
            <div className="text-[10px] font-semibold text-emerald-700/70 uppercase tracking-wide mt-1">
              Drafts
            </div>
          </div>
        </div>

        {top && (
          <div className="bg-white rounded-xl p-3 mb-3 border border-emerald-100">
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <span className="text-xs font-bold text-emerald-800 truncate">
                {top.displayName}
              </span>
              <span className="text-[10px] font-semibold text-emerald-700/60 shrink-0 tabular-nums">
                {formatRelative(top.lastAt)}
              </span>
            </div>
            <p className="text-[12px] text-slate-600 leading-relaxed line-clamp-2">
              {top.lastText}
            </p>
          </div>
        )}

        {/* Create booking + Reply — equal width, dark green with
            light green text. Each takes 50% of the row. */}
        <div className="flex items-stretch gap-2 mb-3">
          <button
            type="button"
            onClick={() => onCreateBooking?.(top)}
            className="flex-1 basis-0 inline-flex items-center justify-center gap-1 h-9 px-3 rounded-full text-[12px] font-bold bg-emerald-800 text-emerald-100 cursor-pointer transition-colors hover:bg-emerald-900 border-none font-[inherit]"
          >
            <Plus size={13} strokeWidth={2.5} aria-hidden="true" />
            Create booking
          </button>
          <button
            type="button"
            onClick={() =>
              navigate(top ? `/whatsapp?conversation=${top.conversationId}` : "/whatsapp")
            }
            className="flex-1 basis-0 inline-flex items-center justify-center gap-1 h-9 px-3 rounded-full text-[12px] font-bold bg-emerald-800 text-emerald-100 cursor-pointer transition-colors hover:bg-emerald-900 border-none font-[inherit]"
          >
            <Reply size={13} strokeWidth={2.2} aria-hidden="true" />
            Reply
          </button>
        </div>

        <button
          type="button"
          onClick={() => navigate("/whatsapp")}
          className="w-full inline-flex items-center justify-between gap-2 text-[12px] font-semibold text-emerald-800 bg-white border border-emerald-200 rounded-full px-3 py-1.5 cursor-pointer transition-colors hover:border-emerald-400 hover:bg-emerald-50 font-[inherit]"
        >
          View messages
          <ArrowRight size={12} strokeWidth={2.5} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
