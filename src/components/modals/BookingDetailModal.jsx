import { useMemo, useEffect, useCallback, useState, lazy, Suspense } from "react";
import { ModalShell } from "./shell/index.js";
import { useBookingEditState } from "../../hooks/useBookingEditState.ts";
import { useSlotAvailability } from "../../hooks/useSlotAvailability.ts";
import { useBookingSave } from "../../hooks/useBookingSave.ts";
import { useToast } from "../../contexts/ToastContext.jsx";
import {
  SIZE_THEME,
  SIZE_FALLBACK,
  BOOKING_STATUS,
  getStatusDisplay,
} from "../../constants/index";
import { getDefaultOpenForDate } from "../../engine/utils";
import { excludeCancelled } from "../../engine/occupancy";
import {
  getAllowedServicesForSize,
  getDogByIdOrName,
  getHumanByIdOrName,
  normalizeServiceForSize,
  computeBookingPricing,
} from "../../engine/bookingRules";
import { toDateStr } from "../../supabase/transforms";
import { useBookingDeliveryFailure } from "../../supabase/hooks/useDeliveryFailures.js";

import { BookingHeader } from "./booking-detail/BookingHeader.jsx";
import { BookingStatusBar } from "./booking-detail/BookingStatusBar.jsx";
import { BookingAlerts } from "./booking-detail/BookingAlerts.jsx";
import { BookingActions } from "./booking-detail/BookingActions.jsx";
import { AppointmentDetailsCard } from "./booking-detail/AppointmentDetailsCard.jsx";
import { ServicesPaymentCard } from "./booking-detail/ServicesPaymentCard.jsx";
import { ReminderCard } from "./booking-detail/ReminderCard.jsx";
import { BookingMetaFooters } from "./booking-detail/BookingMetaFooters.jsx";
import { BookingDetailOverlays } from "./booking-detail/BookingDetailOverlays.jsx";
import { DeliveryFailureCard } from "./booking-detail/DeliveryFailureCard.jsx";
import { useAutosave } from "../../hooks/useAutosave.js";
import { useSalonPricing } from "../../contexts/SalonContext";
import { bookingToReminderRow } from "./send-reminder/bookingToReminderRow.js";

// Lazy so the channel composers don't load until staff first send from here.
const SendReminderModal = lazy(() =>
  import("./send-reminder/SendReminderModal.jsx").then((m) => ({
    default: m.SendReminderModal,
  })),
);

