import type { ToneRecord } from "./types";

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

export type InboxToneInput = {
  awaitingReply: number;
  oldestUnansweredAt: string | null;
  now?: Date;
};

export function resolveInboxTone({
  awaitingReply,
  oldestUnansweredAt,
  now,
}: InboxToneInput): ToneRecord {
  if (!awaitingReply || awaitingReply <= 0) {
    return {
      tone: "calm",
      pillLabel: null,
      primaryNumber: null,
      primaryLine: "Inbox clear",
      subtitle: null,
      ariaSummary: "WhatsApp inbox, clear",
      urgency: 0,
      progress: null,
    };
  }

  const nowMs = (now ?? new Date()).getTime();
  const oldestMs = oldestUnansweredAt
    ? new Date(oldestUnansweredAt).getTime()
    : Number.NaN;
  const ageMs = Number.isFinite(oldestMs) ? Math.max(0, nowMs - oldestMs) : 0;
  const hoursOld = ageMs / 3600000;
  const ageLabel = formatAge(ageMs);

  if (ageMs >= TWO_HOURS_MS) {
    return {
      tone: "attention",
      pillLabel: "Needs reply",
      primaryNumber: awaitingReply,
      primaryLine: null,
      subtitle: oldestUnansweredAt ? `oldest ${ageLabel} ago` : null,
      ariaSummary: `WhatsApp inbox, ${awaitingReply} ${
        awaitingReply === 1 ? "message needs" : "messages need"
      } reply${oldestUnansweredAt ? `, oldest ${ageLabel} ago` : ""}`,
      urgency: hoursOld,
      progress: null,
    };
  }

  return {
    tone: "active",
    pillLabel: "Open",
    primaryNumber: awaitingReply,
    primaryLine: null,
    subtitle: awaitingReply === 1 ? "message waiting" : "messages waiting",
    ariaSummary: `WhatsApp inbox, ${awaitingReply} ${
      awaitingReply === 1 ? "message" : "messages"
    } waiting`,
    urgency: hoursOld,
    progress: null,
  };
}

function formatAge(ms: number): string {
  if (ms < 60 * 60 * 1000) {
    const mins = Math.max(1, Math.round(ms / 60000));
    return `${mins} ${mins === 1 ? "minute" : "minutes"}`;
  }
  const hours = Math.round(ms / 3600000);
  return `${hours} ${hours === 1 ? "hour" : "hours"}`;
}
