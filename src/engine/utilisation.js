import { SALON_SLOTS } from "../constants/index.ts";
import { canBookSlot } from "./capacity.js";
import { getDefaultOpenForDate } from "./utils.ts";
import { toDateStr } from "../supabase/transforms.js";

export const DAY_CAPACITY = 14;

export function utilisationColor(pct) {
  if (pct >= 70) return "bg-rose-500";
  if (pct >= 40) return "bg-amber-500";
  return "bg-emerald-500";
}

export function utilisationLabel(pct, isOpen) {
  if (!isOpen) return "Closed";
  if (pct >= 70) return "Full";
  if (pct >= 40) return "Steady";
  return "Quiet";
}

export function computeDayCapacity(bookingCount, isOpen) {
  const cap = isOpen ? DAY_CAPACITY : 0;
  const pct = cap > 0 ? Math.min(100, Math.round((bookingCount / cap) * 100)) : 0;
  return { cap, pct };
}

export function computeWeekCapacity(dates, bookingsByDate, dayOpenState) {
  let bookings = 0;
  let openDays = 0;
  (dates || []).forEach((d) => {
    bookings += (bookingsByDate?.[d.dateStr] || []).length;
    const isOpen = dayOpenState?.[d.dateStr] ?? getDefaultOpenForDate(d.dateObj);
    if (isOpen) openDays += 1;
  });
  const cap = openDays * DAY_CAPACITY;
  const pct = cap > 0 ? Math.min(100, Math.round((bookings / cap) * 100)) : 0;
  return { bookings, cap, pct };
}

function formatSlot(slot) {
  const [h, m] = slot.split(":");
  const hour = parseInt(h, 10);
  return `${hour}:${m}`;
}

export function findNextAvailable({
  fromDate,
  bookingsByDate,
  dayOpenState,
  daySettings,
  maxDaysAhead = 28,
  size = "small",
  now = new Date(),
} = {}) {
  if (!fromDate) return null;
  const start = new Date(fromDate);
  start.setHours(0, 0, 0, 0);
  // Never advertise a slot in the past. If the caller is looking at a
  // past day (e.g., the user clicked back through the calendar), bump
  // the search start to today so we don't suggest "Mon 11 May" when
  // today is the 17th.
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  if (start < today) start.setTime(today.getTime());
  for (let i = 0; i < maxDaysAhead; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const dateStr = toDateStr(d);
    const isOpen = dayOpenState?.[dateStr] ?? getDefaultOpenForDate(d);
    if (!isOpen) continue;
    const settings = daySettings?.[dateStr] || {};
    const slots = [...SALON_SLOTS, ...(settings.extraSlots || [])];
    const dayBookings = bookingsByDate?.[dateStr] || [];
    for (const slot of slots) {
      const overrides = settings.overrides?.[slot] || {};
      const check = canBookSlot(dayBookings, slot, size, slots, { overrides });
      if (check.allowed) {
        return {
          date: d,
          dateStr,
          slot,
          slotLabel: formatSlot(slot),
          dateLabel: d.toLocaleDateString("en-GB", {
            weekday: "short",
            day: "numeric",
            month: "short",
          }),
        };
      }
    }
  }
  return null;
}
