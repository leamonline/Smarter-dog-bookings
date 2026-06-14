// ============================================================
// src/components/views/inbox/InboxFilterChip.jsx
//
// Header filter chip. Reused for unread / drafts / bookings /
// needs review so the inbox title row reads like a control surface
// rather than static text. Only one chip can be active at a time —
// clicking the active chip clears the filter.
// color: "purple" | "amber" | "emerald" | "rose" | "sky" — falls back to slate.
// ============================================================

const FILTER_CHIP_PALETTES = {
  purple: {
    dot: "bg-brand-purple",
    active: "bg-brand-purple/10 border-brand-purple/30 text-brand-purple",
    idle: "bg-white border-slate-200 text-slate-600 hover:border-brand-purple/40 hover:text-brand-purple",
  },
  amber: {
    dot: "bg-amber-500",
    active: "bg-amber-100 border-amber-300 text-amber-900",
    idle: "bg-white border-slate-200 text-slate-600 hover:border-amber-300 hover:text-amber-800",
  },
  emerald: {
    dot: "bg-emerald-500",
    active: "bg-emerald-100 border-emerald-300 text-emerald-900",
    idle: "bg-white border-slate-200 text-slate-600 hover:border-emerald-300 hover:text-emerald-800",
  },
  rose: {
    dot: "bg-rose-500",
    active: "bg-rose-100 border-rose-300 text-rose-900",
    idle: "bg-white border-slate-200 text-slate-600 hover:border-rose-300 hover:text-rose-700",
  },
  sky: {
    dot: "bg-sky-500",
    active: "bg-sky-100 border-sky-300 text-sky-900",
    idle: "bg-white border-slate-200 text-slate-600 hover:border-sky-300 hover:text-sky-800",
  },
  default: {
    dot: "bg-slate-400",
    active: "bg-slate-100 border-slate-300 text-slate-700",
    idle: "bg-white border-slate-200 text-slate-600",
  },
};

export function InboxFilterChip({ label, count, active, color, onClick, hint, clearable = true }) {
  const palette = FILTER_CHIP_PALETTES[color] ?? FILTER_CHIP_PALETTES.default;
  const isEmpty = count === 0;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={
        active
          ? `${label}: ${count}. ${clearable ? "Filter is on, click to clear." : "Filter is on."}`
          : isEmpty
            ? `${label}: 0. No conversations match.`
            : `${label}: ${count}. Click to filter.`
      }
      title={hint}
      className={`inline-flex shrink-0 items-center gap-1.5 h-9 px-3 rounded-full text-xs font-bold border motion-safe:transition-colors font-[inherit] ${
        active ? palette.active : palette.idle
      } ${isEmpty && !active ? "opacity-60" : ""} cursor-pointer`}
    >
      <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full ${palette.dot}`} />
      {label}
      <span className="ml-0.5 tabular-nums opacity-90">· {count}</span>
    </button>
  );
}
