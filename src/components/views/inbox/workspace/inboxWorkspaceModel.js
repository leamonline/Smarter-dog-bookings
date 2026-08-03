import { formatConversationalDate } from "../helpers.js";

const REVIEW_COPY = Object.freeze({
  both: "Needs review: AI flagged a handoff AND the draft is high-risk. Open to see the reason.",
  handoff: "Needs review: the AI explicitly flagged this conversation for human handoff. Open to see why.",
  highRisk: "Needs review: the draft is rated high-risk (bookings, refunds, complaints, medical). Open to read it.",
  fallback: "Needs review: draft is awaiting your approval.",
});

function status(key, label, tone, title, ariaLabel = title) {
  return { key, label, tone, title, ariaLabel };
}

function reviewTitle(conversation) {
  const drafts = Array.isArray(conversation?.whatsapp_drafts)
    ? conversation.whatsapp_drafts.filter((draft) => draft.state === "pending")
    : [];
  const handoff = drafts.some((draft) => draft.handoff_required === true);
  const highRisk = drafts.some((draft) => draft.risk_level === "high");
  if (handoff && highRisk) return REVIEW_COPY.both;
  if (handoff) return REVIEW_COPY.handoff;
  if (highRisk) return REVIEW_COPY.highRisk;
  return REVIEW_COPY.fallback;
}

export function getConversationRowStatus(conversation) {
  if (conversation?.has_failed_message) {
    const title = conversation.latest_failed_message?.error_message
      ? `Latest failed send: ${conversation.latest_failed_message.error_message}`
      : "Latest send failed. Open the thread to check the delivery state.";
    return status("failed", "Failed send", "danger", title);
  }
  if (conversation?.needs_human_review) {
    const title = reviewTitle(conversation);
    return status("review", "Action needed", "danger", title);
  }
  if (conversation?.has_pending_draft) {
    return status(
      "draft",
      "Draft pending",
      "warning",
      "AI has drafted a reply for this conversation — open to read it and approve, edit, or reject.",
      "AI draft pending review",
    );
  }
  if (conversation?.has_pending_booking_action) {
    return status(
      "booking-action",
      "Booking action pending",
      "success",
      "The AI is proposing a booking (create / reschedule / cancel) — open to review the proposed dog, date, and slot before applying.",
      "Booking proposal pending approval",
    );
  }
  const unread = conversation?.unread_count ?? 0;
  if (unread > 0) return status("unread", "Unread", "info", `${unread} unread`);
  if (conversation?.closed_at) return status("closed", "Closed", "neutral", "Conversation closed");
  if (conversation?.state === "snoozed") {
    return status("snoozed", "Snoozed", "neutral", "Conversation snoozed");
  }
  if (conversation?.state === "human_takeover") {
    return status("takeover", "Taken over", "neutral", "Conversation taken over by staff");
  }
  return null;
}

function parseLocalDate(dateStr) {
  const [year, month, day] = String(dateStr).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function localDateStr(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function buildDiaryDates(dateStr, count = 5) {
  const start = parseLocalDate(dateStr);
  return Array.from({ length: count }, (_, index) => {
    const dateObj = new Date(start);
    dateObj.setDate(start.getDate() + index);
    return { dateObj, dateStr: localDateStr(dateObj) };
  });
}

function displayTime(slot) {
  const [hourValue, minute] = String(slot).split(":").map(Number);
  const suffix = hourValue >= 12 ? "pm" : "am";
  const hour = hourValue % 12 || 12;
  return `${hour}:${String(minute).padStart(2, "0")}${suffix}`;
}

export function formatSlotOffer(choices) {
  const grouped = new Map();
  for (const choice of choices ?? []) {
    const times = grouped.get(choice.dateStr) ?? [];
    times.push(displayTime(choice.slot));
    grouped.set(choice.dateStr, times);
  }
  return [...grouped.entries()]
    .map(([dateStr, times]) => `${formatConversationalDate(dateStr)} — ${times.join(" / ")}`)
    .join("\n");
}

export function appendSlotOffer(draft, choices) {
  const offer = formatSlotOffer(choices);
  if (!offer) return draft;
  const prefix = String(draft || "").trimEnd();
  return prefix ? `${prefix}\n\n${offer}` : offer;
}
