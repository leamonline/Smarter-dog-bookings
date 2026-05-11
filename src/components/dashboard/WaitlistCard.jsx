import { Clock3, ArrowRight } from "lucide-react";

export function WaitlistCard({ count = 0, onOpen, bare = false }) {
  const hasWaiting = count > 0;
  return (
    <section
      aria-label={`Waitlist, ${count} ${count === 1 ? "dog" : "dogs"} waiting`}
      className={
        bare
          ? "p-1"
          : "rounded-2xl border border-sky-200 shadow-[0_2px_8px_rgba(14,165,233,0.08)] p-4 bg-gradient-to-br from-sky-50 to-white"
      }
    >
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-[10px] font-bold text-sky-700/70 uppercase tracking-wider">
          Waitlist
        </h2>
        <span className="w-7 h-7 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center">
          <Clock3 size={14} strokeWidth={2.4} aria-hidden="true" />
        </span>
      </div>

      <div className="flex items-baseline gap-2 mb-3">
        <div className={`text-2xl font-black font-display leading-none ${
          hasWaiting ? "text-sky-700" : "text-sky-300"
        }`}>
          {count}
        </div>
        <div className="text-[11px] font-semibold text-sky-700/70">
          {count === 1 ? "dog waiting" : "dogs waiting"}
        </div>
      </div>

      <button
        type="button"
        onClick={onOpen}
        className="w-full inline-flex items-center justify-between gap-2 text-[12px] font-semibold text-sky-800 bg-white border border-sky-200 rounded-full px-3 py-1.5 cursor-pointer transition-colors hover:border-sky-400 hover:bg-sky-50 font-[inherit]"
      >
        View waitlist
        <ArrowRight size={12} strokeWidth={2.5} aria-hidden="true" />
      </button>
    </section>
  );
}
