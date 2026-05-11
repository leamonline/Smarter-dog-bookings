import { Plus, Clock3, XCircle } from "lucide-react";
import { DogSilhouette } from "../decor/index.jsx";

function formatLong(dateObj) {
  return dateObj.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function EmptyDayPanel({
  currentDateObj,
  onAddBooking,
  onOpenWaitlist,
  onCloseDay,
}) {
  return (
    <section
      aria-label="No bookings today"
      className="relative bg-white rounded-2xl border border-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.04)] p-6 md:p-8 overflow-hidden text-center"
    >
      {/* Soft brand decor */}
      <div className="absolute -right-6 -bottom-8 opacity-[0.08] pointer-events-none" aria-hidden="true">
        {DogSilhouette ? <DogSilhouette width={180} /> : null}
      </div>

      <div className="relative z-[1] max-w-md mx-auto">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-brand-yellow/20 text-brand-purple mb-3">
          <Plus size={22} strokeWidth={2.4} aria-hidden="true" />
        </div>

        <h2 className="text-lg md:text-xl font-bold text-brand-purple font-display mb-1.5">
          No dogs booked for {formatLong(currentDateObj)}
        </h2>
        <p className="text-sm text-slate-600 mb-5">
          You can add a booking, open the waitlist, or close this day if the salon isn't running.
        </p>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={onAddBooking}
            className="btn btn-primary inline-flex items-center justify-center gap-1.5"
          >
            <Plus size={16} strokeWidth={2.5} aria-hidden="true" />
            Add booking
          </button>
          <button
            type="button"
            onClick={onOpenWaitlist}
            className="btn btn-ghost inline-flex items-center justify-center gap-1.5"
          >
            <Clock3 size={15} strokeWidth={2.2} aria-hidden="true" />
            Open waitlist
          </button>
          <button
            type="button"
            onClick={onCloseDay}
            className="text-xs font-semibold text-slate-500 hover:text-brand-coral underline-offset-2 hover:underline cursor-pointer bg-transparent border-none px-2 py-2 font-[inherit] inline-flex items-center gap-1"
          >
            <XCircle size={13} strokeWidth={2.2} aria-hidden="true" />
            Close this day
          </button>
        </div>
      </div>
    </section>
  );
}
