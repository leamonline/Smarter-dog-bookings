import type { ToneRecord } from "./types";

export type RemindersToneInput = {
  targetDate: string | null;
  sentCount: number;
  totalCount: number;
  now?: Date;
};

// Attention kicks in once we're inside the evening of the calendar day
// *before* targetDate (i.e. less than 6 hours from midnight of the
// target day). Keying off the target's eve — not "tonight" — matches
// the spec's intent: a Wed-evening rail for a Mon target stays active
// because there are still days left to send. The window only closes
// once the operator is actually running out of time before tomorrow.
const ATTENTION_WINDOW_MS = 6 * 60 * 60 * 1000;

export function resolveRemindersTone({
  targetDate,
  sentCount,
  totalCount,
  now,
}: RemindersToneInput): ToneRecord {
  const targetLabel = targetDate ? formatTargetLabel(targetDate) : "tomorrow";
  if (!totalCount || totalCount <= 0) {
    return {
      tone: "calm",
      pillLabel: null,
      primaryNumber: null,
      primaryLine: `No bookings ${targetLabel}`,
      subtitle: null,
      ariaSummary: `Reminders for ${targetLabel}, no bookings`,
      urgency: 0,
      progress: null,
    };
  }
  if (sentCount >= totalCount) {
    return {
      tone: "calm",
      pillLabel: null,
      primaryNumber: null,
      primaryLine: `All reminders sent · ${sentCount} of ${totalCount}`,
      subtitle: null,
      ariaSummary: `Reminders for ${targetLabel}, all ${totalCount} sent`,
      urgency: 0,
      progress: null,
    };
  }

  const unsent = totalCount - sentCount;
  const hoursToTargetMidnight = targetDate
    ? hoursUntilMidnightLocal(targetDate, now ?? new Date())
    : Number.POSITIVE_INFINITY;
  const isAttention = hoursToTargetMidnight < ATTENTION_WINDOW_MS / 3600000;

  return {
    tone: isAttention ? "attention" : "active",
    pillLabel: isAttention ? "Send now" : "Pending",
    primaryNumber: unsent,
    primaryLine: null,
    subtitle: `unsent of ${totalCount} bookings ${targetLabel}`,
    ariaSummary: `Reminders for ${targetLabel}, ${unsent} unsent of ${totalCount}${
      isAttention ? ", send tonight" : ""
    }`,
    urgency: unsent,
    progress: { current: sentCount, total: totalCount },
  };
}

function formatTargetLabel(yyyyMmDd: string): string {
  // "Tue 14 May" — matches the existing card heading style. We do this
  // here so the resolver's primaryLine / ariaSummary stay free of
  // formatting concerns in the wrapper.
  try {
    return new Date(`${yyyyMmDd}T12:00:00Z`).toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  } catch {
    return yyyyMmDd;
  }
}

function hoursUntilMidnightLocal(yyyyMmDd: string, now: Date): number {
  // Midnight at the start of the target day, in the salon's local time
  // (Europe/London). The salon's calendar matters here, not the
  // server's UTC clock.
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  if (!y || !m || !d) return Number.POSITIVE_INFINITY;
  const targetMidnight = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
  const diffMs = targetMidnight - now.getTime();
  return diffMs / 3600000;
}
