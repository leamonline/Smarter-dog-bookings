import { AvailabilityCalendar } from "../new-booking/AvailabilityCalendar.jsx";
import { TimeSlotPicker } from "../new-booking/TimeSlotPicker.jsx";
import { ServiceAddonsPicker } from "./ServiceAddonsPicker.jsx";
import { SIZE_THEME, SIZE_FALLBACK } from "../../../constants/index";
import { isDateOpen } from "../../../engine/utils";

const SIZE_ORDER = { small: 0, medium: 1, large: 2 };

// The calendar/slot capacity preflight wants the BIGGEST dog's theme + the
// dogs' sizes — large dogs cost more capacity. Works off in-state sizes, so
// no dog_id / DB write is needed before the slot is validated.
function largestSize(dogs) {
  return dogs.reduce(
    (acc, d) => ((SIZE_ORDER[d.size] ?? 0) > (SIZE_ORDER[acc] ?? 0) ? d.size : acc),
    "small",
  );
}

// Step 3 — choose which dogs to book now, a service each, then date + slot.
export function StepFirstBooking({
  dogs, selections, onToggleBooked, onServiceChange, onAddonsChange,
  bookingsByDate, dayOpenState, daySettings, dateStr, slot, onSelectDate, onSelectSlot,
}) {
  const booked = dogs.filter((d) => selections[d.clientKey]?.booked);
  const theme = SIZE_THEME[largestSize(booked.length ? booked : dogs)] || SIZE_FALLBACK;
  const selectedDogs = booked.map((d) => ({ id: d.clientKey, size: d.size, name: d.name }));
  const dayOpen = dateStr ? isDateOpen(dateStr, dayOpenState) : false;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-[12px] font-bold text-brand-teal-text mb-1.5">Who's coming in?</div>
        <ul className="flex flex-col gap-2">
          {dogs.map((d) => {
            const sel = selections[d.clientKey] || {};
            return (
              <li key={d.clientKey} className="rounded-lg border border-slate-200 bg-white p-2.5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={!!sel.booked} onChange={() => onToggleBooked(d.clientKey)} />
                  <span className="text-[13px] font-bold text-brand-purple">{d.name}</span>
                  <span className="text-[11px] text-slate-500">
                    {[d.breed, d.size].filter(Boolean).join(" · ")}
                  </span>
                </label>
                {sel.booked && (
                  <div className="mt-2">
                    <ServiceAddonsPicker
                      dogName={d.name}
                      size={d.size}
                      service={sel.service}
                      addons={sel.addons}
                      onServiceChange={(v) => onServiceChange(d.clientKey, v)}
                      onAddonsChange={(a) => onAddonsChange(d.clientKey, a)}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {booked.length === 0 && (
          <div className="text-[12px] text-slate-500 mt-1.5">
            Pick at least one dog to book now. Unticked dogs are still saved — you can book them later.
          </div>
        )}
      </div>

      {booked.length > 0 && (
        <div>
          <div className="text-[12px] font-bold text-brand-teal-text mb-1.5">Choose a date</div>
          <AvailabilityCalendar
            bookingsByDate={bookingsByDate}
            dayOpenState={dayOpenState}
            daySettings={daySettings}
            onSelectDate={onSelectDate}
            selectedDateStr={dateStr}
            sizeTheme={theme}
          />
        </div>
      )}

      {booked.length > 0 && dateStr && (
        <div>
          <div className="text-[12px] font-bold text-brand-teal-text mb-1.5">Available times</div>
          {dayOpen ? (
            <TimeSlotPicker
              dateStr={dateStr}
              bookingsByDate={bookingsByDate}
              daySettings={daySettings}
              selectedDogs={selectedDogs}
              onSelectSlot={onSelectSlot}
              selectedSlot={slot}
              sizeTheme={theme}
            />
          ) : (
            <div role="status" className="text-[13px] font-semibold text-brand-coral bg-brand-coral-light px-3 py-2 rounded-lg">
              The salon's closed that day — pick an open day above.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
