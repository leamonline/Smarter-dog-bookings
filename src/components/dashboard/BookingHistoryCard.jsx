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

import { useBookingEvents } from "../../supabase/hooks/useBookingEvents.js";
import { eventSentence, EVENT_TONE, formatRelative } from "../../lib/bookingEventFormat.js";
import { History } from "lucide-react";

// eventSentence + EVENT_TONE + formatRelative now live in
// lib/bookingEventFormat so the owner timeline on the Human Profile shares the
// exact wording and tone.

export function BookingHistoryCard({ limit = 10 } = {}) {
  const { events, loading, error, refresh } = useBookingEvents({ limit });

  return (
    <section
      aria-label="Recent booking activity"
      className="rounded-2xl border border-slate-200 shadow-[0_2px_8px_rgba(0,0,0,0.04)] overflow-hidden bg-white"
    >
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            Recent booking activity
          </h2>
          <span className="w-7 h-7 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center">
            <History size={14} strokeWidth={2.4} aria-hidden="true" />
          </span>
        </div>

        {error && (
          <div role="alert" className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg p-2 mb-2">
            Couldn&apos;t load activity — give it another go.
            <button type="button" onClick={refresh} className="ml-2 underline font-semibold cursor-pointer">
              Retry
            </button>
          </div>
        )}

        {loading && events.length === 0 && (
          <p className="text-[12px] text-slate-500 italic" role="status">Loading…</p>
        )}

        {!loading && events.length === 0 && !error && (
          <p className="text-[12px] text-slate-500 italic">
            Nothing booked yet.
          </p>
        )}

        <ul className="flex flex-col gap-2">
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
    </section>
  );
}
