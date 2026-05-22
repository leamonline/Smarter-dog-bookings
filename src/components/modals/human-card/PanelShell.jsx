// Dashboard-style mini panel used inside the Human modal. Same idiom
// as CapacityCard, WeeklyRevenueCard, TomorrowRemindersCard: white
// surface, soft border, gentle drop shadow, uppercase eyebrow label
// top-left, hairline divider below, coloured corner icon chip top-right.
//
// `accent` picks the chip palette so the panel inherits the dashboard's
// colour semantics (teal = primary, amber = today/attention, sky =
// informational, rose = destructive, slate = neutral).
//
// `headerSlot` lets a panel inject a small action next to the icon chip
// (e.g. Notes "Expand"). `bodyClassName` lets a panel become a flex
// column that absorbs leftover vertical space inside its parent.

const ACCENTS = {
  slate: { chipBg: "bg-slate-100", chipFg: "text-slate-600", eyebrow: "text-slate-400" },
  teal: { chipBg: "bg-[#E6F5F2]", chipFg: "text-brand-teal-text", eyebrow: "text-brand-teal-text/70" },
  amber: { chipBg: "bg-amber-100", chipFg: "text-amber-700", eyebrow: "text-amber-700/70" },
  emerald: { chipBg: "bg-emerald-100", chipFg: "text-emerald-700", eyebrow: "text-emerald-700/70" },
  sky: { chipBg: "bg-sky-100", chipFg: "text-sky-700", eyebrow: "text-sky-700/70" },
  rose: { chipBg: "bg-rose-100", chipFg: "text-rose-700", eyebrow: "text-rose-700/70" },
};

export function PanelShell({
  eyebrow,
  icon: Icon,
  accent = "slate",
  ariaLabel,
  className = "",
  bodyClassName = "",
  headerSlot,
  children,
}) {
  const theme = ACCENTS[accent] || ACCENTS.slate;
  return (
    <section
      aria-label={ariaLabel || eyebrow}
      className={`bg-white rounded-2xl border border-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.04)] p-3 flex flex-col min-h-0 ${className}`}
    >
      <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-slate-200/70">
        <h3 className={`text-[10px] font-bold uppercase tracking-wider ${theme.eyebrow}`}>
          {eyebrow}
        </h3>
        <div className="flex items-center gap-1.5 shrink-0">
          {headerSlot}
          {Icon && (
            <span
              aria-hidden="true"
              className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${theme.chipBg} ${theme.chipFg}`}
            >
              <Icon size={12} strokeWidth={2.4} />
            </span>
          )}
        </div>
      </div>
      <div className={`min-h-0 ${bodyClassName}`}>{children}</div>
    </section>
  );
}
