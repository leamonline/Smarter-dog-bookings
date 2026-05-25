// ============================================================
// src/lib/reminders/templates.js
//
// Pure rendering helpers for booking reminders, shared by the Send
// Reminder modal's previews and the payloads it posts to the
// reminder-send edge function. No React, no Supabase — so they're
// trivially unit-testable.
//
// WhatsApp reuses the Meta-approved template registry
// (appointment_reminder_v1) so the in-app preview is byte-identical
// to what Meta sends. SMS/email are free-form text we own.
// ============================================================

import { WHATSAPP_TEMPLATES, buildTemplateParams } from "../../constants/whatsappTemplates.js";

// The Meta-approved template used for appointment reminders. Must stay
// in sync with an Active template in WhatsApp Manager.
export const REMINDER_TEMPLATE_NAME = "appointment_reminder_v1";

export function getReminderTemplate() {
  return WHATSAPP_TEMPLATES.find((t) => t.name === REMINDER_TEMPLATE_NAME);
}

/** Join names naturally: "Bella", "Bella and Max", "Bella, Max and Daisy". */
export function joinNames(names) {
  const list = (names ?? []).filter(Boolean);
  if (list.length === 0) return "";
  if (list.length === 1) return list[0];
  return list.slice(0, -1).join(", ") + " and " + list[list.length - 1];
}

/** "09:00" -> "9:00am". */
export function formatTime(slot) {
  if (!slot) return "";
  const [h, m] = slot.split(":").map(Number);
  const period = h < 12 ? "am" : "pm";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")}${period}`;
}

// Parse the date at noon UTC and format in UTC so the weekday/day never
// drifts with the host timezone (a bare "YYYY-MM-DD" parses as local
// midnight, which can roll back a day west of GMT).
function ukDate(dateStr, opts) {
  return new Date(`${dateStr}T12:00:00Z`).toLocaleDateString("en-GB", {
    ...opts,
    timeZone: "UTC",
  });
}

/** "2026-05-25" -> "Mon 25 May" (compact, for SMS + subjects). */
export function formatDateShort(dateStr) {
  if (!dateStr) return "";
  return ukDate(dateStr, { weekday: "short", day: "numeric", month: "short" });
}

/** "2026-05-25" -> "Monday 25 May" (the appointment_when phrasing). */
export function formatDateWhen(dateStr) {
  if (!dateStr) return "";
  return ukDate(dateStr, { weekday: "long", day: "numeric", month: "long" });
}

function whenPhrase(date, slot) {
  return `${formatDateWhen(date)} at ${formatTime(slot)}`;
}

function reminderValues({ firstName, dogNames, date, slot }) {
  return {
    customer_first_name: firstName || "",
    dog_name: joinNames(dogNames),
    appointment_when: whenPhrase(date, slot),
  };
}

/** Ordered params array for appointment_reminder_v1 ({{1}}..{{3}}). */
export function buildWhatsAppReminderParams(args) {
  return buildTemplateParams(getReminderTemplate(), reminderValues(args));
}

/** Read-only chat preview string, byte-identical to the registered template. */
export function renderWhatsAppReminderPreview(args) {
  return getReminderTemplate().preview(reminderValues(args));
}

/**
 * Short SMS reminder. Aims to stay within a single GSM-7 segment for the
 * common single-dog case; staff can edit and the composer shows a live
 * segment counter.
 */
export function renderSmsReminder({ firstName, dogNames, date, slot, service }) {
  const name = firstName || "there";
  const dogs = joinNames(dogNames);
  const plural = (dogNames ?? []).filter(Boolean).length > 1;
  const verb = plural ? "are" : "is";
  const svc = service ? ` for a ${service}` : "";
  return `Hi ${name}, just a reminder ${dogs} ${verb} booked in${svc} on ${formatDateShort(date)} at ${formatTime(slot)}. See you then!`;
}

/** Email reminder subject + plain-text body (the SendGrid sender is text/plain). */
export function renderEmailReminder({ firstName, dogNames, date, slot, service }) {
  const name = firstName || "there";
  const dogs = joinNames(dogNames);
  const plural = (dogNames ?? []).filter(Boolean).length > 1;
  const verb = plural ? "are" : "is";
  const svc = service ? ` for a ${service}` : "";
  const subject = `Reminder: ${dogs} ${verb} booked in on ${formatDateShort(date)}`;
  const body = [
    `Hi ${name},`,
    "",
    `Just a friendly reminder that ${dogs} ${verb} booked in with us at Smarter Dog Grooming${svc} on ${formatDateWhen(date)} at ${formatTime(slot)}.`,
    "",
    "If you need to change anything, just reply to this email or give us a call.",
    "",
    "See you soon!",
    "Smarter Dog Grooming",
  ].join("\n");
  return { subject, body };
}
