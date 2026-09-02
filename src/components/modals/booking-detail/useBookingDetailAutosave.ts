// Autosave for the booking detail modal (Debt 9; extracted from
// BookingDetailModal.jsx).
//
// While staff are editing, the edited fields are written through onUpdate
// two seconds after the last change — the same onUpdate the Save button
// uses, so the DB gates and triggers apply unchanged. Nothing here talks to
// Supabase directly.
//
// This is deliberately the lightweight subset of useBookingSave: no date
// move validation, no capacity-override prompt, no dog-level allergy or
// usual-price writes. Those stay behind the explicit Save button. A failed
// validation throws so useAutosave keeps its baseline (the failed edit stays
// "unsaved" rather than being announced as saved).
import { useCallback } from "react";
import { useAutosave, type AutosaveStatus } from "../../../hooks/useAutosave";
import {
  getHumanByIdOrName,
  normalizeServiceForSize,
  validateDepositAmount,
} from "../../../engine/bookingRules";
import { toDateStr } from "../../../supabase/transforms";
import type { EditData } from "../../../hooks/useBookingEditState";
import type { Booking, Human } from "../../../types/index";

export const AUTOSAVE_DELAY_MS = 2000;

/**
 * The booking shape handed to onUpdate: the app Booking with the edited
 * fields applied. `service` widens to string because normalizeServiceForSize
 * returns a plain string (mirrors useBookingSave's BookingUpdate).
 */
export type AutosaveBookingUpdate = Omit<Booking, "service"> & { service: string };

export interface UseBookingDetailAutosaveInput {
  booking: Booking;
  editData: EditData;
  /** Autosave only runs while the form is in edit mode. */
  isEditing: boolean;
  humans: Record<string, Human>;
  currentDateStr: string;
  /** pricing.subtotal — the ceiling a deposit must stay under. */
  subtotal: number;
  setSaveError: (message: string) => void;
  onUpdate: (
    booking: AutosaveBookingUpdate,
    fromDateStr: string,
    toDateStr: string,
  ) => Promise<unknown>;
}

export function useBookingDetailAutosave({
  booking,
  editData,
  isEditing,
  humans,
  currentDateStr,
  subtotal,
  setSaveError,
  onUpdate,
}: UseBookingDetailAutosaveInput): { autosaveStatus: AutosaveStatus } {
  const autosaveFn = useCallback(async () => {
    if (!editData.slot) return;
    const depositValidationError = validateDepositAmount(
      editData.payment,
      editData.depositAmount,
      subtotal,
    );
    if (depositValidationError) {
      setSaveError(depositValidationError);
      throw new Error(depositValidationError);
    }
    const newDateStr = toDateStr(editData.date);
    // Resolve the chosen pick-up once and persist BOTH name and id — see the
    // note in useBookingSave: updateBooking reads pickup_by_id from
    // `_pickupById` first, so the id must be refreshed or the change is lost.
    const pickedPickup = getHumanByIdOrName(humans, editData.pickupBy);
    await onUpdate(
      {
        ...booking,
        service: normalizeServiceForSize(editData.service, booking.size),
        addons: editData.addons,
        pickupBy: pickedPickup?.fullName || editData.pickupBy,
        _pickupById: pickedPickup?.id ?? null,
        payment: editData.payment,
        // Mirror useBookingSave: the ledger fields travel with Paid in Full
        // (the DB trigger clears them whenever payment moves off it).
        paymentMethod: editData.payment === "Paid in Full" ? editData.paymentMethod : null,
        paidAmount: editData.payment === "Paid in Full" ? editData.paidAmount : null,
        depositAmount: editData.payment === "Deposit Paid" ? editData.depositAmount : null,
        slot: editData.slot,
      },
      currentDateStr,
      newDateStr,
    );
  }, [editData, booking, humans, currentDateStr, onUpdate, subtotal, setSaveError]);

  const { status: autosaveStatus } = useAutosave(editData, autosaveFn, {
    delay: AUTOSAVE_DELAY_MS,
    enabled: isEditing,
  });

  return { autosaveStatus };
}
