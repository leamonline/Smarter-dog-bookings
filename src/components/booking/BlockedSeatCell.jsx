// src/components/booking/BlockedSeatCell.jsx
export function BlockedSeatCell({ onClick, span }) {
  return (
    <div
      onClick={onClick}
      className={[
        "border-2 border-dashed border-brand-coral rounded-xl flex items-center justify-center cursor-pointer transition-all min-h-[60px] md:min-h-[80px] bg-brand-coral/[0.04] text-brand-coral hover:border-brand-red hover:bg-brand-coral/[0.08]",
        span ? "col-span-2" : "",
      ].join(" ")}
    >
      {/* Block icon — circle with diagonal strike */}
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
        <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </div>
  );
}
