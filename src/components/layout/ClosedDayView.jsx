export function ClosedDayView({ onOpen }) {
  return (
    <div className="py-12 px-4 text-center bg-slate-50 rounded-b-xl border border-slate-200 border-t-0">
      <div className="text-[40px] mb-3">{"\uD83D\uDC3E"}</div>
      <div className="text-base font-semibold text-slate-800 mb-1">Salon closed</div>
      <div className="text-[13px] text-slate-500 leading-relaxed mb-4">
        No appointments on this day.
      </div>
      <button
        onClick={onOpen}
        className="btn btn-primary focus:outline-none focus:ring-2 focus:ring-brand-cyan focus:ring-offset-2"
      >
        Open this day
      </button>
    </div>
  );
}
