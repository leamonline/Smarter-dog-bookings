import { BRAND } from "../../constants/index.js";

export function GhostSeat({ onClick, span }) {
  return (
    <div
      onClick={onClick}
      style={{
        border: `2px dashed ${BRAND.greyLight}`, borderRadius: 12,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#D1D5DB", fontSize: 22, cursor: "pointer",
        transition: "all 0.15s", minHeight: 80,
        ...(span ? { gridColumn: "2 / 4" } : {}),
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = BRAND.blue;
        e.currentTarget.style.color = BRAND.blue;
        e.currentTarget.style.background = "#F0FAFF";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = BRAND.greyLight;
        e.currentTarget.style.color = "#D1D5DB";
        e.currentTarget.style.background = "transparent";
      }}
    >
      +
    </div>
  );
}
