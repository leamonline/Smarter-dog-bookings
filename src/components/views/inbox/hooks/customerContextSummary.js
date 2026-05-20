// ============================================================
// src/components/views/inbox/hooks/customerContextSummary.js
//
// Pure helpers for the customer-context panel. No React, no
// Supabase — just shapes in, strings out. Exported separately so
// the unit tests don't need to mock the hook.
// ============================================================

import { serviceLabel } from "../helpers.js";

// One-line summary used as the panel's at-a-glance line. Returns
// "" when there isn't enough data to say anything useful — the
// caller hides the line entirely in that case.
//
// Examples:
//   "Returning client — 2 dogs. Last groom: Tue 6 May, full groom."
//   "First-time visitor — Rex booked but no past grooms yet."
//   "" (when human is missing or we know nothing)
export function buildCustomerSummary({ human, dogs, lastBooking }) {
  if (!human) return "";

  const dogCount = Array.isArray(dogs) ? dogs.length : 0;
  const dogPhrase =
    dogCount === 0
      ? null
      : dogCount === 1
        ? `${dogs[0].name || "1 dog"}`
        : `${dogCount} dogs`;

  if (lastBooking) {
    const datePhrase = formatBookingDate(lastBooking.date);
    const servicePhrase = serviceLabel(lastBooking.service);
    const lead = dogPhrase
      ? `Returning client — ${dogPhrase}.`
      : `Returning client.`;
    return `${lead} Last groom: ${datePhrase}, ${servicePhrase.toLowerCase()}.`;
  }

  if (dogPhrase) {
    return `First-time visitor — ${dogPhrase} on file, no past grooms yet.`;
  }

  return `On file with no dogs yet.`;
}

// "Tue 6 May" or similar UK-friendly long format. Falls back to
// the raw string if it doesn't parse — better than dropping data.
export function formatBookingDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

// Re-exported so existing imports from this module keep working — the
// canonical phone-link helpers live in `src/utils/phone.js` next to
// the rest of the phone utilities.
export { telLinkOrNull as telLink, waMeLink } from "../../../../utils/phone.js";
