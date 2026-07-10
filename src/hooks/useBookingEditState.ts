import { useState, useCallback } from "react";
import {
  getServicePriceAmount,
  normalizeServiceForSize,
  type PricingConfig,
} from "../engine/bookingRules";
import type { Booking, Dog } from "../types/index";

// The caller passes `{}` when the booking's dog can't be resolved, so every
// dog field must stay optional — hence Partial<Dog> rather than Dog.
type EditableDogData = Partial<Dog> | null | undefined;

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
  /** This booking's effective base price (pounds). Saved as a per-booking
   *  price_override when it differs from the dog's usual/guide price. */
  price: number;
  /** Explicit opt-in: also save the edited price as the dog's usual
   *  custom_price. Off by default — one-off adjustments stay one-off. */
  saveAsUsual: boolean;
}

interface AllergyState {
  hasAllergy: boolean;
  setHasAllergy: (v: boolean) => void;
  allergyInput: string;
  setAllergyInput: (v: string) => void;
}

interface ModalFlags {
  showDatePicker: boolean;
  setShowDatePicker: (v: boolean) => void;
  showExitConfirm: boolean;
  setShowExitConfirm: (v: boolean) => void;
}

interface UseBookingEditStateReturn {
  editData: EditData;
  setEditData: React.Dispatch<React.SetStateAction<EditData>>;
  isEditing: boolean;
  setIsEditing: (v: boolean) => void;
  saving: boolean;
  setSaving: (v: boolean) => void;
  saveError: string;
  setSaveError: (v: string) => void;
  allergyState: AllergyState;
  modalFlags: ModalFlags;
  resetEditState: () => void;
}

function buildEditState(
  booking: Booking,
  dogData: EditableDogData,
  currentDateObj: Date,
  configPricing?: PricingConfig,
): EditData {
  const size = booking.size || dogData?.size || "small";
  const service = normalizeServiceForSize(
    booking.service || "full-groom",
    size,
  );
  // Seed with the booking's effective price: its one-off override, else the
  // dog's usual price (>0 only — 0/null means "no usual price"), else the
  // Settings/constant guide price. Mirrors computeBookingPricing.
  const override = booking.priceOverride;
  const usual = dogData?.customPrice;
  const basePrice =
    override != null && Number(override) > 0
      ? Number(override)
      : usual != null && Number(usual) > 0
        ? Number(usual)
        : getServicePriceAmount(service, size, configPricing);

  return {
    service,
    // Prefer the resolved human id so the pick-up <select> defaults to the
    // booking's current pick-up human (its options are keyed by id). Falls
    // back to the stored name when no id is linked; the save path resolves
    // either form back to a fullName via getHumanByIdOrName.
    pickupBy:
      booking._pickupById ||
      booking._ownerId ||
      booking.pickupBy ||
      booking.owner ||
      "",
    payment: booking.payment || "Due at Pick-up",
    // Method defaults to card (the common case) so marking paid is a
    // confirmation, not data entry; the amount stays null until "Paid in
    // Full" is chosen, at which point the UI prefills the appointment total.
    paymentMethod: booking.paymentMethod ?? "card",
    paidAmount: booking.paidAmount ?? null,
    depositAmount: booking.depositAmount ?? 10,
    groomNotes: dogData?.groomNotes || "",
    alerts: [...(dogData?.alerts || [])],
    addons: [...(booking.addons || [])],
    date: currentDateObj,
    slot: booking.slot || "",
    price: basePrice,
    saveAsUsual: false,
  };
}

export function useBookingEditState(
  booking: Booking,
  dogData: EditableDogData,
  currentDateObj: Date,
  configPricing?: PricingConfig,
): UseBookingEditStateReturn {
  const [isEditing, setIsEditing] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);

  const [editData, setEditData] = useState<EditData>(() =>
    buildEditState(booking, dogData, currentDateObj, configPricing),
  );

  const allergyEntry = (dogData?.alerts || []).find(
    (a: string) => typeof a === "string" && a.startsWith("Allergic to "),
  );
  const [allergyInput, setAllergyInput] = useState<string>(
    allergyEntry ? allergyEntry.replace("Allergic to ", "") : "",
  );
  const [hasAllergy, setHasAllergy] = useState<boolean>(!!allergyEntry);

  const resetEditState = useCallback(() => {
    const fresh = buildEditState(booking, dogData, currentDateObj, configPricing);
    setEditData(fresh);
    setIsEditing(false);
    setSaveError("");
    const entry = (dogData?.alerts || []).find(
      (a: string) => typeof a === "string" && a.startsWith("Allergic to "),
    );
    setAllergyInput(entry ? entry.replace("Allergic to ", "") : "");
    setHasAllergy(!!entry);
  }, [booking, dogData, currentDateObj, configPricing]);

  return {
    editData,
    setEditData,
    isEditing,
    setIsEditing,
    saving,
    setSaving,
    saveError,
    setSaveError,
    allergyState: { hasAllergy, setHasAllergy, allergyInput, setAllergyInput },
    modalFlags: {
      showDatePicker,
      setShowDatePicker,
      showExitConfirm,
      setShowExitConfirm,
    },
    resetEditState,
  };
}
