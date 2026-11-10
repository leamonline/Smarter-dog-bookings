import { useState, useMemo, useEffect } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { HeaderIconButton } from "./shell/index.js";
import { SIZE_FALLBACK, isActiveBooking } from "../../constants/index";
import { buildSlotGrid } from "../../engine/slotGrid";
import { canBookSlot, isCapacityRejection } from "../../engine/capacity";
import { getDefaultOpenForDate } from "../../engine/utils";
import { DAY_CAPACITY } from "../../engine/utilisation";
import { toDateStr } from "../../supabase/transforms";
import { useMonthBookings } from "../../supabase/hooks/useMonthBookings";
import { useMonthDaySettings } from "../../supabase/hooks/useMonthDaySettings";
import { useStaffAvailability } from "../../supabase/hooks/useStaffAvailability";
import { Button, IconButton, ModalShell } from "../ui";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function buildMonthGrid(year, month) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startDay = first.getDay() === 0 ? 6 : first.getDay() - 1; // Monday-first
  const monthName = first.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const rows = [];
  let week = new Array(startDay).fill(null);
  for (let d = 1; d <= last.getDate(); d++) {
    week.push(new Date(year, month, d));
    if (week.length === 7) { rows.push(week); week = []; }
  }
  if (week.length > 0) { while (week.length < 7) week.push(null); rows.push(week); }
  return { weeks: rows, monthName };
}

function formatDayLong(dateStr) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long",
  });
}

/**
 * The day's occupancy with the booking being moved taken out. The occupancy
 * read carries only (slot, size) per booking and no ids, so on the booking's
 * own day its seat looks like somebody else's and it competes with itself.
 * A cancelled or no-show booking holds no seat, so nothing is removed for it.
 */
function withoutBookingBeingMoved(dayBookings, booking) {
  if (!isActiveBooking(booking.status)) return dayBookings;
  const index = dayBookings.findIndex((b) => b.slot === booking.slot && b.size === booking.size);
  return index === -1 ? dayBookings : dayBookings.filter((_, i) => i !== index);
}

/**
 * Staff reschedule picker. A month calendar drives the day choice — only
 * available days (open + under capacity) are green/bold/selectable; closed,
 * fully-booked or past days are greyed out. Picking a day reveals the times,
 * with free slots selectable and fully-booked slots greyed. Because this is
 * the staff surface, a greyed (full) slot is still clickable: selecting it
 * marks the reschedule as an overbook (red, "Overbook" tag) and confirming
 * sends capacityOverride so the booking-update trigger stamps the override.
 */
