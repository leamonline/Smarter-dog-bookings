// The sticky "Now / Up next" strip — a slim live control panel pinned beneath
// the header while the booking feed scrolls. WHAT it shows is decided entirely
// by the engine (selectNowNext + entryOpStatus), and its primary action reuses
// the same contextual-action handlers as the booking cards, so the strip can
// never disagree with the card it points at. Tapping the booking identity
// scrolls to (and briefly highlights) the matching card.
//
// Safe areas: the wrapper is sticky at top-0 with an env(safe-area-inset-top)
// padding that is cancelled out by an equal negative margin — zero extra height
// while the strip sits in the normal flow, but when it pins on a notched
// iPhone (installed PWA, viewport-fit=cover) the padding pushes the panel
// below the status bar and the wrapper's background covers the content
// scrolling behind it.
import { useState } from "react";
import { entryOpStatus, minutesUntilSlot } from "../../../engine/today";
import { BOOKING_STATUS } from "../../../constants/index";
import {
  Chip,
  CHIP_TONE_CLASS,
  MarkPaidAction,
  formatMinutes,
  formatLondonTime,
} from "./parts.jsx";

/** Compact solid-teal primary — same hierarchy as the cards, strip-sized. */
function StripPrimary({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center justify-center min-h-[44px] px-3.5 rounded-xl bg-brand-teal text-white text-[13px] font-bold hover:bg-brand-teal-dark motion-safe:transition-colors whitespace-nowrap"
    >
      {children}
    </button>
  );
}

/** Compact muted secondary for the strip. */
function StripSecondary({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center justify-center min-h-[44px] px-3 rounded-xl bg-slate-100 text-slate-700 text-[13px] font-semibold hover:bg-slate-200 motion-safe:transition-colors whitespace-nowrap"
    >
      {children}
    </button>
  );
}

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
 * The NOW booking's one primary action — the same mapping the cards use.
 * Collection keeps its two-step confirm; recording a payment keeps its
 * method chooser (MarkPaidAction), so nothing here can skip a safeguard.
 */
function NowAction({ entry, onMarkArrived, onStartGroom, onMarkReady, onMarkCollected, onSendCollection, onMessageOwner, onMarkPaid }) {
  const [confirming, setConfirming] = useState(false);
  const b = entry.booking;
  const op = entryOpStatus(entry);

  if (op.kind === "overdue") {
    return (
      <>
        <StripPrimary onClick={() => onMarkArrived(b)}>Mark arrived</StripPrimary>
        <StripSecondary onClick={() => onMessageOwner(b)}>Message</StripSecondary>
      </>
    );
  }
  if (op.kind === "paymentDue") {
    return <MarkPaidAction booking={b} onMarkPaid={onMarkPaid} variant="primary" />;
  }
  if (op.kind === "unconfirmed") {
    return (
      <>
        <StripPrimary onClick={() => onMessageOwner(b)}>Chase confirmation</StripPrimary>
        <StripSecondary onClick={() => onMarkArrived(b)}>Mark arrived</StripSecondary>
      </>
    );
  }
  if (entry.stage === "ready") {
    if (confirming) {
      return (
        <>
          <StripPrimary onClick={() => { onMarkCollected(b); setConfirming(false); }}>Confirm collected</StripPrimary>
          <StripSecondary onClick={() => setConfirming(false)}>Cancel</StripSecondary>
        </>
      );
    }
    return b.collectionSentAt ? (
      <StripPrimary onClick={() => setConfirming(true)}>Mark collected</StripPrimary>
    ) : (
      <StripPrimary onClick={() => onSendCollection(b)}>Send collection message</StripPrimary>
    );
  }
  if (entry.stage === "inSalon") {
    return b.status === BOOKING_STATUS.CHECKED_IN ? (
      <StripPrimary onClick={() => onStartGroom(b)}>Start groom</StripPrimary>
    ) : (
      <StripPrimary onClick={() => onMarkReady(b)}>Mark ready</StripPrimary>
    );
  }
  // Due soon / expected.
  return (
    <>
      <StripPrimary onClick={() => onMarkArrived(b)}>Mark arrived</StripPrimary>
      <StripSecondary onClick={() => onMessageOwner(b)}>Message</StripSecondary>
    </>
  );
}

/** Tappable booking identity — scrolls to and highlights the matching card. */
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
      <span className="block truncate">
        <span className="font-bold text-[15px] text-slate-800">{d.dogName}</span>{" "}
        <span className="text-[13px] font-bold text-slate-600 tabular-nums">{b.slot}</span>
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
  onMarkArrived,
  onStartGroom,
  onMarkReady,
  onMarkCollected,
  onSendCollection,
  onMessageOwner,
  onMarkPaid,
}) {
  const { now: nowEntry, next: nextEntry, readyCount } = selection;
  const nowOp = nowEntry ? entryOpStatus(nowEntry) : null;
  const nextOp = nextEntry ? entryOpStatus(nextEntry) : null;

  return (
    <div className="sticky top-0 z-30 -mx-3 sm:-mx-4 px-3 sm:px-4 pt-[env(safe-area-inset-top,0px)] -mt-[env(safe-area-inset-top,0px)] bg-slate-50 pb-1.5">
      <section
        aria-label="Happening now"
        className="rounded-xl border border-slate-200 bg-white shadow-[0_2px_8px_rgba(15,23,42,0.08)] divide-y divide-slate-100"
      >
        {nowEntry ? (
          <div className="flex items-center gap-x-2 gap-y-1 flex-wrap px-3 py-1.5">
            <span className={`shrink-0 text-[10px] font-extrabold uppercase tracking-wider ${nowOp.tone === "coral" ? "text-brand-coral-text" : nowOp.tone === "amber" ? "text-amber-700" : "text-brand-teal-text"}`}>
              Now
            </span>
            <IdentityButton entry={nowEntry} resolve={resolve} onJumpTo={onJumpTo} context={nowContext(nowEntry, now)} />
            <span className="flex items-center gap-1.5 flex-wrap shrink-0 max-w-full">
              <NowAction
                entry={nowEntry}
                onMarkArrived={onMarkArrived}
                onStartGroom={onStartGroom}
                onMarkReady={onMarkReady}
                onMarkCollected={onMarkCollected}
                onSendCollection={onSendCollection}
                onMessageOwner={onMessageOwner}
                onMarkPaid={onMarkPaid}
              />
            </span>
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
