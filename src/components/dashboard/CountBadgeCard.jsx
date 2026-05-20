import { ArrowRight } from "lucide-react";
import { SkeletonBlock } from "../ui/Skeleton.jsx";

// Dashboard tile that shows a single count with an icon, label, and a
// chevron hinting at "click to open". Shared shape used by the to-do
// list, waitlist, and any future single-number badges on the sidebar.
//
// Theme is picked by `accent` rather than passing Tailwind class names
// at every call site — gradients, shadow rgbas, and dim/bright text
// shades must vary together, and that's easier to keep in sync here.
const ACCENT_THEMES = {
  rose: {
    bareHoverBg: "hover:bg-rose-50/40",
    border: "border-rose-200",
    shadow: "shadow-[0_2px_8px_rgba(244,63,94,0.08)]",
    gradient: "bg-gradient-to-br from-rose-50 to-white",
    hoverBorder: "hover:border-rose-400",
    hoverShadow: "hover:shadow-[0_2px_10px_rgba(244,63,94,0.18)]",
    headingText: "text-rose-700/70",
    iconBg: "bg-rose-100 text-rose-700",
    countOn: "text-rose-700",
    countOff: "text-rose-300",
    subText: "text-rose-700/70",
    arrow: "text-rose-500/70 group-hover:text-rose-700",
  },
  sky: {
    bareHoverBg: "hover:bg-sky-50/40",
    border: "border-sky-200",
    shadow: "shadow-[0_2px_8px_rgba(14,165,233,0.08)]",
    gradient: "bg-gradient-to-br from-sky-50 to-white",
    hoverBorder: "hover:border-sky-400",
    hoverShadow: "hover:shadow-[0_2px_10px_rgba(14,165,233,0.18)]",
    headingText: "text-sky-700/70",
    iconBg: "bg-sky-100 text-sky-700",
    countOn: "text-sky-700",
    countOff: "text-sky-300",
    subText: "text-sky-700/70",
    arrow: "text-sky-500/70 group-hover:text-sky-700",
  },
};

export function CountBadgeCard({
  heading,
  icon: Icon,
  accent,
  count = 0,
  singular,
  plural,
  ariaLabel,
  onOpen,
  bare = false,
  loading = false,
}) {
  const theme = ACCENT_THEMES[accent];
  const hasItems = count > 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={ariaLabel}
      aria-busy={loading || undefined}
      className={[
        "group w-full text-left cursor-pointer font-[inherit] border-none transition-colors",
        bare
          ? `p-3 bg-transparent ${theme.bareHoverBg}`
          : `rounded-2xl border ${theme.border} ${theme.shadow} p-3 ${theme.gradient} ${theme.hoverBorder} ${theme.hoverShadow}`,
      ].join(" ")}
    >
      <div className="flex items-center justify-between mb-1">
        <h2 className={`text-[10px] font-bold ${theme.headingText} uppercase tracking-wider`}>
          {heading}
        </h2>
        <span className={`w-7 h-7 rounded-full ${theme.iconBg} flex items-center justify-center`}>
          <Icon size={14} strokeWidth={2.4} aria-hidden="true" />
        </span>
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          {loading ? (
            <SkeletonBlock className="h-7 w-8 rounded-md" />
          ) : (
            <div
              className={`text-2xl font-black font-display leading-none ${
                hasItems ? theme.countOn : theme.countOff
              }`}
            >
              {count}
            </div>
          )}
          <div className={`text-[11px] font-semibold ${theme.subText}`}>
            {loading ? "checking…" : count === 1 ? singular : plural}
          </div>
        </div>
        <ArrowRight
          size={14}
          strokeWidth={2.5}
          aria-hidden="true"
          className={`${theme.arrow} transition-colors shrink-0`}
        />
      </div>
    </button>
  );
}
