import { lazy, Suspense } from "react";
import { SALON_SLOTS } from "../../../constants/index";
import { canBookSlot } from "../../../engine/capacity";
import { getDefaultOpenForDate } from "../../../engine/utils";
import { toDateStr } from "../../../supabase/transforms";
import { useToast } from "../../../contexts/ToastContext.jsx";
import { useGroomPhotos } from "../../../hooks/useGroomPhotos.js";
import { ConfirmDialog } from "../../shared/ConfirmDialog.jsx";
import { ExitConfirmDialog } from "./ExitConfirmDialog.jsx";

// The four sibling modals are lazy so opening a booking does not pull in
// their dependency graphs — each chunk loads only when staff first use its
// trigger. Same React.lazy + Suspense + conditional-mount pattern as
// App.jsx and BookingCardNew.jsx.
const DatePickerModal = lazy(() =>
  import("../DatePickerModal.jsx").then((module) => ({
    default: module.DatePickerModal,
  })),
);
const RescheduleModal = lazy(() =>
  import("../RescheduleModal.jsx").then((module) => ({
    default: module.RescheduleModal,
  })),
);
const RecurringBookingModal = lazy(() =>
  import("../RecurringBookingModal.jsx").then((module) => ({
    default: module.RecurringBookingModal,
  })),
);
const PhotoUploadModal = lazy(() =>
  import("../PhotoUploadModal.jsx").then((module) => ({
    default: module.PhotoUploadModal,
  })),
);

/**
 * Everything that floats above the booking detail surface: the date
 * picker, exit-confirm, reschedule, recurring-series and photo-upload
 * modals plus the capacity-override confirm raised by useBookingSave.
 * The open/closed flags stay with the orchestrator (their triggers live
 * on the main surface); this component owns mounting and the handlers
 * that only the overlays use.
 */
export function BookingDetailOverlays({
  booking,
  dogData,
  sizeTheme,
  editData,
  setEditData,
  setSaveError,
  bookingsByDate,
  daySettings,
  dayOpenState,
  currentDateObj,
  currentDateStr,
  showDatePicker,
  setShowDatePicker,
  showExitConfirm,
  setShowExitConfirm,
  showReschedule,
  setShowReschedule,
  showSeries,
  setShowSeries,
  showPhotoUpload,
  setShowPhotoUpload,
  pendingSaveOverride,
  confirmSaveOverride,
  cancelSaveOverride,
  onUpdate,
  onRemove,
  onClose,
}) {
  const toast = useToast();
  const { uploadPhoto } = useGroomPhotos();

  const handleSelectDate = (newDate) => {
    const newDateStr = toDateStr(newDate);
    const newSettings = daySettings[newDateStr] || {
      isOpen:
        dayOpenState?.[newDateStr] !== undefined
          ? dayOpenState[newDateStr]
          : getDefaultOpenForDate(newDate),
      overrides: {},
      extraSlots: [],
    };
    const newActiveSlots = [...SALON_SLOTS, ...(newSettings.extraSlots || [])];
    const dayBookings = bookingsByDate[newDateStr] || [];
    const filteredBookings = dayBookings.filter((b) => b.id !== booking.id);

    let nextSlot = editData.slot;
    if (nextSlot) {
      const check = canBookSlot(
        filteredBookings,
        nextSlot,
        booking.size,
        newActiveSlots,
        {
          overrides: newSettings.overrides?.[nextSlot] || {},
          dogId: booking._dogId,
          staffOverride: true,
        },
      );
      if (!check.allowed) {
        nextSlot = "";
      }
    }

    setEditData((prev) => ({
      ...prev,
      date: newDate,
      slot: nextSlot,
    }));
    setSaveError("");
    setShowDatePicker(false);
  };

  return (
    <>
      {showDatePicker && (
        <Suspense fallback={null}>
          <DatePickerModal
            currentDate={editData.date}
            dayOpenState={dayOpenState}
            onSelectDate={handleSelectDate}
            onClose={() => setShowDatePicker(false)}
          />
        </Suspense>
      )}

      {showExitConfirm && (
        <ExitConfirmDialog
          onDiscard={() => {
            setShowExitConfirm(false);
            onClose();
          }}
          onKeepEditing={() => setShowExitConfirm(false)}
        />
      )}

      {showReschedule && (
        <Suspense fallback={null}>
          <RescheduleModal
            booking={booking}
            currentDateObj={currentDateObj}
            bookingsByDate={bookingsByDate}
            daySettings={daySettings}
            dayOpenState={dayOpenState}
            sizeTheme={sizeTheme}
            onClose={() => setShowReschedule(false)}
            onConfirm={async (newDateStr, newSlot, options = {}) => {
              const oldDateStr = currentDateStr;
              const oldSlot = booking.slot;
              const updated = {
                ...booking,
                slot: newSlot,
                // capacityOverride flips on when staff picked an override-eligible
                // (over-capacity) slot in the reschedule picker. useBookings.update
                // forwards staff_capacity_override → the trigger stamps _by/_at.
                ...(options.capacityOverride
                  ? { staff_capacity_override: true }
                  : {}),
              };
              await onUpdate(updated, oldDateStr, newDateStr);
              setShowReschedule(false);
              toast.show("Booking rescheduled", "success", () => {
                onUpdate({ ...booking, slot: oldSlot }, newDateStr, oldDateStr);
              });
              onClose();
            }}
          />
        </Suspense>
      )}

      {showSeries && booking._groupId && (
        <Suspense fallback={null}>
          <RecurringBookingModal
            chainId={booking._groupId}
            currentBookingId={booking.id}
            dogName={booking.dogName}
            sizeTheme={sizeTheme}
            onClose={() => setShowSeries(false)}
            onRemove={onRemove}
            onCloseParent={onClose}
          />
        </Suspense>
      )}

      {showPhotoUpload && (
        <Suspense fallback={null}>
          <PhotoUploadModal
            dogId={dogData?.id || booking._dogId}
            bookingId={booking.id}
            bookingDate={currentDateStr}
            sizeTheme={sizeTheme}
            onClose={() => setShowPhotoUpload(false)}
            onSaved={() => toast.show("Photo saved", "success")}
            uploadPhoto={uploadPhoto}
          />
        </Suspense>
      )}

      {pendingSaveOverride && (
        <ConfirmDialog
          title="This time is fully booked"
          message={`${pendingSaveOverride.reason}. Override and save anyway?`}
          confirmLabel="Override and save"
          cancelLabel="Pick another time"
          variant="primary"
          onConfirm={confirmSaveOverride}
          onCancel={cancelSaveOverride}
        />
      )}
    </>
  );
}
