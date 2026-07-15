// The sticky "Now / Up next" strip — a slim live control panel pinned beneath
// the header while the booking feed scrolls. WHAT it shows is decided entirely
// by the engine (selectNowNext + entryOpStatus). Tapping the booking identity
// scrolls to the matching card and focuses its time control. Booking mutations
// live only on the journey row, so each booking has one operational surface.
//
// Safe areas: the wrapper is sticky at top-0 with an env(safe-area-inset-top)
// padding that is cancelled out by an equal negative margin — zero extra height
// while the strip sits in the normal flow, but when it pins on a notched
// iPhone (installed PWA, viewport-fit=cover) the padding pushes the panel
// below the status bar and the wrapper's background covers the content
// scrolling behind it.
import { entryOpStatus, minutesUntilSlot } from "../../../engine/today";
import { BOOKING_STATUS } from "../../../constants/index";
import {
  Chip,
  CHIP_TONE_CLASS,
  formatMinutes,
  formatLondonTime,
} from "./parts.jsx";

/** One short live context line for the NOW booking — time-anchored, honest. */
function nowContext(entry, now) {
  const op = entryOpStatus(entry);
  if (op.kind === "overdue") return `${formatMinutes(entry.overdueMinutes)} overdue`;
  if (op.kind === "paymentDue") return "collected · payment not recorded";
  if (op.kind === "readyWaiting" || op.kind === "ready") {
    return entry.waitMinutes != null ? `waiting ${formatMinutes(entry.waitMinutes)}` : "waiting to be collected";
  }
  if (entry.stage === "inSalon") {
    const since = formatLondonTime(entry.booking.checkedInAt);
    const label = entry.booking.status === BOOKING_STATUS.IN_BATH ? "in the bath" : "checked in";
    return since ? `${label} since ${since}` : label;
  }
  // Still to arrive (due soon / unconfirmed).
  const mins = minutesUntilSlot(entry.booking.slot || "00:00", now);
  if (mins <= 0) return "due now";
  return `due in ${formatMinutes(mins)}`;
}

/**
 * Tappable booking identity — scrolls to and highlights the matching card.
 * Mirrors the booking card's header: dog · breed on the left, the
 * appointment (arrival) time pinned to the right. The live context — "due
 * in 12 min", "waiting to be collected" — sits underneath.
 */
function IdentityButton({ entry, resolve, onJumpTo, context }) {
  const b = entry.booking;
  const d = resolve(b);
  return (
    <button
      type="button"
      onClick={() => onJumpTo(b.id)}
      className="flex-1 min-w-[10rem] text-left min-h-[44px] py-1 rounded-lg hover:bg-slate-50 motion-safe:transition-colors"
      aria-label={`Show ${d.dogName}'s booking card`}
    >
      <span className="flex items-baseline gap-x-2">
        <span className="min-w-0 truncate">
          <span className="font-bold text-[15px] text-slate-800">{d.dogName}</span>
          {d.breed && <span className="text-[15px] font-medium text-slate-600"> — {d.breed}</span>}
        </span>
        {b.slot && (
          <span className="ml-auto shrink-0 text-[13px] font-bold text-slate-600 tabular-nums">{b.slot}</span>
        )}
      </span>
      {context && (
        <span className="block truncate text-[12px] text-slate-600 leading-tight">{context}</span>
      )}
    </button>
  );
}

export function TodayNowStrip({
  selection,
  now,
  resolve,
  onJumpTo,
}) {
  const { now: nowEntry, next: nextEntry, readyCount } = selection;
  const nowOp = nowEntry ? entryOpStatus(nowEntry) : null;
  const nextOp = nextEntry ? entryOpStatus(nextEntry) : null;
  const focusLabel = selection.nowReason === "upcoming" ? "First up" : "Now";

  return (
    <div className="sticky top-0 z-30 -mx-3 sm:-mx-4 px-3 sm:px-4 pt-[env(safe-area-inset-top,0px)] -mt-[env(safe-area-inset-top,0px)] bg-brand-paper pb-1.5">
      <section
        aria-label="Happening now"
        className="rounded-xl border border-slate-200 bg-white shadow-[0_2px_8px_rgba(15,23,42,0.08)] divide-y divide-slate-100"
      >
        {nowEntry ? (
          <div className="px-3 py-2">
            <div className="flex items-center gap-2">
              <span className={`shrink-0 text-[10px] font-extrabold uppercase tracking-wider ${nowOp.tone === "coral" ? "text-brand-coral-text" : nowOp.tone === "amber" ? "text-amber-700" : "text-brand-teal-text"}`}>
                {focusLabel}
              </span>
              <IdentityButton entry={nowEntry} resolve={resolve} onJumpTo={onJumpTo} context={nowContext(nowEntry, now)} />
            </div>
          </div>
        ) : (
          <p className="px-3 py-2.5 text-[13px] font-semibold text-slate-600">
            {readyCount > 0
              ? `${readyCount} ${readyCount === 1 ? "dog is" : "dogs are"} ready for collection.`
              : "No more arrivals scheduled today."}
          </p>
        )}

        {nextEntry && (
          <div className="flex items-center gap-2 px-3 py-0.5">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
              Up next
            </span>
            <IdentityButton entry={nextEntry} resolve={resolve} onJumpTo={onJumpTo} />
            {nextOp.kind === "unconfirmed" && (
              <Chip dot className={CHIP_TONE_CLASS[nextOp.tone]}>{nextOp.label}</Chip>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
