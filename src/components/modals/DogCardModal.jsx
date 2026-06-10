import { useState, useEffect, useMemo, lazy, Suspense } from "react";
import { SIZE_THEME, SIZE_FALLBACK, getSizeForBreed, BOOKING_STATUS } from "../../constants/index";
import { AccessibleModal } from "../shared/AccessibleModal.tsx";
import {
  getDogByIdOrName,
  getHumanByIdOrName,
  looksLikeUuid,
} from "../../engine/bookingRules";
import { formatOwnerLabel } from "../../utils/formatOwnerLabel.js";
import {
  GroomingHistory,
  DogCardHeader,
  DogDetailsSection,
  TrustedHumansSection,
  DogCardActions,
  calcAge,
} from "./dog-card/index.js";
import { useToast } from "../../contexts/ToastContext.jsx";
import { useGroomPhotos } from "../../hooks/useGroomPhotos.js";
import { ConfirmDialog } from "../shared/ConfirmDialog.jsx";
import { PhotoGalleryModal } from "./PhotoGalleryModal.jsx";
import { LoadingSpinner } from "../ui/LoadingSpinner.jsx";

const ChainBookingModal = lazy(() =>
  import("./ChainBookingModal.jsx").then((m) => ({ default: m.ChainBookingModal })),
);

