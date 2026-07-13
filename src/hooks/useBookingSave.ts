import { useCallback, useState } from "react";
import { canBookSlot, isCapacityRejection } from "../engine/capacity";
import {
  computeBookingPricing,
  getHumanByIdOrName,
  getServicePriceAmount,
  normalizeServiceForSize,
  type PricingConfig,
} from "../engine/bookingRules";
import { formatFullDate } from "../engine/utils";
import { toDateStr } from "../supabase/transforms";
import type { SlotOverrides, Human, Booking, Dog } from "../types/index";

interface EditData {
  service: string;
  pickupBy: string;
  payment: string;
  paymentMethod: string | null;
  paidAmount: number | null;
  depositAmount: number;
  groomNotes: string;
  alerts: string[];
  addons: string[];
  date: Date;
  slot: string;
  price: number;
  saveAsUsual: boolean;
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
  /** The booking's dog ({} when unresolved) — its customPrice anchors the
   *  "does the edited price differ from usual?" decision. */
  dogData: Partial<Dog> | null | undefined;
  humans: Record<string, Human>;
  currentDateObj: Date;
  currentDateStr: string;
  editDayOpen: boolean;
  editSettings: EditSettings;
  editActiveSlots: string[];
  otherBookings: Booking[];
  allowedServices: AllowedService[];
  configPricing?: PricingConfig;
  // Both callbacks resolve to the saved record on success and null on
  // failure — runSave only inspects truthiness, so `unknown` is enough.
  onUpdate: (booking: BookingUpdate, fromDateStr: string, toDateStr: string) => Promise<unknown>;
  onUpdateDog: (
    dogIdOrName: string,
    updates: { alerts: string[]; groomNotes: string; customPrice?: number | null },
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
  dogData,
  humans,
  currentDateObj,
  currentDateStr,
  editDayOpen,
  editSettings,
  editActiveSlots,
  otherBookings,
  allowedServices,
  configPricing,
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

      // ── Price semantics (owner-confirmed, 2026-07-10) ──
      // The edited price is THIS BOOKING's agreed price. It only becomes the
      // dog's usual price when staff explicitly tick "Save as usual price";
      // otherwise a difference from the usual/guide price persists as a
      // per-booking price_override — a matting surcharge today must not
      // silently reprice every future visit (the old behaviour).
      const editedPrice = Number(editData.price);
      if (!(editedPrice > 0)) {
        setSaving(false);
        setSaveError("Enter a price above £0");
        return;
      }
      const editedSubtotal = computeBookingPricing({
        service: normalizedService,
        size: booking.size,
        addons: editData.addons,
        payment: editData.payment,
        depositAmount: editData.depositAmount,
        priceOverride: editedPrice,
        configPricing,
      }).subtotal;
      if (
        editData.payment === "Deposit Paid" &&
        Number(editData.depositAmount) <= 0
      ) {
        setSaving(false);
        setSaveError("Enter a deposit above £0");
        return;
      }
      if (
        editData.payment === "Deposit Paid" &&
        Number(editData.depositAmount) >= editedSubtotal
      ) {
        setSaving(false);
        setSaveError("Deposit must be less than the booking total");
        return;
      }
      const usualPrice =
        dogData?.customPrice != null && Number(dogData.customPrice) > 0
          ? Number(dogData.customPrice)
          : getServicePriceAmount(normalizedService, booking.size, configPricing);
      const priceOverride =
        !editData.saveAsUsual && editedPrice !== usualPrice ? editedPrice : null;

      const dogUpdates: { alerts: string[]; groomNotes: string; customPrice?: number } = {
        alerts: finalAlerts,
        groomNotes: finalNotes,
      };
      if (editData.saveAsUsual) dogUpdates.customPrice = editedPrice;

      const dogUpdateResult = await onUpdateDog(
        booking._dogId || booking.dogName,
        dogUpdates,
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
          // Method + amount travel WITH the Paid-in-Full status or they're
          // silently lost (the ~70%-of-completed-bookings-unpaid problem).
          // Off Paid in Full the DB trigger clears all three ledger fields.
          paymentMethod: editData.payment === "Paid in Full" ? editData.paymentMethod : null,
          paidAmount: editData.payment === "Paid in Full" ? editData.paidAmount : null,
          depositAmount: editData.payment === "Deposit Paid" ? editData.depositAmount : null,
          priceOverride,
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
      dogData,
      humans,
      currentDateObj,
      currentDateStr,
      editDayOpen,
      editSettings,
      editActiveSlots,
      otherBookings,
      allowedServices,
      configPricing,
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
