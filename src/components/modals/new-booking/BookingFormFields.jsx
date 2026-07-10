import { AvailabilityCalendar } from "./AvailabilityCalendar.jsx";
import { TimeSlotPicker } from "./TimeSlotPicker.jsx";
import { isDateOpen } from "./helpers.js";

export function BookingFormFields({
  hasDogs,
  bookingsByDate,
  dayOpenState,
  daySettings,
  selectedDateStr,
  selectedDateDisplay,
  selectedSlot,
  selectedDogs,
  recurringWeeks,
  setRecurringWeeks,
  primaryTheme,
  onSelectDate,
  onSelectSlot,
}) {
  const selectedDayOpen = isDateOpen(selectedDateStr, dayOpenState);
  return (
    <div className="px-6 py-4 pb-5 flex flex-col gap-4 overflow-y-auto flex-1">

      {/* ─── STEP 2: Date Selection ─── */}
      {hasDogs && (
        <div className="rounded-2xl border border-brand-paper-line bg-white p-3">
          <label className="text-[11px] font-extrabold text-brand-teal-text uppercase tracking-wide block mb-1.5">Choose a Date</label>
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
        <div className="rounded-2xl border border-brand-paper-line bg-white p-3">
          <label className="text-[11px] font-extrabold text-brand-teal-text uppercase tracking-wide block mb-1.5">
            Available Times — {selectedDateDisplay}
          </label>
          {selectedDayOpen ? (
            <TimeSlotPicker
              dateStr={selectedDateStr}
              bookingsByDate={bookingsByDate}
              daySettings={daySettings}
              selectedDogs={selectedDogs}
              onSelectSlot={onSelectSlot}
              selectedSlot={selectedSlot}
              sizeTheme={primaryTheme}
            />
          ) : (
            <div role="status" aria-live="polite" className="text-[13px] font-semibold text-brand-coral bg-brand-coral-light px-3.5 py-2.5 rounded-control">
              We're closed that day. Pick another date from the calendar, or open the day in day view first.
            </div>
          )}
        </div>
      )}

      {/* ─── STEP 4: Recurring (Optional) ─── */}
      {hasDogs && selectedDateStr && selectedSlot && (
        <div>
          <label htmlFor="recurring-weeks-select" className="text-[11px] font-extrabold text-brand-teal-text uppercase tracking-wide block mb-1.5">Repeat Booking (Optional)</label>
          <select
            id="recurring-weeks-select"
            value={recurringWeeks}
            onChange={(e) => setRecurringWeeks(Number(e.target.value))}
            className="w-full py-3 px-3.5 rounded-control border-[1.5px] border-slate-200 text-sm font-inherit box-border outline-none text-slate-800 transition-colors cursor-pointer bg-white focus:border-brand-teal"
          >
            <option value={0}>None (Once off)</option>
            <option value={4}>Every 4 weeks</option>
            <option value={6}>Every 6 weeks</option>
            <option value={8}>Every 8 weeks</option>
          </select>
          {recurringWeeks > 0 && (
            <div className="mt-2 text-[13px] text-brand-teal-text font-semibold">
              This will generate bookings for the rest of the year. If a day is full, that slot will be skipped.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
