// ============================================================
// DashboardWhatsAppCard.jsx
//
// Sidebar card summarising WhatsApp state. Leads with
// "awaiting reply" because that's the number that maps directly
// to a pending action — the others are supporting context.
//
// Design choices:
// - Awaiting-reply in WhatsApp green when > 0 (signals "do
//   something"), slate when 0 (calm).
// - Compact two-up "Drafts" / "Today" row under the big number
//   so the card stays small and doesn't compete with the month
//   calendar for sidebar real estate.
// - Skeleton on loading, not a spinner — avoids the card
//   jumping in height on initial paint.
// - Each conversation row deep-links into its own chat via
//   ?conversation=<id> on /whatsapp, so the card is a div with
//   nested button rows rather than one big button.
// ============================================================

import { useNavigate } from "react-router-dom";
import { useWhatsAppSummary } from "../../supabase/hooks/useWhatsAppSummary.js";

function WhatsAppGlyph({ className = "" }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12.05 21.785h-.004c-1.954 0-3.87-.525-5.54-1.516L2.5 21.5l1.27-4.375a10.213 10.213 0 01-1.634-5.514C2.136 5.92 6.582 1.476 12.05 1.476c2.653 0 5.147 1.033 7.02 2.908a9.859 9.859 0 012.906 7.018c-.003 5.647-4.448 10.383-9.926 10.383zm0-18.41c-4.523 0-8.203 3.68-8.205 8.204 0 1.788.527 3.531 1.524 5.037l.237.373-1.001 3.448 3.539-.928.36.216a8.24 8.24 0 004.203 1.153h.004c4.52 0 8.2-3.68 8.204-8.204a8.162 8.162 0 00-2.403-5.808 8.15 8.15 0 00-5.802-2.406z" />
    </svg>
  );
}

function formatRelativeTime(iso) {
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

export function DashboardWhatsAppCard() {
  const navigate = useNavigate();
  const { awaitingReply, draftsPending, conversationsToday, recentConversations, loading } =
    useWhatsAppSummary();

  const hasAwaiting = awaitingReply > 0;

  return (
    <div
      className="bg-white border border-slate-200 rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] overflow-hidden"
      aria-label={`WhatsApp: ${awaitingReply} awaiting reply, ${draftsPending} drafts pending`}
    >
      {/* Summary header — clickable to /whatsapp inbox root. Matches
          the calendar/capacity cards' typographic style; the green
          stays as an accent on the glyph and on the awaiting-reply
          number so urgency still reads at a glance. */}
      <button
        type="button"
        onClick={() => navigate("/whatsapp")}
        className="w-full text-left p-4 cursor-pointer transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#25D366] focus:ring-inset"
      >
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            WhatsApp
          </div>
          <span
            className={hasAwaiting ? "text-[#25D366]" : "text-slate-300"}
            aria-hidden="true"
          >
            <WhatsAppGlyph />
          </span>
        </div>

        <div className="flex items-baseline gap-2">
          {loading ? (
            <div className="h-8 w-10 rounded bg-slate-100 animate-pulse" />
          ) : (
            <div
              className={`text-3xl font-black font-display leading-none ${
                hasAwaiting ? "text-[#25D366]" : "text-slate-400"
              }`}
            >
              {awaitingReply}
            </div>
          )}
          <div className="text-xs font-semibold text-slate-500">
            awaiting reply
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-3">
          <div>
            <div className="text-sm font-bold text-slate-700">
              {loading ? "—" : draftsPending}
            </div>
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
              Drafts
            </div>
          </div>
          <div>
            <div className="text-sm font-bold text-slate-700">
              {loading ? "—" : conversationsToday}
            </div>
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
              Today
            </div>
          </div>
        </div>
      </button>

      {/* Recent conversations — one row per person, ordered by latest
          inbound message. Each is its own button so it can deep-link
          into that specific chat. */}
      {recentConversations && recentConversations.length > 0 && (
        <ul className="border-t border-slate-100 flex flex-col">
          {recentConversations.map((conv) => (
            <li key={conv.conversationId}>
              <button
                type="button"
                onClick={() => navigate(`/whatsapp?conversation=${conv.conversationId}`)}
                aria-label={`Open conversation with ${conv.displayName}`}
                className="w-full text-left flex items-baseline gap-2 px-4 py-2 min-w-0 cursor-pointer transition-colors hover:bg-slate-50 focus:outline-none focus:bg-slate-50 border-none bg-transparent font-[inherit]"
              >
                <span className="text-[11px] font-bold text-slate-800 truncate shrink-0 max-w-[40%]">
                  {conv.displayName}
                </span>
                <span className="text-[11px] text-slate-500 truncate flex-1 min-w-0">
                  {conv.lastText}
                </span>
                <span className="text-[10px] font-semibold text-slate-400 shrink-0 tabular-nums">
                  {formatRelativeTime(conv.lastAt)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* View inbox footer — separate button so the recent rows can
          have their own click targets without nested-button issues. */}
      <button
        type="button"
        onClick={() => navigate("/whatsapp")}
        className="w-full px-4 py-2 border-t border-slate-100 flex items-center justify-end gap-1 text-[11px] font-semibold text-slate-500 cursor-pointer transition-colors hover:bg-slate-50 hover:text-slate-700 bg-transparent border-l-0 border-r-0 border-b-0 font-[inherit]"
      >
        View inbox
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    </div>
  );
}
