import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";

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
  onOpenCalendar,
  trailing,
}) {
  return (
    // Hidden on phones — the week-pill row (CalendarTabs) carries the
    // chevrons and calendar button there, and the date label moves into
    // the BookingGridControls bar. Reclaims a full row of chrome.
    // "Today" lives on the BookingGridControls bar below (one button for
    // every breakpoint), so it's intentionally absent here.
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
