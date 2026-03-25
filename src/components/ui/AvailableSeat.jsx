import { BRAND } from "../../constants/index.js";
import { IconTick, IconPlus, IconBlock } from "../icons/index.jsx";
import { StaffIconBtn } from "./StaffIconBtn.jsx";

const SEAT_ROW_STYLE = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  borderRadius: 10, padding: "6px 10px", minHeight: 42, boxSizing: "border-box",
};

export function AvailableSeat({ onAddBooking, onBlock }) {
  return (
    <div style={{ ...SEAT_ROW_STYLE, background: BRAND.blueLight, border: `1.5px solid #8AD8EE` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 28, minWidth: 28, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><IconTick size={16} /></div>
        <span style={{ fontSize: 12, fontWeight: 600, color: BRAND.blueDark }}>Available</span>
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        <StaffIconBtn icon={<IconPlus />} title="Add appointment" onClick={onAddBooking} />
        <StaffIconBtn icon={<IconBlock />} title="Block appointment" onClick={onBlock} />
      </div>
    </div>
  );
}
