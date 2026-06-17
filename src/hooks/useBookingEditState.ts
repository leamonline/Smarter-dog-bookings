import { useState, useCallback } from "react";
import {
  getNumericPrice,
  getServicePriceLabel,
  normalizeServiceForSize,
} from "../engine/bookingRules";
import type { Booking, Dog } from "../types/index";

// The caller passes `{}` when the booking's dog can't be resolved, so every
// dog field must stay optional — hence Partial<Dog> rather than Dog.
type EditableDogData = Partial<Dog> | null | undefined;

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
): EditData {
  const size = booking.size || dogData?.size || "small";
  const service = normalizeServiceForSize(
    booking.service || "full-groom",
    size,
  );
  const basePrice =
    dogData?.customPrice !== undefined
      ? dogData.customPrice
      : getNumericPrice(getServicePriceLabel(service, size));

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
    depositAmount: booking.depositAmount ?? 10,
    groomNotes: dogData?.groomNotes || "",
    alerts: [...(dogData?.alerts || [])],
    addons: [...(booking.addons || [])],
    date: currentDateObj,
    slot: booking.slot || "",
    customPrice: basePrice,
  };
}

export function useBookingEditState(
  booking: Booking,
  dogData: EditableDogData,
  currentDateObj: Date,
): UseBookingEditStateReturn {
  const [isEditing, setIsEditing] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);

  const [editData, setEditData] = useState<EditData>(() =>
    buildEditState(booking, dogData, currentDateObj),
  );

  const allergyEntry = (dogData?.alerts || []).find(
    (a: string) => typeof a === "string" && a.startsWith("Allergic to "),
  );
  const [allergyInput, setAllergyInput] = useState<string>(
    allergyEntry ? allergyEntry.replace("Allergic to ", "") : "",
  );
  const [hasAllergy, setHasAllergy] = useState<boolean>(!!allergyEntry);

  const resetEditState = useCallback(() => {
    const fresh = buildEditState(booking, dogData, currentDateObj);
    setEditData(fresh);
    setIsEditing(false);
    setSaveError("");
    const entry = (dogData?.alerts || []).find(
      (a: string) => typeof a === "string" && a.startsWith("Allergic to "),
    );
    setAllergyInput(entry ? entry.replace("Allergic to ", "") : "");
    setHasAllergy(!!entry);
  }, [booking, dogData, currentDateObj]);

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
