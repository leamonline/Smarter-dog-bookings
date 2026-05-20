import { ListChecks, ArrowRight } from "lucide-react";

export function TodoListCard({ count = 0, onOpen, bare = false }) {
  const hasTasks = count > 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`To-do list, ${count} ${count === 1 ? "task" : "tasks"} — click to view all`}
      className={[
        "group w-full text-left cursor-pointer font-[inherit] border-none transition-colors",
        bare
          ? "p-3 bg-transparent hover:bg-rose-50/40"
          : "rounded-2xl border border-rose-200 shadow-[0_2px_8px_rgba(244,63,94,0.08)] p-3 bg-gradient-to-br from-rose-50 to-white hover:border-rose-400 hover:shadow-[0_2px_10px_rgba(244,63,94,0.18)]",
      ].join(" ")}
    >
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-[10px] font-bold text-rose-700/70 uppercase tracking-wider">
          To-do list
        </h2>
        <span className="w-7 h-7 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center">
          <ListChecks size={14} strokeWidth={2.4} aria-hidden="true" />
        </span>
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <div
            className={`text-2xl font-black font-display leading-none ${
              hasTasks ? "text-rose-700" : "text-rose-300"
            }`}
          >
            {count}
          </div>
          <div className="text-[11px] font-semibold text-rose-700/70">
            {count === 1 ? "open task" : "open tasks"}
          </div>
        </div>
        <ArrowRight
          size={14}
          strokeWidth={2.5}
          aria-hidden="true"
          className="text-rose-500/70 group-hover:text-rose-700 transition-colors shrink-0"
        />
      </div>
    </button>
  );
}