export function RescheduleModal({ booking, currentDateObj, sizeTheme, onConfirm, onClose }) {
  const theme = sizeTheme || SIZE_FALLBACK;
  const todayStr = toDateStr(new Date());
  const bookingDateStr = booking._bookingDate || toDateStr(currentDateObj);

  const [viewYear, setViewYear] = useState(currentDateObj.getFullYear());
  const [viewMonth, setViewMonth] = useState(currentDateObj.getMonth());
  const { monthBookingsByDate, monthBookingsLoading } = useMonthBookings(viewYear, viewMonth);
  const { monthDaySettings, monthDayOpenState, monthDaySettingsLoading } =
    useMonthDaySettings(viewYear, viewMonth);
  const monthLoading = monthBookingsLoading || monthDaySettingsLoading;

  const { weeks, monthName } = useMemo(() => buildMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);
  const goMonth = (offset) => {
    const d = new Date(viewYear, viewMonth + offset, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };

  const [selectedDateStr, setSelectedDateStr] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null); // { slot, overbook }

  // Detailed slot occupancy for the chosen day (the month hooks only carry
  // per-day counts, not per-slot detail) via the get_slot_occupancy RPC.
  const availability = useStaffAvailability();
  const [dayBookings, setDayBookings] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  // A failed read is not an empty day. Showing its empty list would offer
  // every time as free, and staff saves are not held back by the capacity
  // gate, so the picker says it could not check and offers nothing.
  const [slotsError, setSlotsError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    setSlotsError(false);
    if (!selectedDateStr) { setDayBookings([]); return; }
    let cancelled = false;
    (async () => {
      setSlotsLoading(true);
      if (!availability.connected) { setDayBookings([]); setSlotsLoading(false); return; }
      let result;
      try {
        result = await availability.loadDayOccupancy(selectedDateStr);
      } catch (error) {
        result = { bookings: [], error };
      }
      if (cancelled) return;
      setDayBookings(result.error ? [] : result.bookings);
      setSlotsError(Boolean(result.error));
      setSlotsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [selectedDateStr, availability, reloadKey]);

  // Calendar day state. Past / closed / fully-booked → greyed (not selectable).
  const dayStatus = (date) => {
    const dateStr = toDateStr(date);
    if (dateStr < todayStr) return "past";
    if (monthLoading) return "loading";
    const isOpen = monthDayOpenState[dateStr] ?? getDefaultOpenForDate(date);
    if (!isOpen) return "closed";
    // The booking being moved already has its place on its own day.
    const count = (monthBookingsByDate[dateStr] || [])
      .filter((b) => !(dateStr === bookingDateStr && b.id === booking.id)).length;
    if (count >= DAY_CAPACITY) return "full";
    return "available";
  };

  // Per-slot states for the chosen day: available (free) or full (overbookable).
  // Data-integrity rejections (the same dog already in that slot) stay hidden.
  const slotStates = useMemo(() => {
    if (!selectedDateStr || slotsError) return [];
    const occupancy = selectedDateStr === bookingDateStr
      ? withoutBookingBeingMoved(dayBookings, booking)
      : dayBookings;
    const settings = monthDaySettings[selectedDateStr] || { overrides: {}, extraSlots: [] };
    const activeSlots = buildSlotGrid(settings.extraSlots || []);
    const out = [];
    for (const slot of activeSlots) {
      const result = canBookSlot(occupancy, slot, booking.size, activeSlots, {
        overrides: settings.overrides?.[slot] || {},
        dogId: booking._dogId,
        staffOverride: true,
      });
      if (result.allowed) out.push({ slot, state: "available" });
      else if (isCapacityRejection(result.reason)) out.push({ slot, state: "full" });
    }
    return out;
  }, [selectedDateStr, slotsError, bookingDateStr, monthDaySettings, dayBookings, booking]);

  const pickDay = (dateStr) => {
    setSelectedDateStr(dateStr);
    setSelectedSlot(null);
  };

  const handleConfirm = () => {
    if (!selectedDateStr || !selectedSlot) return;
    onConfirm(selectedDateStr, selectedSlot.slot, selectedSlot.overbook ? { capacityOverride: true } : {});
  };

  return (
    <ModalShell
      onClose={onClose}
      titleId="reschedule-title"
      accent={theme.primary}
      widthClass="w-[min(440px,95vw)]"
      maxHeightClass="max-h-[88vh]"
      bodyClassName="px-6 pt-4 pb-3"
      header={
        <header className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 bg-[var(--color-brand-paper)]">
          <div className="flex-1 min-w-0">
            <span className="text-label text-ink-muted">
              Move booking
            </span>
            <h2
              id="reschedule-title"
              className="text-xl md:text-2xl font-bold font-display text-brand-ink leading-tight mt-1 truncate"
            >
              {booking.dogName}
            </h2>
          </div>
          <HeaderIconButton label="Close" onClick={onClose}>
            <X size={16} strokeWidth={2.2} aria-hidden="true" />
          </HeaderIconButton>
        </header>
      }
      footer={
        <div className="border-t border-slate-100 bg-white px-5 py-3 flex items-center gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 max-sm:min-h-[44px] rounded-control border-[1.5px] border-slate-200 bg-white text-slate-600 text-sm font-bold cursor-pointer font-inherit transition-colors hover:bg-slate-50 inline-flex items-center justify-center"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!selectedDateStr || !selectedSlot}
            className="ml-auto px-5 py-2 max-sm:min-h-[44px] rounded-full border-none bg-action text-on-action text-sm font-bold cursor-pointer font-inherit transition-colors hover:bg-brand-yellow-dark disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 inline-flex items-center justify-center"
          >
            {selectedSlot?.overbook ? "Overbook & Move" : "Confirm Move"}
          </button>
        </div>
      }
    >
        <p className="text-body text-slate-500 mb-4">
          Pick an available day, then a time. Fully-booked times can be overbooked.
        </p>

        {/* Month calendar */}
        <div className="flex items-center justify-between mb-2">
          <IconButton label="Previous month" onClick={() => goMonth(-1)}>
            <ChevronLeft size={18} strokeWidth={2.5} />
          </IconButton>
          <div className="text-sm font-bold text-slate-800">{monthName}</div>
          <IconButton label="Next month" onClick={() => goMonth(1)}>
            <ChevronRight size={18} strokeWidth={2.5} />
          </IconButton>
        </div>
        <div className="grid grid-cols-7 gap-1 mb-1" aria-hidden="true">
          {WEEKDAYS.map((d) => (
            <div key={d} className="text-center text-micro font-bold text-slate-400">{d}</div>
          ))}
        </div>
        <div role="grid" aria-label="Choose a day" className="grid grid-cols-7 gap-1">
          {weeks.flat().map((date, i) => {
            if (!date) return <div key={`e-${i}`} />;
            const dateStr = toDateStr(date);
            const status = dayStatus(date);
            const selectable = status === "available";
            const isSelected = dateStr === selectedDateStr;
            const stateWord =
              status === "available" ? "available"
                : status === "full" ? "fully booked"
                  : status === "closed" ? "closed"
                    : status === "past" ? "in the past" : "";
            return (
              <button
                key={dateStr}
                type="button"
                disabled={!selectable}
                aria-pressed={isSelected}
                aria-label={`${date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}${stateWord ? `, ${stateWord}` : ""}`}
                onClick={() => pickDay(dateStr)}
                className={`aspect-square rounded-lg text-body font-bold flex items-center justify-center border transition-colors ${
                  isSelected
                    ? "border-transparent"
                    : selectable
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200 cursor-pointer hover:bg-emerald-100"
                      : "bg-transparent text-slate-300 border-transparent cursor-not-allowed"
                }`}
                style={isSelected ? { background: theme.primary, color: theme.headerText } : undefined}
              >
                {date.getDate()}
              </button>
            );
          })}
        </div>

        {/* Times for the chosen day */}
        {selectedDateStr && (
          <div className="mt-5">
            <div className="text-xs font-extrabold text-slate-500 uppercase tracking-wide mb-2">
              Times — {formatDayLong(selectedDateStr)}
            </div>
            {slotsLoading ? (
              <div className="text-body text-slate-400 py-2" role="status">Checking availability…</div>
            ) : slotsError ? (
              <div role="alert" className="text-body text-brand-coral font-semibold py-1">
                Couldn't check this day's times, so none are shown.{" "}
                <Button variant="link" size="sm" onClick={() => setReloadKey((key) => key + 1)}>
                  Try again
                </Button>
              </div>
            ) : slotStates.length === 0 ? (
              <p className="text-body text-brand-coral font-semibold py-1">No times available on this day.</p>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(76px,1fr))] gap-1.5">
                {slotStates.map(({ slot, state }) => {
                  const isSel = selectedSlot?.slot === slot;
                  const overbook = state === "full";
                  return (
                    <button
                      key={slot}
                      type="button"
                      aria-pressed={isSel}
                      aria-label={`${slot}${overbook ? ", fully booked, select to overbook" : ""}`}
                      onClick={() => setSelectedSlot({ slot, overbook })}
                      className={`min-h-[44px] py-2 px-1 rounded-lg text-body font-semibold border-[1.5px] inline-flex flex-col items-center justify-center cursor-pointer transition-colors ${
                        isSel && overbook
                          ? "bg-red-50 text-red-700 border-red-400"
                          : isSel
                            ? "border-transparent"
                            : overbook
                              ? "bg-slate-50 text-slate-400 border-slate-200 hover:border-slate-300"
                              : "bg-white text-slate-800 border-emerald-200 hover:border-emerald-400"
                      }`}
                      style={isSel && !overbook ? { background: theme.primary, color: theme.headerText, borderColor: theme.primary } : undefined}
                    >
                      {slot}
                      {isSel && overbook && (
                        <span className="text-[9px] font-extrabold uppercase tracking-wide leading-none mt-0.5">
                          Overbook
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
    </ModalShell>
  );
}
