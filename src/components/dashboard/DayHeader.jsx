import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { toDateStr } from "../../supabase/transforms";

function formatLong(dateObj) {
  return dateObj.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatShort(dateObj) {
  return dateObj.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function DayHeader({
  currentDateObj,
  onNavigateDay,
  onJumpToToday,
  onOpenCalendar,
  trailing,
}) {
  const todayStr = toDateStr(new Date());
  const currentStr = toDateStr(currentDateObj);
  const isToday = todayStr === currentStr;

  return (
    // Hidden on phones — the week-pill row (CalendarTabs) carries the
    // chevrons and calendar button there, and the date label moves into
    // the BookingGridControls pill. Reclaims a full row of chrome.
    <header className="hidden sm:flex items-center gap-2 bg-white rounded-2xl border border-gray-100 shadow-card-resting py-2 px-3 md:py-2.5 md:px-4">
      <button
        type="button"
        onClick={() => onNavigateDay(-1)}
        aria-label="Previous day"
        className="tap-target w-9 h-9 rounded-full flex items-center justify-center border-none cursor-pointer text-brand-purple/60 hover:text-brand-purple hover:bg-brand-purple/5 transition-colors shrink-0"
      >
        <ChevronLeft size={18} strokeWidth={2.5} />
      </button>

      <div className="flex-1 text-center min-w-0">
        <div className="text-base sm:text-lg md:text-xl font-bold text-brand-purple font-display leading-tight">
          <span className="sm:hidden">{formatShort(currentDateObj)}</span>
          <span className="hidden sm:inline">{formatLong(currentDateObj)}</span>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onNavigateDay(1)}
        aria-label="Next day"
        className="tap-target w-9 h-9 rounded-full flex items-center justify-center border-none cursor-pointer text-brand-purple/60 hover:text-brand-purple hover:bg-brand-purple/5 transition-colors shrink-0"
      >
        <ChevronRight size={18} strokeWidth={2.5} />
      </button>

      {!isToday && onJumpToToday && (
        <button
          type="button"
          onClick={onJumpToToday}
          aria-label="Jump to today"
          className="hidden sm:inline-flex tap-target items-center justify-center h-9 px-3 rounded-full text-xs font-semibold text-brand-purple bg-white border border-slate-200 cursor-pointer transition-colors hover:border-brand-yellow/60 hover:bg-brand-yellow/10 font-[inherit] shrink-0"
        >
          Today
        </button>
      )}

      {onOpenCalendar && (
        <button
          type="button"
          onClick={onOpenCalendar}
          aria-label="Open calendar overview"
          className="lg:hidden tap-target w-9 h-9 rounded-full flex items-center justify-center border-none cursor-pointer text-brand-purple/60 hover:text-brand-purple hover:bg-brand-purple/5 transition-colors shrink-0"
        >
          <CalendarDays size={18} strokeWidth={2} />
        </button>
      )}

      {trailing}
    </header>
  );
}
