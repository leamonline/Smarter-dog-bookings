import { BOOKING_STATUS, BOOKING_STATUSES, getStatusDisplay } from "../../../constants/index.js";
import { useToast } from "../../../contexts/ToastContext.jsx";

export function BookingStatusBar({ booking, currentDateStr, onUpdate }) {
  const toast = useToast();
  const currentStatus = booking.status || BOOKING_STATUS.BOOKED;

  return (
    <div className="mb-4">
      <div
        role="radiogroup"
        aria-label="Booking status"
        className="grid grid-cols-5 gap-1 p-1 rounded-xl bg-slate-100 ring-1 ring-slate-200/70"
      >
        {BOOKING_STATUSES.map((status) => {
          const isActive = currentStatus === status.id;
          // Active step pulls the same colour the dashboard card pill uses for
          // this status, so the stepper colour-matches the card.
          const accent = getStatusDisplay(status.id);

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
                const variant = status.id === BOOKING_STATUS.CHECKED_IN || status.id === BOOKING_STATUS.READY_FOR_PICKUP ? "success" : "info";
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
              className={`py-2 px-0.5 md:px-1 rounded-lg text-[10px] md:text-[11px] font-bold text-center leading-tight whitespace-nowrap border border-transparent transition-colors duration-150 ${
                isActive
                  ? "shadow-sm"
                  : "bg-transparent text-slate-400 hover:text-slate-600 hover:bg-white/60"
              }`}
              style={
                isActive
                  ? { background: accent.bg, color: accent.color, borderColor: accent.border }
                  : undefined
              }
            >
              {status.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
