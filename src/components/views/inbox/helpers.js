// ============================================================
// src/components/views/inbox/helpers.js
//
// Pure formatting helpers shared across the inbox component tree.
// No React, no Supabase — keeps the tree leaf-light.
// ============================================================

import { titleCase } from "../../../utils/text";
import { formatPhoneForDisplay } from "../../../utils/phone.js";

// "09:30" if today, "Yesterday" if yesterday, "12 May" otherwise.
export function formatWhen(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }
  const yday = new Date(now);
  yday.setDate(yday.getDate() - 1);
  if (d.toDateString() === yday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// Display name for a conversation row: customer's full name if matched
// to a humans record, otherwise the phone in 07… form. "Unknown contact"
// only when both are missing (degenerate data).
export function displayName(conv) {
  if (conv?.humans?.name) {
    const name = titleCase(conv.humans.name);
    const surname = conv.humans.surname ? " " + titleCase(conv.humans.surname) : "";
    return `${name}${surname}`;
  }
  return formatPhoneForDisplay(conv?.phone_e164) || "Unknown contact";
}

// Bucket a 0..1 confidence into a human label.
export function confidenceLabel(c) {
  if (c == null) return "";
  if (c >= 0.9) return "high";
  if (c >= 0.6) return "medium";
  return "low";
}

// Human-friendly service name. Falls back to the raw id if unknown.
export function serviceLabel(service) {
  const labels = {
    "full-groom": "Full groom",
    "bath-and-brush": "Bath & brush",
    "bath-and-deshed": "Bath & de-shed",
    "puppy-groom": "Puppy groom",
  };
  return labels[service] || service || "Service";
}

// Compact UK-style "Mon 27 Apr" used by the booking-attached banner.
// Year is omitted because the banner is showing imminent bookings.
export function formatShortDate(dateStr) {
  if (!dateStr) return "?";
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

// Meta only lets us send free-form text within 24h of the customer's
// last inbound message. Client-side check mirrors the backend check
// in whatsapp-send so we can disable the compose box before the user
// writes anything. Backend still enforces — this is a UX hint, not
// security. Returns true if the window is currently open.
export const WINDOW_MS = 24 * 60 * 60 * 1000;
export const CLOSING_SOON_MS = 4 * 60 * 60 * 1000;

export function isWindowOpen(lastInboundAt, nowMs = Date.now()) {
  if (!lastInboundAt) return false;
  return nowMs - new Date(lastInboundAt).getTime() < WINDOW_MS;
}

export function windowRemainingMs(lastInboundAt, nowMs = Date.now()) {
  if (!lastInboundAt) return 0;
  return Math.max(0, WINDOW_MS - (nowMs - new Date(lastInboundAt).getTime()));
}

// Human-friendly "window closes in Xh Ym" — shown as a soft hint next
// to the compose box so staff know when they'll lose free-form.
export function windowCountdown(lastInboundAt, nowMs = Date.now()) {
  if (!lastInboundAt) return null;
  const remaining = windowRemainingMs(lastInboundAt, nowMs);
  if (remaining <= 0) return null;
  const hours = Math.floor(remaining / (60 * 60 * 1000));
  const mins = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
  if (hours >= 1) return `Window closes in ${hours}h ${mins}m`;
  return `Window closes in ${mins}m`;
}

export function isAwaitingReply(conv) {
  if (!conv?.last_inbound_at || conv.closed_at) return false;
  if (!conv.last_outbound_at) return true;
  return new Date(conv.last_inbound_at).getTime() > new Date(conv.last_outbound_at).getTime();
}

export function isWindowClosingSoon(conv, nowMs = Date.now()) {
  if ((conv?.channel ?? "whatsapp") !== "whatsapp") return false;
  if (!isAwaitingReply(conv)) return false;
  if (!isWindowOpen(conv.last_inbound_at, nowMs)) return false;
  return windowRemainingMs(conv.last_inbound_at, nowMs) <= CLOSING_SOON_MS;
}

export function inboxWindowBadge(conv, nowMs = Date.now()) {
  if ((conv?.channel ?? "whatsapp") !== "whatsapp") return null;
  if (!isAwaitingReply(conv)) return null;
  if (!isWindowOpen(conv.last_inbound_at, nowMs)) {
    return {
      kind: "template_needed",
      label: "Template needed",
      title: "The 24-hour WhatsApp reply window is closed. Send an approved template to reopen the conversation.",
    };
  }
  if (!isWindowClosingSoon(conv, nowMs)) return null;
  return {
    kind: "closing_soon",
    label: windowCountdown(conv.last_inbound_at, nowMs)?.replace(/^Window closes/, "Closes") ?? "Closes soon",
    title: "The WhatsApp free-form reply window is nearly closed.",
  };
}