export function DogCardModal({
  dogId,
  onClose,
  onOpenHuman,
  dogs,
  humans = {},
  onUpdateDog,
  onUpdateHuman,
  onAddHuman,
  onDeleteDog,
  bookingsByDate,
  fetchBookingHistoryForDog,
  fetchDogById,
  handleAdd,
  findHumanByFullName,
  searchHumansByTerm,
}) {
  const [pendingDelete, setPendingDelete] = useState(false);
  // Placeholder used while fetchDogById is in flight. `name: ""` instead
  // of the UUID so the header never briefly shows the raw id on a cold
  // deep-link.
  const placeholder = useMemo(() => ({
    id: dogId,
    name: "",
    breed: "",
    age: "",
    humanId: "",
    _humanId: null,
    alerts: [],
    groomNotes: "",
  }), [dogId]);

  const initialDog = getDogByIdOrName(dogs, dogId);
  const [resolvedDog, setResolvedDog] = useState(initialDog || placeholder);
  const [isLoadingDog, setIsLoadingDog] = useState(!initialDog);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const found = getDogByIdOrName(dogs, dogId);
    if (found) {
      setResolvedDog(found);
      setIsLoadingDog(false);
      setNotFound(false);
      return;
    }
    // Dog not in the pre-loaded page — fetch on demand
    if (!fetchDogById) {
      setIsLoadingDog(false);
      setNotFound(true);
      return;
    }
    setIsLoadingDog(true);
    fetchDogById(dogId).then((dog) => {
      if (dog) {
        setResolvedDog(dog);
        setNotFound(false);
      } else {
        setNotFound(true);
      }
      setIsLoadingDog(false);
    });
  }, [dogId, dogs, fetchDogById]);

  // _humanId is the source of truth for "is this dog linked to an owner".
  // We also accept a non-UUID humanId fallback for legacy rows that only
  // have the name-keyed value populated.
  const hasLinkedOwner = Boolean(
    resolvedDog._humanId ||
      (resolvedDog.humanId && !looksLikeUuid(resolvedDog.humanId)),
  );
  const owner =
    getHumanByIdOrName(humans, resolvedDog._humanId || resolvedDog.humanId) ||
    null;

  // formatOwnerLabel is the single source of truth for owner display copy
  // (refuses to render UUIDs, returns "Unknown owner" when the human row
  // isn't in the map). DogsView uses the same helper, so the directory
  // card and this modal can never disagree on what the owner is called.
  const { label: resolvedOwnerLabel } = formatOwnerLabel(resolvedDog, humans);
  const ownerLabel = hasLinkedOwner ? resolvedOwnerLabel : "";
  const ownerOpenValue = owner?.id || resolvedDog._humanId || null;

  const toast = useToast();
  const { fetchPhotosForDog, deletePhoto, updatePhotoNotes } = useGroomPhotos();
  const [isEditing, setIsEditing] = useState(false);
  const [showChainBooking, setShowChainBooking] = useState(false);
  const [showGallery, setShowGallery] = useState(false);
  const [trustedToRemove, setTrustedToRemove] = useState(null);

  const lastBooking = useMemo(() => {
    if (!resolvedDog?.id && !resolvedDog?.name) return null;
    const allBookings = Object.values(bookingsByDate || {}).flat();
    const dogBookings = allBookings.filter(
      (b) => b.dog_id === resolvedDog.id || b.dogName === resolvedDog.name,
    );
    if (dogBookings.length === 0) return null;
    return dogBookings.sort((a, b) => (b.booking_date || "").localeCompare(a.booking_date || ""))[0] || null;
  }, [resolvedDog, bookingsByDate]);

  // --- Edit state ---
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

  const displayAge = calcAge(resolvedDog.dob) || (() => {
    const raw = resolvedDog.age || "";
    if (!raw) return "";
    if (/^\d+$/.test(raw.trim())) return `${raw.trim()} yrs`;
    return raw;
  })();

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

  // --- Trusted humans state ---
  const [showTrustedSearch, setShowTrustedSearch] = useState(false);
  const [trustedSearchQuery, setTrustedSearchQuery] = useState("");
  const [showNewTrustedForm, setShowNewTrustedForm] = useState(false);
  const [newTrustedName, setNewTrustedName] = useState("");
  const [newTrustedSurname, setNewTrustedSurname] = useState("");
  const [newTrustedPhone, setNewTrustedPhone] = useState("");
  const [newTrustedRelationship, setNewTrustedRelationship] = useState("");

  const trustedContacts = useMemo(
    () => owner?.trustedContacts || [],
    [owner?.trustedContacts],
  );

  // Server-side fallback: humans past the paginated page boundary (50)
  // aren't in the local map, so a name/phone the user knows about may
  // not surface in the dropdown. We hit the DB whenever the query
  // changes, debounced, and let the helper fold matches into the local
  // humans state — the memo below then includes them naturally.
  useEffect(() => {
    const query = trustedSearchQuery.trim();
    if (!query || !searchHumansByTerm) return;
    let cancelled = false;
    const handle = setTimeout(() => {
      if (cancelled) return;
      searchHumansByTerm(query).catch((err) => {
        console.error("trusted-human server search failed:", err);
      });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [trustedSearchQuery, searchHumansByTerm]);

  const trustedSearchResults = useMemo(() => {
    if (!trustedSearchQuery.trim()) return [];
    const query = trustedSearchQuery.toLowerCase().trim();
    const linkedIds = new Set(trustedContacts.map((c) => c.id).filter(Boolean));
    const linkedNames = new Set(trustedContacts.map((c) => c.fullName).filter(Boolean));
    return Object.values(humans)
      .filter((h) => {
        if (!h || h.id === owner?.id) return false;
        if (linkedIds.has(h.id) || linkedNames.has(h.fullName)) return false;
        const fullName = (h.fullName || `${h.name || ""} ${h.surname || ""}`).toLowerCase();
        const phone = (h.phone || "").toLowerCase();
        return fullName.includes(query) || phone.includes(query);
      })
      .slice(0, 5);
  }, [trustedSearchQuery, humans, owner?.id, trustedContacts]);

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

  // --- Handlers ---
  const handleAddTrusted = async (selectedHumanId) => {
    if (!owner || !onUpdateHuman) return;
    const currentContacts = owner.trustedContacts || [];
    const ownerKey = owner.fullName || owner.id;

    await onUpdateHuman(ownerKey, {
      trustedContacts: [...currentContacts, { id: selectedHumanId, relationship: "" }],
    });

    const selectedHuman = getHumanByIdOrName(humans, selectedHumanId);
    if (selectedHuman) {
      const theirContacts = selectedHuman.trustedContacts || [];
      const myId = owner.id || ownerKey;
      if (!theirContacts.some((c) => c.id === myId || c.fullName === owner.fullName)) {
        const theirKey = selectedHuman.fullName || selectedHuman.id;
        await onUpdateHuman(theirKey, {
          trustedContacts: [...theirContacts, { id: myId, relationship: "" }],
        });
      }
    }

    setTrustedSearchQuery("");
    setShowTrustedSearch(false);
    toast.show("Trusted human added", "success");
  };

  const handleAddNewTrusted = async () => {
    if (!onAddHuman || !onUpdateHuman) return;
    if (!owner) {
      toast.show("Set an owner on this dog before adding a trusted human.", "error");
      return;
    }
    const name = newTrustedName.trim();
    const surname = newTrustedSurname.trim();
    const phone = newTrustedPhone.trim();
    const relationship = (newTrustedRelationship || "").trim();
    if (!name || !surname || !phone) return;

    const linkAsTrusted = async (trustedHuman, successMessage) => {
      const currentContacts = owner.trustedContacts || [];
      const ownerKey = owner.fullName || owner.id;
      await onUpdateHuman(ownerKey, {
        trustedContacts: [
          ...currentContacts,
          { id: trustedHuman.id, relationship },
        ],
      });

      const theirContacts = trustedHuman.trustedContacts || [];
      const ownerId = owner.id || ownerKey;
      if (!theirContacts.some((c) => c.id === ownerId || c.fullName === owner.fullName)) {
        const theirKey = trustedHuman.fullName || trustedHuman.id;
        await onUpdateHuman(theirKey, {
          trustedContacts: [
            ...theirContacts,
            { id: ownerId, relationship: "" },
          ],
        });
      }

      setNewTrustedName("");
      setNewTrustedSurname("");
      setNewTrustedPhone("");
      setNewTrustedRelationship("");
      setShowNewTrustedForm(false);
      setShowTrustedSearch(false);
      toast.show(successMessage, "success");
    };

    try {
      // Reuse an existing customer with this name rather than creating a
      // duplicate. The humans directory no longer enforces a unique
      // (name, surname), so onAddHuman would otherwise insert a second
      // record; and the existing row may be paginated out of the local
      // map, so the search above never offered it. A direct lookup links
      // the real person instead.
      const existing = findHumanByFullName
        ? await findHumanByFullName(name, surname)
        : null;
      if (existing) {
        await linkAsTrusted(
          existing,
          `Linked existing ${existing.fullName} as trusted human`,
        );
        return;
      }
      const newHuman = await onAddHuman({ name, surname, phone });
      if (!newHuman) return;
      await linkAsTrusted(newHuman, "Trusted human added");
    } catch (err) {
      console.error("Failed to add trusted human:", err);
      toast.show(err?.message || "Could not add trusted human.", "error");
    }
  };

  const handleUpdateTrustedRelationship = async (trustedIdOrName, relationship) => {
    if (!owner || !onUpdateHuman) return;
    const currentContacts = owner.trustedContacts || [];
    const nextContacts = currentContacts.map((c) =>
      c.id === trustedIdOrName || c.fullName === trustedIdOrName
        ? { ...c, relationship }
        : c,
    );
    const ownerKey = owner.fullName || owner.id;
    await onUpdateHuman(ownerKey, { trustedContacts: nextContacts });
  };

  const doRemoveTrusted = async (trustedIdToRemove) => {
    if (!owner || !onUpdateHuman) return;
    const currentContacts = owner.trustedContacts || [];
    const ownerKey = owner.fullName || owner.id;

    await onUpdateHuman(ownerKey, {
      trustedContacts: currentContacts.filter(
        (c) => c.id !== trustedIdToRemove && c.fullName !== trustedIdToRemove,
      ),
    });

    const removedHuman = getHumanByIdOrName(humans, trustedIdToRemove);
    if (removedHuman) {
      const theirContacts = removedHuman.trustedContacts || [];
      const myId = owner.id || ownerKey;
      if (theirContacts.some((c) => c.id === myId || c.fullName === owner.fullName)) {
        const theirKey = removedHuman.fullName || removedHuman.id;
        await onUpdateHuman(theirKey, {
          trustedContacts: theirContacts.filter(
            (c) => c.id !== myId && c.fullName !== owner.fullName,
          ),
        });
      }
    }
    toast.show("Trusted human removed", "success");
  };

  const handleRemoveTrusted = (trustedIdToRemove) => {
    setTrustedToRemove(trustedIdToRemove);
  };

  // Wrap setEditBreed so changing the breed in the header auto-derives a
  // size — matching the AddDogModal flow. Stops once staff override the
  // dropdown manually (sizeOverridden), so we don't clobber an explicit
  // choice on a subsequent unrelated breed tweak.
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
    const priceNum = editPrice.trim() ? Number(editPrice) : undefined;
    if (priceNum !== resolvedDog.customPrice) updates.customPrice = priceNum;
    if (editSize && editSize !== (resolvedDog.size || "")) updates.size = editSize;
    // Optional profile fields — normalise to the DB shape (text → null when
    // blank, neutered → boolean | null) and only send what actually changed.
    const nextSex = editSex || null;
    if (nextSex !== (resolvedDog.sex || null)) updates.sex = nextSex;
    const nextColour = editColour.trim() || null;
    if (nextColour !== (resolvedDog.colour || null)) updates.colour = nextColour;
    const nextNeutered = editNeutered === "yes" ? true : editNeutered === "no" ? false : null;
    if (nextNeutered !== (resolvedDog.neutered ?? null)) updates.neutered = nextNeutered;
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

  const sizeTheme = SIZE_THEME[resolvedDog.size] || SIZE_FALLBACK;
  const sizeAccent = sizeTheme.primary;
  const headerTextColour = sizeTheme.headerText;
  const headerSubTextColour = sizeTheme.headerTextSub;

  const displayAlerts = isEditing ? editAlerts : resolvedDog.alerts || [];

  if (isLoadingDog) {
    return (
      <AccessibleModal
        onClose={onClose}
        titleId="dog-card-title"
        className="bg-white rounded-2xl w-[min(420px,95vw)] shadow-modal"
      >
        <div
          id="dog-card-title"
          className="px-6 py-16 flex flex-col items-center justify-center gap-3"
        >
          <LoadingSpinner />
          <div className="text-sm text-slate-500">Loading dog profile…</div>
        </div>
      </AccessibleModal>
    );
  }

  if (notFound) {
    return (
      <AccessibleModal
        onClose={onClose}
        titleId="dog-card-title"
        className="bg-white rounded-2xl w-[min(420px,95vw)] shadow-modal"
      >
        <div className="px-6 py-12 text-center">
          <div
            id="dog-card-title"
            className="text-base font-extrabold text-slate-800 mb-2"
          >
            Dog not found
          </div>
          <div className="text-sm text-slate-500 mb-5">
            This dog may have been deleted or the link is broken.
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 text-white text-sm font-bold cursor-pointer font-inherit"
          >
            Close
          </button>
        </div>
      </AccessibleModal>
    );
  }

  return (
    <>
    <AccessibleModal
      onClose={onClose}
      titleId="dog-card-title"
      className="bg-white rounded-2xl w-[min(420px,95vw)] max-h-[90vh] overflow-auto shadow-modal"
    >
        <DogCardHeader
          titleId="dog-card-title"
          isEditing={isEditing}
          resolvedDog={resolvedDog}
          displayAge={displayAge}
          editName={editName}
          setEditName={setEditName}
          editBreed={editBreed}
          setEditBreed={handleEditBreedChange}
          editDobMonth={editDobMonth}
          setEditDobMonth={setEditDobMonth}
          editDobYear={editDobYear}
          setEditDobYear={setEditDobYear}
          sizeTheme={sizeTheme}
          headerTextColour={headerTextColour}
          headerSubTextColour={headerSubTextColour}
          onClose={onClose}
          onEnterEdit={() => setIsEditing(true)}
          onOpenGallery={() => setShowGallery(true)}
          incomplete={
            !resolvedDog.size ||
            !resolvedDog.breed ||
            !resolvedDog.breed.trim() ||
            !hasLinkedOwner
          }
        />

        <div
          className="px-4 pt-4 pb-2"
          style={{ background: sizeTheme.light }}
        >

        <DogDetailsSection
          isEditing={isEditing}
          resolvedDog={resolvedDog}
          sizeAccent={sizeAccent}
          ownerLabel={ownerLabel}
          ownerOpenValue={ownerOpenValue}
          owner={owner}
          hasLinkedOwner={hasLinkedOwner}
          onClose={onClose}
          onOpenHuman={onOpenHuman}
          editOwnerLabel={editOwnerLabel}
          showOwnerSearch={showOwnerSearch}
          setShowOwnerSearch={setShowOwnerSearch}
          ownerSearchQuery={ownerSearchQuery}
          setOwnerSearchQuery={setOwnerSearchQuery}
          ownerSearchResults={ownerSearchResults}
          setEditOwnerId={setEditOwnerId}
          editNotes={editNotes}
          setEditNotes={setEditNotes}
          editSex={editSex}
          setEditSex={setEditSex}
          editColour={editColour}
          setEditColour={setEditColour}
          editNeutered={editNeutered}
          setEditNeutered={setEditNeutered}
          editMicrochip={editMicrochip}
          setEditMicrochip={setEditMicrochip}
          editVet={editVet}
          setEditVet={setEditVet}
          displayAlerts={displayAlerts}
          editAlerts={editAlerts}
          setEditAlerts={setEditAlerts}
          hasAllergy={hasAllergy}
          setHasAllergy={setHasAllergy}
          allergyInput={allergyInput}
          setAllergyInput={setAllergyInput}
          editPrice={editPrice}
          setEditPrice={setEditPrice}
          editSize={editSize}
          setEditSize={handleEditSizeChange}
          sizeAutoSet={sizeAutoSet}
          sizeOverridden={sizeOverridden}
        />

        <TrustedHumansSection
          isEditing={isEditing}
          sizeAccent={sizeAccent}
          trustedContacts={trustedContacts}
          humans={humans}
          owner={owner}
          onClose={onClose}
          onOpenHuman={onOpenHuman}
          onUpdateHuman={onUpdateHuman}
          onAddHuman={onAddHuman}
          showTrustedSearch={showTrustedSearch}
          setShowTrustedSearch={setShowTrustedSearch}
          trustedSearchQuery={trustedSearchQuery}
          setTrustedSearchQuery={setTrustedSearchQuery}
          trustedSearchResults={trustedSearchResults}
          handleAddTrusted={handleAddTrusted}
          handleRemoveTrusted={handleRemoveTrusted}
          showNewTrustedForm={showNewTrustedForm}
          setShowNewTrustedForm={setShowNewTrustedForm}
          newTrustedName={newTrustedName}
          setNewTrustedName={setNewTrustedName}
          newTrustedSurname={newTrustedSurname}
          setNewTrustedSurname={setNewTrustedSurname}
          newTrustedPhone={newTrustedPhone}
          setNewTrustedPhone={setNewTrustedPhone}
          newTrustedRelationship={newTrustedRelationship}
          setNewTrustedRelationship={setNewTrustedRelationship}
          handleAddNewTrusted={handleAddNewTrusted}
          handleUpdateTrustedRelationship={handleUpdateTrustedRelationship}
          getHumanByIdOrName={getHumanByIdOrName}
        />

        <GroomingHistory
          dogId={resolvedDog.id}
          fetchBookingHistoryForDog={fetchBookingHistoryForDog}
          accentColour={sizeAccent}
        />

        {lastBooking && !isEditing && (
          <button
            onClick={() => setShowChainBooking(true)}
            className="w-full py-2.5 rounded-xl border-2 text-[13px] font-bold cursor-pointer font-inherit transition-all bg-white mb-2"
            style={{
              borderColor: sizeAccent,
              color: sizeAccent,
            }}
          >
            Recurring Bookings
          </button>
        )}

        </div>

        <DogCardActions
          isEditing={isEditing}
          onSave={handleSave}
          onCancel={handleCancel}
          sizeTheme={sizeTheme}
          headerTextColour={headerTextColour}
        />

        {/* Archive (primary, reversible) + permanent delete (secondary). Archive
            hides the dog from the directory while keeping its booking history and
            groom photos; delete is the irreversible removal (delete moved here in
            task 4 of the May 2026 review pass — bulk delete from the /dogs grid
            was too easy to mis-fire). */}
        {isEditing && (onUpdateDog || onDeleteDog) && (
          <div className="px-6 pb-5 -mt-2 bg-slate-50 flex items-center gap-4">
            {onUpdateDog && (
              <button
                type="button"
                onClick={async () => {
                  await onUpdateDog(resolvedDog.id, { archivedAt: new Date().toISOString() });
                  toast.show(`Archived ${resolvedDog.name}`, "success");
                  onClose?.();
                }}
                className="text-[12px] font-bold text-brand-purple underline cursor-pointer bg-transparent border-none p-0 font-[inherit]"
              >
                Archive this dog
              </button>
            )}
            {onDeleteDog && (
              <button
                type="button"
                onClick={() => setPendingDelete(true)}
                className="text-[11px] font-semibold text-slate-400 underline cursor-pointer bg-transparent border-none p-0 font-[inherit] hover:text-brand-coral"
              >
                Delete permanently…
              </button>
            )}
          </div>
        )}
    </AccessibleModal>

    {pendingDelete && (
      <ConfirmDialog
        title={`Delete ${resolvedDog.name}?`}
        message="This removes the dog from the salon — booking history and groom photos go with them. Cannot be undone."
        confirmLabel="Delete dog"
        variant="danger"
        onConfirm={async () => {
          const result = await onDeleteDog?.(resolvedDog.id);
          setPendingDelete(false);
          if (result?.ok) {
            toast.show(`Deleted ${resolvedDog.name}`, "success");
            onClose?.();
          } else if (result?.error) {
            toast.show(result.error, "error");
          }
        }}
        onCancel={() => setPendingDelete(false)}
      />
    )}

    {showChainBooking && lastBooking && (
      <Suspense fallback={null}>
        <ChainBookingModal
          dog={resolvedDog}
          lastBooking={lastBooking}
          onClose={() => setShowChainBooking(false)}
          onUpdateDog={onUpdateDog}
          onCreateChain={async (chain) => {
            const chainId = crypto.randomUUID();
            for (const link of chain) {
              await handleAdd({
                dogName: resolvedDog.name,
                dog_id: resolvedDog.id,
                breed: resolvedDog.breed,
                size: link.size,
                service: link.service,
                slot: link.slot,
                owner: owner?.id || resolvedDog.human_id || "",
                ownerName: owner
                  ? `${owner.name || ""} ${owner.surname || ""}`.trim()
                  : "",
                status: BOOKING_STATUS.BOOKED,
                group_id: chainId,
                // Per-link override flag from ChainBookingModal — useBookings.add
                // conditionally spreads it into the insert payload so the
                // trigger stamps _by/_at.
                ...(link.staffCapacityOverride
                  ? { staff_capacity_override: true }
                  : {}),
              }, link.dateStr);
            }
          }}
        />
      </Suspense>
    )}

    {trustedToRemove && (
      <ConfirmDialog
        title="Remove trusted human?"
        message="This person will no longer be linked as a trusted human."
        confirmLabel="Remove"
        variant="danger"
        onConfirm={async () => {
          const id = trustedToRemove;
          setTrustedToRemove(null);
          await doRemoveTrusted(id);
        }}
        onCancel={() => setTrustedToRemove(null)}
      />
    )}

    {showGallery && (
      <PhotoGalleryModal
        dogId={resolvedDog.id}
        dogName={resolvedDog.name}
        sizeTheme={sizeTheme}
        onClose={() => setShowGallery(false)}
        fetchPhotosForDog={fetchPhotosForDog}
        deletePhoto={deletePhoto}
        updatePhotoNotes={updatePhotoNotes}
      />
    )}
    </>
  );
}
