import { Clock3, ArrowRight } from "lucide-react";
import { SkeletonBlock } from "../ui/Skeleton.jsx";

export function WaitlistCard({ count = 0, onOpen, bare = false, loading = false }) {
  const hasWaiting = count > 0;
  const ariaLabel = loading
    ? "Waitlist, loading"
    : `Waitlist, ${count} ${count === 1 ? "dog" : "dogs"} waiting — click to view`;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={ariaLabel}
      aria-busy={loading || undefined}
      className={[
        "group w-full text-left cursor-pointer font-[inherit] border-none transition-colors",
        bare
          ? "p-3 bg-transparent hover:bg-sky-50/40"
          : "rounded-2xl border border-sky-200 shadow-[0_2px_8px_rgba(14,165,233,0.08)] p-3 bg-gradient-to-br from-sky-50 to-white hover:border-sky-400 hover:shadow-[0_2px_10px_rgba(14,165,233,0.18)]",
      ].join(" ")}
    >
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-[10px] font-bold text-sky-700/70 uppercase tracking-wider">
          Waitlist
        </h2>
        <span className="w-7 h-7 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center">
          <Clock3 size={14} strokeWidth={2.4} aria-hidden="true" />
        </span>
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          {loading ? (
            <SkeletonBlock className="h-7 w-8 rounded-md" />
          ) : (
            <div
              className={`text-2xl font-black font-display leading-none ${
                hasWaiting ? "text-sky-700" : "text-sky-300"
              }`}
            >
              {count}
            </div>
          )}
          <div className="text-[11px] font-semibold text-sky-700/70">
            {loading ? "checking…" : count === 1 ? "dog waiting" : "dogs waiting"}
          </div>
        </div>
        <ArrowRight
          size={14}
          strokeWidth={2.5}
          aria-hidden="true"
          className="text-sky-500/70 group-hover:text-sky-700 transition-colors shrink-0"
        />
      </div>
    </button>
  );
}
