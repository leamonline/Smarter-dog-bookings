import { useMemo } from "react";
import { canBookSlot } from "../engine/capacity.js";
import { SALON_SLOTS } from "../constants/index.js";
import type { SlotOverrides } from "../types/index.js";

interface EditSettings {
  isOpen?: boolean;
  overrides?: Record<string, SlotOverrides>;
  extraSlots?: string[];
}

interface UseSlotAvailabilityInput {
  editSettings: EditSettings;
  otherBookings: unknown[];
  bookingSize: string;
  bookingSlot: string;
  bookingDogId?: string | null;
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
  bookingDogId,
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
          dogId: bookingDogId,
        },
      );
      return check.allowed;
    });
  }, [otherBookings, bookingSize, editActiveSlots, editSettings.overrides, bookingDogId]);

  const currentSlotStillValid = useMemo(() => {
    if (!bookingSlot) return false;
    const check = canBookSlot(
      otherBookings as any[],
      bookingSlot,
      bookingSize as any,
      editActiveSlots,
      {
        overrides: editSettings.overrides?.[bookingSlot] || {},
        dogId: bookingDogId,
      },
    );
    return check.allowed;
  }, [otherBookings, bookingSize, editActiveSlots, editSettings.overrides, bookingSlot, bookingDogId]);

  return { editActiveSlots, availableSlots, currentSlotStillValid };
}
