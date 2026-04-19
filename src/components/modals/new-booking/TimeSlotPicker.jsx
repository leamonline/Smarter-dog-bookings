import { SALON_SLOTS } from "../../../constants/index.js";
import { computeSlotCapacities, canBookSlot } from "../../../engine/capacity.js";

export function TimeSlotPicker({ dateStr, bookingsByDate, daySettings, selectedDogs, onSelectSlot, selectedSlot, sizeTheme }) {
  const dayBookings = bookingsByDate?.[dateStr] || [];
  const settings = daySettings?.[dateStr];
  const activeSlots = [...SALON_SLOTS, ...(settings?.extraSlots || [])];
  const capacities = computeSlotCapacities(dayBookings, activeSlots);

  const availableSlots = activeSlots.filter(slot => {
    const cap = capacities[slot];
    if (!cap || cap.available <= 0) return false;
    // Check that ALL dogs can fit — simulate sequential booking
    let simulated = [...dayBookings];
    for (const dog of selectedDogs) {
      const check = canBookSlot(simulated, slot, dog.size, activeSlots, {
        dogId: dog.id,
      });
      if (!check.allowed) return false;
      simulated = [...simulated, { slot, size: dog.size, id: `sim-${dog.id}`, _dogId: dog.id }];
    }
    return true;
  });

  if (availableSlots.length === 0) {
    return (
      <div className="text-[13px] text-slate-500 text-center py-3">
        No available slots for this size on this date.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-2">
      {availableSlots.map(slot => {
        const hour = parseInt(slot.split(":")[0]);
        const min = parseInt(slot.split(":")[1]);
        const displayTime = `${hour > 12 ? hour - 12 : hour}:${min.toString().padStart(2, "0")}${hour >= 12 ? "pm" : "am"}`;
        const isSelected = slot === selectedSlot;

        return (
          <button
            key={slot}
            onClick={() => onSelectSlot(slot)}
            className="py-2.5 rounded-[10px] border-2 text-sm font-bold cursor-pointer font-inherit transition-all text-center"
            style={{
              borderColor: isSelected ? sizeTheme.gradient[0] : "#E5E7EB",
              background: isSelected ? sizeTheme.gradient[0] : "#FFFFFF",
              color: isSelected ? sizeTheme.headerText : "#1F2937",
            }}
            onMouseEnter={(e) => { if (!isSelected) { e.currentTarget.style.borderColor = sizeTheme.gradient[0]; e.currentTarget.style.background = sizeTheme.light; } }}
            onMouseLeave={(e) => { if (!isSelected) { e.currentTarget.style.borderColor = "#E5E7EB"; e.currentTarget.style.background = "#FFFFFF"; } }}
          >
            {displayTime}
          </button>
        );
      })}
    </div>
  );
}
