import { BOOKING_STATUSES } from "../../../constants/index.js";
import { useToast } from "../../../contexts/ToastContext.jsx";
import { getStatusAccent } from "./shared.jsx";

const STATUS_ICON = {
  "Booked": (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2.5" y="3.5" width="11" height="10" rx="1.5" />
      <line x1="2.5" y1="6.5" x2="13.5" y2="6.5" />
      <line x1="5.5" y1="2" x2="5.5" y2="5" />
      <line x1="10.5" y1="2" x2="10.5" y2="5" />
    </svg>
  ),
  "Checked in": (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 8h9" />
      <path d="M8 5l3 3-3 3" />
      <path d="M14 3v10" />
    </svg>
  ),
  "Ready for pick-up": (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 8.5l3.5 3.5 6.5-8" />
    </svg>
  ),
};

export function BookingStatusBar({ booking, currentDateStr, onUpdate }) {
  const toast = useToast();
  const currentStatus = booking.status || "Booked";
  const currentIdx = BOOKING_STATUSES.findIndex((s) => s.id === currentStatus);
  const safeIdx = currentIdx < 0 ? 0 : currentIdx;

  return (
    <div className="mb-4">
      <div
        role="radiogroup"
        aria-label="Booking status"
        className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100 ring-1 ring-slate-200/70"
      >
        {BOOKING_STATUSES.map((status, idx) => {
          const isActive = currentStatus === status.id;
          const isPast = idx < safeIdx;
          const accent = getStatusAccent(status.id);

          return (
            <button
              key={status.id}
              type="button"
              role="radio"
              aria-checked={isActive}
              aria-label={`Set status to ${status.label}`}
              onClick={async () => {
                if (isActive) return;
                // Capture the pre-change status so the undo callback
                // reverts to the right value even if `currentStatus`
                // changes between toast trigger and undo click.
                const previousStatus = currentStatus;
                const result = await onUpdate(
                  { ...booking, status: status.id },
                  currentDateStr,
                  currentDateStr,
                );
                // updateBooking returns null on failure (server check or
                // RLS error); the global error banner already surfaces the
                // message, so suppress the success toast in that case.
                if (result === null) return;
                const variant = status.id === "Checked in" || status.id === "Ready for pick-up" ? "success" : "info";
                toast.show(
                  `Status: ${status.label}`,
                  variant,
                  () => onUpdate(
                    { ...booking, status: previousStatus },
                    currentDateStr,
                    currentDateStr,
                  ),
                );
              }}
              className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-[12px] font-bold ring-1 transition-colors duration-150 ${
                isActive
                  ? `${accent.pillBg} ${accent.pillText} ${accent.ring} shadow-sm`
                  : isPast
                    ? "bg-transparent ring-transparent text-slate-400 hover:text-slate-600 hover:bg-white/60"
                    : "bg-transparent ring-transparent text-slate-500 hover:text-slate-700 hover:bg-white/60"
              }`}
            >
              <span className={isActive ? accent.text : ""}>{STATUS_ICON[status.id]}</span>
              <span>{status.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
