import { useMemo } from "react";
import { computeRevenue } from "../../../engine/pricing";
import { BOOKING_STATUS } from "../../../constants/index.js";
import { toDateStr } from "../../../supabase/transforms.js";

// At-a-glance stat strip — lifetime bookings · last visit · next
// appointment · total spend. Mirrors the "Capacity / Revenue" mini
// tile treatment on the dashboard: tiny caption above, bold value
// below, neutral navy text except for the next-appointment tile,
// which switches to amber when the appointment is today.

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

function Tile({ caption, value, sub, tone = "navy" }) {
  const valueClass =
    tone === "amber"
      ? "text-amber-700"
      : tone === "muted"
        ? "text-slate-400"
        : "text-brand-purple";
  return (
    <div className="bg-white rounded-xl border border-gray-100 px-3 py-2.5 min-w-0">
      <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider truncate">
        {caption}
      </div>
      <div className={`text-base font-bold font-display leading-tight mt-0.5 truncate ${valueClass}`}>
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

export function AtAGlanceStrip({ human, humanFullName, dogs, bookingsByDate }) {
  const stats = useMemo(() => {
    const dogsArr = Object.values(dogs || {});
    const ownedDogIds = new Set(
      dogsArr
        .filter((d) => d._humanId === human.id || d.humanId === humanFullName)
        .map((d) => d.id),
    );
    const ownedDogNames = new Set(
      dogsArr
        .filter((d) => d._humanId === human.id || d.humanId === humanFullName)
        .map((d) => d.name),
    );

    const todayStr = toDateStr(new Date());
    const matchedBookings = [];
    for (const [dateStr, bookings] of Object.entries(bookingsByDate || {})) {
      for (const b of bookings || []) {
        const owned =
          ownedDogIds.has(b._dogId) ||
          ownedDogNames.has(b.dogName) ||
          b._ownerId === human.id ||
          b.owner === humanFullName;
        if (owned) {
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
    for (const b of completed) {
      if (b.date <= todayStr && (!lastVisit || b.date > lastVisit)) {
        lastVisit = b.date;
      }
    }
    if (!lastVisit) {
      // Fall back to most recent past booking regardless of status — the
      // staff still wants to know when they last saw this human.
      for (const b of matchedBookings) {
        if (b.date <= todayStr && (!lastVisit || b.date > lastVisit)) {
          lastVisit = b.date;
        }
      }
    }

    let nextAppt = null;
    for (const b of matchedBookings) {
      if (b.status === BOOKING_STATUS.CANCELLED) continue;
      if (b.date >= todayStr && (!nextAppt || b.date < nextAppt)) {
        nextAppt = b.date;
      }
    }

    return {
      lifetime,
      lastVisit,
      nextAppt,
      isNextToday: nextAppt === todayStr,
      totalSpend,
    };
  }, [human.id, humanFullName, dogs, bookingsByDate]);

  return (
    <div
      aria-label="At a glance"
      className="bg-slate-50 rounded-2xl border border-gray-100 p-2 grid grid-cols-2 md:grid-cols-4 gap-2"
    >
      <Tile
        caption="Bookings"
        value={stats.lifetime}
        sub={stats.lifetime === 1 ? "lifetime" : "lifetime"}
        tone={stats.lifetime > 0 ? "navy" : "muted"}
      />
      <Tile
        caption="Last visit"
        value={formatShortDate(stats.lastVisit)}
        tone={stats.lastVisit ? "navy" : "muted"}
      />
      <Tile
        caption="Next appt"
        value={formatShortDate(stats.nextAppt)}
        sub={stats.isNextToday ? "today" : undefined}
        tone={stats.isNextToday ? "amber" : stats.nextAppt ? "navy" : "muted"}
      />
      <Tile
        caption="Total spend"
        value={stats.totalSpend > 0 ? `£${stats.totalSpend}` : "£0"}
        tone={stats.totalSpend > 0 ? "navy" : "muted"}
      />
    </div>
  );
}
