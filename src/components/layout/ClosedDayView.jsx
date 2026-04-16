export function ClosedDayView({ onOpen }) {
  return (
    <div className="py-12 px-4 text-center bg-slate-50 rounded-b-xl border border-slate-200 border-t-0">
      <svg className="w-10 h-10 mx-auto mb-3 text-slate-300" viewBox="0 0 24 24" fill="currentColor"><ellipse cx="8" cy="6" rx="2.5" ry="3" /><ellipse cx="16" cy="6" rx="2.5" ry="3" /><ellipse cx="4.5" cy="12" rx="2" ry="2.5" /><ellipse cx="19.5" cy="12" rx="2" ry="2.5" /><ellipse cx="12" cy="16.5" rx="5" ry="4" /></svg>
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
