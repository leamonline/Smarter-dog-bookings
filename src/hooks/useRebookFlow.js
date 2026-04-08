import { useCallback } from "react";
import { SALON_SLOTS } from "../constants/index.js";
import { canBookSlot } from "../engine/capacity.js";
import { toDateStr } from "../supabase/transforms.js";
import { getDefaultOpenForDate } from "../engine/utils.js";

export function useRebookFlow({ currentDateObj, daySettings, dayOpenState, bookingsByDate, setRebookData, setShowRebookDatePicker }) {
  const handleOpenRebook = useCallback(
    (booking) => {
      const targetDate = currentDateObj;
      const targetDateStr = toDateStr(targetDate);
      const targetSettings = daySettings[targetDateStr] || {
        isOpen:
          dayOpenState[targetDateStr] ?? getDefaultOpenForDate(targetDate),
        overrides: {},
        extraSlots: [],
      };
      const targetSlots = [
        ...SALON_SLOTS,
        ...(targetSettings.extraSlots || []),
      ];
      const targetBookings = bookingsByDate[targetDateStr] || [];

      const defaultSlot =
        targetSlots.find(
          (slot) =>
            canBookSlot(targetBookings, slot, booking.size, targetSlots, {
              overrides: targetSettings.overrides?.[slot] || {},
            }).allowed,
        ) || "";

      setRebookData({
        ...booking,
        date: targetDate,
        dateStr: targetDateStr,
        slot: defaultSlot,
        status: "No-show",
        payment: "Due at Pick-up",
        confirmed: false,
      });
      setShowRebookDatePicker(false);
    },
    [currentDateObj, daySettings, dayOpenState, bookingsByDate, setRebookData, setShowRebookDatePicker],
  );

  return { handleOpenRebook };
}
