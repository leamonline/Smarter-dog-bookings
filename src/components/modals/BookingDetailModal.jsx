import { useMemo, useState } from "react";
import {
  BRAND,
  SERVICES,
  SALON_SLOTS,
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


function buildEditState(booking, dogData, currentDateObj) {
  const size = booking.size || dogData?.size || "small";
  const service = normalizeServiceForSize(
    booking.service || "full-groom",
    size,
  );
  const basePrice =
    dogData?.customPrice !== undefined
      ? dogData.customPrice
      : getNumericPrice(getServicePriceLabel(service, size));

  return {
    service,
    pickupBy: booking.pickupBy || booking.owner || "",
    payment: booking.payment || "Due at Pick-up",
    groomNotes: dogData?.groomNotes || "",
    alerts: [...(dogData?.alerts || [])],
    addons: [...(booking.addons || [])],
    date: currentDateObj,
    slot: booking.slot || "",
    customPrice: basePrice,
  };
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
  const [isEditing, setIsEditing] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);

  const dogData = useMemo(
    () => getDogByIdOrName(dogs, booking._dogId || booking.dogName) || {},
    [dogs, booking._dogId, booking.dogName],
  );

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

  const [editData, setEditData] = useState(() =>
    buildEditState(booking, dogData, currentDateObj),
  );

  const [allergyInput, setAllergyInput] = useState(() => {
    const allergy = (dogData?.alerts || []).find((a) =>
      a.startsWith("Allergic to "),
    );
    return allergy ? allergy.replace("Allergic to ", "") : "";
  });

  const [hasAllergy, setHasAllergy] = useState(() =>
    (dogData?.alerts || []).some((a) => a.startsWith("Allergic to ")),
  );

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
  const editActiveSlots = [...SALON_SLOTS, ...(editSettings.extraSlots || [])];

  const editDayBookings = bookingsByDate[editDateStr] || [];
  const otherBookings = editDayBookings.filter((b) => b.id !== booking.id);

  const allowedServices = useMemo(
    () => getAllowedServicesForSize(booking.size || dogData?.size || "small"),
    [booking.size, dogData?.size],
  );

  const availableSlots = useMemo(() => {
    return editActiveSlots.filter((slot) => {
      const check = canBookSlot(
        otherBookings,
        slot,
        booking.size,
        editActiveSlots,
        {
          overrides: editSettings.overrides?.[slot] || {},
        },
      );
      return check.allowed;
    });
  }, [otherBookings, booking.size, editActiveSlots, editSettings.overrides]);

  const currentSlotStillValid = useMemo(() => {
    if (!editData.slot) return false;
    const check = canBookSlot(
      otherBookings,
      editData.slot,
      booking.size,
      editActiveSlots,
      {
        overrides: editSettings.overrides?.[editData.slot] || {},
      },
    );
    return check.allowed;
  }, [
    otherBookings,
    booking.size,
    editActiveSlots,
    editSettings.overrides,
    editData.slot,
  ]);

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

  const resetEditState = () => {
    setEditData(buildEditState(booking, dogData, currentDateObj));
    const allergy = (dogData?.alerts || []).find((a) =>
      a.startsWith("Allergic to "),
    );
    setAllergyInput(allergy ? allergy.replace("Allergic to ", "") : "");
    setHasAllergy(
      (dogData?.alerts || []).some((a) => a.startsWith("Allergic to ")),
    );
    setSaveError("");
  };

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

  const handleSave = async () => {
    if (!editData.slot) {
      setSaveError("Select a drop-off time");
      return;
    }

    if (!editDayOpen) {
      setSaveError("This day is currently closed");
      return;
    }

    const normalizedService = normalizeServiceForSize(
      editData.service,
      booking.size,
    );
    if (!allowedServices.some((service) => service.id === normalizedService)) {
      setSaveError("Select a valid service for this dog size");
      return;
    }

    const slotCheck = canBookSlot(
      otherBookings,
      editData.slot,
      booking.size,
      editActiveSlots,
      {
        overrides: editSettings.overrides?.[editData.slot] || {},
      },
    );

    if (!slotCheck.allowed) {
      setSaveError(slotCheck.reason);
      return;
    }

    setSaving(true);
    setSaveError("");

    let finalNotes = editData.groomNotes || "";
    const originalDateDisplay = formatFullDate(currentDateObj);
    const newDateDisplay = formatFullDate(editData.date);

    if (
      originalDateDisplay !== newDateDisplay ||
      booking.slot !== editData.slot
    ) {
      const stamp = `\n\n[Booking moved by Staff from ${originalDateDisplay} at ${booking.slot} to ${newDateDisplay} at ${editData.slot}]`;
      finalNotes += stamp;
    }

    const finalAlerts = editData.alerts.filter(
      (a) => !a.startsWith("Allergic to "),
    );
    if (hasAllergy && allergyInput.trim()) {
      finalAlerts.push(`Allergic to ${allergyInput.trim()}`);
    }

    const dogUpdateResult = await onUpdateDog(
      booking._dogId || booking.dogName,
      {
        alerts: finalAlerts,
        groomNotes: finalNotes,
        customPrice: Number(editData.customPrice || 0),
      },
    );

    if (dogUpdateResult === null) {
      setSaving(false);
      setSaveError("Could not update dog details");
      return;
    }

    const newDateStr = toDateStr(editData.date);
    const updateResult = await onUpdate(
      {
        ...booking,
        service: normalizedService,
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

    if (!updateResult) {
      setSaving(false);
      setSaveError("Could not save booking changes");
      return;
    }

    setSaving(false);
    setIsEditing(false);
  };

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
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: BRAND.white,
          borderRadius: 16,
          width: 420,
          maxHeight: "90vh",
          overflow: "auto",
          boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
        }}
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

        <div style={{ padding: "16px 24px 0" }}>
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
          <div
            style={{
              padding: "10px 0",
              borderBottom: `1px solid ${BRAND.greyLight}`,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: "#1E6B5C", textTransform: "uppercase", letterSpacing: 0.5 }}>
                Dog
              </span>
              <span
                onClick={() =>
                  onOpenDog &&
                  onOpenDog(dogData?.id || booking._dogId || booking.dogName)
                }
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: sizeTheme.primary,
                  cursor: "pointer",
                  borderBottom: `1px dashed ${sizeTheme.primary}`,
                }}
              >
                {titleCase(booking.dogName)}
              </span>
            </div>
          </div>

          {/* Breed row */}
          <div
            style={{
              padding: "10px 0",
              borderBottom: `1px solid ${BRAND.greyLight}`,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: "#1E6B5C", textTransform: "uppercase", letterSpacing: 0.5 }}>
                Breed
              </span>
              <span
                onClick={() =>
                  onOpenDog &&
                  onOpenDog(dogData?.id || booking._dogId || booking.dogName)
                }
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: sizeTheme.primary,
                  cursor: "pointer",
                  borderBottom: `1px dashed ${sizeTheme.primary}`,
                }}
              >
                {titleCase(booking.breed || dogData?.breed) || "—"}
              </span>
            </div>
          </div>

          {/* Human / Owner row */}
          <div
            style={{
              padding: "10px 0",
              borderBottom: `1px solid ${BRAND.greyLight}`,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: "#1E6B5C", textTransform: "uppercase", letterSpacing: 0.5 }}>
                Human
              </span>
              <span
                onClick={() =>
                  onOpenHuman &&
                  onOpenHuman(
                    primaryHuman?.id || booking._ownerId || booking.owner,
                  )
                }
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: BRAND.teal,
                  cursor: "pointer",
                  borderBottom: `1px dashed ${BRAND.teal}`,
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
                className={MODAL_INPUT_CLS}
                style={{ resize: "vertical", minHeight: 44, textAlign: "right" }}
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
                className={`${MODAL_INPUT_CLS} flex-1 text-left bg-white cursor-pointer flex justify-between items-center`}
              >
                <span style={{ fontWeight: 600 }}>
                  {formatFullDate(editData.date)}
                </span>
                <span style={{ fontSize: 14 }}>{"\uD83D\uDCC5"}</span>
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
                    <span style={{ color: BRAND.coral }}>None selected</span>
                  )
                : booking.slot
            }
            editNode={
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(70px, 1fr))",
                  gap: 6,
                  width: "100%",
                }}
              >
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
                        style={{
                          padding: "8px 0",
                          borderRadius: 8,
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: allowed ? "pointer" : "not-allowed",
                          background:
                            editData.slot === slot
                              ? sizeTheme.primary
                              : isStaffOpened
                                ? sizeTheme.light
                                : BRAND.white,
                          color:
                            editData.slot === slot
                              ? sizeTheme.headerText
                              : allowed
                                ? BRAND.text
                                : BRAND.textLight,
                          border: `1.5px solid ${
                            editData.slot === slot
                              ? sizeTheme.primary
                              : isStaffOpened
                                ? sizeTheme.primary
                                : BRAND.greyLight
                          }`,
                          textAlign: "center",
                          opacity: allowed ? 1 : 0.5,
                        }}
                      >
                        {slot}
                      </button>
                    );
                  })
                ) : (
                  <span
                    style={{
                      fontSize: 13,
                      color: BRAND.coral,
                      fontWeight: 600,
                      gridColumn: "1 / -1",
                    }}
                  >
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
            <div
              style={{
                padding: "10px 0",
                borderBottom: `1px solid ${BRAND.greyLight}`,
              }}
            >
              <div style={{ marginBottom: 8 }}>
                <LogisticsLabel text="Add-ons" />
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {AVAILABLE_ADDONS.map((addon) => (
                  <label
                    key={addon}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 13,
                      cursor: "pointer",
                      fontWeight: 500,
                    }}
                  >
                    <input
                      type="checkbox"
                      style={{
                        accentColor: sizeTheme.primary,
                        width: 18,
                        height: 18,
                        cursor: "pointer",
                      }}
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

          <div style={{ height: 24 }} />

          {/* Finance rows */}
          <DetailRow
            label={<FinanceLabel text="Base Price" />}
            value={
              isEditing ? (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontWeight: 600 }}>{"\u00A3"}</span>
                  <input
                    type="number"
                    value={editData.customPrice}
                    onChange={(e) =>
                      setEditData((prev) => ({
                        ...prev,
                        customPrice: Number(e.target.value),
                      }))
                    }
                    className={MODAL_INPUT_CLS}
                    style={{ width: 80 }}
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
                style={{
                  fontWeight: 800,
                  color: amountDue > 0 ? BRAND.coral : BRAND.openGreen,
                  fontSize: 16,
                }}
              >
                {"\u00A3"}{Math.max(0, amountDue)}
              </span>
            }
            isEditing={isEditing}
          />

          {saveError && (
            <div
              style={{
                marginTop: 12,
                padding: "10px 12px",
                background: BRAND.coralLight,
                color: BRAND.coral,
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              {saveError}
            </div>
          )}

          {primaryHuman?.historyFlag && (
            <div
              style={{
                fontSize: 13,
                color: BRAND.coral,
                marginTop: 12,
                textAlign: "right",
                fontWeight: 700,
                background: BRAND.coralLight,
                padding: "8px 12px",
                borderRadius: 8,
                display: "inline-block",
                float: "right",
              }}
            >
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
