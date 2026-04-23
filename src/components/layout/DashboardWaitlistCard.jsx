// ============================================================
// DashboardWaitlistCard.jsx
//
// Sidebar card. Shows total upcoming waitlist entries (not
// day-scoped) so it doesn't duplicate WaitlistPanel, which is
// already visible in the main content area for the selected
// date.
//
// "Upcoming total" + "this week" gives a quick read on whether
// waitlist pressure is looming on the horizon or just today.
// ============================================================

import { useWaitlistSummary } from "../../supabase/hooks/useWaitlistSummary.js";

function HourglassGlyph() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 22h14M5 2h14M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22M17 2v4.172a2 2 0 0 1-.586 1.414L12 12 7.586 7.586A2 2 0 0 1 7 6.172V2" />
    </svg>
  );
}

export function DashboardWaitlistCard() {
  const { totalUpcoming, thisWeek, loading } = useWaitlistSummary();

  const hasAny = totalUpcoming > 0;

  return (
    <div
      className="w-full bg-white border border-slate-200 rounded-xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)]"
      aria-label={`Waitlist: ${totalUpcoming} upcoming, ${thisWeek} this week`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
          Waitlist
        </div>
        <span
          className={hasAny ? "text-brand-yellow" : "text-slate-300"}
          aria-hidden="true"
        >
          <HourglassGlyph />
        </span>
      </div>

      <div className="flex items-baseline gap-2">
        {loading ? (
          <div className="h-8 w-10 rounded bg-slate-100 animate-pulse" />
        ) : (
          <div
            className={`text-3xl font-black font-display leading-none ${
              hasAny ? "text-slate-800" : "text-slate-400"
            }`}
          >
            {totalUpcoming}
          </div>
        )}
        <div className="text-xs font-semibold text-slate-500">
          {totalUpcoming === 1 ? "person" : "people"} waiting
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-slate-100 flex items-baseline justify-between">
        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
          Next 7 days
        </span>
        <span className="text-sm font-bold text-slate-700">
          {loading ? "—" : thisWeek}
        </span>
      </div>
    </div>
  );
}
