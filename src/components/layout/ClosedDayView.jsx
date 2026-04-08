export function ClosedDayView({ onOpen }) {
  return (
    <div className="py-12 px-4 text-center bg-slate-50 rounded-b-[14px] border border-slate-200 border-t-0">
      <div className="text-[40px] mb-3">{"\uD83D\uDC3E"}</div>
      <div className="text-base font-semibold text-slate-800 mb-1">Salon closed</div>
      <div className="text-[13px] text-slate-500 leading-relaxed mb-4">
        No appointments on this day.
      </div>
      <button
        onClick={onOpen}
        className="bg-brand-blue text-white border-none rounded-[10px] py-2.5 px-6 text-[13px] font-semibold cursor-pointer font-[inherit] transition-all hover:bg-brand-blue-dark"
      >
        Open this day
      </button>
    </div>
  );
}