export function BookingDetailModal({
  booking,
  onClose,
  onAdd,
  onRemove,
  onOpenHuman,
  onMessageOwner,
  onOpenDog,
  onUpdate,
  currentDateStr,
  currentDateObj,
  bookingsByDate,
  dayOpenState,
  dogs,
  humans,
  onUpdateDog,
  onUpdateHuman,
  daySettings = {},
}) {
  const configPricing = useSalonPricing();
  const dogData = useMemo(
    () => getDogByIdOrName(dogs, booking._dogId || booking.dogName) || {},
    [dogs, booking._dogId, booking.dogName],
  );

  const {
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
  } = useBookingEditState(booking, dogData, currentDateObj, configPricing);

  const primaryHuman = useMemo(
    () => getHumanByIdOrName(humans, booking._ownerId || booking.owner) || null,
    [humans, booking._ownerId, booking.owner],
  );

  const pickupHuman = useMemo(
    () =>
      getHumanByIdOrName(humans, booking.pickupBy || booking._ownerId || booking.owner) ||
      primaryHuman,
    [humans, booking.pickupBy, booking._ownerId, booking.owner, primaryHuman],
  );

  // Failed customer notifications for THIS booking (null when all delivered).
  const deliveryFailures = useBookingDeliveryFailure(booking.id);

  const sizeTheme = SIZE_THEME[booking.size] || SIZE_FALLBACK;
  // The booking's status colour — same map as the dashboard card pill — drives
  // the header accent bar, the active stepper step and the primary button so
  // the pop-up colour-matches the card it was opened from.
  const statusObj = getStatusDisplay(booking.status || BOOKING_STATUS.BOOKED);
  const [showSeries, setShowSeries] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);
  const [showPhotoUpload, setShowPhotoUpload] = useState(false);
  const [showSendReminder, setShowSendReminder] = useState(false);
  // Optimistic flip for the open modal: SendReminderModal.onSent doesn't
  // report the channel, so we set state+time only; the realtime refetch
  // (useBookings) backfills the real channel on reopen.
  const [reminderSentOverride, setReminderSentOverride] = useState(null);

  // A different booking opened in the same modal instance must not inherit
  // the previous booking's override, open send modal, or edit-mode state.
  // resetEditState() rebuilds editData for the new booking and flips isEditing
  // back off, so staff can't land in edit mode for the wrong booking.
  useEffect(() => {
    setReminderSentOverride(null);
    setShowSendReminder(false);
    resetEditState();
    // Keyed on booking.id only: resetEditState's identity also changes with
    // date/dog props, and depending on it would wipe an in-progress edit on
    // unrelated re-renders. We only want a reset when the booking itself swaps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking.id]);

  const editDateStr = toDateStr(editData.date);
  const editSettings = daySettings[editDateStr] || {
    isOpen:
      dayOpenState?.[editDateStr] !== undefined
        ? dayOpenState[editDateStr]
        : getDefaultOpenForDate(editData.date),
    overrides: {},
    extraSlots: [],
  };
  const editDayOpen =
    dayOpenState?.[editDateStr] !== undefined
      ? dayOpenState[editDateStr]
      : editSettings.isOpen;
  // Cancelled rows free their seat, so exclude them before the reschedule
  // slot-picker (canBookSlot / getSeatStatesForSlot) and useSlotAvailability
  // treat the day as occupied — otherwise a cancelled booking phantom-blocks
  // an open slot.
  const editDayBookings = excludeCancelled(bookingsByDate[editDateStr] || []);
  const otherBookings = editDayBookings.filter((b) => b.id !== booking.id);

  const { editActiveSlots } = useSlotAvailability({
    editDateStr,
    editSettings,
    editDayOpen,
    otherBookings,
    bookingSize: booking.size,
    bookingSlot: editData.slot,
    bookingDogId: booking._dogId,
    isEditing,
  });

  const allowedServices = useMemo(
    () => getAllowedServicesForSize(booking.size || dogData?.size || "small"),
    [booking.size, dogData?.size],
  );

  const activeAddons = isEditing ? editData.addons : booking.addons || [];
  const activePayment = isEditing
    ? editData.payment
    : booking.payment || "Due at Pick-up";

  const activeDepositAmount = isEditing
    ? editData.depositAmount
    : booking.depositAmount ?? 10;

  const pricing = computeBookingPricing({
    service: booking.service,
    size: booking.size,
    addons: activeAddons,
    payment: activePayment,
    depositAmount: activeDepositAmount,
    // While editing, the typed price IS this booking's price (it becomes a
    // per-booking override on save unless "Save as usual" is ticked).
    priceOverride: isEditing ? editData.price : booking.priceOverride,
    customPrice: dogData?.customPrice,
    configPricing,
  });

  const handleCloseAttempt = useCallback(() => {
    if (isEditing) setShowExitConfirm(true);
    else onClose();
  }, [isEditing, onClose, setShowExitConfirm]);

  // Custom Escape handler — checks for unsaved changes before closing
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") { e.stopPropagation(); handleCloseAttempt(); } };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [handleCloseAttempt]);

  const toast = useToast();

  const setIsEditingWithToast = useCallback((value) => {
    setIsEditing(value);
    if (value === false) {
      toast.show("Booking updated — all saved", "success");
    }
  }, [setIsEditing, toast]);

  const {
    save: handleSave,
    pendingOverride: pendingSaveOverride,
    confirmOverride: confirmSaveOverride,
    cancelOverride: cancelSaveOverride,
  } = useBookingSave({
    editData,
    setSaving,
    setSaveError,
    setIsEditing: setIsEditingWithToast,
    hasAllergy,
    allergyInput,
    booking,
    dogData,
    humans,
    currentDateObj,
    currentDateStr,
    editDayOpen,
    editSettings,
    editActiveSlots,
    otherBookings,
    allowedServices,
    configPricing,
    onUpdate,
    onUpdateDog,
  });

  // Autosave — lightweight save of booking fields while editing
  const autosaveFn = useCallback(async () => {
    if (!editData.slot) return;
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
  }, [editData, booking, humans, currentDateStr, onUpdate]);

  const { status: autosaveStatus } = useAutosave(
    editData,
    autosaveFn,
    { delay: 2000, enabled: isEditing },
  );

  return (
    <ModalShell
      onClose={handleCloseAttempt}
      titleId="booking-detail-title"
      accent={statusObj.border}
      widthClass="w-[min(480px,93vw)]"
      maxHeightClass="max-h-[90vh]"
      dismissOnEscape={false}
      bodyClassName="px-5 max-[400px]:px-3 pt-1 pb-2"
      // Marks every field in this modal for the iOS focus-zoom fix (≥16px
      // on touch, 13px only on mouse/desktop). See `.bm-fields` in index.css.
      rootClassName="bm-fields"
      header={
        <BookingHeader
          booking={booking}
          dogData={dogData}
          dogs={dogs}
          humans={humans}
          isEditing={isEditing}
          editData={editData}
          setEditData={setEditData}
          setSaveError={setSaveError}
          allowedServices={allowedServices}
          pricing={pricing}
          onClose={handleCloseAttempt}
          onEnterEdit={() => { resetEditState(); setIsEditing(true); }}
          onOpenCamera={() => setShowPhotoUpload(true)}
          onOpenDog={onOpenDog}
          primaryHuman={primaryHuman}
          onOpenHuman={onOpenHuman}
          onMessageOwner={onMessageOwner}
          titleId="booking-detail-title"
          alerts={dogData?.alerts || []}
          allergyText={hasAllergy && allergyInput ? allergyInput : ""}
        />
      }
      footer={
        <BookingActions
          isEditing={isEditing}
          editData={editData}
          saving={saving}
          booking={booking}
          onSave={handleSave}
          onCancelEdit={() => {
            resetEditState();
            setIsEditing(false);
          }}
          onAdd={onAdd}
          onRemove={onRemove}
          onUpdate={onUpdate}
          currentDateStr={currentDateStr}
          onClose={onClose}
          onReschedule={() => setShowReschedule(true)}
          autosaveStatus={autosaveStatus}
        />
      }
    >
        <div>
          <BookingStatusBar
            booking={booking}
            currentDateStr={currentDateStr}
            onUpdate={onUpdate}
          />

          <DeliveryFailureCard
            booking={booking}
            failures={deliveryFailures}
            primaryHuman={primaryHuman}
            onUpdateHuman={onUpdateHuman}
          />

          {booking._groupId && (
            <button
              onClick={() => setShowSeries(true)}
              className="w-full mb-3 px-3 py-2 rounded-full text-[12px] font-bold cursor-pointer font-inherit flex items-center justify-center gap-2 border-[1.5px] border-slate-200 text-brand-purple transition-colors bg-white hover:bg-slate-50"
            >
              <span className="text-sm">{"🔁"}</span>
              Part of recurring series — View all
            </button>
          )}

          <BookingAlerts
            isEditing={isEditing}
            editData={editData}
            setEditData={setEditData}
            dogData={dogData}
            hasAllergy={hasAllergy}
            setHasAllergy={setHasAllergy}
            allergyInput={allergyInput}
            setAllergyInput={setAllergyInput}
          />

          {/* ── Card 1: Appointment Summary ── */}
          <AppointmentDetailsCard
            booking={booking}
            isEditing={isEditing}
            editData={editData}
            setEditData={setEditData}
            setSaveError={setSaveError}
            currentDateObj={currentDateObj}
            humans={humans}
            primaryHuman={primaryHuman}
            onOpenHuman={onOpenHuman}
            onOpenDatePicker={() => setShowDatePicker(true)}
            editActiveSlots={editActiveSlots}
            otherBookings={otherBookings}
            editSettings={editSettings}
            sizeTheme={sizeTheme}
          />

          {/* ── Card 2: Services & Payment ── */}
          <ServicesPaymentCard
            booking={booking}
            isEditing={isEditing}
            editData={editData}
            setEditData={setEditData}
            setSaveError={setSaveError}
            dogData={dogData}
            allowedServices={allowedServices}
            sizeTheme={sizeTheme}
            pricing={pricing}
            activeAddons={activeAddons}
            onUpdate={onUpdate}
            currentDateStr={currentDateStr}
          />

          {/* ── Card 3: Reminder ── (between Services & Payment and the
              footer actions). The pickup-message action targets the saved
              pick-up human (pickupHuman) and only shows in view mode, so it
              always reflects the persisted pick-up selection. */}
          <ReminderCard
            // Apply the optimistic "sent" flip only when the booking isn't
            // already confirmed — never let the override downgrade a
            // confirmed booking back to "sent" (confirmed always wins).
            booking={
              reminderSentOverride &&
              booking.reminderState !== "confirmed" &&
              !booking.reminderConfirmedAt
                ? { ...booking, ...reminderSentOverride }
                : booking
            }
            pickupHuman={pickupHuman}
            isEditing={isEditing}
            onSendReminder={() => setShowSendReminder(true)}
          />

          {saveError && (
            <div className="px-3 py-2.5 bg-white text-brand-coral rounded-xl text-[13px] font-bold mb-3 shadow-sm">
              {saveError}
            </div>
          )}

          <BookingMetaFooters booking={booking} />
        </div>

      <BookingDetailOverlays
        booking={booking}
        dogData={dogData}
        sizeTheme={sizeTheme}
        editData={editData}
        setEditData={setEditData}
        setSaveError={setSaveError}
        bookingsByDate={bookingsByDate}
        daySettings={daySettings}
        dayOpenState={dayOpenState}
        currentDateObj={currentDateObj}
        currentDateStr={currentDateStr}
        showDatePicker={showDatePicker}
        setShowDatePicker={setShowDatePicker}
        showExitConfirm={showExitConfirm}
        setShowExitConfirm={setShowExitConfirm}
        showReschedule={showReschedule}
        setShowReschedule={setShowReschedule}
        showSeries={showSeries}
        setShowSeries={setShowSeries}
        showPhotoUpload={showPhotoUpload}
        setShowPhotoUpload={setShowPhotoUpload}
        pendingSaveOverride={pendingSaveOverride}
        confirmSaveOverride={confirmSaveOverride}
        cancelSaveOverride={cancelSaveOverride}
        onUpdate={onUpdate}
        onRemove={onRemove}
        onClose={onClose}
      />
      {showSendReminder && (
        <Suspense fallback={null}>
          <SendReminderModal
            row={bookingToReminderRow(booking)}
            targetDate={booking._bookingDate}
            onClose={() => setShowSendReminder(false)}
            onSent={() => {
              setReminderSentOverride({
                reminderState: "sent",
                reminderSentAt: new Date().toISOString(),
              });
              setShowSendReminder(false);
            }}
          />
        </Suspense>
      )}
    </ModalShell>
  );
}
