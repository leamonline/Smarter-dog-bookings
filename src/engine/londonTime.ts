// src/engine/londonTime.ts
// Shared Europe/London wall clock and timezone helper functions.

export interface LondonParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** Minutes since London midnight (hour*60 + minute). */
  minutesOfDay: number;
  /** London calendar date as "YYYY-MM-DD". */
  dateStr: string;
}

// hourCycle 'h23' guarantees 00-23 (avoids the "24:00" edge that hour12:false
// can emit at midnight, which would desync the hour from the date).
const LONDON_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function londonNowParts(now: Date = new Date()): LondonParts {
  const parts = LONDON_FMT.formatToParts(now);
  const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? "";
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  let hour = Number(get("hour"));
  if (hour === 24) hour = 0; // defensive; h23 should never produce 24
  const minute = Number(get("minute"));
  return {
    year,
    month,
    day,
    hour,
    minute,
    minutesOfDay: hour * 60 + minute,
    dateStr: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

export function londonDateStr(now: Date = new Date()): string {
  return londonNowParts(now).dateStr;
}

/** Europe/London offset from UTC (ms) at a given instant: 0 in GMT, +1h in BST. */
export function londonOffsetMs(instant: Date): number {
  const p = londonNowParts(instant);
  const wallAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  const instMinute = Math.floor(instant.getTime() / 60000) * 60000;
  return wallAsUtc - instMinute;
}

/**
 * Convert a Europe/London wall-clock date + time ("YYYY-MM-DD", "HH:MM") to a
 * UTC epoch (ms). Booking dates/slots are stored as London wall-clock, so any
 * comparison against a real UTC instant (e.g. a booking_events timestamptz)
 * must go through this rather than naively appending "Z" — which would be an
 * hour out for the ~7 months of British Summer Time.
 */
export function londonWallClockToUtcMs(dateStr: string, timeHHMM: string): number {
  const naiveUtc = Date.parse(`${dateStr}T${timeHHMM}:00Z`);
  if (Number.isNaN(naiveUtc)) return NaN;
  // Slots are mid-morning, never at the 01:00–02:00 DST fold, so the offset at
  // the naive instant equals the offset at the true instant.
  return naiveUtc - londonOffsetMs(new Date(naiveUtc));
}
