import { useCallback } from "react";
import { canBookSlot } from "../engine/capacity.js";
import {
  getHumanByIdOrName,
  normalizeServiceForSize,
} from "../engine/bookingRules.js";
import { formatFullDate } from "../engine/utils.js";
import { toDateStr } from "../supabase/transforms.js";

interface EditData {
  service: string;
  pickupBy: string;
  payment: string;
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

interface UseBookingSaveParams {
  editData: EditData;
  setSaving: (v: boolean) => void;
  setSaveError: (v: string) => void;
  setIsEditing: (v: boolean) => void;
  hasAllergy: boolean;
  allergyInput: string;
  booking: any;
  humans: any[];
  currentDateObj: Date;
  currentDateStr: string;
  editDayOpen: boolean;
  editSettings: EditSettings;
  editActiveSlots: string[];
  otherBookings: any[];
  allowedServices: AllowedService[];
  onUpdate: (booking: any, fromDateStr: string, toDateStr: string) => Promise<any>;
  onUpdateDog: (dogIdOrName: any, updates: object) => Promise<any>;
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
  const save = useCallback(async () => {
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
        overrides: editSettings.overrides?.[editData.slot] || {},
      },
    );

    if (!slotCheck.allowed) {
      setSaveError(slotCheck.reason);
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

    if (dogUpdateResult === null) {
      setSaving(false);
      setSaveError("Could not update dog details");
      return;
    }

    const newDateStr = toDateStr(editData.date);
    const updateResult = await onUpdate(
      {
        ...booking,
        service: normalizedService,
        addons: editData.addons,
        pickupBy:
          getHumanByIdOrName(humans, editData.pickupBy)?.fullName ||
          editData.pickupBy,
        payment: editData.payment,
        slot: editData.slot,
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
  }, [
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
  ]);

  return { save };
}
