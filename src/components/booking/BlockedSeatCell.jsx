// src/components/booking/BlockedSeatCell.jsx
export function BlockedSeatCell({ onClick, span }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Blocked seat, activate to unblock"
      title="Click to unblock"
      className={[
        "tap-target w-full group border-[1.5px] border-slate-200 rounded-xl flex flex-col items-center justify-center gap-0.5 cursor-pointer motion-safe:transition-all motion-safe:duration-200 min-h-[92px] md:min-h-[112px] bg-slate-50 text-slate-400 hover:border-brand-coral hover:text-brand-coral hover:bg-brand-coral/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-coral focus-visible:ring-offset-1 font-[inherit]",
        span ? "col-span-2" : "",
      ].join(" ")}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="transition-transform duration-200 group-hover:scale-110">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
        <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span className="text-[10px] font-semibold">
        <span className="group-hover:hidden">Blocked</span>
        <span className="hidden group-hover:inline">Unblock</span>
      </span>
    </button>
  );
}
