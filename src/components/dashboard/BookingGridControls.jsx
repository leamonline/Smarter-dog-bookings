import { PawPrint, LayoutGrid, List, Settings as SettingsIcon } from "lucide-react";

export function BookingGridControls({
  bookingCount = 0,
  viewMode,
  setViewMode,
  onOpenDaySettings,
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 bg-white rounded-2xl border border-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.04)] p-2.5">
      {/* Dogs-booked pill — at-a-glance count, replaces the old
          "+ Add timeslot" pill. Adding extra slots now lives in
          Day Settings to keep the row uncluttered. */}
      <span
        role="status"
        aria-label={`${bookingCount} ${bookingCount === 1 ? "dog" : "dogs"} booked`}
        className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-full text-[12px] font-bold text-brand-purple bg-brand-yellow/15 border border-brand-yellow/40"
      >
        <PawPrint size={13} strokeWidth={2.4} aria-hidden="true" />
        {bookingCount} {bookingCount === 1 ? "dog booked" : "dogs booked"}
      </span>

      <div className="flex-1" />

      <div
        role="tablist"
        aria-label="View mode"
        className="flex bg-slate-100 rounded-full p-0.5"
      >
        <button
          type="button"
          role="tab"
          aria-selected={viewMode === "grid"}
          onClick={() => setViewMode("grid")}
          aria-label="Grid view"
          className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all cursor-pointer border-none font-[inherit] min-h-[32px] ${
            viewMode === "grid"
              ? "bg-white text-brand-purple shadow-sm"
              : "bg-transparent text-slate-500 hover:text-brand-purple"
          }`}
        >
          <LayoutGrid size={13} strokeWidth={2.2} aria-hidden="true" />
          Grid
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={viewMode === "list"}
          onClick={() => setViewMode("list")}
          aria-label="List view"
          className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all cursor-pointer border-none font-[inherit] min-h-[32px] ${
            viewMode === "list"
              ? "bg-white text-brand-purple shadow-sm"
              : "bg-transparent text-slate-500 hover:text-brand-purple"
          }`}
        >
          <List size={13} strokeWidth={2.2} aria-hidden="true" />
          List
        </button>
      </div>

      <button
        type="button"
        onClick={onOpenDaySettings}
        className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-full text-[12px] font-semibold text-slate-600 bg-white border border-slate-200 cursor-pointer font-[inherit] transition-colors hover:border-brand-yellow/60 hover:text-brand-purple"
      >
        <SettingsIcon size={13} strokeWidth={2.2} aria-hidden="true" />
        Day settings
      </button>
    </div>
  );
}
