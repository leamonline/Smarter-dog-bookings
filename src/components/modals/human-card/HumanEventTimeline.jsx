import { useMemo } from "react";
import { History } from "lucide-react";
import { getDogsForHuman } from "../../../utils/directorySearch";
import { useOwnerBookingEvents } from "../../../supabase/hooks/useOwnerBookingEvents.js";
import {
  eventSentence,
  EVENT_TONE,
  formatRelative,
} from "../../../lib/bookingEventFormat.js";

// Read-only timeline of this owner's booking events (created / rescheduled /
// cancelled / reconfirmed / completed) on the Human Profile. Booking actions
// stay in the booking detail modal — this is a record, not a control. Scoped
// to the owner's dogs by useOwnerBookingEvents; reuses the dashboard's
// eventSentence so the wording + actor attribution never drift.
export function HumanEventTimeline({ human, dogs, dogsByHumanId }) {
  const dogIds = useMemo(
    () =>
      human
        ? getDogsForHuman(human, dogs || {}, dogsByHumanId || {}).map((d) => d.id)
        : [],
    [human, dogs, dogsByHumanId],
  );

  const { events, loading, error } = useOwnerBookingEvents({ dogIds });

  return (
    <section
      aria-label="Booking activity"
      className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.04)] overflow-hidden"
    >
      <div className="sticky top-0 z-[1] bg-white px-3 py-2 border-b border-slate-200/70 flex items-center justify-between gap-2">
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-brand-teal-text/70">
          Booking activity
          {events.length > 0 && (
            <span className="ml-1.5 text-slate-400 normal-case tracking-normal">
              · {events.length}
            </span>
          )}
        </h3>
        <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center">
          <History size={13} strokeWidth={2.4} aria-hidden="true" />
        </span>
      </div>

      <div className="px-3 py-2">
        {error ? (
          <p role="alert" className="text-[12px] text-rose-700 italic py-1">
            Couldn&apos;t load the activity history — give it another go.
          </p>
        ) : loading && events.length === 0 ? (
          <p className="text-[12px] text-slate-400 italic py-1">Loading…</p>
        ) : events.length === 0 ? (
          <p className="text-[12px] text-slate-400 italic py-1">
            No booking changes yet.
          </p>
        ) : (
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
                      <span className="font-semibold uppercase tracking-wide">
                        {tone.label}
                      </span>
                      <span className="text-slate-400 font-normal">
                        {" "}
                        · {formatRelative(e.occurred_at)}
                      </span>
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
