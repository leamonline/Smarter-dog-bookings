/**
 * StaffModals — the staff app's global modal stack, extracted from App.jsx
 * (Debt 11).
 *
 * Renders (at most) the profile cards, the new-booking drawer, the booking
 * detail card, the add-dog modal, the new-client wizard, the date picker
 * and the collection notice. Each modal gets exactly the props it received
 * when this block lived inline in App.jsx; the only change is that the
 * repeated "close the drawer" sequence is `session.closeNewBooking()`.
 *
 * Props:
 *   data     — `useStaffAppData` result.
 *   nav      — `useWeekNav` result (+ wrapped handleDatePick).
 *   modals   — `useModalState` result.
 *   session  — `useBookingSession` result.
 *   ui       — the shell's cross-view callbacks: open/close profile,
 *              open booking, navigate, current pathname.
 */
import { lazy, Suspense } from "react";
import { LoadingSpinner } from "../ui/LoadingSpinner.jsx";
import { ErrorBoundary } from "../ui/ErrorBoundary.jsx";

const HumanCardModal = lazy(() =>
  import("../modals/HumanCardModal.jsx").then((module) => ({
    default: module.HumanCardModal,
  })),
);
const DogCardModal = lazy(() =>
  import("../modals/DogCardModal.jsx").then((module) => ({
    default: module.DogCardModal,
  })),
);
const NewBookingModal = lazy(() =>
  import("../modals/NewBookingModal.jsx").then((module) => ({
    default: module.NewBookingModal,
  })),
);
const DatePickerModal = lazy(() =>
  import("../modals/DatePickerModal.jsx").then((module) => ({
    default: module.DatePickerModal,
  })),
);
const BookingDetailModal = lazy(() =>
  import("../modals/BookingDetailModal.jsx").then((module) => ({
    default: module.BookingDetailModal,
  })),
);
const AddDogModal = lazy(() =>
  import("../modals/AddDogModal.jsx").then((module) => ({
    default: module.AddDogModal,
  })),
);
const NewClientWizard = lazy(() =>
  import("../modals/new-client/index.js").then((module) => ({
    default: module.NewClientWizard,
  })),
);
const CollectionNoticeModal = lazy(() =>
  import("../modals/collection-notice/CollectionNoticeModal.jsx").then((module) => ({
    default: module.CollectionNoticeModal,
  })),
);

