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
  onManageAvailability,
}) {
  const dogsLabel = `${dogsBooked} ${dogsBooked === 1 ? "dog" : "dogs"} booked`;
  return (
    <header className="flex flex-col gap-2">
      <div>
        <h1 className="font-display text-[24px] font-extrabold text-brand-purple leading-tight">Today</h1>
        <p className="text-[13px] text-slate-600 mt-0.5 flex items-center gap-x-1.5 flex-wrap">
          <span className="font-semibold text-slate-700">{dateLabel}</span>
          {!isDayOpen && (
            <>
              <span aria-hidden>·</span>
              <span className="font-bold text-brand-coral-text">salon closed</span>
            </>
          )}
          <span aria-hidden>·</span>
          <span>{dogsLabel}</span>
          <span aria-hidden>·</span>
          {actionCount > 0 ? (
            <span className="font-bold text-brand-coral-text">
              {actionCount} need action
            </span>
          ) : (
            <span className="font-semibold text-brand-teal-text">all calm</span>
          )}
          {unpaidTotal > 0 && (
            <>
              <span aria-hidden>·</span>
              <span className="font-bold text-slate-800">{formatMoney(unpaidTotal)} unpaid</span>
            </>
          )}
        </p>
      </div>

      {isDayOpen && (
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={onManageAvailability}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-full bg-white border border-slate-200 text-[13px] font-bold text-brand-purple hover:border-brand-purple/30 hover:bg-brand-purple/5 motion-safe:transition-colors"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M16 2v4M8 2v4M3 10h18" />
            </svg>
            Manage availability
          </button>
          <span className="text-[13px] text-slate-600">
            Next online slot:{" "}
            {nextOnlineSlot ? (
              <span className="font-bold text-brand-teal-text tabular-nums">{nextOnlineSlot}</span>
            ) : (
              <span className="font-semibold text-slate-500">none open</span>
            )}
          </span>
        </div>
      )}
    </header>
  );
}
