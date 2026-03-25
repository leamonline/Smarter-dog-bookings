import { BRAND } from "../../constants/index.js";

export function ClosedDayView({ onOpen }) {
  return (
    <div style={{
      padding: "48px 16px", textAlign: "center",
      background: BRAND.offWhite, borderRadius: "0 0 14px 14px",
      border: `1px solid ${BRAND.greyLight}`, borderTop: "none",
    }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>{"\uD83D\uDC3E"}</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: BRAND.text, marginBottom: 4 }}>Salon closed</div>
      <div style={{ fontSize: 13, color: BRAND.textLight, lineHeight: 1.5, marginBottom: 16 }}>
        No appointments on this day.
      </div>
      <button onClick={onOpen} style={{
        background: BRAND.blue, color: BRAND.white, border: "none", borderRadius: 10,
        padding: "10px 24px", fontSize: 13, fontWeight: 600, cursor: "pointer",
        fontFamily: "inherit", transition: "all 0.15s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = BRAND.blueDark; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = BRAND.blue; }}>
        Open this day
      </button>
    </div>
  );
}
