import { useMemo } from "react";
import { computeRevenue } from "../../../engine/pricing";
import { BOOKING_STATUS } from "../../../constants/index.js";
import { toDateStr } from "../../../supabase/transforms.js";
import { getDogsForHuman } from "../../../utils/directorySearch.js";

// At-a-glance stat strip — lifetime bookings · last visit · next
// appointment · total spend. Flat 4-col tile row (no outer slate
// wrapper) where each tile is a button when wired to a handler.
//
// Bookings scrolls to the in-modal history via `onShowHistory`. Last visit
// and Next appt invoke `onOpenBooking` with the relevant booking's id
// (most-recent / upcoming). Total stays inert.

const COMPLETED_STATUSES = new Set([
  BOOKING_STATUS.READY_FOR_PICKUP,
  BOOKING_STATUS.COMPLETED,
]);

function formatShortDate(iso) {
  if (!iso) return "—";
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function Tile({ caption, value, sub, tone = "navy", onClick, disabled, ariaLabel }) {
  const valueClass =
    tone === "amber"
      ? "text-amber-700"
      : tone === "muted"
        ? "text-slate-400"
        : "text-brand-purple";

  const isInteractive = !!onClick && !disabled;
  const base =
    "bg-white rounded-xl border border-gray-100 px-3 py-2.5 min-w-0 text-left font-inherit";
  const interactive = isInteractive
    ? "cursor-pointer transition-colors hover:bg-slate-50 hover:border-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal/60"
    : disabled
      ? "cursor-default opacity-80"
      : "cursor-default";

  if (isInteractive) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel || caption}
        className={`${base} ${interactive}`}
      >
        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide truncate">
          {caption}
        </div>
        <div className={`text-lg font-semibold font-display leading-tight mt-0.5 truncate ${valueClass}`}>
          {value}
        </div>
        {sub && (
          <div className="text-[10px] font-semibold text-slate-400 mt-0.5 truncate">
            {sub}
          </div>
        )}
      </button>
    );
  }

  return (
    <div className={`${base} ${interactive}`}>
      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide truncate">
        {caption}
      </div>
      <div className={`text-lg font-semibold font-display leading-tight mt-0.5 truncate ${valueClass}`}>
        {value}
      </div>
      {sub && (
        <div className="text-[10px] font-semibold text-slate-400 mt-0.5 truncate">
          {sub}
        </div>
      )}
    </div>
  );
}

export function AtAGlanceStrip({
  human,
  humanFullName,
  dogs,
  dogsByHumanId,
  bookingsByDate,
  onShowHistory,
  onOpenBooking,
}) {
  const stats = useMemo(() => {
    // Use the merged dogs lookup so customers whose dogs sit past the
    // paginated dogs window still match their bookings here.
    const ownedDogs = getDogsForHuman(human, dogs || {}, dogsByHumanId || {});
    const ownedDogIds = new Set(ownedDogs.map((d) => d.id));
    const ownedDogNames = new Set(ownedDogs.map((d) => d.name));

    const todayStr = toDateStr(new Date());
    const matchedBookings = [];
    for (const [dateStr, bookings] of Object.entries(bookingsByDate || {})) {
      for (const b of bookings || []) {
        const isOwned =
          ownedDogIds.has(b._dogId) ||
          ownedDogNames.has(b.dogName) ||
          b._ownerId === human.id ||
          b.owner === humanFullName;
        if (isOwned) {
          matchedBookings.push({ ...b, date: dateStr });
        }
      }
    }

    const lifetime = matchedBookings.length;

    const completed = matchedBookings.filter((b) => COMPLETED_STATUSES.has(b.status));
    const totalSpend = completed.reduce(
      (sum, b) => sum + computeRevenue([b], dogs),
      0,
    );

    let lastVisit = null;
    let lastVisitBooking = null;
    for (const b of completed) {
      if (b.date <= todayStr && (!lastVisit || b.date > lastVisit)) {
        lastVisit = b.date;
        lastVisitBooking = b;
      }
    }
    if (!lastVisit) {
      for (const b of matchedBookings) {
        if (b.date <= todayStr && (!lastVisit || b.date > lastVisit)) {
          lastVisit = b.date;
          lastVisitBooking = b;
        }
      }
    }

    let nextApptDate = null;
    let nextApptBooking = null;
    for (const b of matchedBookings) {
      if (b.status === BOOKING_STATUS.CANCELLED) continue;
      if (b.date >= todayStr && (!nextApptDate || b.date < nextApptDate)) {
        nextApptDate = b.date;
        nextApptBooking = b;
      }
    }

    return {
      lifetime,
      lastVisit,
      lastVisitBooking,
      nextAppt: nextApptDate,
      nextApptBooking,
      isNextToday: nextApptDate === todayStr,
      totalSpend,
    };
  }, [human, humanFullName, dogs, dogsByHumanId, bookingsByDate]);

  return (
    <div aria-label="At a glance" className="grid grid-cols-4 gap-2">
      <Tile
        caption="Bookings"
        value={stats.lifetime}
        sub="lifetime"
        tone={stats.lifetime > 0 ? "navy" : "muted"}
        onClick={stats.lifetime > 0 ? () => onShowHistory?.() : undefined}
        disabled={stats.lifetime === 0}
        ariaLabel={`See all bookings (${stats.lifetime} lifetime)`}
      />
      <Tile
        caption="Last visit"
        value={formatShortDate(stats.lastVisit)}
        tone={stats.lastVisit ? "navy" : "muted"}
        onClick={
          stats.lastVisitBooking?.id
            ? () => onOpenBooking?.(stats.lastVisitBooking.id)
            : undefined
        }
        disabled={!stats.lastVisitBooking?.id}
        ariaLabel={stats.lastVisit ? `Open most recent visit` : undefined}
      />
      <Tile
        caption="Next appt"
        value={formatShortDate(stats.nextAppt)}
        sub={stats.isNextToday ? "today" : undefined}
        tone={stats.isNextToday ? "amber" : stats.nextAppt ? "navy" : "muted"}
        onClick={
          stats.nextApptBooking?.id
            ? () => onOpenBooking?.(stats.nextApptBooking.id)
            : undefined
        }
        disabled={!stats.nextApptBooking?.id}
        ariaLabel={stats.nextAppt ? `Open upcoming appointment on ${stats.nextAppt}` : undefined}
      />
      <Tile
        caption="Total"
        value={stats.totalSpend > 0 ? `£${stats.totalSpend}` : "£0"}
        tone={stats.totalSpend > 0 ? "navy" : "muted"}
      />
    </div>
  );
}
