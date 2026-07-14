import { PiggyBank } from "lucide-react";
import { buildAwaitingDeposits } from "../../../engine/deposits";
import { SectionCard } from "./parts.jsx";

// "Awaiting deposit" attention section: every unpaid deposit booking on
// today's diary with its time left; overdue rows are flagged before the
// hourly cron sweep (at :20 past) auto-releases them.
// v1 scope: today's diary only — a future-dated awaiting booking surfaces
// on its own day (TodayView only holds today's bookings).

function timeLeftLabel(minutesLeft, overdue) {
  if (overdue) return "overdue — releases at 20 past the hour";
  if (minutesLeft == null) return "";
  if (minutesLeft >= 120) return `${Math.floor(minutesLeft / 60)}h left`;
  if (minutesLeft >= 60) return `1h ${minutesLeft - 60}m left`;
  return `${minutesLeft}m left`;
}

export function AwaitingDepositsCard({ bookings, now, onOpenBooking }) {
  const items = buildAwaitingDeposits(bookings || [], now);
  if (items.length === 0) return null;

  return (
    <SectionCard
      title="Awaiting deposit"
      subtitle="Unpaid deposits release automatically when their window closes"
      count={items.length}
      accent="bg-amber-400"
    >
      <ul className="list-none m-0 p-0 flex flex-col gap-1">
        {items.map(({ booking, minutesLeft, overdue }) => (
          <li key={booking.id}>
            <button
              type="button"
              onClick={() => onOpenBooking?.(booking)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-transparent bg-transparent cursor-pointer text-left transition-colors hover:bg-amber-50 font-[inherit]"
            >
              <span
                aria-hidden="true"
                className="w-7 h-7 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0"
              >
                <PiggyBank size={14} strokeWidth={2.4} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-bold text-slate-800 truncate">
                  {booking.dogName} · {booking.slot}
                </span>
                <span className="block text-[12px] text-slate-500 font-mono tracking-wide">
                  {booking.depositReference}
                </span>
              </span>
              <span
                className={[
                  "shrink-0 text-[12px] font-bold",
                  overdue ? "text-rose-600" : "text-amber-700",
                ].join(" ")}
              >
                {timeLeftLabel(minutesLeft, overdue)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
