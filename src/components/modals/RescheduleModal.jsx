import { useState, useMemo } from "react";
import { AccessibleModal } from "../shared/AccessibleModal.tsx";
import { SALON_SLOTS, SIZE_THEME, SIZE_FALLBACK } from "../../constants/index.js";
import { canBookSlot } from "../../engine/capacity.js";
import { getDefaultOpenForDate } from "../../engine/utils.js";
import { toDateStr } from "../../supabase/transforms.js";

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
      const settings = daySettings?.[dateStr] || {
        isOpen:
          dayOpenState?.[dateStr] !== undefined
            ? dayOpenState[dateStr]
            : getDefaultOpenForDate(d),
        overrides: {},
        extraSlots: [],
      };
      const isOpen =
        dayOpenState?.[dateStr] !== undefined
          ? dayOpenState[dateStr]
          : settings.isOpen;

      result.push({ date: d, dateStr, settings, isOpen });
    }
    return result;
  }, [currentDateObj, daySettings, dayOpenState]);

  const [selectedDateStr, setSelectedDateStr] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);

  const selectedDay = days.find((d) => d.dateStr === selectedDateStr);

  const availableSlots = useMemo(() => {
    if (!selectedDay || !selectedDay.isOpen) return [];
    const activeSlots = [
      ...SALON_SLOTS,
      ...(selectedDay.settings.extraSlots || []),
    ];
    const dayBookings = bookingsByDate[selectedDay.dateStr] || [];

    return activeSlots.filter((slot) => {
      const result = canBookSlot(dayBookings, slot, booking.size, activeSlots, {
        overrides: selectedDay.settings.overrides?.[slot] || {},
      });
      return result.allowed;
    });
  }, [selectedDay, bookingsByDate, booking.size]);

  const handleConfirm = () => {
    if (!selectedDateStr || !selectedSlot) return;
    onConfirm(selectedDateStr, selectedSlot);
  };

  return (
    <AccessibleModal
      onClose={onClose}
      titleId="reschedule-title"
      className="bg-white rounded-2xl w-[min(420px,95vw)] max-h-[85vh] overflow-auto shadow-[0_8px_32px_rgba(0,0,0,0.18)]"
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
          <>
            <div className="text-[12px] font-extrabold text-slate-500 uppercase tracking-wide mb-2">
              Available Slots
            </div>
            {availableSlots.length === 0 ? (
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
                      onClick={() => setSelectedSlot(slot)}
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
              </div>
            )}
          </>
        )}

        {/* Actions */}
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-[10px] border-[1.5px] border-slate-200 bg-white text-slate-800 text-[13px] font-bold cursor-pointer font-inherit"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedDateStr || !selectedSlot}
            className="px-5 py-2.5 rounded-[10px] border-none text-white text-[13px] font-bold cursor-pointer font-inherit disabled:cursor-not-allowed disabled:bg-slate-300 transition-colors"
            style={{
              background:
                selectedDateStr && selectedSlot ? theme.primary : undefined,
            }}
          >
            Confirm Reschedule
          </button>
        </div>
      </div>
    </AccessibleModal>
  );
}
