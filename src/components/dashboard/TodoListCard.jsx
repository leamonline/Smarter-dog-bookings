import { ListChecks, ArrowRight } from "lucide-react";

export function TodoListCard({ count = 0, onOpen, bare = false }) {
  const hasTasks = count > 0;
  return (
    <section
      aria-label={`To-do list, ${count} ${count === 1 ? "task" : "tasks"}`}
      className={
        bare
          ? "p-1"
          : "rounded-2xl border border-rose-200 shadow-[0_2px_8px_rgba(244,63,94,0.08)] p-4 bg-gradient-to-br from-rose-50 to-white"
      }
    >
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-[10px] font-bold text-rose-700/70 uppercase tracking-wider">
          To-do list
        </h2>
        <span className="w-7 h-7 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center">
          <ListChecks size={14} strokeWidth={2.4} aria-hidden="true" />
        </span>
      </div>

      <div className="flex items-baseline gap-2 mb-3">
        <div className={`text-2xl font-black font-display leading-none ${
          hasTasks ? "text-rose-700" : "text-rose-300"
        }`}>
          {count}
        </div>
        <div className="text-[11px] font-semibold text-rose-700/70">
          {count === 1 ? "open task" : "open tasks"}
        </div>
      </div>

      <button
        type="button"
        onClick={onOpen}
        className="w-full inline-flex items-center justify-between gap-2 text-[12px] font-semibold text-rose-800 bg-white border border-rose-200 rounded-full px-3 py-1.5 cursor-pointer transition-colors hover:border-rose-400 hover:bg-rose-50 font-[inherit]"
      >
        View all tasks
        <ArrowRight size={12} strokeWidth={2.5} aria-hidden="true" />
      </button>
    </section>
  );
}
