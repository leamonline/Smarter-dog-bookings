import { SALON_SLOTS } from "../../../constants/index.js";
import { computeSlotCapacities, canBookSlot } from "../../../engine/capacity.js";

export function TimeSlotPicker({ dateStr, bookingsByDate, daySettings, selectedDogs, onSelectSlot, selectedSlot, sizeTheme }) {
  const dayBookings = bookingsByDate?.[dateStr] || [];
  const settings = daySettings?.[dateStr];
  const activeSlots = [...SALON_SLOTS, ...(settings?.extraSlots || [])];
  const capacities = computeSlotCapacities(dayBookings, activeSlots);

  // Compute every slot's state up front. Slots are NEVER filtered out
  // — a slot the user previously clicked must stay visible (disabled
  // with a tooltip) so they don't think their pick disappeared.
  const slotStates = activeSlots.map(slot => {
    const cap = capacities[slot];
    if (!cap || cap.available <= 0) {
      return { slot, status: "full", reason: "No capacity in this slot" };
    }
    let simulated = [...dayBookings];
    let status = "available";
    let reason = "";
    let blockedDogName = "";
    for (const dog of selectedDogs) {
      const check = canBookSlot(simulated, slot, dog.size, activeSlots, {
        dogId: dog.id,
        staffOverride: true,
      });
      if (!check.allowed) {
        if (check.reason === "This dog is already booked in this slot") {
          status = "already-booked";
          reason = `Already booked for ${dog.name || "this dog"}`;
          blockedDogName = dog.name || "";
        } else {
          status = "full";
          reason = check.reason || "Slot can't fit this booking";
        }
        break;
      }
      simulated = [...simulated, { slot, size: dog.size, id: `sim-${dog.id}`, _dogId: dog.id }];
    }
    return { slot, status, reason, blockedDogName };
  });

  const hasAnyAvailable = slotStates.some(s => s.status === "available");
  if (!hasAnyAvailable && slotStates.every(s => s.status === "full")) {
    return (
      <div className="text-[13px] text-slate-500 text-center py-3">
        No available slots for this size on this date.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-2">
      {slotStates.map(({ slot, status, reason }) => {
        const hour = parseInt(slot.split(":")[0]);
        const min = parseInt(slot.split(":")[1]);
        const displayTime = `${hour > 12 ? hour - 12 : hour}:${min.toString().padStart(2, "0")}${hour >= 12 ? "pm" : "am"}`;
        const isSelected = slot === selectedSlot;
        const isAvailable = status === "available";
        const isAlreadyBooked = status === "already-booked";

        // Visual hierarchy: available > already-booked (greyed but visible)
        // > full (hidden from the grid via opacity but still mounted, so the
        // user can scan for slot positions).
        if (status === "full" && !isSelected) {
          // Don't show fully-full slots unless they were previously selected.
          return null;
        }

        const baseStyle = {
          borderColor: isSelected ? sizeTheme.gradient[0] : "#E5E7EB",
          background: isSelected ? sizeTheme.gradient[0] : "#FFFFFF",
          color: isSelected ? sizeTheme.headerText : isAvailable ? "#1F2937" : "#94A3B8",
          opacity: isAvailable || isSelected ? 1 : 0.7,
          cursor: isAvailable ? "pointer" : "not-allowed",
        };

        return (
          <button
            key={slot}
            type="button"
            onClick={() => isAvailable && onSelectSlot(slot)}
            disabled={!isAvailable}
            title={isAlreadyBooked ? reason : undefined}
            aria-disabled={!isAvailable}
            aria-label={isAlreadyBooked ? `${displayTime} — ${reason}` : displayTime}
            className="py-2.5 rounded-[10px] border-2 text-sm font-bold font-inherit transition-all text-center"
            style={baseStyle}
            onMouseEnter={(e) => { if (isAvailable && !isSelected) { e.currentTarget.style.borderColor = sizeTheme.gradient[0]; e.currentTarget.style.background = sizeTheme.light; } }}
            onMouseLeave={(e) => { if (isAvailable && !isSelected) { e.currentTarget.style.borderColor = "#E5E7EB"; e.currentTarget.style.background = "#FFFFFF"; } }}
          >
            {displayTime}
          </button>
        );
      })}
    </div>
  );
}
