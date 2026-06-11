// Layout shell for the dog card. State and behaviour live in the
// dog-card/ hooks (useResolvedDog, useDogEditForm, useTrustedHumans);
// the heavyweight flows (chain booking, photo gallery) are sibling
// modals that only mount when staff open them.
import { useState, useMemo } from "react";
import { SIZE_THEME, SIZE_FALLBACK } from "../../constants/index";
import { ModalShell } from "./shell/index.js";
import { getHumanByIdOrName, looksLikeUuid } from "../../engine/bookingRules";
import { formatOwnerLabel } from "../../utils/formatOwnerLabel.js";
import {
  GroomingHistory,
  DogCardHeader,
  DogDetailsSection,
  TrustedHumansSection,
  DogCardActions,
  DogChainBooking,
  DogPhotoGallery,
  DogCardLoading,
  DogCardNotFound,
  findLastBooking,
  useResolvedDog,
  useDogEditForm,
  useTrustedHumans,
  calcAge,
} from "./dog-card/index.js";
import { useToast } from "../../contexts/ToastContext.jsx";
import { ConfirmDialog } from "../shared/ConfirmDialog.jsx";

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
  const toast = useToast();
  const { resolvedDog, isLoadingDog, notFound } = useResolvedDog(dogId, dogs, fetchDogById);

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

  const [pendingDelete, setPendingDelete] = useState(false);
  const [showChainBooking, setShowChainBooking] = useState(false);
  const [showGallery, setShowGallery] = useState(false);

  const lastBooking = useMemo(
    () => findLastBooking(resolvedDog, bookingsByDate),
    [resolvedDog, bookingsByDate],
  );

  const displayAge = calcAge(resolvedDog.dob) || (() => {
    const raw = resolvedDog.age || "";
    if (!raw) return "";
    if (/^\d+$/.test(raw.trim())) return `${raw.trim()} yrs`;
    return raw;
  })();

  const {
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
  } = useDogEditForm({ resolvedDog, ownerOpenValue, humans, onUpdateDog });

  const {
    trustedContacts,
    trustedSearchResults,
    showTrustedSearch,
    setShowTrustedSearch,
    trustedSearchQuery,
    setTrustedSearchQuery,
    showNewTrustedForm,
    setShowNewTrustedForm,
    newTrustedName,
    setNewTrustedName,
    newTrustedSurname,
    setNewTrustedSurname,
    newTrustedPhone,
    setNewTrustedPhone,
    newTrustedRelationship,
    setNewTrustedRelationship,
    handleAddTrusted,
    handleAddNewTrusted,
    handleUpdateTrustedRelationship,
    handleRemoveTrusted,
    trustedToRemove,
    confirmRemoveTrusted,
    cancelRemoveTrusted,
  } = useTrustedHumans({
    owner,
    humans,
    onUpdateHuman,
    onAddHuman,
    findHumanByFullName,
    searchHumansByTerm,
  });

  const sizeTheme = SIZE_THEME[resolvedDog.size] || SIZE_FALLBACK;

  const displayAlerts = isEditing ? editAlerts : resolvedDog.alerts || [];

  if (isLoadingDog) return <DogCardLoading onClose={onClose} />;
  if (notFound) return <DogCardNotFound onClose={onClose} />;

  return (
    <>
    <ModalShell
      onClose={onClose}
      titleId="dog-card-title"
      accent={sizeTheme.primary}
      widthClass="w-[min(520px,95vw)]"
      maxHeightClass="max-h-[90vh]"
      bodyClassName="px-4 pt-1 pb-2"
      header={
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
          ownerLabel={ownerLabel}
          onOpenOwner={
            ownerOpenValue
              ? () => {
                  onClose();
                  onOpenHuman?.(ownerOpenValue);
                }
              : undefined
          }
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
      }
      footer={
        isEditing ? (
          <>
            <DogCardActions
              isEditing={isEditing}
              onSave={handleSave}
              onCancel={handleCancel}
            />
            {/* Archive (primary, reversible) + permanent delete (secondary).
                Archive hides the dog from the directory while keeping its
                booking history and groom photos; delete is the irreversible
                removal (moved here in task 4 of the May 2026 review pass —
                bulk delete from the /dogs grid was too easy to mis-fire). */}
            {(onUpdateDog || onDeleteDog) && (
              <div className="px-6 pb-4 -mt-1 bg-white flex items-center gap-4">
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
          </>
        ) : null
      }
    >
      <div>
        <DogDetailsSection
          isEditing={isEditing}
          resolvedDog={resolvedDog}
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
        />

        {lastBooking && !isEditing && (
          <button
            onClick={() => setShowChainBooking(true)}
            className="w-full py-2.5 rounded-full border-[1.5px] border-slate-200 bg-white text-brand-purple text-[13px] font-bold cursor-pointer font-inherit transition-colors hover:bg-slate-50 mb-2"
          >
            Recurring Bookings
          </button>
        )}

      </div>
    </ModalShell>

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
      <DogChainBooking
        dog={resolvedDog}
        lastBooking={lastBooking}
        owner={owner}
        onClose={() => setShowChainBooking(false)}
        onUpdateDog={onUpdateDog}
        handleAdd={handleAdd}
      />
    )}

    {trustedToRemove && (
      <ConfirmDialog
        title="Remove trusted human?"
        message="This person will no longer be linked as a trusted human."
        confirmLabel="Remove"
        variant="danger"
        onConfirm={confirmRemoveTrusted}
        onCancel={cancelRemoveTrusted}
      />
    )}

    {showGallery && (
      <DogPhotoGallery
        dog={resolvedDog}
        sizeTheme={sizeTheme}
        onClose={() => setShowGallery(false)}
      />
    )}
    </>
  );
}
