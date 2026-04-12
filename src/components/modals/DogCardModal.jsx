import { useState, useMemo, useEffect, lazy, Suspense } from "react";
import { SIZE_THEME, SIZE_FALLBACK } from "../../constants/index.js";
import {
  getDogByIdOrName,
  getHumanByIdOrName,
} from "../../engine/bookingRules.js";
import {
  GroomingHistory,
  DogCardHeader,
  DogDetailsSection,
  TrustedHumansSection,
  DogCardActions,
  calcAge,
} from "./dog-card/index.js";

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
  bookingsByDate,
  fetchBookingHistoryForDog,
  handleAdd,
}) {
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  const resolvedDog = getDogByIdOrName(dogs, dogId) || {
    id: dogId,
    name: dogId,
    breed: "",
    age: "",
    humanId: "",
    _humanId: null,
    alerts: [],
    groomNotes: "",
  };

  const owner =
    getHumanByIdOrName(humans, resolvedDog._humanId || resolvedDog.humanId) ||
    null;

  const ownerLabel = owner?.fullName || resolvedDog.humanId || "";
  const ownerOpenValue =
    owner?.id || resolvedDog._humanId || resolvedDog.humanId || null;

  const [isEditing, setIsEditing] = useState(false);
  const [showChainBooking, setShowChainBooking] = useState(false);

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
  const [editPrice, setEditPrice] = useState(resolvedDog.customPrice != null ? String(resolvedDog.customPrice) : "");
  const [editAlerts, setEditAlerts] = useState([...(resolvedDog.alerts || [])]);

  const [allergyInput, setAllergyInput] = useState(() => {
    const allergy = (resolvedDog.alerts || []).find((a) =>
      a.startsWith("Allergic to "),
    );
    return allergy ? allergy.replace("Allergic to ", "") : "";
  });

  const [hasAllergy, setHasAllergy] = useState(() =>
    (resolvedDog.alerts || []).some((a) => a.startsWith("Allergic to ")),
  );

  // --- Trusted humans state ---
  const [showTrustedSearch, setShowTrustedSearch] = useState(false);
  const [trustedSearchQuery, setTrustedSearchQuery] = useState("");
  const [showNewTrustedForm, setShowNewTrustedForm] = useState(false);
  const [newTrustedName, setNewTrustedName] = useState("");
  const [newTrustedSurname, setNewTrustedSurname] = useState("");
  const [newTrustedPhone, setNewTrustedPhone] = useState("");

  const trustedIds = owner?.trustedIds || [];

  const trustedSearchResults = useMemo(() => {
    if (!trustedSearchQuery.trim()) return [];
    const query = trustedSearchQuery.toLowerCase().trim();
    return Object.values(humans)
      .filter((h) => {
        if (!h || h.id === owner?.id) return false;
        if (trustedIds.includes(h.id) || trustedIds.includes(h.fullName)) return false;
        const fullName = (h.fullName || `${h.name || ""} ${h.surname || ""}`).toLowerCase();
        const phone = (h.phone || "").toLowerCase();
        return fullName.includes(query) || phone.includes(query);
      })
      .slice(0, 5);
  }, [trustedSearchQuery, humans, owner?.id, trustedIds]);

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
    const currentTrusted = owner.trustedIds || [];
    const ownerKey = owner.fullName || owner.id;

    await onUpdateHuman(ownerKey, {
      trustedIds: [...currentTrusted, selectedHumanId],
    });

    const selectedHuman = getHumanByIdOrName(humans, selectedHumanId);
    if (selectedHuman) {
      const theirTrusted = selectedHuman.trustedIds || [];
      const myId = owner.id || ownerKey;
      if (!theirTrusted.includes(myId)) {
        const theirKey = selectedHuman.fullName || selectedHuman.id;
        await onUpdateHuman(theirKey, {
          trustedIds: [...theirTrusted, myId],
        });
      }
    }

    setTrustedSearchQuery("");
    setShowTrustedSearch(false);
  };

  const handleAddNewTrusted = async () => {
    if (!owner || !onAddHuman || !onUpdateHuman) return;
    const name = newTrustedName.trim();
    const surname = newTrustedSurname.trim();
    const phone = newTrustedPhone.trim();
    if (!name || !surname || !phone) return;

    const newHuman = await onAddHuman({ name, surname, phone });
    if (!newHuman) return;

    const currentTrusted = owner.trustedIds || [];
    const ownerKey = owner.fullName || owner.id;
    await onUpdateHuman(ownerKey, {
      trustedIds: [...currentTrusted, newHuman.id],
    });

    const newKey = newHuman.fullName || `${name} ${surname}`;
    await onUpdateHuman(newKey, {
      trustedIds: [owner.id || ownerKey],
    });

    setNewTrustedName("");
    setNewTrustedSurname("");
    setNewTrustedPhone("");
    setShowNewTrustedForm(false);
    setShowTrustedSearch(false);
  };

  const handleRemoveTrusted = async (trustedIdToRemove) => {
    if (!owner || !onUpdateHuman) return;
    const currentTrusted = owner.trustedIds || [];
    const ownerKey = owner.fullName || owner.id;

    await onUpdateHuman(ownerKey, {
      trustedIds: currentTrusted.filter((id) => id !== trustedIdToRemove),
    });

    const removedHuman = getHumanByIdOrName(humans, trustedIdToRemove);
    if (removedHuman) {
      const theirTrusted = removedHuman.trustedIds || [];
      const myId = owner.id || ownerKey;
      if (theirTrusted.includes(myId)) {
        const theirKey = removedHuman.fullName || removedHuman.id;
        await onUpdateHuman(theirKey, {
          trustedIds: theirTrusted.filter((id) => id !== myId),
        });
      }
    }
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

    await onUpdateDog(resolvedDog.id || resolvedDog.name, updates);
    setIsEditing(false);
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
    setEditPrice(resolvedDog.customPrice != null ? String(resolvedDog.customPrice) : "");
    setEditAlerts([...(resolvedDog.alerts || [])]);
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

  return (
    <>
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/35 flex items-center justify-center z-[1000]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl w-[min(360px,95vw)] max-h-[85vh] overflow-auto shadow-[0_8px_32px_rgba(0,0,0,0.18)]"
      >
        <DogCardHeader
          isEditing={isEditing}
          resolvedDog={resolvedDog}
          displayAge={displayAge}
          editName={editName}
          setEditName={setEditName}
          editBreed={editBreed}
          setEditBreed={setEditBreed}
          editDobMonth={editDobMonth}
          setEditDobMonth={setEditDobMonth}
          editDobYear={editDobYear}
          setEditDobYear={setEditDobYear}
          sizeTheme={sizeTheme}
          headerTextColour={headerTextColour}
          headerSubTextColour={headerSubTextColour}
          onClose={onClose}
        />

        <DogDetailsSection
          isEditing={isEditing}
          resolvedDog={resolvedDog}
          sizeAccent={sizeAccent}
          ownerLabel={ownerLabel}
          ownerOpenValue={ownerOpenValue}
          owner={owner}
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
          displayAlerts={displayAlerts}
          editAlerts={editAlerts}
          setEditAlerts={setEditAlerts}
          hasAllergy={hasAllergy}
          setHasAllergy={setHasAllergy}
          allergyInput={allergyInput}
          setAllergyInput={setAllergyInput}
          editPrice={editPrice}
          setEditPrice={setEditPrice}
        />

        <TrustedHumansSection
          isEditing={isEditing}
          sizeAccent={sizeAccent}
          trustedIds={trustedIds}
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
          handleAddNewTrusted={handleAddNewTrusted}
          getHumanByIdOrName={getHumanByIdOrName}
        />

        <GroomingHistory
          dogId={resolvedDog.id}
          fetchBookingHistoryForDog={fetchBookingHistoryForDog}
          accentColour={sizeAccent}
        />

        {lastBooking && (
          <div className="px-6">
            <button
              onClick={() => setShowChainBooking(true)}
              className="w-full py-2.5 rounded-[10px] border-none bg-brand-teal text-white text-[13px] font-bold cursor-pointer font-inherit transition-all hover:bg-[#1E6B5C] mt-2"
            >
              Recurring Bookings
            </button>
          </div>
        )}

        <DogCardActions
          isEditing={isEditing}
          onSave={handleSave}
          onCancel={handleCancel}
          onEdit={() => setIsEditing(true)}
          sizeTheme={sizeTheme}
          headerTextColour={headerTextColour}
        />
      </div>
    </div>

    {showChainBooking && lastBooking && (
      <Suspense fallback={null}>
        <ChainBookingModal
          dog={resolvedDog}
          lastBooking={lastBooking}
          onClose={() => setShowChainBooking(false)}
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
                  ? `${owner.first_name || owner.name || ""} ${owner.last_name || owner.surname || ""}`.trim()
                  : "",
                status: "No-show",
                chain_id: chainId,
              }, link.dateStr);
            }
          }}
        />
      </Suspense>
    )}
    </>
  );
}
