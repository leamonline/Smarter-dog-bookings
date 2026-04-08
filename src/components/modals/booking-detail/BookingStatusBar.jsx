import { BOOKING_STATUSES, NO_SHOW_STATUS } from "../../../constants/index.js";

export function BookingStatusBar({ booking, currentDateStr, onUpdate }) {
  const currentStatus = booking.status || "Not Arrived";

  // Build the display list: normal flow + optional No Show entry
  const statuses = currentStatus === NO_SHOW_STATUS.id
    ? [...BOOKING_STATUSES, NO_SHOW_STATUS]
    : BOOKING_STATUSES;

  return (
    <div className="mb-4">
      <div className="flex gap-1.5 flex-wrap justify-center">
        {statuses.map((status) => {
          const isActive = currentStatus === status.id;
          const currentIdx = statuses.findIndex(
            (st) => st.id === currentStatus,
          );
          const thisIdx = statuses.findIndex(
            (st) => st.id === status.id,
          );
          const isPast = thisIdx < currentIdx;

          return (
            <button
              key={status.id}
              onClick={async () => {
                if (isActive) return;
                if (status.id === NO_SHOW_STATUS.id) {
                  if (!window.confirm(`Mark ${booking.dogName || "this booking"} as No Show?`)) return;
                }
                await onUpdate(
                  { ...booking, status: status.id },
                  currentDateStr,
                  currentDateStr,
                );
              }}
              className="px-3 py-1.5 rounded-lg text-xs font-bold font-inherit transition-all"
              style={{
                cursor: isActive ? "default" : "pointer",
                background: isActive
                  ? status.bg
                  : isPast
                    ? "#F9FAFB"
                    : "#FFFFFF",
                color: isActive
                  ? status.color
                  : isPast
                    ? "#6B7280"
                    : "#6B7280",
                border: isActive
                  ? `2px solid ${status.color}`
                  : `1px solid #E5E7EB`,
                opacity: isPast ? 0.6 : 1,
              }}
            >
              {isActive ? "\u25CF " : ""}
              {status.label}
            </button>
          );
        })}

        {/* No Show button — only offered when still Not Arrived */}
        {currentStatus === "Not Arrived" && (
          <button
            onClick={async () => {
              if (!window.confirm(`Mark ${booking.dogName || "this booking"} as No Show?`)) return;
              await onUpdate(
                { ...booking, status: NO_SHOW_STATUS.id },
                currentDateStr,
                currentDateStr,
              );
            }}
            className="px-3 py-1.5 rounded-lg text-xs font-bold font-inherit transition-all"
            style={{
              cursor: "pointer",
              background: NO_SHOW_STATUS.bg,
              color: NO_SHOW_STATUS.color,
              border: `1px dashed ${NO_SHOW_STATUS.color}`,
            }}
          >
            ✗ No Show
          </button>
        )}
      </div>
    </div>
  );
}

export function ClientConfirmedToggle({ booking, currentDateStr, onUpdate }) {
  return (
    <div className="py-2.5 border-b border-slate-200 flex justify-between items-center">
      <span className="text-[12px] font-extrabold text-brand-teal uppercase tracking-wide">
        Client Confirmed
      </span>
      <button
        onClick={async () => {
          await onUpdate(
            { ...booking, confirmed: !booking.confirmed },
            currentDateStr,
            currentDateStr,
          );
        }}
        className="rounded-lg px-3 py-1 text-xs font-bold cursor-pointer font-inherit transition-all"
        style={{
          background: booking.confirmed ? "#DCFCE7" : "#FEE2E2",
          color: booking.confirmed ? "#16A34A" : "#DC2626",
          border: `1.5px solid ${booking.confirmed ? "#16A34A" : "#DC2626"}`,
        }}
      >
        {booking.confirmed ? "\u2713 Confirmed" : "Not confirmed"}
      </button>
    </div>
  );
}
