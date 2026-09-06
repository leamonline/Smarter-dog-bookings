// src/engine/holidayNotice.ts
// Pure presentation helpers for scheduled holiday notices. No React, no Supabase.
import { londonDateStr } from "./londonTime";

export interface HolidayNotice {
  id: string;
  notice_from: string;
  closed_from: string;
  reopens_on: string;
  phase: "upcoming" | "away";
}

/** Today's Europe/London calendar date as "YYYY-MM-DD". */
export const londonDate = londonDateStr;

/** True when `dateStr` falls inside the closure (reopening day excluded). */
export function isHolidayDate(notices: readonly Pick<HolidayNotice, "closed_from" | "reopens_on">[], dateStr: string): boolean {
  return notices.some((n) => n.closed_from <= dateStr && dateStr < n.reopens_on);
}

/**
 * Derive the phase for the given London date, dropping notices that are not
 * yet announced or have already reopened. The server projection does the same
 * on its own clock; this keeps a long-open tab honest across a date boundary.
 */
export function scheduleHolidayNotices<T extends Omit<HolidayNotice, "phase">>(notices: readonly T[], today = londonDate()): (T & { phase: HolidayNotice["phase"] })[] {
  return notices
    .filter((n) => n.notice_from <= today && today < n.reopens_on)
    .map((n) => ({ ...n, phase: today < n.closed_from ? "upcoming" : "away" }));
}

const LONG_DATE = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
export function formatHolidayDate(date: string): string {
  return LONG_DATE.format(new Date(`${date}T12:00:00Z`));
}

export function holidayCopy(notice: Pick<HolidayNotice, "phase" | "closed_from" | "reopens_on">): { title: string; text: string } {
  const closedLine = notice.phase === "upcoming" ? `We’ll be closed from ${formatHolidayDate(notice.closed_from)}. ` : "";
  return {
    title: notice.phase === "upcoming" ? "Upcoming holiday" : "We’re taking a little break",
    text: `${closedLine}We reopen on ${formatHolidayDate(notice.reopens_on)}. Online booking is still open — book your dog’s next groom for when we’re back.`,
  };
}
