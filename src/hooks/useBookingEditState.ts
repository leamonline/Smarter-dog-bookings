import { useState, useCallback } from "react";
import {
  getNumericPrice,
  getServicePriceLabel,
  normalizeServiceForSize,
} from "../engine/bookingRules.js";

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
  showContact: boolean;
  setShowContact: (v: boolean) => void;
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

function buildEditState(booking: any, dogData: any, currentDateObj: Date): EditData {
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
    pickupBy: booking.pickupBy || booking.owner || "",
    payment: booking.payment || "Due at Pick-up",
    groomNotes: dogData?.groomNotes || "",
    alerts: [...(dogData?.alerts || [])],
    addons: [...(booking.addons || [])],
    date: currentDateObj,
    slot: booking.slot || "",
    customPrice: basePrice,
  };
}

export function useBookingEditState(
  booking: any,
  dogData: any,
  currentDateObj: Date,
): UseBookingEditStateReturn {
  const [isEditing, setIsEditing] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showContact, setShowContact] = useState(false);
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
      showContact,
      setShowContact,
    },
    resetEditState,
  };
}
