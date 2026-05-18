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
  const hasAnyOverrideEligible = slotStates.some(s => s.status === "full");
  // Empty-state only kicks in when there's literally nothing to pick — every
  // slot is "already-booked" (data-integrity, not overridable). Full slots
  // still render so staff can opt to override capacity.
  if (!hasAnyAvailable && !hasAnyOverrideEligible) {
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
        const isOverrideEligible = status === "full";

        // Visual hierarchy: available > override-eligible (amber, capacity rule
        // can be overridden by staff) > already-booked (greyed, data integrity,
        // not overridable).
        const isClickable = isAvailable || isOverrideEligible;

        const baseStyle = {
          borderColor: isSelected
            ? sizeTheme.gradient[0]
            : isOverrideEligible
              ? "#F59E0B"
              : "#E5E7EB",
          background: isSelected
            ? sizeTheme.gradient[0]
            : isOverrideEligible
              ? "#FFFBEB"
              : "#FFFFFF",
          color: isSelected
            ? sizeTheme.headerText
            : isAvailable
              ? "#1F2937"
              : isOverrideEligible
                ? "#92400E"
                : "#94A3B8",
          opacity: isClickable || isSelected ? 1 : 0.7,
          cursor: isClickable ? "pointer" : "not-allowed",
        };

        return (
          <button
            key={slot}
            type="button"
            onClick={() => isClickable && onSelectSlot(slot)}
            disabled={!isClickable}
            title={
              isOverrideEligible
                ? `${reason}. Click to override.`
                : isAlreadyBooked
                  ? reason
                  : undefined
            }
            aria-disabled={!isClickable}
            aria-label={
              isOverrideEligible
                ? `${displayTime} — over capacity, click to override`
                : isAlreadyBooked
                  ? `${displayTime} — ${reason}`
                  : displayTime
            }
            className="py-2.5 rounded-[10px] border-2 text-sm font-bold font-inherit transition-all text-center"
            style={baseStyle}
            onMouseEnter={(e) => {
              if (isAvailable && !isSelected) {
                e.currentTarget.style.borderColor = sizeTheme.gradient[0];
                e.currentTarget.style.background = sizeTheme.light;
              } else if (isOverrideEligible && !isSelected) {
                e.currentTarget.style.background = "#FEF3C7";
              }
            }}
            onMouseLeave={(e) => {
              if (isAvailable && !isSelected) {
                e.currentTarget.style.borderColor = "#E5E7EB";
                e.currentTarget.style.background = "#FFFFFF";
              } else if (isOverrideEligible && !isSelected) {
                e.currentTarget.style.background = "#FFFBEB";
              }
            }}
          >
            {displayTime}
            {isOverrideEligible && (
              <div className="text-[9px] font-semibold mt-0.5 leading-none">over</div>
            )}
          </button>
        );
      })}
    </div>
  );
}
