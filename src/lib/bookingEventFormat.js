// ============================================================
// src/lib/bookingEventFormat.js
//
// Shared formatting for booking_events rows. Single source of truth for the
// dashboard's BookingHistoryCard and the Human Profile's owner timeline so the
// two never drift on wording or actor attribution.
//
// Each event names the actor who made/amended the booking. Staff and the
// WhatsApp AI lead the line ("Leam booked in …", "Smarter Dog AI booked in …");
// customers / system / legacy-null rows stay owner-led. Staff show first name
// only; the AI name is verbatim.
// ============================================================

import { SERVICES } from "../constants/salon.ts";

const SERVICE_LABEL = Object.fromEntries(SERVICES.map((s) => [s.id, s.name]));

function formatService(id) {
  return SERVICE_LABEL[id] ?? id ?? "groom";
}

function formatDate(yyyyMmDd) {
  if (!yyyyMmDd) return "";
  const d = new Date(`${yyyyMmDd}T12:00:00Z`);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function formatTime(slot) {
  if (!slot) return "";
  const [h, m] = slot.split(":").map(Number);
  const period = h < 12 ? "am" : "pm";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")}${period}`;
}

function dogParenthetical(breed) {
  if (!breed) return "";
  return ` (${breed})`;
}

const firstWord = (s) => (s || "").trim().split(/\s+/)[0] || "";

export function formatRelative(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff) || diff < 0) return "";
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function eventSentence(event) {
  if (!event) return "";
  const owner = event.customer_name || "Someone";
  const dog = event.dog_name || "a dog";
  const breed = dogParenthetical(event.dog_breed);
  const service = formatService(event.service);
  const date = formatDate(event.booking_date);
  const time = formatTime(event.slot);

  // Staff and the AI lead the line; customers / system / legacy-null rows
  // stay owner-led. Staff show first name only; the AI name is verbatim.
  let leadActor = null;
  if (event.actor_name) {
    if (event.actor_role === "staff") leadActor = firstWord(event.actor_name);
    else if (event.actor_role === "ai") leadActor = event.actor_name;
  }

  if (event.event_type === "reconfirmed") {
    return `${owner} reconfirmed the ${service} for ${dog}${breed}.`;
  }
  if (event.event_type === "rescheduled") {
    const prevDate = formatDate(event.previous_booking_date);
    const prevTime = formatTime(event.previous_slot);
    return leadActor
      ? `${leadActor} moved ${dog}${breed}'s ${service} (${owner}) from ${prevDate} at ${prevTime} to ${date} at ${time}.`
      : `${owner} moved ${dog}${breed}'s ${service} from ${prevDate} at ${prevTime} to ${date} at ${time}.`;
  }
  if (event.event_type === "cancelled") {
    const reason = event.cancel_reason ? ` (${event.cancel_reason})` : "";
    return leadActor
      ? `${leadActor} cancelled ${dog}${breed}'s ${service} (${owner}) for ${date} at ${time}${reason}.`
      : `${owner} cancelled ${dog}${breed}'s ${service} for ${date} at ${time}${reason}.`;
  }
  if (event.event_type === "completed") {
    return leadActor
      ? `${leadActor} completed ${dog}${breed}'s ${service} (${owner}).`
      : `${dog}${breed}'s ${service} for ${owner} was completed.`;
  }
  // created
  return leadActor
    ? `${leadActor} booked in ${dog}${breed} with ${owner} for a ${service} at ${date} at ${time}.`
    : `${owner} booked a ${service} for ${dog}${breed} ${date} at ${time}.`;
}

export const EVENT_TONE = {
  created: {
    dot: "bg-brand-green-500",
    pill: "text-brand-green-700",
    label: "Booked",
  },
  rescheduled: {
    dot: "bg-amber-500",
    pill: "text-amber-700",
    label: "Moved",
  },
  cancelled: {
    dot: "bg-rose-500",
    pill: "text-rose-700",
    label: "Cancelled",
  },
  reconfirmed: {
    dot: "bg-teal-500",
    pill: "text-teal-700",
    label: "Reconfirmed",
  },
  completed: {
    dot: "bg-violet-500",
    pill: "text-violet-700",
    label: "Completed",
  },
};
