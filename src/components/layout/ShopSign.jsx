// src/components/layout/ShopSign.jsx
import { BRAND } from "../../constants/index.js";

export function ShopSign({ isOpen }) {
  const colour = isOpen ? BRAND.openGreen : BRAND.closedRed;
  const label = isOpen ? "Open" : "Closed";

  return (
    <div style={{ transform: "rotate(-4deg)", flexShrink: 0 }}>
      <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center" }}>
        {/* Hook */}
        <div style={{
          width: 18, height: 9,
          border: "2px solid rgba(255,255,255,0.25)",
          borderBottom: "none",
          borderRadius: "9px 9px 0 0",
          marginBottom: -2,
        }} />
        {/* Sign body */}
        <div style={{
          background: colour, borderRadius: 10,
          padding: "7px 22px",
          fontSize: 15, fontWeight: 900, color: BRAND.white,
          letterSpacing: 2, textTransform: "uppercase",
          boxShadow: `0 3px 10px ${isOpen ? "rgba(22,163,74,0.35)" : "rgba(220,38,38,0.35)"}, inset 0 1px 0 rgba(255,255,255,0.2)`,
          border: "2px solid rgba(255,255,255,0.15)",
          position: "relative",
        }}>
          {/* Shine */}
          <div style={{
            position: "absolute", top: 3, left: 8, right: 8,
            height: 3, background: "rgba(255,255,255,0.15)", borderRadius: 3,
          }} />
          {label}
        </div>
      </div>
    </div>
  );
}
