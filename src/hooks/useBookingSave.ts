import { useCallback, useState } from "react";
import { canBookSlot, isCapacityRejection } from "../engine/capacity";
import {
  getHumanByIdOrName,
  normalizeServiceForSize,
} from "../engine/bookingRules";
import { formatFullDate } from "../engine/utils";
import { toDateStr } from "../supabase/transforms";
import type { SlotOverrides, Human, Booking } from "../types/index";

interface EditData {
  service: string;
  pickupBy: string;
  payment: string;
  depositAmount: number;
  groomNotes: string;
  alerts: string[];
  addons: string[];
  date: Date;
  slot: string;
  customPrice: number;
}

interface EditSettings {
  isOpen?: boolean;
  overrides?: Record<string, Record<string, unknown>>;
  extraSlots?: string[];
}

interface AllowedService {
  id: string;
  [key: string]: unknown;
}

/**
 * The booking shape handed to onUpdate: the app Booking with the edited
 * fields applied. `service` widens to string because normalizeServiceForSize
 * returns a plain string, and `staff_capacity_override` is the snake_case
 * flag read by useBookings.updateBooking (and stamped by the capacity
 * trigger) — it is not part of the app-shaped Booking.
 */
type BookingUpdate = Omit<Booking, "service"> & {
  service: string;
  staff_capacity_override?: boolean;
};

interface UseBookingSaveParams {
  editData: EditData;
  setSaving: (v: boolean) => void;
  setSaveError: (v: string) => void;
  setIsEditing: (v: boolean) => void;
  hasAllergy: boolean;
  allergyInput: string;
  booking: Booking;
  humans: Record<string, Human>;
  currentDateObj: Date;
  currentDateStr: string;
  editDayOpen: boolean;
  editSettings: EditSettings;
  editActiveSlots: string[];
  otherBookings: Booking[];
  allowedServices: AllowedService[];
  // Both callbacks resolve to the saved record on success and null on
  // failure — runSave only inspects truthiness, so `unknown` is enough.
  onUpdate: (booking: BookingUpdate, fromDateStr: string, toDateStr: string) => Promise<unknown>;
  onUpdateDog: (
    dogIdOrName: string,
    updates: { alerts: string[]; groomNotes: string; customPrice: number },
  ) => Promise<unknown>;
}

export function useBookingSave({
  editData,
  setSaving,
  setSaveError,
  setIsEditing,
  hasAllergy,
  allergyInput,
  booking,
  humans,
  currentDateObj,
  currentDateStr,
  editDayOpen,
  editSettings,
  editActiveSlots,
  otherBookings,
  allowedServices,
  onUpdate,
  onUpdateDog,
}: UseBookingSaveParams) {
  // pendingOverride is null in the happy path. Populated when canBookSlot
  // returns a capacity-class rejection: the BookingDetailModal renders a
  // ConfirmDialog using this state, then calls confirmOverride to retry
  // the save with staff_capacity_override stamped on the booking.
  const [pendingOverride, setPendingOverride] = useState<{ reason: string } | null>(null);

  const runSave = useCallback(
    async (capacityOverride: boolean) => {
      if (!editData.slot) {
        setSaveError("Select a drop-off time");
        return;
      }

      if (!editDayOpen) {
        setSaveError("This day is currently closed");
        return;
      }

      const normalizedService = normalizeServiceForSize(
        editData.service,
        booking.size,
      );

      if (!allowedServices.some((service) => service.id === normalizedService)) {
        setSaveError("Select a valid service for this dog size");
        return;
      }

      const slotCheck = canBookSlot(
        otherBookings,
        editData.slot,
        booking.size,
        editActiveSlots,
        {
          overrides: (editSettings.overrides?.[editData.slot] || {}) as SlotOverrides,
          dogId: booking._dogId,
          staffOverride: capacityOverride
            ? { approval: true, capacity: true }
            : true,
        },
      );

      if (!slotCheck.allowed) {
        if (!capacityOverride && isCapacityRejection(slotCheck.reason)) {
          // Surface the override popup; BookingDetailModal will render
          // the ConfirmDialog and call confirmOverride if staff confirms.
          setPendingOverride({ reason: slotCheck.reason || "Slot unavailable" });
          return;
        }
        setSaveError(slotCheck.reason || "Slot unavailable");
        return;
      }

      setSaving(true);
      setSaveError("");

      let finalNotes = editData.groomNotes || "";
      const originalDateDisplay = formatFullDate(currentDateObj);
      const newDateDisplay = formatFullDate(editData.date);

      if (
        originalDateDisplay !== newDateDisplay ||
        booking.slot !== editData.slot
      ) {
        const stamp = `\n\n[Booking moved by Staff from ${originalDateDisplay} at ${booking.slot} to ${newDateDisplay} at ${editData.slot}]`;
        finalNotes += stamp;
      }

      const finalAlerts = editData.alerts.filter(
        (a) => !a.startsWith("Allergic to "),
      );
      if (hasAllergy && allergyInput.trim()) {
        finalAlerts.push(`Allergic to ${allergyInput.trim()}`);
      }

      const dogUpdateResult = await onUpdateDog(
        booking._dogId || booking.dogName,
        {
          alerts: finalAlerts,
          groomNotes: finalNotes,
          customPrice: Number(editData.customPrice || 0),
        },
      );

      // Loose equality on purpose: useDogs.updateDog resolves to undefined
      // for an unknown dog and null for a failed save — both must stop the
      // booking write, or the save proceeds with the dog edits silently lost.
      if (dogUpdateResult == null) {
        setSaving(false);
        setSaveError("Could not update dog details");
        return;
      }

      const newDateStr = toDateStr(editData.date);
      // Resolve the chosen pick-up human ONCE and write BOTH the display
      // name and the id. updateBooking persists pickup_by_id from
      // `_pickupById` first (falling back to a name lookup), so without
      // refreshing the id here the stale spread `_pickupById` would win and
      // the new pick-up selection would never persist.
      const pickedPickup = getHumanByIdOrName(humans, editData.pickupBy);
      const updateResult = await onUpdate(
        {
          ...booking,
          service: normalizedService,
          addons: editData.addons,
          pickupBy: pickedPickup?.fullName || editData.pickupBy,
          _pickupById: pickedPickup?.id ?? null,
          payment: editData.payment,
          depositAmount: editData.payment === "Deposit Paid" ? editData.depositAmount : null,
          slot: editData.slot,
          ...(capacityOverride ? { staff_capacity_override: true } : {}),
        },
        currentDateStr,
        newDateStr,
      );

      if (!updateResult) {
        setSaving(false);
        setSaveError("Could not save booking changes");
        return;
      }

      setSaving(false);
      setIsEditing(false);
    },
    [
      editData,
      setSaving,
      setSaveError,
      setIsEditing,
      hasAllergy,
      allergyInput,
      booking,
      humans,
      currentDateObj,
      currentDateStr,
      editDayOpen,
      editSettings,
      editActiveSlots,
      otherBookings,
      allowedServices,
      onUpdate,
      onUpdateDog,
    ],
  );

  const save = useCallback(() => runSave(false), [runSave]);
  const confirmOverride = useCallback(() => {
    setPendingOverride(null);
    return runSave(true);
  }, [runSave]);
  const cancelOverride = useCallback(() => setPendingOverride(null), []);

  return { save, pendingOverride, confirmOverride, cancelOverride };
}
