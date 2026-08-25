import { PiggyBank } from "lucide-react";
import { buildAwaitingDeposits } from "../../../engine/deposits";

// "Awaiting deposit" attention rows: every unpaid deposit booking on today's
// diary with its time left; overdue rows are flagged before the hourly cron
// sweep (at :20 past) auto-releases them. Rendered in the board's shell-less
// group language — a quiet labelled list, not a boxed card.
// v1 scope: today's diary only — TodayView deliberately renders this live
// countdown surface only when the selected date is the real London today.

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
    <section aria-label="Awaiting deposit" className="min-w-0">
      <header className="mb-1.5 flex items-baseline gap-2 px-0.5">
        <h2 className="text-label text-slate-500">Awaiting deposit</h2>
        <span className="text-[12px] font-bold tabular-nums text-brand-purple">{items.length}</span>
        <span className="hidden text-[11px] font-medium text-slate-500 sm:inline">
          unpaid deposits release automatically when their window closes
        </span>
      </header>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {items.map(({ booking, minutesLeft, overdue }) => (
          <li key={booking.id}>
            <button
              type="button"
              onClick={() => onOpenBooking?.(booking)}
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl border border-brand-paper-line bg-white px-3 py-2 text-left font-[inherit] outline-none transition-colors hover:border-slate-300 focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2"
            >
              <span
                aria-hidden="true"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700"
              >
                <PiggyBank size={14} strokeWidth={2.4} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-bold text-slate-800">
                  {booking.dogName} · {booking.slot}
                </span>
                <span className="block font-mono text-[12px] tracking-wide text-slate-500">
                  {booking.depositReference}
                </span>
              </span>
              <span
                className={[
                  "shrink-0 text-[12px] font-bold",
                  overdue ? "text-brand-coral-text" : "text-amber-700",
                ].join(" ")}
              >
                {timeLeftLabel(minutesLeft, overdue)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
