// ============================================================
// src/components/dashboard/BookingHistoryCard.jsx
//
// Append-only feed of recent booking events for the dashboard
// sidebar. Three event types from booking_events:
//
//   created     — "Catherine Green booked a Full Groom for Alfie
//                  (Yorkshire Terrier) Mon 1 Jun at 9:00am"
//   rescheduled — "Catherine Green moved Alfie's Full Groom from
//                  Mon 1 Jun at 9:00am to Wed 3 Jun at 10:30am"
//   cancelled   — "Catherine Green cancelled Alfie's Full Groom
//                  for Mon 1 Jun at 9:00am"
//
// Subscribes to realtime so new bookings, reschedules, and
// cancellations appear instantly.
// ============================================================

import { useBookingEvents } from "../../supabase/hooks/useBookingEvents.js";
import { SERVICES } from "../../constants/salon.ts";
import { History } from "lucide-react";

const SERVICE_LABEL = Object.fromEntries(SERVICES.map((s) => [s.id, s.name]));

function formatService(id) {
  return SERVICE_LABEL[id] ?? id ?? "groom";
}

function formatDate(yyyyMmDd) {
  if (!yyyyMmDd) return "";
  const d = new Date(`${yyyyMmDd}T12:00:00Z`);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function formatTime(slot) {
  if (!slot) return "";
  const [h, m] = slot.split(":").map(Number);
  const period = h < 12 ? "am" : "pm";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")}${period}`;
}

function dogParenthetical(breed) {
  if (!breed) return "";
  return ` (${breed})`;
}

function formatRelative(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff) || diff < 0) return "";
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function eventSentence(event) {
  if (!event) return "";
  const customer = event.customer_name || "Someone";
  const dog = event.dog_name || "a dog";
  const breed = dogParenthetical(event.dog_breed);
  const service = formatService(event.service);
  const date = formatDate(event.booking_date);
  const time = formatTime(event.slot);

  if (event.event_type === "rescheduled") {
    const prevDate = formatDate(event.previous_booking_date);
    const prevTime = formatTime(event.previous_slot);
    return `${customer} moved ${dog}${breed}'s ${service} from ${prevDate} at ${prevTime} to ${date} at ${time}.`;
  }
  if (event.event_type === "cancelled") {
    const reason = event.cancel_reason ? ` (${event.cancel_reason})` : "";
    return `${customer} cancelled ${dog}${breed}'s ${service} for ${date} at ${time}${reason}.`;
  }
  // created
  return `${customer} booked a ${service} for ${dog}${breed} ${date} at ${time}.`;
}

const EVENT_TONE = {
  created: {
    dot: "bg-emerald-500",
    pill: "text-emerald-700",
    label: "Booked",
  },
  rescheduled: {
    dot: "bg-amber-500",
    pill: "text-amber-700",
    label: "Moved",
  },
  cancelled: {
    dot: "bg-rose-500",
    pill: "text-rose-700",
    label: "Cancelled",
  },
};

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
            Couldn&apos;t load activity.
            <button type="button" onClick={refresh} className="ml-2 underline font-semibold cursor-pointer">
              Retry
            </button>
          </div>
        )}

        {loading && events.length === 0 && (
          <p className="text-[12px] text-slate-400 italic">Loading…</p>
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
