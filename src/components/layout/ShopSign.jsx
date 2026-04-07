// src/components/layout/ShopSign.jsx
import { BRAND } from "../../constants/index.js";

export function ShopSign({ isOpen }) {
  const colour = isOpen ? BRAND.openGreen : BRAND.closedRed;
  const label = isOpen ? "Open" : "Closed";
  const shadowColour = isOpen ? "rgba(22,163,74,0.35)" : "rgba(220,38,38,0.35)";

  return (
    <div className="transform -rotate-[4deg] shrink-0">
      <div className="inline-flex flex-col items-center">
        {/* Hook */}
        <div className="w-[18px] h-[9px] border-2 border-white/25 border-b-0 rounded-t-[9px] -mb-0.5" />
        {/* Sign body */}
        <div
          className="rounded-[10px] px-[22px] py-[7px] text-[15px] font-black text-white uppercase tracking-[2px] border-2 border-white/15 relative"
          style={{
            background: colour,
            boxShadow: `0 3px 10px ${shadowColour}, inset 0 1px 0 rgba(255,255,255,0.2)`,
          }}
        >
          {/* Shine */}
          <div className="absolute top-[3px] left-2 right-2 h-[3px] bg-white/15 rounded-full" />
          {label}
        </div>
      </div>
    </div>
  );
}
