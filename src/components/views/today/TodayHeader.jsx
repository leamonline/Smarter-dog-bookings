import { CalendarDays } from "lucide-react";
import { formatMoney } from "./parts.jsx";

export function TodayHeader({
  dateLabel,
  dogsBooked,
  actionCount,
  unpaidTotal = 0,
  nextOnlineSlot = null,
  isDayOpen,
  isToday = true,
  briefMode = false,
  onOpenDatePicker,
  onManageAvailability,
}) {
  return (
    <header className="grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(16rem,.65fr)]">
      <div className="flex min-w-0 flex-col gap-3">
        <div>
          <h1 className="sr-only">Daily Brief</h1>
          <button
            type="button"
            aria-label={`Choose date, ${dateLabel}`}
            onClick={onOpenDatePicker}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-brand-yellow bg-brand-yellow px-3 text-center text-brand-purple outline-none hover:bg-brand-yellow/85 focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2 sm:w-auto sm:justify-start sm:border-transparent sm:bg-transparent sm:text-left sm:hover:bg-white"
          >
            <CalendarDays size={20} aria-hidden="true" />
            <span className="font-display text-base font-bold">{dateLabel}</span>
          </button>
        </div>

        {!briefMode && (
          <ul aria-label={isToday ? "Today's summary" : "Selected date summary"} className="grid grid-cols-3 gap-2">
            <li className="flex h-9 items-center justify-center whitespace-nowrap rounded-full bg-slate-100 px-3 text-[12px] font-semibold text-slate-700">
              <strong className="mr-1 font-extrabold text-slate-900">{dogsBooked}</strong>{" "}
              {dogsBooked === 1 ? "dog" : "dogs"} booked
            </li>
            <li
              className={`flex h-9 items-center justify-center whitespace-nowrap rounded-full px-3 text-[12px] font-bold ${
                actionCount > 0
                  ? "bg-brand-coral/10 text-brand-coral-text"
                  : "bg-brand-teal/10 text-brand-teal-text"
              }`}
            >
              {actionCount > 0 ? (
                <>
                  <strong className="mr-1 font-extrabold">{actionCount}</strong> need action
                </>
              ) : (
                "All calm"
              )}
            </li>
            <li
              className={`flex h-9 items-center justify-center whitespace-nowrap rounded-full px-3 text-[12px] font-bold ${
                unpaidTotal > 0
                  ? "bg-brand-yellow/25 text-slate-800"
                  : "bg-brand-teal/10 text-brand-teal-text"
              }`}
            >
              {unpaidTotal > 0 ? (
                <>
                  <strong className="mr-1 font-extrabold">{formatMoney(unpaidTotal)}</strong>{" "}
                  unpaid
                </>
              ) : (
                "All paid"
              )}
            </li>
          </ul>
        )}
      </div>

      <aside
        aria-label="Availability"
        className="flex min-h-full flex-col items-start justify-center gap-1.5 rounded-2xl border border-brand-paper-line bg-brand-paper px-4 py-3 lg:items-end lg:text-right"
      >
        <button
          type="button"
          onClick={onManageAvailability}
          className="inline-flex min-h-11 items-center rounded-full border border-brand-paper-line bg-white px-4 text-[13px] font-bold text-brand-purple outline-none transition-colors hover:border-brand-purple/30 hover:bg-brand-purple/5 focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2"
        >
          Manage availability
        </button>
        {nextOnlineSlot ? (
          <p className="text-[12px] text-slate-500">
            Next online slot{" "}
            <span className="font-bold tabular-nums text-brand-teal-text">
              {nextOnlineSlot}
            </span>
          </p>
        ) : (
          <p className="text-[12px] font-semibold text-slate-500">
            No online slots available
          </p>
        )}
        {!isDayOpen && (
          <p className="rounded-full bg-brand-coral/10 px-2 py-0.5 text-[11px] font-bold text-brand-coral-text">
            Salon closed
          </p>
        )}
      </aside>
    </header>
  );
}
