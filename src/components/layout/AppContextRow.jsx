import { useLocation } from "react-router-dom";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { sectionTitleFor } from "./navConfig.jsx";

// ── Simplified Date-Navigation Header ─────────────────────────────────────────────
// Sits directly under the header and has one clear purpose: date navigation on Bookings.
// Retains visual styling of a quiet, elegant banner without duplicate badges or extra text.

export function AppContextRow({ dateLabel, onNavigateDay, onGoToday }) {
  const location = useLocation();
  const sectionTitle = sectionTitleFor(location.pathname);
  const isBookings = sectionTitle === "Bookings";

  if (!isBookings) return null;

  return (
    <div
      data-testid="page-header"
      className="relative -mx-4 sm:-mx-6 mb-4 flex min-h-[56px] items-center justify-center rounded-b-2xl border-x border-b border-slate-200 bg-white/90 px-4 py-3 shadow-sm sm:px-6"
    >
      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 w-full max-w-xl">
        <div className="flex items-center gap-1 sm:gap-2">
          <button
            type="button"
            onClick={() => onNavigateDay?.(-1)}
            aria-label="Previous day"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-brand-purple transition-colors hover:bg-brand-purple/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-1"
          >
            <ChevronLeft aria-hidden="true" size={20} strokeWidth={2.5} />
          </button>

          <strong className="px-2 sm:px-4 text-center font-display text-base sm:text-lg font-extrabold leading-tight text-brand-purple min-w-[200px] sm:min-w-[240px]">
            {dateLabel}
          </strong>

          <button
            type="button"
            onClick={() => onNavigateDay?.(1)}
            aria-label="Next day"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-brand-purple transition-colors hover:bg-brand-purple/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-1"
          >
            <ChevronRight aria-hidden="true" size={20} strokeWidth={2.5} />
          </button>
        </div>

        {onGoToday && (
          <button
            type="button"
            onClick={onGoToday}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-extrabold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-1 shadow-sm cursor-pointer min-h-[36px] touch-manipulation"
          >
            <Calendar size={13} className="text-slate-500" aria-hidden="true" />
            Today
          </button>
        )}
      </div>
    </div>
  );
}
