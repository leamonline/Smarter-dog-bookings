import type { ToneRecord } from "./types";

export type WaitlistEntry = { target_date: string };

export type WaitlistToneInput = {
  entries: WaitlistEntry[];
  now?: Date;
};

export function resolveWaitlistTone({
  entries,
  now,
}: WaitlistToneInput): ToneRecord {
  const total = entries?.length ?? 0;
  if (total === 0) {
    return {
      tone: "calm",
      pillLabel: null,
      primaryNumber: null,
      primaryLine: "Waitlist empty",
      subtitle: null,
      ariaSummary: "Waitlist, empty",
      urgency: 0,
      progress: null,
    };
  }

  const today = toLocalDateString(now ?? new Date());
  const tomorrow = addDaysToDateString(today, 1);
  const imminent = entries.filter(
    (e) => e.target_date === today || e.target_date === tomorrow,
  ).length;

  if (imminent > 0) {
    return {
      tone: "attention",
      pillLabel: "Action",
      primaryNumber: imminent,
      primaryLine: null,
      subtitle: `could slot in today or tomorrow (${total} waiting total)`,
      ariaSummary: `Waitlist, ${imminent} ${
        imminent === 1 ? "dog" : "dogs"
      } could be slotted in within the next 2 days, ${total} ${
        total === 1 ? "dog" : "dogs"
      } waiting total`,
      urgency: imminent,
      progress: null,
    };
  }

  return {
    tone: "active",
    pillLabel: "In progress",
    primaryNumber: total,
    primaryLine: null,
    subtitle: total === 1 ? "dog waiting" : "dogs waiting",
    ariaSummary: `Waitlist, ${total} ${total === 1 ? "dog" : "dogs"} waiting`,
    urgency: 0,
    progress: null,
  };
}

function toLocalDateString(d: Date): string {
  // YYYY-MM-DD in the salon's local calendar — matches how target_date
  // is stored on waitlist_entries.
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDaysToDateString(yyyyMmDd: string, days: number): string {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return toLocalDateString(dt);
}
