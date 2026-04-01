import { BRAND, BOOKING_STATUSES } from "../../../constants/index.js";

export function BookingStatusBar({ booking, currentDateStr, onUpdate }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
        {BOOKING_STATUSES.map((status) => {
          const currentStatus = booking.status || "Not Arrived";
          const isActive = currentStatus === status.id;
          const currentIdx = BOOKING_STATUSES.findIndex(
            (st) => st.id === currentStatus,
          );
          const thisIdx = BOOKING_STATUSES.findIndex(
            (st) => st.id === status.id,
          );
          const isPast = thisIdx < currentIdx;

          return (
            <button
              key={status.id}
              onClick={async () => {
                if (!isActive) {
                  await onUpdate(
                    { ...booking, status: status.id },
                    currentDateStr,
                    currentDateStr,
                  );
                }
              }}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                cursor: isActive ? "default" : "pointer",
                background: isActive
                  ? status.bg
                  : isPast
                    ? "#F9FAFB"
                    : BRAND.white,
                color: isActive
                  ? status.color
                  : isPast
                    ? BRAND.textLight
                    : BRAND.grey,
                border: isActive
                  ? `2px solid ${status.color}`
                  : `1px solid ${BRAND.greyLight}`,
                transition: "all 0.15s",
                opacity: isPast ? 0.6 : 1,
              }}
            >
              {isActive ? "\u25CF " : ""}
              {status.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ClientConfirmedToggle({ booking, currentDateStr, onUpdate }) {
  return (
    <div
      style={{
        padding: "10px 0",
        borderBottom: `1px solid ${BRAND.greyLight}`,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 800, color: BRAND.blueDark, textTransform: "uppercase", letterSpacing: 0.5 }}>
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
        style={{
          background: booking.confirmed
            ? BRAND.openGreenBg
            : BRAND.closedRedBg,
          color: booking.confirmed ? BRAND.openGreen : BRAND.closedRed,
          border: `1.5px solid ${
            booking.confirmed ? BRAND.openGreen : BRAND.closedRed
          }`,
          borderRadius: 8,
          padding: "4px 12px",
          fontSize: 12,
          fontWeight: 700,
          cursor: "pointer",
          fontFamily: "inherit",
          transition: "all 0.15s",
        }}
      >
        {booking.confirmed ? "\u2713 Confirmed" : "Not confirmed"}
      </button>
    </div>
  );
}
