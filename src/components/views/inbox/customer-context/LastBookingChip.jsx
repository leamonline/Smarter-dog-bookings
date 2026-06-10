// ============================================================
// src/components/views/inbox/customer-context/LastBookingChip.jsx
//
// At-a-glance "when did this customer last visit" chip. Renders
// nothing when there's no past booking — the empty state lives
// at the panel level (e.g. "First-time visitor — Rex on file").
// ============================================================

import { formatBookingDate } from "../hooks/customerContextSummary.js";
import { serviceLabel } from "../helpers.js";
import { titleCase } from "../../../../utils/text";

export function LastBookingChip({ lastBooking }) {
  if (!lastBooking || !lastBooking.date) return null;

  const dateText = formatBookingDate(lastBooking.date);
  const service = serviceLabel(lastBooking.service);
  const dogName = lastBooking.dogName ? titleCase(lastBooking.dogName) : "";

  return (
    <div
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-100 border border-emerald-200 text-emerald-900 text-[11px] font-semibold"
      title={`Last groom: ${dateText} — ${service}${dogName ? ` — ${dogName}` : ""}`}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
      <span>
        Last groom: {dateText}
        {dogName ? ` (${dogName})` : ""} — {service.toLowerCase()}
      </span>
    </div>
  );
}
