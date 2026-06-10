import { useMemo, useEffect, useCallback, useState } from "react";
import { AccessibleModal } from "../shared/AccessibleModal.tsx";
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
import {
  getAllowedServicesForSize,
  getDogByIdOrName,
  getHumanByIdOrName,
  normalizeServiceForSize,
  computeBookingPricing,
} from "../../engine/bookingRules";
import { toDateStr } from "../../supabase/transforms";

import { BookingHeader } from "./booking-detail/BookingHeader.jsx";
import { BookingStatusBar } from "./booking-detail/BookingStatusBar.jsx";
import { BookingAlerts } from "./booking-detail/BookingAlerts.jsx";
import { BookingActions } from "./booking-detail/BookingActions.jsx";
import { AppointmentDetailsCard } from "./booking-detail/AppointmentDetailsCard.jsx";
import { ServicesAddonsCard } from "./booking-detail/ServicesAddonsCard.jsx";
import { PaymentsPickupCard } from "./booking-detail/PaymentsPickupCard.jsx";
import { BookingMetaFooters } from "./booking-detail/BookingMetaFooters.jsx";
import { BookingDetailOverlays } from "./booking-detail/BookingDetailOverlays.jsx";
import { useAutosave } from "../../hooks/useAutosave.js";

export function BookingDetailModal({
  booking,
  onClose,
  onAdd,
  onRemove,
  onOpenHuman,
  onOpenDog,
  onUpdate,
  currentDateStr,
  currentDateObj,
  bookingsByDate,
  dayOpenState,
  dogs,
  humans,
  onUpdateDog,
  daySettings = {},
}) {
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
  } = useBookingEditState(booking, dogData, currentDateObj);

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

  const sizeTheme = SIZE_THEME[booking.size] || SIZE_FALLBACK;
  // The booking's status colour — same map as the dashboard card pill — drives
  // the header accent bar, the active stepper step and the primary button so
  // the pop-up colour-matches the card it was opened from.
  const statusObj = getStatusDisplay(booking.status || BOOKING_STATUS.BOOKED);
  const [showSeries, setShowSeries] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);
  const [showPhotoUpload, setShowPhotoUpload] = useState(false);

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
  const editDayBookings = bookingsByDate[editDateStr] || [];
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
    customPrice: isEditing ? editData.customPrice : dogData?.customPrice,
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
      toast.show("Booking updated", "success");
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
    humans,
    currentDateObj,
    currentDateStr,
    editDayOpen,
    editSettings,
    editActiveSlots,
    otherBookings,
    allowedServices,
    onUpdate,
    onUpdateDog,
  });

  // Autosave — lightweight save of booking fields while editing
  const autosaveFn = useCallback(async () => {
    if (!editData.slot) return;
    const newDateStr = toDateStr(editData.date);
    await onUpdate(
      {
        ...booking,
        service: normalizeServiceForSize(editData.service, booking.size),
        addons: editData.addons,
        pickupBy:
          getHumanByIdOrName(humans, editData.pickupBy)?.fullName ||
          editData.pickupBy,
        payment: editData.payment,
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
    <AccessibleModal
      onClose={handleCloseAttempt}
      titleId="booking-detail-title"
      className="relative bg-white rounded-2xl w-[min(480px,92vw)] max-h-[90vh] overflow-auto shadow-[0_40px_80px_-24px_rgba(15,23,42,0.45),_0_12px_28px_-12px_rgba(15,23,42,0.3)] ring-1 ring-slate-900/5 animate-card-pop-in"
      backdropClass="bg-slate-900/55 animate-overlay-fade"
      dismissOnEscape={false}
    >
        {/* Status-coloured top accent bar — mirrors the dashboard card's bar so
            the pop-up reads as a floating extension of the card. */}
        <div
          aria-hidden="true"
          className="h-[3px]"
          style={{ background: statusObj.border }}
        />

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
          titleId="booking-detail-title"
          alerts={dogData?.alerts || []}
          allergyText={hasAllergy && allergyInput ? allergyInput : ""}
        />

        <div className="px-5 pt-4 pb-2 bg-slate-50/80">
          <BookingStatusBar
            booking={booking}
            currentDateStr={currentDateStr}
            onUpdate={onUpdate}
          />

          {booking._groupId && (
            <button
              onClick={() => setShowSeries(true)}
              className="w-full mb-3 px-3 py-2 rounded-lg text-[12px] font-bold cursor-pointer font-inherit flex items-center gap-2 border-[1.5px] transition-colors bg-white hover:bg-slate-50"
              style={{
                borderColor: sizeTheme.primary + "40",
                color: sizeTheme.primary,
              }}
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
            primaryHuman={primaryHuman}
            onOpenHuman={onOpenHuman}
            onOpenDatePicker={() => setShowDatePicker(true)}
            editActiveSlots={editActiveSlots}
            otherBookings={otherBookings}
            editSettings={editSettings}
            sizeTheme={sizeTheme}
          />

          {/* ── Card 2: Services & Add-ons ── */}
          <ServicesAddonsCard
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
            activePayment={activePayment}
            activeDepositAmount={activeDepositAmount}
          />

          {/* ── Card 3: Actions & Payments ── */}
          <PaymentsPickupCard
            booking={booking}
            isEditing={isEditing}
            editData={editData}
            setEditData={setEditData}
            humans={humans}
            primaryHuman={primaryHuman}
            pickupHuman={pickupHuman}
            statusObj={statusObj}
          />

          {saveError && (
            <div className="px-3 py-2.5 bg-white text-brand-coral rounded-xl text-[13px] font-bold mb-3 shadow-sm">
              {saveError}
            </div>
          )}

          <BookingMetaFooters booking={booking} />
        </div>

        <BookingActions
          isEditing={isEditing}
          editData={editData}
          saving={saving}
          booking={booking}
          sizeTheme={sizeTheme}
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
    </AccessibleModal>
  );
}
