import { BRAND } from "../../constants/index.js";
import { SizeTag } from "./SizeTag.jsx";
import { IconTick, IconBlock, IconReopen, IconEdit, IconMessage } from "../icons/index.jsx";

export function Legend() {
  return (
    <div style={{
      display: "flex", flexWrap: "wrap", gap: 14, padding: "10px 16px",
      background: BRAND.offWhite, borderRadius: 10, marginBottom: 16, fontSize: 12, color: BRAND.textLight,
      alignItems: "center",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}><SizeTag size="small" legendMode /> Small</div>
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}><SizeTag size="medium" legendMode /> Medium</div>
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}><SizeTag size="large" legendMode /> Large</div>
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}><IconTick /> Available</div>
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}><IconBlock /> Blocked</div>
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}><IconReopen /> Re-open</div>
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}><IconEdit /> Edit</div>
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}><IconMessage /> Message</div>
    </div>
  );
}
