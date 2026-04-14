import { useMemo, useEffect, useCallback, useState } from "react";
import { AccessibleModal } from "../shared/AccessibleModal.tsx";
import { useBookingEditState } from "../../hooks/useBookingEditState.ts";
import { useSlotAvailability } from "../../hooks/useSlotAvailability.ts";
import { useBookingSave } from "../../hooks/useBookingSave.ts";
import { useToast } from "../../contexts/ToastContext.jsx";
import {
  SERVICES,
  SIZE_THEME,
  SIZE_FALLBACK,
  SALON_SLOTS,
} from "../../constants/index.js";
import { canBookSlot, getSeatStatesForSlot } from "../../engine/capacity.js";
import { formatFullDate, getDefaultOpenForDate } from "../../engine/utils.js";
import {
  getAllowedServicesForSize,
  getDogByIdOrName,
  getHumanByIdOrName,
  getNumericPrice,
  getServicePriceLabel,
  normalizeServiceForSize,
} from "../../engine/bookingRules.js";
import { toDateStr } from "../../supabase/transforms.js";
import { DatePickerModal } from "./DatePickerModal.jsx";

import {
  DetailRow,
  LogisticsLabel,
  FinanceLabel,
  SectionCard,
  CardRow,
  MODAL_INPUT_CLS,
} from "./booking-detail/shared.jsx";
import { BookingHeader } from "./booking-detail/BookingHeader.jsx";
import { BookingStatusBar } from "./booking-detail/BookingStatusBar.jsx";
import { BookingAlerts } from "./booking-detail/BookingAlerts.jsx";
import { BookingActions } from "./booking-detail/BookingActions.jsx";
import { ExitConfirmDialog } from "./booking-detail/ExitConfirmDialog.jsx";
import { useAutosave } from "../../hooks/useAutosave.js";
import { RecurringBookingModal } from "./RecurringBookingModal.jsx";
import { RescheduleModal } from "./RescheduleModal.jsx";
import { titleCase } from "../../utils/text.js";

