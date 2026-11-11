import { AvailabilityCalendar } from "./AvailabilityCalendar.jsx";
import { TimeSlotPicker } from "./TimeSlotPicker.jsx";
import { isDateOpen } from "./helpers.js";
import { useState } from "react";
import { Button } from "../../ui";

export function BookingFormFields({
  hasDogs,
  bookingsByDate,
  dayOpenState,
  daySettings,
  selectedDateStr,
  selectedDateDisplay,
  selectedSlot,
  selectedSlotLabel,
  selectedDogs,
  recurringWeeks,
  setRecurringWeeks,
  primaryTheme,
  onSelectDate,
  onSelectSlot,
  children,
}) {
  const selectedDayOpen = isDateOpen(selectedDateStr, dayOpenState);
  const [editingDateTime, setEditingDateTime] = useState(false);
  const compact = selectedDateStr && selectedSlot && selectedDayOpen && !editingDateTime;
  return (
    <div className="px-6 py-4 pb-5 flex flex-col gap-4">

      {hasDogs && compact && (
        <section aria-label="Selected appointment time" className="rounded-card border border-brand-paper-line bg-white p-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold text-brand-ink">
            {selectedDateDisplay} · {selectedSlotLabel || selectedSlot}
          </div>
          <Button variant="ghost" type="button" onClick={() => setEditingDateTime(true)}>Change date or time</Button>
        </section>
      )}

      {hasDogs && editingDateTime && selectedSlot && selectedDayOpen && (
        <Button variant="ghost" type="button" onClick={() => setEditingDateTime(false)}>Keep selected date and time</Button>
      )}

      {/* ─── STEP 2: Date Selection ─── */}
      {hasDogs && !compact && (
        <div className="rounded-card border border-brand-paper-line bg-white p-3">
          <label className="text-caption font-extrabold text-brand-teal-text uppercase tracking-wide block mb-1.5">Choose a Date</label>
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
      {selectedDateStr && hasDogs && !compact && (
        <div className="rounded-card border border-brand-paper-line bg-white p-3">
          <label className="text-caption font-extrabold text-brand-teal-text uppercase tracking-wide block mb-1.5">
            Available Times — {selectedDateDisplay}
          </label>
          {selectedDayOpen ? (
            <TimeSlotPicker
              dateStr={selectedDateStr}
              bookingsByDate={bookingsByDate}
              daySettings={daySettings}
              selectedDogs={selectedDogs}
              onSelectSlot={(slot) => { onSelectSlot(slot); setEditingDateTime(false); }}
              selectedSlot={selectedSlot}
              sizeTheme={primaryTheme}
            />
          ) : (
            <div role="status" aria-live="polite" className="text-body font-semibold text-brand-coral bg-brand-coral-light px-3.5 py-2.5 rounded-control">
              We're closed that day. Pick another date from the calendar, or open the day in day view first.
            </div>
          )}
        </div>
      )}

      {/* ─── STEP 4: Recurring (Optional) ─── */}
      {hasDogs && selectedDateStr && selectedSlot && (
        <div>
          <label htmlFor="recurring-weeks-select" className="text-caption font-extrabold text-brand-teal-text uppercase tracking-wide block mb-1.5">Repeat Booking (Optional)</label>
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
            <div className="mt-2 text-body text-brand-teal-text font-semibold">
              This will generate bookings for the rest of the year. If a day is full, that slot will be skipped.
            </div>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
