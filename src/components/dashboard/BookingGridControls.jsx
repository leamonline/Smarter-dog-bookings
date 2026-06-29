import { Settings as SettingsIcon, BellRing, Clock3, ListChecks } from "lucide-react";
import { capacityRatio, utilisationColor } from "../../engine/utilisation";

export function BookingGridControls({
  bookingCount = 0,
  isOpen = true,
  onOpenDaySettings,
  onJumpToToday,
  reminderCount = 0,
  waitlistCount = 0,
  todoCount = 0,
  onOpenReminders,
  onOpenWaitlist,
  onOpenTodos,
}) {
  // Wordless capacity signal: a slim colour-coded bar + count/cap number.
  // Over-capacity reads as a full rose bar and a number past the cap (e.g.
  // 15/14) — never the word "OVER".
  const cap = capacityRatio(bookingCount, isOpen);
  const barPct = Math.min(100, Math.round(cap.ratio * 100));
  const barColor = utilisationColor(barPct, cap.over);
  const hasCap = isOpen && cap.cap > 0;
  // The parent only passes onJumpToToday when we're on another day. So a
  // missing handler == "already on today" → render the button greyed + inert
  // rather than hiding it, keeping the bar's layout identical every day.
  const canJump = !!onJumpToToday;

  // Workflow notifications — only the categories with something pending get a
  // colourful badge. Desktop (lg+) has the full RightWorkflowSidebar, so these
  // are mobile/tablet only (lg:hidden) to avoid doubling up.
  const notifications = [
    { id: "reminders", count: reminderCount, onOpen: onOpenReminders, Icon: BellRing, cls: "bg-amber-50 text-amber-700 hover:bg-amber-100", one: "reminder to send", many: "reminders to send" },
    { id: "waitlist", count: waitlistCount, onOpen: onOpenWaitlist, Icon: Clock3, cls: "bg-sky-50 text-sky-700 hover:bg-sky-100", one: "on the waitlist", many: "on the waitlist" },
    { id: "tasks", count: todoCount, onOpen: onOpenTodos, Icon: ListChecks, cls: "bg-rose-50 text-rose-700 hover:bg-rose-100", one: "open task", many: "open tasks" },
  ].filter((n) => n.count > 0 && n.onOpen);

  return (
    // Single row at every size. The Today button sits where the old "dogs
    // booked" pill was, sized to the grid's time-column (w-16 md:w-20 = 64/80px)
    // so it lines up with the 8:30 / 9:00 time buttons below. The slim capacity
    // bar (7/14) carries the count; the right cluster holds the workflow badges
    // (mobile/tablet) and Day settings.
    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 bg-white rounded-2xl border border-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.04)] p-2 sm:p-2.5">
      <button
        type="button"
        onClick={canJump ? onJumpToToday : undefined}
        disabled={!canJump}
        aria-label={canJump ? "Jump to today" : "Already viewing today"}
        title={canJump ? "Jump to today" : "Viewing today"}
        className={`shrink-0 w-16 md:w-20 inline-flex items-center justify-center py-1.5 rounded-full text-[12px] font-bold font-[inherit] transition-colors ${
          canJump
            ? "text-brand-purple bg-brand-yellow/15 border border-brand-yellow/40 cursor-pointer hover:bg-brand-yellow/30"
            : "text-slate-400 bg-slate-50 border border-slate-200 cursor-default"
        }`}
      >
        Today
      </button>

      {!isOpen ? (
        <span className="text-[12px] font-bold text-rose-600">Closed</span>
      ) : hasCap ? (
        <span
          role="img"
          aria-label={cap.over ? `Over capacity (${cap.count}/${cap.cap})` : `${cap.count} of ${cap.cap} places booked`}
          title={cap.over ? `Over capacity (${cap.count}/${cap.cap})` : `${cap.count} of ${cap.cap} places booked`}
          className="inline-flex items-center gap-1.5"
        >
          <span className="relative w-14 sm:w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <span
              className={`absolute inset-y-0 left-0 rounded-full ${barColor}`}
              style={{ width: `${barPct}%` }}
            />
          </span>
          <span className={`text-[11px] font-bold tabular-nums ${cap.over ? "text-rose-600" : "text-slate-500"}`}>
            {cap.count}/{cap.cap}
          </span>
        </span>
      ) : null}

      <div className="hidden sm:block sm:flex-1" />

      {/* Button cluster: one flex item on phones (ml-auto, wraps as a
          unit instead of buttons dropping off one by one); dissolves
          into the single row from sm up. */}
      <div className="ml-auto flex items-center gap-1.5 sm:contents">
        {notifications.map(({ id, count, onOpen, Icon, cls, one, many }) => (
          <button
            key={id}
            type="button"
            onClick={onOpen}
            aria-label={`${count} ${count === 1 ? one : many}`}
            title={`${count} ${count === 1 ? one : many}`}
            className={`lg:hidden inline-flex items-center justify-center gap-1 min-h-[40px] px-2.5 rounded-full text-[12px] font-bold border-none cursor-pointer font-[inherit] transition-colors ${cls}`}
          >
            <Icon size={14} strokeWidth={2.4} aria-hidden="true" />
            {count > 99 ? "99+" : count}
          </button>
        ))}

        <button
          type="button"
          onClick={onOpenDaySettings}
          aria-label="Day settings"
          className="inline-flex items-center justify-center gap-1.5 min-h-[40px] max-sm:min-w-[40px] py-1.5 px-2.5 sm:px-3 rounded-full text-[12px] font-semibold text-slate-600 bg-white border border-slate-200 cursor-pointer font-[inherit] transition-colors hover:border-brand-yellow/60 hover:text-brand-purple"
        >
          <SettingsIcon size={13} strokeWidth={2.2} aria-hidden="true" />
          <span className="hidden sm:inline">Day settings</span>
        </button>
      </div>
    </div>
  );
}
