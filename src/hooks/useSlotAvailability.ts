import { useMemo } from "react";
import { canBookSlot } from "../engine/capacity";
import { buildSlotGrid } from "../engine/slotGrid";
import type { Booking, DogSize, SlotOverrides } from "../types/index";

interface EditSettings {
  isOpen?: boolean;
  overrides?: Record<string, SlotOverrides>;
  extraSlots?: string[];
}

interface UseSlotAvailabilityInput {
  editSettings: EditSettings;
  otherBookings: Booking[];
  bookingSize: DogSize;
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
    () => buildSlotGrid(editSettings.extraSlots || []),
    [editSettings.extraSlots],
  );

  const availableSlots = useMemo(() => {
    return editActiveSlots.filter((slot) => {
      const check = canBookSlot(
        otherBookings,
        slot,
        bookingSize,
        editActiveSlots,
        {
          overrides: editSettings.overrides?.[slot] || {},
          dogId: bookingDogId,
          staffOverride: true,
        },
      );
      return check.allowed;
    });
  }, [otherBookings, bookingSize, editActiveSlots, editSettings.overrides, bookingDogId]);

  const currentSlotStillValid = useMemo(() => {
    if (!bookingSlot) return false;
    const check = canBookSlot(
      otherBookings,
      bookingSlot,
      bookingSize,
      editActiveSlots,
      {
        overrides: editSettings.overrides?.[bookingSlot] || {},
        dogId: bookingDogId,
        staffOverride: true,
      },
    );
    return check.allowed;
  }, [otherBookings, bookingSize, editActiveSlots, editSettings.overrides, bookingSlot, bookingDogId]);

  return { editActiveSlots, availableSlots, currentSlotStillValid };
}
