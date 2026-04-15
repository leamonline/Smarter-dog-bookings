// src/components/booking/BlockedSeatCell.jsx
export function BlockedSeatCell({ onClick, span }) {
  return (
    <div
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick?.(); } }}
      role="button"
      tabIndex={0}
      aria-label="Unblock this seat"
      className={[
        "border-[1.5px] border-slate-200 rounded-xl flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-all min-h-[36px] md:min-h-[44px] bg-slate-50 text-slate-400 hover:border-brand-coral hover:text-brand-coral hover:bg-brand-coral/[0.04] focus:outline-none focus:ring-2 focus:ring-brand-coral focus:ring-offset-1",
        span ? "col-span-2" : "",
      ].join(" ")}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
        <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span className="text-[10px] font-semibold">Blocked</span>
    </div>
  );
}
