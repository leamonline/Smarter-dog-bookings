// ============================================================
// src/components/dashboard/BookingHistoryCard.jsx
//
// Append-only feed of recent booking events for the dashboard
// sidebar. Four event types from booking_events, each naming the
// actor who made/amended the booking. Staff and the WhatsApp AI lead
// the line ("Leam booked in …", "Smarter Dog AI booked in …");
// customers stay owner-led:
//
//   created     — "Leam booked in Alfie (Yorkshire Terrier) with
//                  Catherine Green for a Full Groom at Mon 1 Jun at 9:00am"
//   rescheduled — "Leam moved Alfie's Full Groom (Catherine Green)
//                  from Mon 1 Jun at 9:00am to Wed 3 Jun at 10:30am"
//   cancelled   — "Catherine Green cancelled Alfie's Full Groom
//                  for Mon 1 Jun at 9:00am"
//   reconfirmed — "Catherine Green reconfirmed the Full Groom for
//                  Alfie (Yorkshire Terrier)"
//
// Subscribes to realtime so new bookings, reschedules,
// cancellations, and reconfirmations appear instantly.
// ============================================================

import { useState, useMemo } from "react";
import { useBookingEvents } from "../../supabase/hooks/useBookingEvents";
import { eventSentence, EVENT_TONE, formatRelative } from "../../lib/bookingEventFormat.js";
import { ChevronDown, ChevronUp } from "lucide-react";

export function BookingHistoryCard({ limit = 10 } = {}) {
  const { events, loading, error, refresh } = useBookingEvents({ limit });
  const [isExpanded, setIsExpanded] = useState(false);

  // Track "new" events (e.g., occurred in the last hour)
  const newCount = useMemo(() => {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    return events.filter(
      (e) => new Date(e.occurred_at).getTime() > oneHourAgo
    ).length;
  }, [events]);

  const toggleExpand = () => setIsExpanded((prev) => !prev);

  return (
    <section
      aria-label="Recent booking activity"
      className="rounded-2xl border border-slate-200 shadow-[0_2px_8px_rgba(0,0,0,0.04)] overflow-hidden bg-white transition-all duration-200"
    >
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Recent booking activity
            </h2>
            {!isExpanded && (
              <p className="text-xs text-slate-500 font-semibold mt-1 truncate">
                Recent activity {newCount > 0 ? `· ${newCount} new` : `· ${events.length} events`}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={toggleExpand}
            aria-expanded={isExpanded}
            className="w-8 h-8 rounded-full bg-slate-50 text-slate-600 flex items-center justify-center cursor-pointer border border-slate-200 transition-colors hover:bg-slate-100 min-h-[36px] min-w-[36px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple"
            aria-label={isExpanded ? "Collapse activity history" : "Expand activity history"}
          >
            {isExpanded ? (
              <ChevronUp size={14} strokeWidth={2.4} aria-hidden="true" />
            ) : (
              <ChevronDown size={14} strokeWidth={2.4} aria-hidden="true" />
            )}
          </button>
        </div>

        {error && (
          <div role="alert" className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg p-2 mt-2">
            Couldn&apos;t load activity — give it another go.
            <button type="button" onClick={refresh} className="ml-2 underline font-semibold cursor-pointer bg-transparent border-none">
              Retry
            </button>
          </div>
        )}

        {isExpanded && (
          <div className="mt-3 border-t border-slate-100 pt-3 animate-pop-in">
            {loading && events.length === 0 && (
              <p className="text-[12px] text-slate-500 italic" role="status">Loading…</p>
            )}

            {!loading && events.length === 0 && !error && (
              <p className="text-[12px] text-slate-500 italic">
                Nothing booked yet.
              </p>
            )}

            <ul className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1">
              {events.map((e) => {
                const tone = EVENT_TONE[e.event_type] ?? EVENT_TONE.created;
                return (
                  <li key={e.id} className="flex gap-2 text-[12px] leading-snug">
                    <span
                      aria-hidden="true"
                      className={`mt-1 shrink-0 w-1.5 h-1.5 rounded-full ${tone.dot}`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-700">{eventSentence(e)}</p>
                      <p className={`text-[10px] mt-0.5 ${tone.pill}`}>
                        <span className="font-semibold uppercase tracking-wide">{tone.label}</span>
                        <span className="text-slate-400 font-normal"> · {formatRelative(e.occurred_at)}</span>
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