const AVAILABLE_ADDONS = ["Flea Bath", "Sensitive Shampoo", "Anal Glands"];



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
  onRebook,
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
      showContact,
      setShowContact,
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
  const [showSeries, setShowSeries] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);

  const trustedHumans = useMemo(() => {
    const trusted = primaryHuman?.trustedIds || [];
    const ownerId = primaryHuman?.id || booking._ownerId || null;
    const ownerName = primaryHuman?.fullName || booking.owner || "";

    const items = [ownerId || ownerName, ...trusted];
    const unique = [];
    for (const item of items) {
      if (!item) continue;
      if (!unique.includes(item)) unique.push(item);
    }
    return unique;
  }, [primaryHuman, booking._ownerId, booking.owner]);

  const currentService = isEditing ? editData.service : booking.service;
  const serviceObj = SERVICES.find((s) => s.id === currentService);

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

  const { editActiveSlots, availableSlots, currentSlotStillValid } =
    useSlotAvailability({
      editDateStr,
      editSettings,
      editDayOpen,
      otherBookings,
      bookingSize: booking.size,
      bookingSlot: editData.slot,
      isEditing,
    });

  const allowedServices = useMemo(
    () => getAllowedServicesForSize(booking.size || dogData?.size || "small"),
    [booking.size, dogData?.size],
  );

  const activePrice = isEditing
    ? editData.customPrice
    : dogData?.customPrice !== undefined
      ? dogData.customPrice
      : getNumericPrice(
          getServicePriceLabel(
            normalizeServiceForSize(booking.service, booking.size),
            booking.size,
          ),
        );

  const activeAddons = isEditing ? editData.addons : booking.addons || [];
  const activePayment = isEditing
    ? editData.payment
    : booking.payment || "Due at Pick-up";

  let amountDue = Number(activePrice || 0);
  if (activeAddons.includes("Flea Bath")) amountDue += 10;
  if (activePayment === "Deposit Paid") amountDue -= 10;
  else if (activePayment === "Paid in Full") amountDue = 0;

  const handleCloseAttempt = () => {
    if (isEditing) setShowExitConfirm(true);
    else onClose();
  };

  // Custom Escape handler — checks for unsaved changes before closing
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") { e.stopPropagation(); handleCloseAttempt(); } };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [isEditing, onClose]);

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

  const toast = useToast();

  const setIsEditingWithToast = useCallback((value) => {
    setIsEditing(value);
    if (value === false) {
      toast.show("Booking updated", "success");
    }
  }, [setIsEditing, toast]);

  const { save: handleSave } = useBookingSave({
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

  const pickupOptions = trustedHumans.map((value) => {
    const human = getHumanByIdOrName(humans, value);
    return {
      value: human?.id || value,
      label: titleCase(
        human?.fullName ||
        `${human?.name || ""} ${human?.surname || ""}`.trim() ||
        value
      ),
    };
  });

  const selectedPickupLabel = titleCase(
    getHumanByIdOrName(humans, editData.pickupBy)?.fullName ||
    editData.pickupBy ||
    booking.pickupBy ||
    booking.owner
  );

  return (
    <AccessibleModal
      onClose={handleCloseAttempt}
      titleId="booking-detail-title"
      className="bg-white rounded-2xl w-[min(420px,95vw)] max-h-[90vh] overflow-auto shadow-[0_8px_32px_rgba(0,0,0,0.18)]"
      dismissOnEscape={false}
    >
        <BookingHeader
          booking={booking}
          dogData={dogData}
          isEditing={isEditing}
          editData={editData}
          setEditData={setEditData}
          setSaveError={setSaveError}
          allowedServices={allowedServices}
          onClose={handleCloseAttempt}
          onEnterEdit={() => { resetEditState(); setIsEditing(true); }}
          onOpenDog={onOpenDog}
          titleId="booking-detail-title"
          alerts={dogData?.alerts || []}
          allergyText={hasAllergy && allergyInput ? allergyInput : ""}
        />

        <div
          className="px-4 pt-4 pb-2"
          style={{ background: sizeTheme.light }}
        >
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
              <span className="text-sm">{"\uD83D\uDD01"}</span>
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
          {isEditing ? (
            <SectionCard title="Appointment Details">
              <DetailRow
                label={<LogisticsLabel text="Date" />}
                value={formatFullDate(editData.date)}
                editNode={
                  <button
                    onClick={() => setShowDatePicker(true)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-[13px] outline-none font-inherit text-slate-800 box-border bg-white cursor-pointer flex justify-between items-center"
                  >
                    <span className="font-semibold">{formatFullDate(editData.date)}</span>
                    <span className="text-sm">{"\uD83D\uDCC5"}</span>
                  </button>
                }
                verticalEdit
                isEditing={isEditing}
              />
              <DetailRow
                label={<LogisticsLabel text="Drop-off time" />}
                value={editData.slot || <span className="text-brand-coral">None selected</span>}
                editNode={
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(70px,1fr))] gap-1.5 w-full">
                    {editActiveSlots.length > 0 ? (
                      editActiveSlots.map((slot) => {
                        const allowed = canBookSlot(otherBookings, slot, booking.size, editActiveSlots, { overrides: editSettings.overrides?.[slot] || {} }).allowed;
                        const seatStates = getSeatStatesForSlot(otherBookings, slot, editActiveSlots, editSettings.overrides?.[slot] || {});
                        const isStaffOpened = seatStates.some((seat) => seat.staffOpened);
                        return (
                          <button key={slot} type="button" onClick={() => { if (!allowed) return; setEditData((prev) => ({ ...prev, slot })); setSaveError(""); }} disabled={!allowed} className="py-2 rounded-lg text-[13px] font-semibold text-center" style={{ cursor: allowed ? "pointer" : "not-allowed", background: editData.slot === slot ? sizeTheme.primary : isStaffOpened ? sizeTheme.light : "#FFFFFF", color: editData.slot === slot ? sizeTheme.headerText : allowed ? "#1F2937" : "#6B7280", border: `1.5px solid ${editData.slot === slot ? sizeTheme.primary : isStaffOpened ? sizeTheme.primary : "#E5E7EB"}`, opacity: allowed ? 1 : 0.5 }}>
                            {slot}
                          </button>
                        );
                      })
                    ) : (
                      <span className="text-[13px] text-brand-coral font-semibold col-span-full">No available slots on this date</span>
                    )}
                  </div>
                }
                verticalEdit
                isEditing={isEditing}
              />
              <DetailRow
                label={<LogisticsLabel text="Human" />}
                value={titleCase(booking.owner)}
                isEditing={isEditing}
              />
              <DetailRow
                label={<LogisticsLabel text="Grooming Notes" />}
                value={<span style={{ whiteSpace: "pre-wrap" }}>{editData.groomNotes || "Standard groom (no specific notes)"}</span>}
                editNode={
                  <textarea value={editData.groomNotes} onChange={(e) => setEditData((prev) => ({ ...prev, groomNotes: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-[13px] outline-none font-inherit text-slate-800 box-border resize-y min-h-[44px] text-right" />
                }
                isEditing={isEditing}
              />
            </SectionCard>
          ) : (
            <SectionCard>
              <CardRow label={<LogisticsLabel text="Date" />} value={formatFullDate(currentDateObj)} />
              <CardRow label={<LogisticsLabel text="Drop-off Time" />} value={booking.slot} />
              <CardRow
                label={<LogisticsLabel text="Human" />}
                value={titleCase(booking.owner)}
                onClick={() => onOpenHuman?.(primaryHuman?.id || booking._ownerId || booking.owner)}
              />
              <CardRow
                label={<LogisticsLabel text="Grooming Notes" />}
                value={editData.groomNotes || "Standard groom (no specific notes)"}
                last
              />
            </SectionCard>
          )}

          {/* ── Card 2: Services & Add-ons ── */}
          {isEditing ? (
            <SectionCard title="Services & Add-ons">
              <DetailRow
                label={<LogisticsLabel text="Service" />}
                value={`${serviceObj?.icon || ""} ${serviceObj?.name || currentService}`}
                editNode={
                  <select value={editData.service} onChange={(e) => { setEditData((prev) => ({ ...prev, service: e.target.value, customPrice: dogData?.customPrice !== undefined ? dogData.customPrice : getNumericPrice(getServicePriceLabel(e.target.value, booking.size)) })); setSaveError(""); }} className={MODAL_INPUT_CLS}>
                    {allowedServices.map((service) => (<option key={service.id} value={service.id}>{service.icon} {service.name}</option>))}
                  </select>
                }
                isEditing={isEditing}
              />
              <div className="py-2.5 border-b border-slate-100">
                <div className="mb-2"><LogisticsLabel text="Add-ons" /></div>
                <div className="flex flex-wrap gap-2">
                  {AVAILABLE_ADDONS.map((addon) => (
                    <label key={addon} className="flex items-center gap-1.5 text-[13px] cursor-pointer font-medium">
                      <input type="checkbox" className="w-[18px] h-[18px] cursor-pointer" style={{ accentColor: sizeTheme.primary }} checked={editData.addons.includes(addon)} onChange={(e) => { if (e.target.checked) { setEditData((prev) => ({ ...prev, addons: [...prev.addons, addon] })); } else { setEditData((prev) => ({ ...prev, addons: prev.addons.filter((a) => a !== addon) })); } }} />{" "}{addon}
                    </label>
                  ))}
                </div>
              </div>
              <DetailRow
                label={<FinanceLabel text="Base Price" />}
                value={
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold">{"\u00A3"}</span>
                    <input type="number" value={editData.customPrice} onChange={(e) => setEditData((prev) => ({ ...prev, customPrice: Number(e.target.value) }))} className="w-20 px-3 py-2 rounded-lg border border-slate-200 text-[13px] outline-none font-inherit text-slate-800 box-border" />
                  </div>
                }
                isEditing={isEditing}
              />
            </SectionCard>
          ) : (
            <SectionCard>
              <div className="flex justify-between items-center py-2.5 border-b border-slate-100">
                <LogisticsLabel text={`${serviceObj?.icon || ""} ${serviceObj?.name || currentService}`} />
                <span className="text-[13px] font-bold text-slate-800">{"\u00A3"}{activePrice}</span>
              </div>
              {activeAddons.map((addon) => (
                <div key={addon} className="flex justify-between items-center py-2.5 border-b border-slate-100">
                  <LogisticsLabel text={`${addon} — Add-on`} />
                  <span className="text-[13px] font-bold text-slate-800">
                    {addon === "Flea Bath" ? "\u00A310" : <span className="text-slate-400 font-medium italic">Included</span>}
                  </span>
                </div>
              ))}
              {activePayment === "Deposit Paid" && (
                <div className="flex justify-between items-center py-2.5 border-b border-slate-100">
                  <FinanceLabel text="Deposit Paid" />
                  <span className="text-[13px] font-bold text-emerald-600">{"\u2212\u00A3"}10</span>
                </div>
              )}
              {activePayment === "Paid in Full" && (
                <div className="flex justify-between items-center py-2.5 border-b border-slate-100">
                  <FinanceLabel text="Paid in Full" />
                  <span className="text-[13px] font-bold text-emerald-600">
                    {"\u2212\u00A3"}{Number(activePrice || 0) + (activeAddons.includes("Flea Bath") ? 10 : 0)}
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center pt-3 pb-1">
                <FinanceLabel text={activePayment === "Paid in Full" ? "Paid" : "Total Due"} />
                <span className="text-[15px] font-extrabold" style={{ color: amountDue > 0 ? "#C93D63" : "#16A34A" }}>
                  {"\u00A3"}{Math.max(0, amountDue)}
                </span>
              </div>
            </SectionCard>
          )}

          {/* ── Card 3: Actions & Payments ── */}
          {isEditing ? (
            <SectionCard title="Payments">
              <DetailRow
                label={<FinanceLabel text="Payment Status" />}
                value={editData.payment}
                editNode={
                  <select value={editData.payment} onChange={(e) => setEditData((prev) => ({ ...prev, payment: e.target.value }))} className={MODAL_INPUT_CLS}>
                    <option value="Due at Pick-up">Due at Pick-up</option>
                    <option value="Deposit Paid">Deposit Paid</option>
                    <option value="Paid in Full">Paid in Full</option>
                  </select>
                }
                isEditing={isEditing}
              />
              <DetailRow
                label={<LogisticsLabel text="Pick-up Human" />}
                value={selectedPickupLabel}
                editNode={
                  <select value={editData.pickupBy} onChange={(e) => setEditData((prev) => ({ ...prev, pickupBy: e.target.value }))} className={MODAL_INPUT_CLS}>
                    {pickupOptions.map((option) => (<option key={option.value} value={option.value}>{option.label}</option>))}
                  </select>
                }
                isEditing={isEditing}
              />
            </SectionCard>
          ) : (
            <SectionCard>
              <CardRow label={<LogisticsLabel text="Pick-up Human" />} value={titleCase(booking.pickupBy || booking.owner)} last />
              {pickupHuman?.phone && (
                <a
                  href={`sms:${pickupHuman.phone}?body=${encodeURIComponent(`Hey, it's Smarter Dog Grooming Salon\n${titleCase(booking.dogName)} will be ready for collection in 15mins.\nSee you soon \uD83C\uDF93\uD83D\uDC36\u2764\uFE0F X`)}`}
                  className="block mt-3 py-2.5 rounded-lg text-[13px] font-bold text-center transition-colors no-underline"
                  style={{
                    background: sizeTheme.gradient[0],
                    color: sizeTheme.headerText,
                  }}
                >
                  Message {titleCase(pickupHuman.fullName || booking.pickupBy || booking.owner)}
                </a>
              )}
            </SectionCard>
          )}

          {saveError && (
            <div className="px-3 py-2.5 bg-white text-brand-coral rounded-xl text-[13px] font-bold mb-3 shadow-sm">
              {saveError}
            </div>
          )}
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
          onClose={onClose}
          onReschedule={() => setShowReschedule(true)}
          autosaveStatus={autosaveStatus}
        />

      {showDatePicker && (
        <DatePickerModal
          currentDate={editData.date}
          dayOpenState={dayOpenState}
          onSelectDate={handleSelectDate}
          onClose={() => setShowDatePicker(false)}
        />
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
        <RescheduleModal
          booking={booking}
          currentDateObj={currentDateObj}
          bookingsByDate={bookingsByDate}
          daySettings={daySettings}
          dayOpenState={dayOpenState}
          sizeTheme={sizeTheme}
          onClose={() => setShowReschedule(false)}
          onConfirm={async (newDateStr, newSlot) => {
            const oldDateStr = currentDateStr;
            const oldSlot = booking.slot;
            await onUpdate(
              { ...booking, slot: newSlot },
              oldDateStr,
              newDateStr,
            );
            setShowReschedule(false);
            toast.show("Booking rescheduled", "success", () => {
              onUpdate({ ...booking, slot: oldSlot }, newDateStr, oldDateStr);
            });
            onClose();
          }}
        />
      )}

      {showSeries && booking._groupId && (
        <RecurringBookingModal
          chainId={booking._groupId}
          currentBookingId={booking.id}
          dogName={booking.dogName}
          sizeTheme={sizeTheme}
          onClose={() => setShowSeries(false)}
          onRemove={onRemove}
          onCloseParent={onClose}
        />
      )}
    </AccessibleModal>
  );
}
