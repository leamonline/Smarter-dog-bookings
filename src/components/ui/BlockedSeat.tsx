import { BRAND } from "../../constants/index.ts";
import { IconBlock, IconPlus, IconReopen } from "../icons/index.tsx";
import { StaffIconBtn } from "./StaffIconBtn.tsx";

const SEAT_ROW_STYLE: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  borderRadius: 10, padding: "6px 10px", minHeight: 42, boxSizing: "border-box",
};

interface Props {
  onOpen: () => void;
  onAddBooking: () => void;
}

export function BlockedSeat({ onOpen, onAddBooking }: Props) {
  return (
    <div style={{ ...SEAT_ROW_STYLE, background: BRAND.offWhite, border: `1.5px solid ${BRAND.greyLight}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 28, minWidth: 28, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><IconBlock size={16} /></div>
        <span style={{ fontSize: 12, fontWeight: 600, color: BRAND.coral }}>Blocked</span>
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        <StaffIconBtn icon={<IconPlus />} title="Add appointment" onClick={onAddBooking} />
        <StaffIconBtn icon={<IconReopen />} title="Re-open appointment" onClick={onOpen} />
      </div>
    </div>
  );
}
