import { useMemo } from "react";
import { canBookSlot } from "../engine/capacity.js";
import { SALON_SLOTS } from "../constants/index.js";

interface SlotOverrides {
  [slot: string]: Record<string, unknown>;
}

interface EditSettings {
  isOpen?: boolean;
  overrides?: SlotOverrides;
  extraSlots?: string[];
}

interface UseSlotAvailabilityInput {
  editDateStr: string;
  editSettings: EditSettings;
  editDayOpen: boolean;
  otherBookings: unknown[];
  bookingSize: string;
  bookingSlot: string;
  isEditing: boolean;
}

interface UseSlotAvailabilityReturn {
  editActiveSlots: string[];
  availableSlots: string[];
  currentSlotStillValid: boolean;
}

export function useSlotAvailability({
  editSettings,
  otherBookings,
  bookingSize,
  bookingSlot,
}: UseSlotAvailabilityInput): UseSlotAvailabilityReturn {
  const editActiveSlots = useMemo(
    () => [...SALON_SLOTS, ...(editSettings.extraSlots || [])],
    [editSettings.extraSlots],
  );

  const availableSlots = useMemo(() => {
    return editActiveSlots.filter((slot) => {
      const check = canBookSlot(
        otherBookings as any[],
        slot,
        bookingSize as any,
        editActiveSlots,
        {
          overrides: editSettings.overrides?.[slot] || {},
        },
      );
      return check.allowed;
    });
  }, [otherBookings, bookingSize, editActiveSlots, editSettings.overrides]);

  const currentSlotStillValid = useMemo(() => {
    if (!bookingSlot) return false;
    const check = canBookSlot(
      otherBookings as any[],
      bookingSlot,
      bookingSize as any,
      editActiveSlots,
      {
        overrides: editSettings.overrides?.[bookingSlot] || {},
      },
    );
    return check.allowed;
  }, [otherBookings, bookingSize, editActiveSlots, editSettings.overrides, bookingSlot]);

  return { editActiveSlots, availableSlots, currentSlotStillValid };
}
