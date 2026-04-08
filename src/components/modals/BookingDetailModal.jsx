import { useMemo } from "react";
import { useBookingEditState } from "../../hooks/useBookingEditState.ts";
import { useSlotAvailability } from "../../hooks/useSlotAvailability.ts";
import { useBookingSave } from "../../hooks/useBookingSave.ts";
import {
  SERVICES,
  SIZE_THEME,
  SIZE_FALLBACK,
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
import { ContactPopup } from "./ContactPopup.jsx";

import {
  DetailRow,
  LogisticsLabel,
  FinanceLabel,
  MODAL_INPUT_CLS,
} from "./booking-detail/shared.jsx";
import { BookingHeader } from "./booking-detail/BookingHeader.jsx";
import {
  BookingStatusBar,
  ClientConfirmedToggle,
} from "./booking-detail/BookingStatusBar.jsx";
import { BookingAlerts } from "./booking-detail/BookingAlerts.jsx";
import { BookingActions } from "./booking-detail/BookingActions.jsx";
import { ExitConfirmDialog } from "./booking-detail/ExitConfirmDialog.jsx";

const AVAILABLE_ADDONS = ["Flea Bath", "Sensitive Shampoo", "Anal Glands"];

function titleCase(str) {
  if (!str) return "";
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}



export function BookingDetailModal({
  booking,
  onClose,
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

  const sizeTheme = SIZE_THEME[booking.size] || SIZE_FALLBACK;

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

  const { save: handleSave } = useBookingSave({
    editData,
    setSaving,
    setSaveError,
    setIsEditing,
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
    <div
      onClick={handleCloseAttempt}
      className="fixed inset-0 bg-black/35 flex items-center justify-center z-[1000]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl w-[min(420px,95vw)] max-h-[90vh] overflow-auto shadow-[0_8px_32px_rgba(0,0,0,0.18)]"
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
        />

        <div className="px-6 pt-4">
          <BookingStatusBar
            booking={booking}
            currentDateStr={currentDateStr}
            onUpdate={onUpdate}
          />

          <ClientConfirmedToggle
            booking={booking}
            currentDateStr={currentDateStr}
            onUpdate={onUpdate}
          />

          {/* Dog row */}
          <div className="py-2.5 border-b border-slate-200">
            <div className="flex justify-between items-center">
              <span className="text-[12px] font-extrabold text-brand-teal uppercase tracking-wide">
                Dog
              </span>
              <span
                onClick={() =>
                  onOpenDog &&
                  onOpenDog(dogData?.id || booking._dogId || booking.dogName)
                }
                className="text-[13px] font-semibold cursor-pointer"
                style={{
                  color: sizeTheme.primary,
                  borderBottom: `1px dashed ${sizeTheme.primary}`,
                }}
              >
                {titleCase(booking.dogName)}
              </span>
            </div>
          </div>

          {/* Breed row */}
          <div className="py-2.5 border-b border-slate-200">
            <div className="flex justify-between items-center">
              <span className="text-[12px] font-extrabold text-brand-teal uppercase tracking-wide">
                Breed
              </span>
              <span
                onClick={() =>
                  onOpenDog &&
                  onOpenDog(dogData?.id || booking._dogId || booking.dogName)
                }
                className="text-[13px] font-semibold cursor-pointer"
                style={{
                  color: sizeTheme.primary,
                  borderBottom: `1px dashed ${sizeTheme.primary}`,
                }}
              >
                {titleCase(booking.breed || dogData?.breed) || "—"}
              </span>
            </div>
          </div>

          {/* Human / Owner row */}
          <div className="py-2.5 border-b border-slate-200">
            <div className="flex justify-between items-center">
              <span className="text-[12px] font-extrabold text-brand-teal uppercase tracking-wide">
                Human
              </span>
              <span
                onClick={() =>
                  onOpenHuman &&
                  onOpenHuman(
                    primaryHuman?.id || booking._ownerId || booking.owner,
                  )
                }
                className="text-[13px] font-semibold cursor-pointer"
                style={{
                  color: "#2D8B7A",
                  borderBottom: "1px dashed #2D8B7A",
                }}
              >
                {titleCase(booking.owner)}
              </span>
            </div>
          </div>

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

          {/* Logistics rows */}
          <DetailRow
            label={<LogisticsLabel text="Grooming Notes" />}
            value={
              <span style={{ whiteSpace: "pre-wrap" }}>
                {editData.groomNotes || "Standard groom (no specific notes)"}
              </span>
            }
            editNode={
              <textarea
                value={editData.groomNotes}
                onChange={(e) =>
                  setEditData((prev) => ({
                    ...prev,
                    groomNotes: e.target.value,
                  }))
                }
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-[13px] outline-none font-inherit text-slate-800 box-border resize-y min-h-[44px] text-right"
              />
            }
            isEditing={isEditing}
          />

          <DetailRow
            label={<LogisticsLabel text="Date" />}
            value={formatFullDate(isEditing ? editData.date : currentDateObj)}
            editNode={
              <button
                onClick={() => setShowDatePicker(true)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-[13px] outline-none font-inherit text-slate-800 box-border bg-white cursor-pointer flex justify-between items-center"
              >
                <span className="font-semibold">
                  {formatFullDate(editData.date)}
                </span>
                <span className="text-sm">{"\uD83D\uDCC5"}</span>
              </button>
            }
            verticalEdit
            isEditing={isEditing}
          />

          <DetailRow
            label={<LogisticsLabel text="Drop-off time" />}
            value={
              isEditing
                ? editData.slot || (
                    <span className="text-brand-coral">None selected</span>
                  )
                : booking.slot
            }
            editNode={
              <div className="grid grid-cols-[repeat(auto-fill,minmax(70px,1fr))] gap-1.5 w-full">
                {editActiveSlots.length > 0 ? (
                  editActiveSlots.map((slot) => {
                    const allowed = canBookSlot(
                      otherBookings,
                      slot,
                      booking.size,
                      editActiveSlots,
                      {
                        overrides: editSettings.overrides?.[slot] || {},
                      },
                    ).allowed;

                    const seatStates = getSeatStatesForSlot(
                      otherBookings,
                      slot,
                      editActiveSlots,
                      editSettings.overrides?.[slot] || {},
                    );
                    const isStaffOpened = seatStates.some(
                      (seat) => seat.staffOpened,
                    );

                    return (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => {
                          if (!allowed) return;
                          setEditData((prev) => ({ ...prev, slot }));
                          setSaveError("");
                        }}
                        disabled={!allowed}
                        className="py-2 rounded-lg text-[13px] font-semibold text-center"
                        style={{
                          cursor: allowed ? "pointer" : "not-allowed",
                          background:
                            editData.slot === slot
                              ? sizeTheme.primary
                              : isStaffOpened
                                ? sizeTheme.light
                                : "#FFFFFF",
                          color:
                            editData.slot === slot
                              ? sizeTheme.headerText
                              : allowed
                                ? "#1F2937"
                                : "#6B7280",
                          border: `1.5px solid ${
                            editData.slot === slot
                              ? sizeTheme.primary
                              : isStaffOpened
                                ? sizeTheme.primary
                                : "#E5E7EB"
                          }`,
                          opacity: allowed ? 1 : 0.5,
                        }}
                      >
                        {slot}
                      </button>
                    );
                  })
                ) : (
                  <span className="text-[13px] text-brand-coral font-semibold col-span-full">
                    No available slots on this date
                  </span>
                )}
              </div>
            }
            verticalEdit
            isEditing={isEditing}
          />

          <DetailRow
            label={<LogisticsLabel text="Service" />}
            value={`${serviceObj?.icon || ""} ${serviceObj?.name || currentService}`}
            editNode={
              <select
                value={editData.service}
                onChange={(e) => {
                  setEditData((prev) => ({
                    ...prev,
                    service: e.target.value,
                    customPrice:
                      dogData?.customPrice !== undefined
                        ? dogData.customPrice
                        : getNumericPrice(
                            getServicePriceLabel(e.target.value, booking.size),
                          ),
                  }));
                  setSaveError("");
                }}
                className={MODAL_INPUT_CLS}
              >
                {allowedServices.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.icon} {service.name}
                  </option>
                ))}
              </select>
            }
            isEditing={isEditing}
          />

          {/* Add-ons */}
          {isEditing ? (
            <div className="py-2.5 border-b border-slate-200">
              <div className="mb-2">
                <LogisticsLabel text="Add-ons" />
              </div>
              <div className="flex flex-wrap gap-2">
                {AVAILABLE_ADDONS.map((addon) => (
                  <label
                    key={addon}
                    className="flex items-center gap-1.5 text-[13px] cursor-pointer font-medium"
                  >
                    <input
                      type="checkbox"
                      className="w-[18px] h-[18px] cursor-pointer"
                      style={{ accentColor: sizeTheme.primary }}
                      checked={editData.addons.includes(addon)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setEditData((prev) => ({
                            ...prev,
                            addons: [...prev.addons, addon],
                          }));
                        } else {
                          setEditData((prev) => ({
                            ...prev,
                            addons: prev.addons.filter((a) => a !== addon),
                          }));
                        }
                      }}
                    />{" "}
                    {addon}
                  </label>
                ))}
              </div>
            </div>
          ) : editData.addons && editData.addons.length > 0 ? (
            <DetailRow
              label={<LogisticsLabel text="Add-ons" />}
              value={editData.addons.join(", ")}
              isEditing={isEditing}
            />
          ) : null}

          <DetailRow
            label={<LogisticsLabel text="Pick-up Human" />}
            value={isEditing ? selectedPickupLabel : titleCase(booking.pickupBy || booking.owner)}
            editNode={
              <select
                value={editData.pickupBy}
                onChange={(e) => {
                  setEditData((prev) => ({
                    ...prev,
                    pickupBy: e.target.value,
                  }));
                }}
                className={MODAL_INPUT_CLS}
              >
                {pickupOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            }
            isEditing={isEditing}
          />

          <div className="h-6" />

          {/* Finance rows */}
          <DetailRow
            label={<FinanceLabel text="Base Price" />}
            value={
              isEditing ? (
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold">{"\u00A3"}</span>
                  <input
                    type="number"
                    value={editData.customPrice}
                    onChange={(e) =>
                      setEditData((prev) => ({
                        ...prev,
                        customPrice: Number(e.target.value),
                      }))
                    }
                    className="w-20 px-3 py-2 rounded-lg border border-slate-200 text-[13px] outline-none font-inherit text-slate-800 box-border"
                  />
                </div>
              ) : (
                `\u00A3${activePrice}`
              )
            }
            isEditing={isEditing}
          />

          <DetailRow
            label={<FinanceLabel text="Payment Status" />}
            value={isEditing ? editData.payment : booking.payment || "Due at Pick-up"}
            editNode={
              <select
                value={editData.payment}
                onChange={(e) =>
                  setEditData((prev) => ({
                    ...prev,
                    payment: e.target.value,
                  }))
                }
                className={MODAL_INPUT_CLS}
              >
                <option value="Due at Pick-up">Due at Pick-up</option>
                <option value="Deposit Paid">Deposit Paid</option>
                <option value="Paid in Full">Paid in Full</option>
              </select>
            }
            isEditing={isEditing}
          />

          <DetailRow
            label={<FinanceLabel text="Amount Due" />}
            value={
              <span
                className="font-extrabold text-base"
                style={{ color: amountDue > 0 ? "#E8567F" : "#16A34A" }}
              >
                {"\u00A3"}{Math.max(0, amountDue)}
              </span>
            }
            isEditing={isEditing}
          />

          {saveError && (
            <div className="mt-3 px-3 py-2.5 bg-brand-coral-light text-brand-coral rounded-lg text-[13px] font-bold">
              {saveError}
            </div>
          )}

          {primaryHuman?.historyFlag && (
            <div className="text-[13px] text-brand-coral font-bold bg-brand-coral-light px-3 py-2 rounded-lg inline-block float-right mt-3">
              Flag: {primaryHuman.historyFlag}
            </div>
          )}
          <div style={{ clear: "both" }} />
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
          onEnterEdit={() => {
            resetEditState();
            setIsEditing(true);
          }}
          onShowContact={() => setShowContact(true)}
          onRemove={onRemove}
          onClose={onClose}
          onRebook={onRebook}
        />
      </div>

      {showDatePicker && (
        <DatePickerModal
          currentDate={editData.date}
          dayOpenState={dayOpenState}
          onSelectDate={handleSelectDate}
          onClose={() => setShowDatePicker(false)}
        />
      )}

      {showContact && (
        <ContactPopup
          human={primaryHuman}
          onClose={() => setShowContact(false)}
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
    </div>
  );
}