export function StaffModals({ data, nav, modals, session, ui }) {
  const {
    humansApi,
    dogsApi,
    bookingsApi,
    dogs,
    humans,
    bookingsByDate,
    daySettings,
    handleAdd,
    handleRemove,
    handleUpdate,
    updateDog,
    updateHuman,
    addHuman,
    addDog,
    commitBookingList,
    dayOpenState,
  } = data;
  const { currentDateObj, currentDateStr, handleDatePick } = nav;
  const {
    selectedHumanId,
    selectedDogId,
    showDatePicker,
    setShowDatePicker,
    showNewBooking,
    showAddDogModal,
    setShowAddDogModal,
    showNewClient,
    setShowNewClient,
    collectionNotice,
    setCollectionNotice,
    selectedBooking,
    setSelectedBooking,
  } = modals;
  const {
    draftPick,
    setDraftTarget,
    requestNewBooking,
    closeNewBooking,
    parkBooking,
    resumeParkedBooking,
    appendDogToParked,
    pendingPresetOwner,
  } = session;
  const {
    pathname,
    navigate,
    onOpenDog,
    onOpenHuman,
    onOpenBooking,
    onCloseDogProfile,
    onCloseHumanProfile,
  } = ui;

  return (
    <>
      {showDatePicker && pathname === "/today" && (
        <Suspense fallback={<LoadingSpinner />}>
          <DatePickerModal
            currentDate={currentDateObj}
            onSelectDate={handleDatePick}
            onClose={() => setShowDatePicker(false)}
            dayOpenState={dayOpenState}
            allowClosedDates={pathname === "/today"}
          />
        </Suspense>
      )}

      {selectedHumanId && (
        <ErrorBoundary>
          <Suspense fallback={<LoadingSpinner />}>
            <HumanCardModal
              humanId={selectedHumanId}
              onClose={onCloseHumanProfile}
              onOpenHuman={onOpenHuman}
              onOpenDog={onOpenDog}
              humans={humans}
              dogs={dogs}
              dogsByHumanId={dogsApi.dogsByHumanId}
              ensureDogsForHumans={dogsApi.ensureDogsForHumans}
              onUpdateHuman={updateHuman}
              onAddHuman={addHuman}
              onAddDog={addDog}
              onDeleteHuman={humansApi.deleteHuman}
              bookingsByDate={bookingsByDate}
              fetchHumanById={humansApi.fetchHumanById}
              findHumanByFullName={humansApi.findHumanByFullName}
              findHumanByPhone={humansApi.findHumanByPhone}
              searchHumansByTerm={humansApi.searchHumansByTerm}
              onLinkPendingSignup={humansApi.linkPendingSignup}
              onNewBookingForHuman={(hid) => {
                onCloseHumanProfile();
                requestNewBooking({
                  dateStr: currentDateStr,
                  slot: "",
                  initialHumanId: hid,
                });
              }}
              onSendMessage={(hid) => {
                onCloseHumanProfile();
                navigate(`/inbox?human=${hid}`);
              }}
              onOpenBooking={onOpenBooking}
              onBookAgain={(booking) => {
                onCloseHumanProfile();
                requestNewBooking({
                  dateStr: currentDateStr,
                  slot: "",
                  initialHumanId: booking._ownerId || selectedHumanId,
                  initialDogId: booking._dogId,
                  initialService: booking.service,
                  initialAddons: booking.addons || [],
                });
              }}
              onMergeHumans={humansApi.mergeHumans}
              onArchiveHuman={(hid) =>
                updateHuman(hid, { archivedAt: new Date().toISOString() })
              }
              onApproveSignup={humansApi.approveSignup}
              onRejectSignup={humansApi.rejectSignup}
            />
          </Suspense>
        </ErrorBoundary>
      )}

      {selectedDogId && (
        <ErrorBoundary>
          <Suspense fallback={<LoadingSpinner />}>
            <DogCardModal
              dogId={selectedDogId}
              onClose={onCloseDogProfile}
              onOpenHuman={onOpenHuman}
              onOpenBooking={onOpenBooking}
              dogs={dogs}
              humans={humans}
              onUpdateDog={updateDog}
              onUpdateHuman={updateHuman}
              onAddHuman={addHuman}
              onDeleteDog={dogsApi.deleteDog}
              bookingsByDate={bookingsByDate}
              fetchBookingHistoryForDog={bookingsApi.fetchBookingHistoryForDog}
              fetchDogById={dogsApi.fetchDogById}
              fetchHumanById={humansApi.fetchHumanById}
              handleAdd={handleAdd}
              findHumanByFullName={humansApi.findHumanByFullName}
              searchHumansByTerm={humansApi.searchHumansByTerm}
            />
          </Suspense>
        </ErrorBoundary>
      )}

      {showNewBooking && (
        <ErrorBoundary>
          <Suspense fallback={<LoadingSpinner />}>
            <NewBookingModal
              key={showNewBooking.sessionKey}
              draftPick={draftPick}
              onDraftTargetChange={setDraftTarget}
              onClose={closeNewBooking}
              onAdd={commitBookingList}
              dogs={dogs}
              humans={humans}
              dogsByHumanId={dogsApi.dogsByHumanId}
              ensureDogsForHumans={dogsApi.ensureDogsForHumans}
              bookingsByDate={bookingsByDate}
              dayOpenState={dayOpenState}
              daySettings={daySettings}
              onBookAnother={(ownerId) =>
                requestNewBooking({
                  dateStr: currentDateStr,
                  slot: "",
                  initialHumanId: ownerId,
                })
              }
              onOpenAddDog={(draft) => parkBooking(draft)}
              onOpenNewClient={() => {
                // Brand-new customer: hand off to the guided New Client
                // wizard. The search step only shows before a dog is picked,
                // so nothing in-progress is lost by closing the booking modal.
                closeNewBooking();
                setShowNewClient(true);
              }}
              initialDateStr={showNewBooking.dateStr}
              initialSlot={showNewBooking.slot}
              initialHumanId={showNewBooking.initialHumanId}
              initialDogId={showNewBooking.initialDogId}
              initialEntries={showNewBooking.initialEntries}
              initialService={showNewBooking.initialService}
              initialAddons={showNewBooking.initialAddons}
              initialStaffCapacityOverride={showNewBooking.capacityOverride === true}
              sourceConversationId={showNewBooking.sourceConversationId}
              sourceMessageText={showNewBooking.sourceMessageText}
              ownerName={showNewBooking.ownerName}
              onSearchDogs={dogsApi.searchDogs}
              isSearchingDogs={dogsApi.isSearching}
            />
          </Suspense>
        </ErrorBoundary>
      )}

      {selectedBooking && (
        <ErrorBoundary>
          <Suspense fallback={null}>
            <BookingDetailModal
              booking={selectedBooking}
              onClose={() => setSelectedBooking(null)}
              onAdd={handleAdd}
              onRemove={handleRemove}
              onOpenHuman={onOpenHuman}
              onMessageOwner={(hid) => { setSelectedBooking(null); navigate(`/inbox?human=${hid}`); }}
              onOpenDog={onOpenDog}
              onUpdate={handleUpdate}
              currentDateStr={selectedBooking._bookingDate || currentDateStr}
              currentDateObj={
                selectedBooking._bookingDate
                  ? new Date(`${selectedBooking._bookingDate}T00:00:00`)
                  : currentDateObj
              }
              bookingsByDate={bookingsByDate}
              dayOpenState={dayOpenState}
              dogs={dogs}
              humans={humans}
              onUpdateDog={updateDog}
              onUpdateHuman={updateHuman}
              onAddHuman={addHuman}
              fetchHumanById={humansApi.fetchHumanById}
              findHumanByFullName={humansApi.findHumanByFullName}
              searchHumansByTerm={humansApi.searchHumansByTerm}
              daySettings={daySettings}
            />
          </Suspense>
        </ErrorBoundary>
      )}

      {showAddDogModal && (
        <ErrorBoundary>
          <Suspense fallback={<LoadingSpinner />}>
            <AddDogModal
              onClose={() => {
                setShowAddDogModal(false);
                // Cancel: re-open the parked booking with their work intact
                // (no new dog). No-op if nothing was parked, or already
                // resumed by a successful add below.
                resumeParkedBooking();
              }}
              onAdd={async (dogData) => {
                const result = await addDog(dogData);
                // Success: re-open the booking with the new dog selected so
                // staff don't have to re-search for the dog they just made.
                if (result) resumeParkedBooking({ newDog: result });
                return result;
              }}
              onAddAnother={async (dogData) => {
                const result = await addDog(dogData);
                // Accumulate into the parked booking and keep the add-dog
                // modal open so the next dog for this customer is one form away.
                if (result) appendDogToParked(result);
                return result;
              }}
              onAddHuman={addHuman}
              presetOwner={pendingPresetOwner}
              humans={humans}
            />
          </Suspense>
        </ErrorBoundary>
      )}

      {showNewClient && (
        <ErrorBoundary>
          <Suspense fallback={<LoadingSpinner />}>
            <NewClientWizard
              onClose={() => setShowNewClient(false)}
              addHuman={addHuman}
              addDog={addDog}
              onAddBookings={commitBookingList}
              findHumanByFullName={humansApi.findHumanByFullName}
              onBookAnother={(ownerId) =>
                requestNewBooking({ dateStr: currentDateStr, slot: "", initialHumanId: ownerId })
              }
              bookingsByDate={bookingsByDate}
              dayOpenState={dayOpenState}
              daySettings={daySettings}
            />
          </Suspense>
        </ErrorBoundary>
      )}

      {collectionNotice && (
        <ErrorBoundary>
          <Suspense fallback={null}>
            <CollectionNoticeModal
              booking={collectionNotice.booking}
              onClose={() => setCollectionNotice(null)}
            />
          </Suspense>
        </ErrorBoundary>
      )}
    </>
  );
}
