// ============================================================
// src/components/views/inbox/thread/BookingCapacityPreview.jsx
//
// Inline capacity preview for the BookingActionPanel. Reads
// existing bookings for the proposed date via useSlotCapacityPreview
// and surfaces a one-liner: "Adds to 1 small. Fits the 2-2-1 rule."
// or "Won't fit — needs manager approval for this slot."
//
// Doesn't gate the Apply button — that's the Postgres capacity
// trigger's job at write time. This is informational, so staff can
// see what they're about to do before they do it.
// ============================================================

import { useSlotCapacityPreview } from "../hooks/useSlotCapacityPreview.js";
import { formatBookingDate } from "../hooks/customerContextSummary.js";

export function BookingCapacityPreview({ date, slot, size }) {
  const ready = Boolean(date && slot && size);
  const preview = useSlotCapacityPreview({ date, slot, size });

  if (!ready) {
    return (
      <p className="mt-2 text-[11px] text-slate-500 italic">
        Capacity preview will appear once date, slot and size are set.
      </p>
    );
  }

  if (preview.loading) {
    return (
      <p className="mt-2 text-[11px] text-slate-500">
        Checking that slot…
      </p>
    );
  }

  if (preview.error) {
    return (
      <p className="mt-2 text-[11px] text-slate-500">
        Couldn&apos;t check capacity ({preview.error}). The diary will reject the apply if it doesn&apos;t fit.
      </p>
    );
  }

  const fits = preview.fits;
  const palette = fits
    ? "bg-emerald-50 border-emerald-200 text-emerald-900"
    : "bg-rose-50 border-rose-200 text-rose-900";
  const iconStroke = fits ? "#047857" : "#b91c1c";

  return (
    <div
      className={`mt-2 flex items-start gap-2 px-2.5 py-1.5 rounded-lg border text-[11.5px] leading-snug ${palette}`}
      role="status"
      aria-live="polite"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke={iconStroke}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="shrink-0 mt-0.5"
      >
        {fits ? (
          <polyline points="20 6 9 17 4 12" />
        ) : (
          <>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </>
        )}
      </svg>
      <div className="min-w-0">
        <div className="font-semibold">
          {formatBookingDate(date)}, {slot} — {size}
        </div>
        <div className="text-[11px] opacity-90">{preview.summary}</div>
      </div>
    </div>
  );
}
