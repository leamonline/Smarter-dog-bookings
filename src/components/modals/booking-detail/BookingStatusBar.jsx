import { useState, useRef } from "react";
import { BOOKING_STATUS, BOOKING_STATUSES, getStatusDisplay } from "../../../constants/index";
import { useToast } from "../../../contexts/ToastContext.jsx";

export function BookingStatusBar({ booking, currentDateStr, onUpdate }) {
  const toast = useToast();
  const currentStatus = booking.status || BOOKING_STATUS.BOOKED;
  // A visually-hidden live region so screen-reader users hear the status
  // change land — the radiogroup's aria-checked moving isn't announced on
  // its own when the change is triggered programmatically (#299).
  const [announcement, setAnnouncement] = useState("");

  // Roving-tabindex keyboard nav. Arrows move FOCUS between steps but don't
  // commit — committing fires a server update + toast, so we never want that
  // on a stray arrow press. Enter/Space on the focused step commits via the
  // button's native onClick.
  const radioRefs = useRef([]);
  const handleKeyNav = (e) => {
    const navKeys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"];
    if (!navKeys.includes(e.key)) return;
    e.preventDefault();
    const count = BOOKING_STATUSES.length;
    let idx = radioRefs.current.findIndex((el) => el === document.activeElement);
    if (idx < 0) idx = BOOKING_STATUSES.findIndex((s) => s.id === currentStatus);
    if (idx < 0) idx = 0;
    let next = idx;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (idx + 1) % count;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (idx - 1 + count) % count;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = count - 1;
    radioRefs.current[next]?.focus();
  };

  return (
    <div className="mb-4">
      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>
      <div
        role="radiogroup"
        aria-label="Booking status"
        className="grid grid-cols-5 gap-1"
        onKeyDown={handleKeyNav}
      >
        {BOOKING_STATUSES.map((status, idx) => {
          const isActive = currentStatus === status.id;
          // Active step pulls the same colour the dashboard card pill uses for
          // this status, so the stepper colour-matches the card.
          const accent = getStatusDisplay(status.id);

          return (
            <button
              key={status.id}
              ref={(el) => (radioRefs.current[idx] = el)}
              type="button"
              role="radio"
              aria-checked={isActive}
              tabIndex={isActive ? 0 : -1}
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
                setAnnouncement(`All set — status updated to ${status.label}`);
                const variant = status.id === BOOKING_STATUS.CHECKED_IN || status.id === BOOKING_STATUS.READY_FOR_PICKUP ? "success" : "info";
                toast.show(
                  `${status.label} — saved`,
                  variant,
                  () => onUpdate(
                    { ...booking, status: previousStatus },
                    currentDateStr,
                    currentDateStr,
                  ),
                );
              }}
              className={`min-h-[44px] inline-flex items-center justify-center py-2 px-0.5 md:px-1 rounded-full text-[10px] md:text-[11px] font-bold text-center leading-tight whitespace-nowrap border-none cursor-pointer font-inherit transition-colors duration-150 ${
                isActive ? "" : "bg-slate-100 text-slate-600 hover:text-slate-700 hover:bg-slate-200"
              }`}
              style={
                isActive
                  ? { background: accent.border, color: accent.onAccent }
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
