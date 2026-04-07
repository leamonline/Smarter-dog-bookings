import { useState } from "react";
import { BRAND } from "../../constants/index.js";

function BlockMenu({ onBlock1, onBlock2, onBlockBoth, onClose }) {
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute", top: "50%", left: "50%",
        transform: "translate(-50%, -50%)",
        background: BRAND.white, borderRadius: 10,
        boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
        border: `1.5px solid ${BRAND.greyLight}`,
        padding: 8, display: "flex", flexDirection: "column", gap: 4,
        zIndex: 10, minWidth: 140,
      }}
    >
      {[
        { label: "Block seat 1", action: onBlock1 },
        { label: "Block seat 2", action: onBlock2 },
        { label: "Block both", action: onBlockBoth },
      ].map(({ label, action }) => (
        <button
          key={label}
          onClick={() => { action(); onClose(); }}
          style={{
            padding: "6px 12px", borderRadius: 6, border: "none",
            background: "#FDE2E8", color: BRAND.coral,
            fontSize: 12, fontWeight: 700, cursor: "pointer",
            fontFamily: "inherit", transition: "all 0.15s",
            textAlign: "left",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = BRAND.coral; e.currentTarget.style.color = BRAND.white; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "#FDE2E8"; e.currentTarget.style.color = BRAND.coral; }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

const ICON_BTN = {
  width: 32, height: 32, borderRadius: 8, border: "none",
  display: "flex", alignItems: "center", justifyContent: "center",
  cursor: "pointer", transition: "all 0.15s", fontFamily: "inherit",
};

export function GhostSeat({ onClick, onBlock, span }) {
  const [showMenu, setShowMenu] = useState(false);

  // Simple ghost seat without blocking (e.g., rebook modal)
  if (!onBlock) {
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

  // Ghost seat with block button
  return (
    <div
      style={{
        border: `2px dashed ${BRAND.greyLight}`, borderRadius: 12,
        display: "flex", alignItems: "center", justifyContent: "center",
        gap: 8, transition: "all 0.15s", minHeight: 80,
        position: "relative",
        ...(span ? { gridColumn: "2 / 4" } : {}),
      }}
    >
      {/* Book button */}
      <button
        onClick={onClick}
        style={{
          ...ICON_BTN,
          background: "#F0FAFF", color: BRAND.blue,
          fontSize: 18, fontWeight: 700,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = BRAND.blue; e.currentTarget.style.color = BRAND.white; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "#F0FAFF"; e.currentTarget.style.color = BRAND.blue; }}
      >
        +
      </button>

      {/* Block button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (span) {
            setShowMenu(true);
          } else {
            onBlock();
          }
        }}
        style={{
          ...ICON_BTN,
          background: "#FDE2E8", color: BRAND.coral,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = BRAND.coral; e.currentTarget.style.color = BRAND.white; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "#FDE2E8"; e.currentTarget.style.color = BRAND.coral; }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" />
          <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      </button>

      {/* Block menu for spanning ghost seats */}
      {showMenu && (
        <BlockMenu
          onBlock1={() => onBlock(0)}
          onBlock2={() => onBlock(1)}
          onBlockBoth={() => { onBlock(0); onBlock(1); }}
          onClose={() => setShowMenu(false)}
        />
      )}
    </div>
  );
}
