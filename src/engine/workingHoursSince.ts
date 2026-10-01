import { londonDateStr, londonWallClockToUtcMs } from "./londonTime";

export interface WorkingDay {
  isOpen: boolean;
  closures: { from: string; to: string }[];
}
export interface WorkingSchedule {
  from: string;
  to: string;
  days: Record<string, WorkingDay>;
  holidays: { closedFrom: string; reopensOn: string; enabled: boolean }[];
}

/** Salon working time, not booking capacity. Missing/unreadable coverage is unknown. */
export function workingHoursSince(start: string, schedule: WorkingSchedule | null, now = new Date()): number | null {
  const startMs = Date.parse(start);
  if (!schedule || !Number.isFinite(startMs) || !Number.isFinite(now.getTime())) return null;
  if (startMs >= now.getTime()) return 0;
  const first = londonDateStr(new Date(startMs));
  const last = londonDateStr(now);
  if (first < schedule.from || last > schedule.to) return null;
  let elapsed = 0;
  for (let day = first; day <= last;) {
    const setting = schedule.days[day];
    const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
    const open = setting?.isOpen ?? (weekday >= 1 && weekday <= 3);
    const holiday = schedule.holidays.some((h) => h.enabled && h.closedFrom <= day && day < h.reopensOn);
    if (open && !holiday) {
      const from = Math.max(startMs, londonWallClockToUtcMs(day, "08:30"));
      const to = Math.min(now.getTime(), londonWallClockToUtcMs(day, "15:00"));
      // Union closure intervals so overlapping records cannot subtract twice.
      const closures = (setting?.closures ?? []).map((c) => [
        Math.max(from, londonWallClockToUtcMs(day, c.from)),
        Math.min(to, londonWallClockToUtcMs(day, c.to)),
      ]).filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
      let cursor = from;
      for (const [a, b] of closures) {
        elapsed += Math.max(0, a - cursor);
        cursor = Math.max(cursor, b);
      }
      elapsed += Math.max(0, to - cursor);
    }
    day = new Date(Date.parse(`${day}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
  }
  return elapsed / 3600000;
}
