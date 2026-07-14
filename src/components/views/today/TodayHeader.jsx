// The one and only "Today" heading. The app shell hides its context row on
// /today, so this header carries the page identity, the compact daily stats a
// groomer wants at a glance, the "Next online slot" a customer could book, and
// the entry point to the availability modal.
import { formatMoney } from "./parts.jsx";

export function TodayHeader({
  dateLabel,
  dogsBooked,
  actionCount,
  unpaidTotal = 0,
  nextOnlineSlot = null,
  isDayOpen,
  briefMode = false,
  onManageAvailability,
}) {
  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-[24px] font-extrabold text-brand-purple leading-tight">Today</h1>
          <p className="mt-0.5 flex items-center gap-2 text-[13px] font-semibold text-slate-700">
            <span>{dateLabel}</span>
            {!isDayOpen && (
              <span className="rounded-full bg-brand-coral/10 px-2 py-0.5 text-[11px] font-bold text-brand-coral-text">
                Salon closed
              </span>
            )}
          </p>
        </div>

        {isDayOpen && (
          <div className="flex flex-col items-start gap-1.5 sm:items-end">
            <button
              type="button"
              onClick={onManageAvailability}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 text-[13px] font-bold text-brand-purple hover:border-brand-purple/30 hover:bg-brand-purple/5 motion-safe:transition-colors"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M16 2v4M8 2v4M3 10h18" />
              </svg>
              Manage availability
            </button>
            {nextOnlineSlot ? (
              <p className="text-[12px] text-slate-500">
                Next online slot <span className="font-bold tabular-nums text-brand-teal-text">{nextOnlineSlot}</span>
              </p>
            ) : (
              <p className="text-[12px] font-semibold text-slate-500">No online slots available</p>
            )}
          </div>
        )}
      </div>

      {/* briefMode = the closed-day brief: today's stats would sit next to
          the NEXT open day's KPIs and read as that day's — so they hide. */}
      {!briefMode && (
        <ul aria-label="Today's summary" className="grid grid-cols-3 gap-2">
          <li className="flex h-9 items-center justify-center whitespace-nowrap rounded-full bg-slate-100 px-3 text-[12px] font-semibold text-slate-700">
            <strong className="mr-1 font-extrabold text-slate-900">{dogsBooked}</strong> booked
          </li>
          <li className={`flex h-9 items-center justify-center whitespace-nowrap rounded-full px-3 text-[12px] font-bold ${actionCount > 0 ? "bg-brand-coral/10 text-brand-coral-text" : "bg-brand-teal/10 text-brand-teal-text"}`}>
            {actionCount > 0 ? <><strong className="mr-1 font-extrabold">{actionCount}</strong> need action</> : "All calm"}
          </li>
          <li className={`flex h-9 items-center justify-center whitespace-nowrap rounded-full px-3 text-[12px] font-bold ${unpaidTotal > 0 ? "bg-brand-yellow/25 text-slate-800" : "bg-brand-teal/10 text-brand-teal-text"}`}>
            {unpaidTotal > 0 ? <><strong className="mr-1 font-extrabold">{formatMoney(unpaidTotal)}</strong> unpaid</> : "All paid"}
          </li>
        </ul>
      )}
    </header>
  );
}
