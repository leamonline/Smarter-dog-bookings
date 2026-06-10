import { useState, useMemo, useEffect } from "react";
import { AccessibleModal } from "../shared/AccessibleModal.tsx";
import { ConfirmDialog } from "../shared/ConfirmDialog.jsx";
import { SALON_SLOTS, SIZE_THEME, SIZE_FALLBACK } from "../../constants/index";
import { canBookSlot, isCapacityRejection } from "../../engine/capacity";
import { isDateOpen } from "../../engine/utils";
import { toDateStr } from "../../supabase/transforms";

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function formatDay(date) {
  return date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function RescheduleModal({
  booking,
  currentDateObj,
  bookingsByDate,
  daySettings,
  dayOpenState,
  sizeTheme,
  onConfirm,
  onClose,
}) {
  const theme = sizeTheme || SIZE_FALLBACK;

  // Next 7 days starting tomorrow
  const days = useMemo(() => {
    const result = [];
    for (let i = 1; i <= 7; i++) {
      const d = addDays(currentDateObj, i);
      const dateStr = toDateStr(d);
      // Open/closed via the shared resolver (explicit override >
      // daySettings.isOpen > weekday default). settings still supplies the
      // slot overrides/extras for the picker below.
      const settings = daySettings?.[dateStr] || { overrides: {}, extraSlots: [] };
      const isOpen = isDateOpen(dateStr, dayOpenState, daySettings);

      result.push({ date: d, dateStr, settings, isOpen });
    }
    return result;
  }, [currentDateObj, daySettings, dayOpenState]);

  const [selectedDateStr, setSelectedDateStr] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [pendingOverride, setPendingOverride] = useState(null);
  // shape: { dateStr: string, slot: string, reason: string }

  const selectedDay = days.find((d) => d.dateStr === selectedDateStr);

  // If the chosen day flips closed while the modal is open (e.g. a staff
  // member closes it elsewhere), drop the held slot so we can't confirm a
  // reschedule onto a closed day.
  useEffect(() => {
    if (selectedSlot && selectedDay && !selectedDay.isOpen) {
      setSelectedSlot(null);
    }
  }, [selectedSlot, selectedDay]);

  // Slots split into two lists: directly bookable (green), and
  // capacity-blocked but staff-overridable (amber). Data-integrity
  // rejections (the same dog already booked in that slot) stay hidden
  // because the override doesn't apply to them.
  const { availableSlots, overrideSlots } = useMemo(() => {
    if (!selectedDay || !selectedDay.isOpen) {
      return { availableSlots: [], overrideSlots: [] };
    }
    const activeSlots = [
      ...SALON_SLOTS,
      ...(selectedDay.settings.extraSlots || []),
    ];
    const dayBookings = bookingsByDate[selectedDay.dateStr] || [];

    const ok = [];
    const overrideable = [];
    for (const slot of activeSlots) {
      const result = canBookSlot(dayBookings, slot, booking.size, activeSlots, {
        overrides: selectedDay.settings.overrides?.[slot] || {},
        dogId: booking._dogId,
        staffOverride: true,
      });
      if (result.allowed) {
        ok.push(slot);
      } else if (isCapacityRejection(result.reason)) {
        overrideable.push({ slot, reason: result.reason });
      }
    }
    return { availableSlots: ok, overrideSlots: overrideable };
  }, [selectedDay, bookingsByDate, booking.size, booking._dogId]);

  const pickSlot = (slot) => {
    setSelectedSlot(slot);
  };

  const pickOverrideSlot = (slot, reason) => {
    setPendingOverride({ dateStr: selectedDateStr, slot, reason });
  };

  const handleConfirm = () => {
    if (!selectedDateStr || !selectedSlot || !selectedDay?.isOpen) return;
    onConfirm(selectedDateStr, selectedSlot);
  };

  const confirmOverride = () => {
    const { dateStr, slot } = pendingOverride;
    setPendingOverride(null);
    onConfirm(dateStr, slot, { capacityOverride: true });
  };

  return (
    <AccessibleModal
      onClose={onClose}
      titleId="reschedule-title"
      className="bg-white rounded-2xl w-[min(420px,95vw)] max-h-[85vh] overflow-auto shadow-modal"
    >
      <div className="px-6 py-5">
        <h2
          id="reschedule-title"
          className="text-lg font-extrabold text-slate-800 mb-1"
        >
          Reschedule — {booking.dogName}
        </h2>
        <p className="text-[13px] text-slate-500 mb-5">
          Pick a new day and time slot.
        </p>

        {/* Day picker */}
        <div className="text-[12px] font-extrabold text-slate-500 uppercase tracking-wide mb-2">
          Day
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(105px,1fr))] gap-1.5 mb-5">
          {days.map((day) => {
            const isSelected = day.dateStr === selectedDateStr;
            return (
              <button
                key={day.dateStr}
                onClick={() => {
                  setSelectedDateStr(day.dateStr);
                  setSelectedSlot(null);
                }}
                disabled={!day.isOpen}
                className="py-2.5 px-2 rounded-lg text-[13px] font-semibold text-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer font-inherit border-[1.5px]"
                style={{
                  background: isSelected ? theme.primary : "#FFFFFF",
                  color: isSelected ? theme.headerText : "#1F2937",
                  borderColor: isSelected ? theme.primary : "#E5E7EB",
                }}
              >
                {formatDay(day.date)}
              </button>
            );
          })}
        </div>

        {/* Slot picker */}
        {selectedDay && (
          !selectedDay.isOpen ? (
            <div
              role="status"
              className="mb-5 py-2.5 px-3 rounded-lg bg-brand-coral-light text-brand-coral text-xs font-bold"
            >
              This day is now closed. Pick another date.
            </div>
          ) : (
          <>
            <div className="text-[12px] font-extrabold text-slate-500 uppercase tracking-wide mb-2">
              Available Slots
            </div>
            {availableSlots.length === 0 && overrideSlots.length === 0 ? (
              <p className="text-[13px] text-brand-coral font-semibold mb-5">
                No available slots on this day.
              </p>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(70px,1fr))] gap-1.5 mb-5">
                {availableSlots.map((slot) => {
                  const isSelected = slot === selectedSlot;
                  return (
                    <button
                      key={slot}
                      onClick={() => pickSlot(slot)}
                      className="py-2 rounded-lg text-[13px] font-semibold text-center cursor-pointer font-inherit border-[1.5px] transition-colors"
                      style={{
                        background: isSelected ? theme.primary : "#FFFFFF",
                        color: isSelected ? theme.headerText : "#1F2937",
                        borderColor: isSelected ? theme.primary : "#E5E7EB",
                      }}
                    >
                      {slot}
                    </button>
                  );
                })}
                {overrideSlots.map(({ slot, reason }) => (
                  <button
                    key={slot}
                    onClick={() => pickOverrideSlot(slot, reason)}
                    title={`${reason}. Click to override.`}
                    aria-label={`${slot} — over capacity, click to override`}
                    className="py-2 rounded-lg text-[13px] font-semibold text-center cursor-pointer font-inherit border-[1.5px] transition-colors"
                    style={{
                      background: "#FFFBEB",
                      color: "#92400E",
                      borderColor: "#F59E0B",
                    }}
                  >
                    {slot}
                    <div className="text-[9px] font-bold mt-0.5 leading-none">over</div>
                  </button>
                ))}
              </div>
            )}
          </>
          )
        )}

        {/* Actions */}
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-control border-[1.5px] border-slate-200 bg-white text-slate-800 text-[13px] font-bold cursor-pointer font-inherit"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedDateStr || !selectedSlot}
            className="px-5 py-2.5 rounded-control border-none text-white text-[13px] font-bold cursor-pointer font-inherit disabled:cursor-not-allowed disabled:bg-slate-300 transition-colors"
            style={{
              background:
                selectedDateStr && selectedSlot ? theme.primary : undefined,
            }}
          >
            Confirm Reschedule
          </button>
        </div>
      </div>

      {pendingOverride && (
        <ConfirmDialog
          title="This time is fully booked"
          message={`${pendingOverride.reason}. Override and reschedule anyway?`}
          confirmLabel="Override and reschedule"
          cancelLabel="Pick another time"
          variant="primary"
          onConfirm={confirmOverride}
          onCancel={() => setPendingOverride(null)}
        />
      )}
    </AccessibleModal>
  );
}
