// A booking whose status maps to no zone has nowhere to stand on the board —
// so it must not silently vanish. This names each one and offers a way to fix
// it. A dog that disappears from the day because of a bad status value is a
// welfare problem, not a rendering one.
//
// Deliberately one quiet line per booking rather than a panel: it has to be
// impossible to miss, but it must not out-shout the board it is warning
// about. Exceptions expand — they do not take the stage.
import { AlertTriangle } from "lucide-react";

function safeDogName(booking, resolve) {
  const display = resolve(booking);
  const candidates = [display?.dogName, booking.dogName, booking.dogNameSnapshot];
  const privateIds = new Set([booking.id, booking._dogId, booking._ownerId].filter(Boolean));
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;
  return candidates.find((candidate) => {
    const value = String(candidate || "").trim();
    return value && !privateIds.has(value) && !uuidPattern.test(value);
  }) || "Unknown dog";
}

export function UnknownStatusRecovery({ bookings, resolve, onOpenBooking }) {
  if (!bookings || bookings.length === 0) return null;

  return (
    <section
      role="alert"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-brand-coral/25 bg-brand-coral/[0.05] px-3 py-1.5"
    >
      <h2 className="inline-flex items-center gap-1.5 text-[12px] font-bold text-brand-coral-text">
        <AlertTriangle size={14} aria-hidden="true" className="shrink-0" />
        {bookings.length === 1
          ? "1 booking needs its status fixed"
          : `${bookings.length} bookings need their status fixed`}
        <span className="font-medium text-slate-500">— it has no place on the board</span>
      </h2>
      <ul className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
        {bookings.map((booking) => {
          const dogName = safeDogName(booking, resolve);
          const time = booking.slot || "Time missing";
          return (
            <li key={booking.id}>
              <button
                type="button"
                aria-label={`Fix ${dogName}'s ${time} booking`}
                onClick={() => onOpenBooking?.(booking.id)}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-control px-2 text-[12px] font-bold text-brand-purple underline decoration-brand-purple/30 underline-offset-2 outline-none transition-colors hover:bg-white/70 hover:decoration-brand-purple focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2"
              >
                {dogName}
                <span aria-hidden="true" className="font-medium text-slate-500">{time}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
