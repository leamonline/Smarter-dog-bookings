import { useState, useEffect, useMemo } from "react";
import { parseGBPInput, penceToPounds } from "../../../utils/money";
import { getSizeForBreed } from "../../../constants/index";
import { getHumanByIdOrName } from "../../../engine/bookingRules";
import { useToast } from "../../../contexts/ToastContext.jsx";
import { calcAge } from "./helpers.js";

/**
 * Edit-mode state for the dog card: every field, the owner-link search,
 * and the save/cancel mapping back to the DB shape.
 *
 * Field state seeds from `resolvedDog` and re-seeds whenever a different
 * dog loads (on-demand fetch) — but never mid-edit, so staff typing is
 * never clobbered by a background refresh.
 */
export function useDogEditForm({ resolvedDog, ownerOpenValue, humans, onUpdateDog }) {
  const toast = useToast();
  const [isEditing, setIsEditing] = useState(false);

  const [editName, setEditName] = useState(resolvedDog.name || "");
  const [editBreed, setEditBreed] = useState(resolvedDog.breed || "");

  const existingDob = resolvedDog.dob || "";
  const [editDobMonth, setEditDobMonth] = useState(() => {
    if (existingDob) return existingDob.split("-")[1] || "";
    return "";
  });
  const [editDobYear, setEditDobYear] = useState(() => {
    if (existingDob) return existingDob.split("-")[0] || "";
    return "";
  });

  const [editOwnerId, setEditOwnerId] = useState(ownerOpenValue);
  const [ownerSearchQuery, setOwnerSearchQuery] = useState("");
  const [showOwnerSearch, setShowOwnerSearch] = useState(false);
  const [editNotes, setEditNotes] = useState(resolvedDog.groomNotes || "");
  const [editSex, setEditSex] = useState(resolvedDog.sex || "");
  const [editColour, setEditColour] = useState(resolvedDog.colour || "");
  // "" | "yes" | "no" ↔ boolean true / false / null in the DB.
  const [editNeutered, setEditNeutered] = useState(
    resolvedDog.neutered === true ? "yes" : resolvedDog.neutered === false ? "no" : "",
  );
  const [editIsPregnant, setEditIsPregnant] = useState(resolvedDog.isPregnant === true);
  const [editMicrochip, setEditMicrochip] = useState(resolvedDog.microchip || "");
  const [editVet, setEditVet] = useState(resolvedDog.vet || "");
  const [editPrice, setEditPrice] = useState(resolvedDog.customPrice != null ? String(resolvedDog.customPrice) : "");
  const [editAlerts, setEditAlerts] = useState([...(resolvedDog.alerts || [])]);
  const [editSize, setEditSize] = useState(resolvedDog.size || "");
  const [sizeAutoSet, setSizeAutoSet] = useState(false);
  const [sizeOverridden, setSizeOverridden] = useState(false);

  const [allergyInput, setAllergyInput] = useState(() => {
    const allergy = (resolvedDog.alerts || []).find((a) =>
      a.startsWith("Allergic to "),
    );
    return allergy ? allergy.replace("Allergic to ", "") : "";
  });

  const [hasAllergy, setHasAllergy] = useState(() =>
    (resolvedDog.alerts || []).some((a) => a.startsWith("Allergic to ")),
  );

  // Re-sync edit defaults when resolvedDog updates (e.g. after on-demand fetch)
  useEffect(() => {
    if (!isEditing) {
      setEditName(resolvedDog.name || "");
      setEditBreed(resolvedDog.breed || "");
      const dob = resolvedDog.dob || "";
      setEditDobMonth(dob ? dob.split("-")[1] || "" : "");
      setEditDobYear(dob ? dob.split("-")[0] || "" : "");
      setEditNotes(resolvedDog.groomNotes || "");
      setEditSex(resolvedDog.sex || "");
      setEditColour(resolvedDog.colour || "");
      setEditNeutered(resolvedDog.neutered === true ? "yes" : resolvedDog.neutered === false ? "no" : "");
      setEditIsPregnant(resolvedDog.isPregnant === true);
      setEditMicrochip(resolvedDog.microchip || "");
      setEditVet(resolvedDog.vet || "");
      setEditPrice(resolvedDog.customPrice != null ? String(resolvedDog.customPrice) : "");
      setEditAlerts([...(resolvedDog.alerts || [])]);
      setEditSize(resolvedDog.size || "");
      setSizeAutoSet(false);
      setSizeOverridden(false);
      const allergy = (resolvedDog.alerts || []).find((a) => a.startsWith("Allergic to "));
      setAllergyInput(allergy ? allergy.replace("Allergic to ", "") : "");
      setHasAllergy((resolvedDog.alerts || []).some((a) => a.startsWith("Allergic to ")));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- form fields seed from props only when a different dog is loaded; isEditing transitions inside the modal must not overwrite the user's typing
  }, [resolvedDog]);

  const ownerSearchResults = useMemo(() => {
    if (!ownerSearchQuery.trim()) return [];
    const query = ownerSearchQuery.toLowerCase().trim();
    return Object.values(humans)
      .filter((h) => {
        if (!h) return false;
        const fullName = (h.fullName || `${h.name || ""} ${h.surname || ""}`).toLowerCase();
        const phone = (h.phone || "").toLowerCase();
        return fullName.includes(query) || phone.includes(query);
      })
      .slice(0, 5);
  }, [ownerSearchQuery, humans]);

  const editOwner = editOwnerId
    ? getHumanByIdOrName(humans, editOwnerId)
    : null;
  const editOwnerLabel = editOwner?.fullName || editOwnerId || "";

  // Changing the breed auto-derives a size — matching the AddDogModal
  // flow. Stops once staff override the dropdown manually
  // (sizeOverridden), so we don't clobber an explicit choice on a
  // subsequent unrelated breed tweak.
  const handleEditBreedChange = (newBreed) => {
    setEditBreed(newBreed);
    if (sizeOverridden) return;
    const detected = getSizeForBreed(newBreed);
    if (detected) {
      setEditSize(detected);
      setSizeAutoSet(true);
    }
  };

  const handleEditSizeChange = (newSize) => {
    setEditSize(newSize);
    setSizeOverridden(true);
    setSizeAutoSet(false);
  };

  const handleSave = async () => {
    const finalAlerts = editAlerts.filter((a) => !a.startsWith("Allergic to "));
    if (hasAllergy && allergyInput.trim()) {
      finalAlerts.push(`Allergic to ${allergyInput.trim()}`);
    }
    const updates = {
      groomNotes: editNotes,
      alerts: finalAlerts,
    };
    if (editName.trim() && editName !== resolvedDog.name) updates.name = editName.trim();
    if (editBreed !== resolvedDog.breed) updates.breed = editBreed.trim();
    const composedDob = editDobYear && editDobMonth ? `${editDobYear}-${editDobMonth}` : "";
    if (composedDob !== (resolvedDog.dob || "")) {
      updates.dob = composedDob || null;
      updates.age = calcAge(composedDob) || "";
    }
    if (editOwnerId !== ownerOpenValue) updates.humanId = editOwnerId;
    // Blank, £0 or junk all mean "no usual price" and save as NULL — the dog
    // falls back to the guide price. (0 used to persist and silently price
    // grooms at £0; null also lets staff genuinely CLEAR an old custom price,
    // which the previous undefined-drop made impossible.)
    const parsedPence = parseGBPInput(editPrice);
    const priceNum = parsedPence != null ? penceToPounds(parsedPence) : null;
    if (priceNum !== (resolvedDog.customPrice ?? null)) updates.customPrice = priceNum;
    if (editSize && editSize !== (resolvedDog.size || "")) updates.size = editSize;
    // Optional profile fields — normalise to the DB shape (text → null when
    // blank, neutered → boolean | null) and only send what actually changed.
    const nextSex = editSex || null;
    if (nextSex !== (resolvedDog.sex || null)) updates.sex = nextSex;
    const nextColour = editColour.trim() || null;
    if (nextColour !== (resolvedDog.colour || null)) updates.colour = nextColour;
    const nextNeutered = editNeutered === "yes" ? true : editNeutered === "no" ? false : null;
    if (nextNeutered !== (resolvedDog.neutered ?? null)) updates.neutered = nextNeutered;
    if (editIsPregnant !== (resolvedDog.isPregnant ?? false)) updates.isPregnant = editIsPregnant;
    const nextMicrochip = editMicrochip.trim() || null;
    if (nextMicrochip !== (resolvedDog.microchip || null)) updates.microchip = nextMicrochip;
    const nextVet = editVet.trim() || null;
    if (nextVet !== (resolvedDog.vet || null)) updates.vet = nextVet;

    await onUpdateDog(resolvedDog.id || resolvedDog.name, updates);
    setIsEditing(false);
    toast.show("Dog profile saved", "success");
  };

  const handleCancel = () => {
    setEditName(resolvedDog.name || "");
    setEditBreed(resolvedDog.breed || "");
    setEditDobMonth(existingDob ? existingDob.split("-")[1] || "" : "");
    setEditDobYear(existingDob ? existingDob.split("-")[0] || "" : "");
    setEditOwnerId(ownerOpenValue);
    setOwnerSearchQuery("");
    setShowOwnerSearch(false);
    setEditNotes(resolvedDog.groomNotes || "");
    setEditSex(resolvedDog.sex || "");
    setEditColour(resolvedDog.colour || "");
    setEditNeutered(resolvedDog.neutered === true ? "yes" : resolvedDog.neutered === false ? "no" : "");
    setEditIsPregnant(resolvedDog.isPregnant === true);
    setEditMicrochip(resolvedDog.microchip || "");
    setEditVet(resolvedDog.vet || "");
    setEditPrice(resolvedDog.customPrice != null ? String(resolvedDog.customPrice) : "");
    setEditAlerts([...(resolvedDog.alerts || [])]);
    setEditSize(resolvedDog.size || "");
    setSizeAutoSet(false);
    setSizeOverridden(false);
    const allergy = (resolvedDog.alerts || []).find((a) =>
      a.startsWith("Allergic to "),
    );
    setAllergyInput(allergy ? allergy.replace("Allergic to ", "") : "");
    setHasAllergy(
      (resolvedDog.alerts || []).some((a) => a.startsWith("Allergic to ")),
    );
    setIsEditing(false);
  };

  return {
    isEditing,
    setIsEditing,
    editName,
    setEditName,
    editBreed,
    handleEditBreedChange,
    editDobMonth,
    setEditDobMonth,
    editDobYear,
    setEditDobYear,
    editOwnerId,
    setEditOwnerId,
    ownerSearchQuery,
    setOwnerSearchQuery,
    showOwnerSearch,
    setShowOwnerSearch,
    ownerSearchResults,
    editOwnerLabel,
    editNotes,
    setEditNotes,
    editSex,
    setEditSex,
    editColour,
    setEditColour,
    editNeutered,
    setEditNeutered,
    editIsPregnant,
    setEditIsPregnant,
    editMicrochip,
    setEditMicrochip,
    editVet,
    setEditVet,
    editPrice,
    setEditPrice,
    editAlerts,
    setEditAlerts,
    hasAllergy,
    setHasAllergy,
    allergyInput,
    setAllergyInput,
    editSize,
    handleEditSizeChange,
    sizeAutoSet,
    sizeOverridden,
    handleSave,
    handleCancel,
  };
}
