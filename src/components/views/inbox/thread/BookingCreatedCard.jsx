// ============================================================
// src/components/views/inbox/thread/BookingCreatedCard.jsx
//
// Inline timeline card rendered between WhatsApp messages at the
// point a whatsapp_booking_action transitioned to applied or
// auto_applied. Closes the loop with the matching
// "Created from WhatsApp" link on the booking detail modal.
// ============================================================

import { Link } from "react-router-dom";
import { formatWhen } from "../helpers.js";

function formatBookingDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function BookingCreatedCard({ action, dogNamesById }) {
  const payload = action?.payload || {};
  const dogId = payload.dog_id || action?.applied_booking_id;
  const dogName = dogNamesById?.[payload.dog_id] || "this dog";
  const dateLabel = formatBookingDate(payload.booking_date);
  const slot = payload.slot || "";
  const autoApplied = action?.state === "auto_applied";
  const href = action?.applied_booking_id
    ? `/?bookingId=${action.applied_booking_id}`
    : dogId
      ? `/dogs/${dogId}`
      : "/";

  return (
    <div className="flex justify-center my-2">
      <Link
        to={href}
        className="inline-flex items-center gap-2 max-w-[80%] px-3 py-2 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-900 text-[12px] font-semibold no-underline hover:bg-emerald-100 transition-colors"
      >
        <span aria-hidden="true">✓</span>
        <span>
          Booking created → {dogName} · {dateLabel}
          {slot ? ` ${slot}` : ""}
          {autoApplied ? " (auto-applied)" : ""}
        </span>
        <span className="text-[10px] text-emerald-700/70">
          · {formatWhen(action?.applied_at || action?.created_at)}
        </span>
      </Link>
    </div>
  );
}
