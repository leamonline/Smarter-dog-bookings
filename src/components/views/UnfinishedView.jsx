// Unfinished business — the catch-up queue for bookings the day-scoped
// surfaces can no longer reach.
//
// TodayView answers "what needs attention now?" and is scoped to one day.
// Nothing answered "what did we never finish?", so a booking left open simply
// disappeared the next morning. This view is that second question, and it is
// deliberately plain: a list, grouped by the action each row needs, oldest
// first, with the one common action inline.
import { useMemo, useState } from "react";

import { resolveBookingDisplay } from "../../engine/bookingRules";
import { useUnfinishedBookings } from "../../supabase/hooks/useUnfinishedBookings.ts";
import { useToast } from "../../contexts/ToastContext.jsx";
import { SectionCard, EmptyState } from "./today/parts.jsx";

const TONE = {
  mid_groom: { rail: "bg-amber-400", chip: "bg-amber-50 text-amber-800 border-amber-200" },
  awaiting_collection: { rail: "bg-violet-400", chip: "bg-violet-50 text-violet-800 border-violet-200" },
  never_started: { rail: "bg-slate-400", chip: "bg-slate-100 text-slate-700 border-slate-200" },
  unpaid: { rail: "bg-rose-400", chip: "bg-rose-50 text-rose-800 border-rose-200" },
};

function formatDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function ageLabel(days) {
  if (days === 1) return "1 day ago";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}

function Row({ item, dogs, humans, onComplete, onOpen, pending }) {
  const { booking, kind, ageDays } = item;
  // Never render a raw dog or owner id — resolveBookingDisplay is the only
  // sanctioned way to turn a booking into text.
  const display = resolveBookingDisplay(booking, dogs, humans);
  const tone = TONE[kind];

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 sm:px-5 py-3 border-b border-slate-100 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-slate-800 truncate">{display.dogName}</span>
          <span className="text-slate-400" aria-hidden>·</span>
          <span className="text-sm text-slate-600 truncate">{display.owner}</span>
        </div>
        <div className="mt-0.5 text-[13px] text-slate-500 tabular-nums">
          {formatDate(booking._bookingDate)} at {booking.slot} · {booking.service}
        </div>
      </div>

      <span
        className={`text-[12px] font-medium px-2 py-0.5 rounded-full border tabular-nums ${tone.chip}`}
        title={`Booked for ${formatDate(booking._bookingDate)}`}
      >
        {ageLabel(ageDays)}
      </span>

      <div className="flex items-center gap-2">
        {kind !== "unpaid" && (
          <button
            type="button"
            onClick={() => onComplete(booking)}
            disabled={pending}
            className="text-[13px] font-semibold px-3 py-1.5 rounded-lg bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-800"
          >
            {pending ? "Saving…" : "Mark completed"}
          </button>
        )}
        <button
          type="button"
          onClick={() => onOpen(booking)}
          className="text-[13px] font-semibold px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-800"
        >
          {kind === "unpaid" ? "Add payment" : "Open"}
        </button>
      </div>
    </li>
  );
}

export function UnfinishedView({ dogs, humans, dogsById, humansById, onOpenBooking }) {
  const toast = useToast();
  const [showAll, setShowAll] = useState({});
  const { queue, loading, error, refetch, completeBooking, pendingIds } =
    useUnfinishedBookings(dogsById, humansById, humans);

  const handleComplete = async (booking) => {
    const message = await completeBooking(booking.id);
    if (message) toast.show(message, "error");
    else toast.show("Marked completed.", "success");
  };

  const summary = useMemo(() => {
    if (queue.total === 0) return null;
    const parts = [];
    const lifecycle =
      queue.counts.mid_groom + queue.counts.awaiting_collection + queue.counts.never_started;
    if (lifecycle > 0) parts.push(`${lifecycle} never closed out`);
    if (queue.counts.unpaid > 0) parts.push(`${queue.counts.unpaid} with no payment recorded`);
    return parts.join(" · ");
  }, [queue]);

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-5 py-4 sm:py-6 flex flex-col gap-4">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Unfinished business</h1>
          <p className="mt-1 text-sm text-slate-600 max-w-prose">
            Past appointments that still need something. These stopped appearing on Today the
            morning after they happened.
          </p>
        </div>
        <button
          type="button"
          onClick={refetch}
          className="text-[13px] font-semibold px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-800"
        >
          Refresh
        </button>
      </header>

      {error && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      {loading && <EmptyState>Looking for unfinished appointments…</EmptyState>}

      {!loading && !error && queue.total === 0 && (
        <EmptyState>
          Nothing outstanding — every past appointment is closed out and paid.
        </EmptyState>
      )}

      {!loading && queue.total > 0 && (
        <p className="text-sm text-slate-600 tabular-nums">
          <span className="font-semibold text-slate-800">{queue.total}</span> to deal with
          {summary ? ` — ${summary}` : ""}. Oldest is {ageLabel(queue.oldestAgeDays)}.
        </p>
      )}

      {queue.groups.map((group) => {
        const expanded = showAll[group.kind];
        const visible = expanded ? group.items : group.items.slice(0, 10);
        return (
          <SectionCard
            key={group.kind}
            title={group.label}
            subtitle={group.action}
            count={group.items.length}
            accent={TONE[group.kind].rail}
          >
            <ul className="divide-y-0">
              {visible.map((item) => (
                <Row
                  key={item.booking.id}
                  item={item}
                  dogs={dogs}
                  humans={humans}
                  onComplete={handleComplete}
                  onOpen={(b) => onOpenBooking?.(b.id, b)}
                  pending={pendingIds.has(item.booking.id)}
                />
              ))}
            </ul>
            {group.items.length > visible.length && (
              <div className="px-4 sm:px-5 py-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAll((s) => ({ ...s, [group.kind]: true }))}
                  className="text-[13px] font-semibold text-slate-700 hover:text-slate-900 underline underline-offset-2"
                >
                  Show the remaining {group.items.length - visible.length}
                </button>
              </div>
            )}
          </SectionCard>
        );
      })}
    </div>
  );
}
