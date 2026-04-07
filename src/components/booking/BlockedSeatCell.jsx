// src/components/booking/BlockedSeatCell.jsx
import { BRAND } from "../../constants/index.js";

export function BlockedSeatCell({ onClick, span }) {
  return (
    <div
      onClick={onClick}
      style={{
        border: `2px dashed ${BRAND.coral}`,
        borderRadius: 12,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        transition: "all 0.15s",
        minHeight: 80,
        background: "rgba(232, 86, 127, 0.04)",
        ...(span ? { gridColumn: "2 / 4" } : {}),
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = BRAND.closedRed;
        e.currentTarget.style.background = "rgba(232, 86, 127, 0.08)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = BRAND.coral;
        e.currentTarget.style.background = "rgba(232, 86, 127, 0.04)";
      }}
    >
      {/* Block icon — circle with diagonal strike */}
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke={BRAND.coral} strokeWidth="2" />
        <line x1="6" y1="6" x2="18" y2="18" stroke={BRAND.coral} strokeWidth="2" strokeLinecap="round" />
      </svg>
    </div>
  );
}
