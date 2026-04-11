import { AvailabilityCalendar } from "./AvailabilityCalendar.jsx";
import { TimeSlotPicker } from "./TimeSlotPicker.jsx";

export function BookingFormFields({
  hasDogs,
  dogEntries,
  bookingsByDate,
  dayOpenState,
  daySettings,
  selectedDateStr,
  selectedDateDisplay,
  selectedSlot,
  selectedSizes,
  recurringWeeks,
  setRecurringWeeks,
  primaryTheme,
  error,
  onSelectDate,
  onSelectSlot,
  onConfirm,
  onClose,
}) {
  return (
    <div className="px-6 py-4 pb-5 flex flex-col gap-4 overflow-y-auto flex-1">

      {/* ─── STEP 2: Date Selection ─── */}
      {hasDogs && (
        <div>
          <label className="text-[11px] font-extrabold text-brand-teal uppercase tracking-wide block mb-1.5">Choose a Date</label>
          <AvailabilityCalendar
            bookingsByDate={bookingsByDate}
            dayOpenState={dayOpenState}
            daySettings={daySettings}
            onSelectDate={onSelectDate}
            selectedDateStr={selectedDateStr}
            sizeTheme={primaryTheme}
          />
        </div>
      )}

      {/* ─── STEP 3: Time Slot Selection ─── */}
      {selectedDateStr && hasDogs && (
        <div>
          <label className="text-[11px] font-extrabold text-brand-teal uppercase tracking-wide block mb-1.5">
            Available Times — {selectedDateDisplay}
          </label>
          <TimeSlotPicker
            dateStr={selectedDateStr}
            bookingsByDate={bookingsByDate}
            daySettings={daySettings}
            selectedSizes={selectedSizes}
            onSelectSlot={onSelectSlot}
            selectedSlot={selectedSlot}
            sizeTheme={primaryTheme}
          />
        </div>
      )}

      {/* ─── Error ─── */}
      {error && (
        <div className="text-[13px] text-brand-coral font-semibold bg-brand-coral-light px-3.5 py-2.5 rounded-[10px] mb-4">
          {error}
        </div>
      )}

      {/* ─── STEP 4: Recurring (Optional) ─── */}
      {hasDogs && selectedDateStr && selectedSlot && (
        <div className="mb-4">
          <label className="text-[11px] font-extrabold text-brand-teal uppercase tracking-wide block mb-1.5">Repeat Booking (Optional)</label>
          <select
            value={recurringWeeks}
            onChange={(e) => setRecurringWeeks(Number(e.target.value))}
            className="w-full py-3 px-3.5 rounded-[10px] border-[1.5px] border-slate-200 text-sm font-inherit box-border outline-none text-slate-800 transition-colors cursor-pointer bg-white focus:border-brand-blue"
          >
            <option value={0}>None (Once off)</option>
            <option value={4}>Every 4 weeks</option>
            <option value={6}>Every 6 weeks</option>
            <option value={8}>Every 8 weeks</option>
          </select>
          {recurringWeeks > 0 && (
            <div className="mt-2 text-[13px] text-brand-teal font-semibold">
              This will generate bookings for the rest of the year. If a day is full, that slot will be skipped.
            </div>
          )}
        </div>
      )}

      {/* ─── Actions ─── */}
      <div className="flex gap-2.5">
        {(() => {
          const ready = hasDogs && selectedDateStr && selectedSlot;
          const label = dogEntries.length > 1
            ? `Confirm ${dogEntries.length} Bookings`
            : "Confirm Booking";
          return (
            <button
              onClick={onConfirm}
              disabled={!ready}
              className="flex-1 py-[13px] rounded-xl border-none font-bold text-sm cursor-pointer font-inherit transition-all disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed"
              style={{
                background: ready ? primaryTheme.gradient[0] : undefined,
                color: ready ? primaryTheme.headerText : undefined,
              }}
              onMouseEnter={(e) => { if (ready) e.currentTarget.style.background = primaryTheme.primary; }}
              onMouseLeave={(e) => { if (ready) e.currentTarget.style.background = primaryTheme.gradient[0]; }}
            >
              {label}
            </button>
          );
        })()}
        <button onClick={onClose} className="py-[13px] px-5 rounded-xl border-[1.5px] border-slate-200 bg-white text-slate-500 text-sm font-semibold cursor-pointer font-inherit">Cancel</button>
      </div>
    </div>
  );
}
