import { PawPrint, Settings as SettingsIcon, CalendarDays, RefreshCw } from "lucide-react";
import { capacityRatio, utilisationColor } from "../../engine/utilisation";

export function BookingGridControls({
  bookingCount = 0,
  isOpen = true,
  onOpenDaySettings,
  onOpenOverview,
  onJumpToToday,
  onRefresh,
  dateLabel,
}) {
  // Wordless capacity signal: a slim colour-coded bar + count/cap number.
  // Over-capacity reads as a full rose bar and a number past the cap (e.g.
  // 15/14) — never the word "OVER".
  const cap = capacityRatio(bookingCount, isOpen);
  const barPct = Math.min(100, Math.round(cap.ratio * 100));
  const barColor = utilisationColor(barPct, cap.over);
  const hasCap = isOpen && cap.cap > 0;

  return (
    // Single row at every size. On phones the pill carries the date and the
    // capacity number ("Thu 11 Jun · 13/14") and the bar is hidden, so the
    // pill and the three icon buttons balance left ↔ right on one line.
    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 bg-white rounded-2xl border border-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.04)] p-2 sm:p-2.5">
      <span
        role="status"
        aria-label={
          hasCap
            ? `${cap.count} of ${cap.cap} places booked${cap.over ? ", over capacity" : ""}`
            : `${bookingCount} ${bookingCount === 1 ? "dog" : "dogs"} booked`
        }
        className="inline-flex items-center gap-1.5 py-1.5 px-2.5 sm:px-3 rounded-full text-[12px] font-bold text-brand-purple bg-brand-yellow/15 border border-brand-yellow/40"
      >
        <PawPrint size={13} strokeWidth={2.4} aria-hidden="true" className="hidden sm:block" />
        {/* On phones the DayHeader bar is hidden, so the date lives here. */}
        {dateLabel && <span className="sm:hidden">{dateLabel} ·</span>}
        {!isOpen ? (
          <span className="text-rose-600">Closed</span>
        ) : (
          <>
            {hasCap ? (
              <span className="sm:hidden tabular-nums">
                <span className={cap.over ? "text-rose-600" : ""}>{cap.count}</span>/{cap.cap}
              </span>
            ) : (
              <span className="sm:hidden">
                {bookingCount} {bookingCount === 1 ? "dog" : "dogs"}
              </span>
            )}
            <span className="hidden sm:inline">
              {bookingCount} {bookingCount === 1 ? "dog booked" : "dogs booked"}
            </span>
          </>
        )}
      </span>

      {hasCap && (
        <span
          role="img"
          aria-hidden="true"
          title={cap.over ? `Over capacity (${cap.count}/${cap.cap})` : `${cap.count} of ${cap.cap} places booked`}
          className="hidden sm:inline-flex items-center gap-1.5"
        >
          <span className="relative w-14 sm:w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <span
              className={`absolute inset-y-0 left-0 rounded-full ${barColor}`}
              style={{ width: `${barPct}%` }}
            />
          </span>
          <span className={`text-[11px] font-bold tabular-nums ${cap.over ? "text-rose-600" : "text-slate-500"}`}>
            {cap.count}/{cap.cap}
          </span>
        </span>
      )}

      <div className="hidden sm:block sm:flex-1" />

      {/* Button cluster: one flex item on phones (ml-auto, wraps as a
          unit instead of buttons dropping off one by one); dissolves
          into the single row from sm up. */}
      <div className="ml-auto flex items-center gap-1.5 sm:contents">
      {/* Phones only — DayHeader carries "Today" from sm up, and pull-to-
          refresh is less discoverable than a visible button. */}
      {onJumpToToday && (
        <button
          type="button"
          onClick={onJumpToToday}
          aria-label="Jump to today"
          className="sm:hidden inline-flex items-center py-1.5 px-2.5 rounded-full text-[12px] font-semibold text-brand-purple bg-brand-yellow/15 border border-brand-yellow/40 cursor-pointer font-[inherit] transition-colors hover:bg-brand-yellow/30"
        >
          Today
        </button>
      )}
      {onRefresh && (
        <button
          type="button"
          onClick={onRefresh}
          aria-label="Refresh bookings"
          className="sm:hidden inline-flex items-center py-1.5 px-2.5 rounded-full text-slate-600 bg-white border border-slate-200 cursor-pointer font-[inherit] transition-colors hover:border-brand-yellow/60 hover:text-brand-purple"
        >
          <RefreshCw size={13} strokeWidth={2.2} aria-hidden="true" />
        </button>
      )}

      <button
        type="button"
        onClick={onOpenDaySettings}
        aria-label="Day settings"
        className="inline-flex items-center gap-1.5 py-1.5 px-2.5 sm:px-3 rounded-full text-[12px] font-semibold text-slate-600 bg-white border border-slate-200 cursor-pointer font-[inherit] transition-colors hover:border-brand-yellow/60 hover:text-brand-purple"
      >
        <SettingsIcon size={13} strokeWidth={2.2} aria-hidden="true" />
        <span className="hidden sm:inline">Day settings</span>
      </button>

      {/* Phones only — the calendar overview button moved here from the
          week-pill row so the chevrons sit symmetrically at its edges.
          From sm up the DayHeader bar carries this button instead. */}
      {onOpenOverview && (
        <button
          type="button"
          onClick={onOpenOverview}
          aria-label="Open calendar overview"
          className="sm:hidden inline-flex items-center py-1.5 px-2.5 rounded-full text-slate-600 bg-white border border-slate-200 cursor-pointer font-[inherit] transition-colors hover:border-brand-yellow/60 hover:text-brand-purple"
        >
          <CalendarDays size={13} strokeWidth={2.2} aria-hidden="true" />
        </button>
      )}
      </div>
    </div>
  );
}
