import { BRAND } from "../../constants/index.js";
import { SizeTag } from "./SizeTag.jsx";
import { IconTick, IconBlock, IconReopen, IconEdit, IconMessage } from "../icons/index.jsx";

export function Legend() {
  const item = { display: "flex", alignItems: "center", gap: 5 };
  return (
    <div style={{
      display: "flex", flexWrap: "wrap", padding: "10px 16px",
      background: BRAND.offWhite, borderRadius: 10, marginBottom: 16, fontSize: 12, color: BRAND.textLight,
      alignItems: "center", justifyContent: "space-between",
    }}>
      <div style={item}><SizeTag size="small" legendMode /> Small</div>
      <div style={item}><SizeTag size="medium" legendMode /> Medium</div>
      <div style={item}><SizeTag size="large" legendMode /> Large</div>
      <div style={item}><IconTick /> Available</div>
      <div style={item}><IconBlock /> Blocked</div>
      <div style={item}><IconReopen /> Re-open</div>
      <div style={item}><IconEdit /> Edit</div>
      <div style={item}><IconMessage /> Message</div>
    </div>
  );
}
