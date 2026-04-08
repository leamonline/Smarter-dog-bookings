// src/components/layout/ShopSign.jsx

export function ShopSign({ isOpen }) {
  return (
    <div className="transform -rotate-[4deg] shrink-0">
      <div className="inline-flex flex-col items-center">
        {/* Hook */}
        <div className="w-[18px] h-[9px] border-2 border-white/25 border-b-0 rounded-t-[9px] -mb-0.5" />
        {/* Sign body */}
        <div
          className={`rounded-[10px] px-[22px] py-[7px] text-[15px] font-black text-white uppercase tracking-[2px] border-2 border-white/15 relative ${
            isOpen
              ? "bg-brand-green shadow-[0_3px_10px_rgba(22,163,74,0.35),inset_0_1px_0_rgba(255,255,255,0.2)]"
              : "bg-brand-red shadow-[0_3px_10px_rgba(220,38,38,0.35),inset_0_1px_0_rgba(255,255,255,0.2)]"
          }`}
        >
          {/* Shine */}
          <div className="absolute top-[3px] left-2 right-2 h-[3px] bg-white/15 rounded-full" />
          {isOpen ? "Open" : "Closed"}
        </div>
      </div>
    </div>
  );
}
