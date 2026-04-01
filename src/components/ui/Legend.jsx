import { useState } from "react";
import { BRAND } from "../../constants/index.js";
import { SizeTag } from "./SizeTag.jsx";
import { IconTick, IconBlock, IconReopen, IconEdit, IconMessage } from "../icons/index.jsx";

export function Legend() {
  const [open, setOpen] = useState(false);
  const item = { display: "flex", alignItems: "center", gap: 5 };

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => setOpen((p) => !p)}
        style={{
          width: 32, height: 32, borderRadius: "50%", border: "none",
          background: open ? BRAND.blue : BRAND.offWhite,
          color: open ? BRAND.white : BRAND.textLight,
          fontSize: 16, fontWeight: 800, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all 0.15s", flexShrink: 0,
          boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
        }}
        title="Show legend"
      >
        i
      </button>

      {open && (
        <div style={{
          position: "absolute", top: 38, left: 0, zIndex: 50,
          display: "flex", flexWrap: "wrap", padding: "10px 16px",
          background: BRAND.white, borderRadius: 10, fontSize: 12, color: BRAND.textLight,
          alignItems: "center", justifyContent: "space-between", gap: 10,
          boxShadow: "0 4px 16px rgba(0,0,0,0.12)", minWidth: 340,
          border: `1px solid ${BRAND.greyLight}`,
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
      )}
    </div>
  );
}
