import { BRAND } from "../../constants/index.js";

export function CalendarDate({ dayName, dayNum, monthShort, year, onClick }) {
  return (
    <div onClick={onClick} style={{
      width: 62, borderRadius: 8, overflow: "hidden",
      boxShadow: "0 2px 8px rgba(0,0,0,0.15)", flexShrink: 0,
      cursor: "pointer", transition: "transform 0.15s",
    }}
    onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.05)"; }}
    onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}>
      <div style={{
        background: BRAND.coral, padding: "4px 0", display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 9, fontWeight: 800, color: BRAND.white, letterSpacing: 1.2, textTransform: "uppercase",
      }}>{dayName}</div>
      <div style={{
        background: BRAND.white, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", padding: "6px 0 5px",
      }}>
        <div style={{ fontSize: 26, fontWeight: 800, color: BRAND.text, lineHeight: 1 }}>{dayNum}</div>
        <div style={{ fontSize: 9, color: BRAND.textLight, fontWeight: 700, marginTop: 2, letterSpacing: 0.5 }}>{monthShort} {year}</div>
      </div>
    </div>
  );
}
