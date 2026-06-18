import { useMemo, useState } from "react";
import { ChevronRight, Plus } from "lucide-react";
import { SERVICES, BOOKING_STATUS } from "../../../constants/index";
import { titleCase } from "../../../utils/text";
import { getDogsForHuman } from "../../../utils/directorySearch";

const COLLAPSED_ROWS = 5;

function formatBookingDate(iso) {
  if (!iso) return "";
  // ISO `YYYY-MM-DD` → `DD-MM-YYYY` for the staff-facing UK format.
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const [, y, m, d] = match;
  return `${d}-${m}-${y}`;
}

// Recent-bookings section of the HumanCardModal. Collapsed it shows the
// last five with a "Show all N" affordance (the old cap had no way to
// see the rest); expanded it lists everything and the modal body does
// the scrolling. Rows become buttons when an `onOpenBooking` handler is
// provided. The desktop "New booking" pill lives here — phones get the
// same CTA pinned to the bottom of the sheet instead.
export function HumanBookingHistory({
  human,
  dogs,
  dogsByHumanId,
  bookingsByDate,
  onOpenBooking,
  onBookAgain,
  onNewBookingForHuman,
}) {
  const [expanded, setExpanded] = useState(false);

  const history = useMemo(() => {
    if (!bookingsByDate || !human) return [];

    // Match by dog id, never by name — two owners can each have a "Daisy",
    // and a name match would leak the other owner's grooms onto this card.
    const humanDogIds = new Set(
      getDogsForHuman(human, dogs || {}, dogsByHumanId || {}).map(
        (dog) => dog.id,
      ),
    );

    const entries = [];
    for (const [dateStr, bookings] of Object.entries(bookingsByDate)) {
      for (const booking of bookings) {
        if (humanDogIds.has(booking._dogId) || booking._ownerId === human.id) {
          entries.push({ ...booking, date: dateStr });
        }
      }
    }

    return entries.sort((a, b) => b.date.localeCompare(a.date));
  }, [human, dogs, dogsByHumanId, bookingsByDate]);

  const rows = expanded ? history : history.slice(0, COLLAPSED_ROWS);
  const hasMore = history.length > COLLAPSED_ROWS;

  return (
    <section
      aria-label="Recent bookings"
      className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.04)] overflow-hidden"
    >
      <div className={expanded ? "" : "max-h-40 overflow-y-auto"}>
        <div className="sticky top-0 z-[1] bg-white px-3 py-2 border-b border-slate-200/70 flex items-center justify-between gap-2">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-brand-teal-text/70">
            Recent bookings
            {history.length > 0 && (
              <span className="ml-1.5 text-slate-400 normal-case tracking-normal">
                · {history.length}
              </span>
            )}
          </h3>
          {onNewBookingForHuman && (
            <button
              type="button"
              onClick={() => onNewBookingForHuman(human.id)}
              className="hidden sm:inline-flex items-center gap-1 text-[11px] font-bold bg-action text-on-action px-2.5 py-1 rounded-full border-none cursor-pointer font-inherit hover:bg-brand-yellow-dark transition-colors"
            >
              <Plus size={12} strokeWidth={2.6} aria-hidden="true" />
              New booking
            </button>
          )}
        </div>
        <div className="px-3 py-1">
          {rows.length === 0 ? (
            <div className="text-sm text-slate-400 italic py-1.5">
              No bookings yet.
            </div>
          ) : (
            rows.map((booking, i) => {
              const service = SERVICES.find((s) => s.id === booking.service);
              const canOpen = !!onOpenBooking && !!booking.id;
              const canRebook = !!onBookAgain && !!booking._dogId;
              const label = (
                <>
                  <div className="flex-1 min-w-0 truncate">
                    <span className="font-semibold text-slate-800">
                      {formatBookingDate(booking.date)}
                    </span>
                    <span className="text-slate-500 ml-1.5">
                      {titleCase(booking.dogName)}
                    </span>
                    {service?.name && (
                      <span className="text-slate-500 ml-1">{service.name}</span>
                    )}
                  </div>
                  <span
                    className="font-semibold text-[11px] shrink-0"
                    style={{
                      color:
                        booking.status === BOOKING_STATUS.READY_FOR_PICKUP
                          ? "#16A34A"
                          : "#6B7280",
                    }}
                  >
                    {booking.status}
                  </span>
                </>
              );

              return (
                <div
                  key={`${booking.id || booking.date}-${i}`}
                  className="group/row flex items-center gap-1 border-b border-slate-100 last:border-b-0"
                >
                  {canOpen ? (
                    <button
                      type="button"
                      onClick={() => onOpenBooking(booking.id)}
                      aria-label={`Open booking on ${booking.date} for ${booking.dogName}`}
                      className="flex-1 min-w-0 flex items-center gap-2 py-1.5 px-1 -mx-1 text-xs text-left font-inherit bg-transparent border-none cursor-pointer rounded transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal/60"
                    >
                      {label}
                      <ChevronRight
                        size={13}
                        strokeWidth={2.4}
                        aria-hidden="true"
                        className="shrink-0 text-slate-300 group-hover/row:text-brand-teal transition-colors"
                      />
                    </button>
                  ) : (
                    <div className="flex-1 min-w-0 flex items-center gap-2 py-1.5 text-xs">
                      {label}
                    </div>
                  )}
                  {canRebook && (
                    <button
                      type="button"
                      onClick={() => onBookAgain(booking)}
                      aria-label={`Book ${titleCase(booking.dogName)} again`}
                      title="Book again with the same dog and service"
                      className="shrink-0 text-[11px] font-bold text-brand-teal-text bg-brand-teal/10 border border-brand-teal/30 px-2 py-0.5 rounded-md cursor-pointer hover:bg-brand-teal/20 transition-colors"
                    >
                      Book again
                    </button>
                  )}
                </div>
              );
            })
          )}
          {hasMore && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="w-full text-left text-[12px] font-bold text-brand-teal-text bg-transparent border-none cursor-pointer font-inherit py-2 px-1 -mx-1 hover:text-brand-teal transition-colors"
            >
              {expanded ? "Show fewer" : `Show all ${history.length} →`}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
