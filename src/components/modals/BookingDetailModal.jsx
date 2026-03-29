import { useMemo, useState } from "react";
import {
  BRAND,
  SERVICES,
  ALERT_OPTIONS,
  BOOKING_STATUSES,
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
import { SizeTag } from "../ui/SizeTag.jsx";
import { IconTick, IconEdit, IconMessage, IconBlock } from "../icons/index.jsx";
import { DatePickerModal } from "./DatePickerModal.jsx";
import { ContactPopup } from "./ContactPopup.jsx";

const AVAILABLE_ADDONS = ["Flea Bath", "Sensitive Shampoo", "Anal Glands"];

// getDefaultOpenForDate is now imported from engine/utils.js

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

  const ageYo = dogData?.age ? dogData.age.replace(" yrs", "yo") : "";

  const inputStyle = {
    padding: "8px 12px",
    borderRadius: 8,
    border: `1px solid ${BRAND.greyLight}`,
    fontSize: 13,
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
    fontFamily: "inherit",
    color: BRAND.text,
  };

  const LogisticsLabel = ({ text }) => (
    <span
      style={{
        color: BRAND.blueDark,
        textTransform: "uppercase",
        fontWeight: 800,
        fontSize: 12,
        letterSpacing: 0.5,
      }}
    >
      {text}
    </span>
  );

  const FinanceLabel = ({ text }) => (
    <span
      style={{
        color: BRAND.openGreen,
        textTransform: "uppercase",
        fontWeight: 800,
        fontSize: 12,
        letterSpacing: 0.5,
      }}
    >
      {text}
    </span>
  );

  const detailRow = (label, value, editNode = null, verticalEdit = false) => (
    <div
      style={{
        padding: "10px 0",
        borderBottom: `1px solid ${BRAND.greyLight}`,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems:
            isEditing && editNode && !verticalEdit ? "center" : "flex-start",
        }}
      >
        <span
          style={{
            fontSize: 13,
            color: BRAND.textLight,
            flexShrink: 0,
            paddingRight: 12,
            paddingTop: isEditing && editNode && !verticalEdit ? 0 : 2,
          }}
        >
          {label}
        </span>
        {isEditing && editNode && !verticalEdit ? (
          <div
            style={{
              flex: 1,
              display: "flex",
              justifyContent: "flex-end",
              maxWidth: "65%",
            }}
          >
            {editNode}
          </div>
        ) : (
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: BRAND.text,
              textAlign: "right",
              wordBreak: "break-word",
            }}
          >
            {value}
          </span>
        )}
      </div>
      {isEditing && editNode && verticalEdit && (
        <div style={{ marginTop: 8 }}>{editNode}</div>
      )}
    </div>
  );

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
      label:
        human?.fullName ||
        `${human?.name || ""} ${human?.surname || ""}`.trim() ||
        value,
    };
  });

  const selectedPickupLabel =
    getHumanByIdOrName(humans, editData.pickupBy)?.fullName ||
    editData.pickupBy ||
    booking.pickupBy ||
    booking.owner;

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
        <div
          style={{
            background: `linear-gradient(135deg, ${BRAND.blue}, ${BRAND.blueDark})`,
            padding: "20px 24px",
            borderRadius: "16px 16px 0 0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              flex: 1,
              minWidth: 0,
            }}
          >
            <SizeTag size={booking.size} headerMode />
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 800,
                  color: BRAND.white,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {booking.dogName}
                {ageYo && (
                  <span
                    style={{
                      fontWeight: 500,
                      fontSize: 14,
                      opacity: 0.8,
                      marginLeft: 6,
                    }}
                  >
                    {ageYo}
                  </span>
                )}
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "rgba(255,255,255,0.8)",
                  marginTop: 2,
                }}
              >
                {booking.breed}
              </div>
              {isEditing ? (
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
                              getServicePriceLabel(
                                e.target.value,
                                booking.size,
                              ),
                            ),
                    }));
                    setSaveError("");
                  }}
                  style={{
                    background: "rgba(255,255,255,0.2)",
                    color: BRAND.white,
                    border: "1px solid rgba(255,255,255,0.3)",
                    borderRadius: 6,
                    padding: "6px 10px",
                    fontSize: 13,
                    fontWeight: 600,
                    outline: "none",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {allowedServices.map((service) => (
                    <option
                      key={service.id}
                      value={service.id}
                      style={{ color: BRAND.text }}
                    >
                      {service.icon} {service.name}
                    </option>
                  ))}
                </select>
              ) : (
                <div
                  style={{
                    fontSize: 13,
                    color: "rgba(255,255,255,0.8)",
                    marginTop: 2,
                  }}
                >
                  {serviceObj?.icon} {serviceObj?.name}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={handleCloseAttempt}
            style={{
              background: "rgba(255,255,255,0.2)",
              border: "none",
              borderRadius: 8,
              width: 28,
              height: 28,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              fontSize: 14,
              color: BRAND.white,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {"×"}
          </button>
        </div>

        <div style={{ padding: "16px 24px 0" }}>
          <div style={{ marginBottom: 16 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: BRAND.textLight,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginBottom: 10,
              }}
            >
              Status
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {BOOKING_STATUSES.map((status) => {
                const currentStatus = booking.status || "Not Arrived";
                const isActive = currentStatus === status.id;
                const currentIdx = BOOKING_STATUSES.findIndex(
                  (st) => st.id === currentStatus,
                );
                const thisIdx = BOOKING_STATUSES.findIndex(
                  (st) => st.id === status.id,
                );
                const isPast = thisIdx < currentIdx;

                return (
                  <button
                    key={status.id}
                    onClick={async () => {
                      if (!isActive) {
                        await onUpdate(
                          { ...booking, status: status.id },
                          currentDateStr,
                          currentDateStr,
                        );
                      }
                    }}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: isActive ? "default" : "pointer",
                      background: isActive
                        ? status.bg
                        : isPast
                          ? "#F9FAFB"
                          : BRAND.white,
                      color: isActive
                        ? status.color
                        : isPast
                          ? BRAND.textLight
                          : BRAND.grey,
                      border: isActive
                        ? `2px solid ${status.color}`
                        : `1px solid ${BRAND.greyLight}`,
                      transition: "all 0.15s",
                      opacity: isPast ? 0.6 : 1,
                    }}
                  >
                    {isActive ? "● " : ""}
                    {status.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div
            style={{
              padding: "10px 0",
              borderBottom: `1px solid ${BRAND.greyLight}`,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: 13, color: BRAND.textLight }}>
              Client Confirmed
            </span>
            <button
              onClick={async () => {
                await onUpdate(
                  { ...booking, confirmed: !booking.confirmed },
                  currentDateStr,
                  currentDateStr,
                );
              }}
              style={{
                background: booking.confirmed
                  ? BRAND.openGreenBg
                  : BRAND.closedRedBg,
                color: booking.confirmed ? BRAND.openGreen : BRAND.closedRed,
                border: `1.5px solid ${
                  booking.confirmed ? BRAND.openGreen : BRAND.closedRed
                }`,
                borderRadius: 8,
                padding: "4px 12px",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "all 0.15s",
              }}
            >
              {booking.confirmed ? "✓ Confirmed" : "Not confirmed"}
            </button>
          </div>

          <div
            style={{
              padding: "10px 0",
              borderBottom: `1px solid ${BRAND.greyLight}`,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, color: BRAND.textLight }}>
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
                {booking.owner}
              </span>
            </div>
          </div>

          {isEditing ? (
            <div style={{ marginTop: 20, marginBottom: 16 }}>
              <div
                style={{
                  fontWeight: 800,
                  fontSize: 12,
                  color: BRAND.coral,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  marginBottom: 12,
                  textAlign: "center",
                }}
              >
                Alerts
              </div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 10,
                  justifyContent: "center",
                }}
              >
                {ALERT_OPTIONS.map((opt) => {
                  const active = editData.alerts.includes(opt.label);
                  return (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => {
                        if (active) {
                          setEditData((prev) => ({
                            ...prev,
                            alerts: prev.alerts.filter((a) => a !== opt.label),
                          }));
                        } else {
                          setEditData((prev) => ({
                            ...prev,
                            alerts: [...prev.alerts, opt.label],
                          }));
                        }
                      }}
                      style={{
                        background: active ? opt.color : BRAND.white,
                        color: active ? BRAND.white : opt.color,
                        border: `2px solid ${opt.color}`,
                        padding: "8px 14px",
                        borderRadius: 20,
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: "pointer",
                        transition: "all 0.15s",
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setHasAllergy(!hasAllergy)}
                  style={{
                    background: hasAllergy ? BRAND.coral : BRAND.white,
                    color: hasAllergy ? BRAND.white : BRAND.coral,
                    border: `2px solid ${BRAND.coral}`,
                    padding: "10px 18px",
                    borderRadius: 24,
                    fontSize: 14,
                    fontWeight: 800,
                    cursor: "pointer",
                    transition: "all 0.15s",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    textAlign: "center",
                  }}
                >
                  {"⚠️"} Allergy {"⚠️"}
                </button>
              </div>

              {hasAllergy && (
                <div
                  style={{
                    marginTop: 12,
                    width: "100%",
                    display: "flex",
                    justifyContent: "center",
                  }}
                >
                  <input
                    type="text"
                    placeholder="What is the dog allergic to?"
                    value={allergyInput}
                    onChange={(e) => setAllergyInput(e.target.value)}
                    style={{
                      ...inputStyle,
                      textAlign: "center",
                      borderColor: BRAND.coral,
                      borderWidth: 2,
                      padding: "10px",
                      width: "100%",
                    }}
                  />
                </div>
              )}
            </div>
          ) : (
            ((dogData.alerts && dogData.alerts.length > 0) ||
              (hasAllergy && allergyInput)) && (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 10,
                  marginBottom: 16,
                  marginTop: 28,
                  justifyContent: "center",
                  width: "100%",
                }}
              >
                {(dogData.alerts || [])
                  .filter((a) => !a.startsWith("Allergic to "))
                  .map((alertLabel) => (
                    <div
                      key={alertLabel}
                      style={{
                        background: BRAND.coral,
                        color: BRAND.white,
                        padding: "10px 18px",
                        borderRadius: 24,
                        fontSize: 14,
                        fontWeight: 800,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                        boxShadow: "0 4px 12px rgba(232,86,127,0.25)",
                        textAlign: "center",
                      }}
                    >
                      {"⚠️"} {alertLabel} {"⚠️"}
                    </div>
                  ))}
                {hasAllergy && allergyInput && (
                  <div
                    style={{
                      background: BRAND.coral,
                      color: BRAND.white,
                      padding: "10px 18px",
                      borderRadius: 24,
                      fontSize: 14,
                      fontWeight: 800,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      boxShadow: "0 4px 12px rgba(232,86,127,0.25)",
                      textAlign: "center",
                    }}
                  >
                    {"⚠️"} Allergic to {allergyInput} {"⚠️"}
                  </div>
                )}
              </div>
            )
          )}

          {detailRow(
            <LogisticsLabel text="Grooming Notes" />,
            <span style={{ whiteSpace: "pre-wrap" }}>
              {editData.groomNotes || "Standard groom (no specific notes)"}
            </span>,
            <textarea
              value={editData.groomNotes}
              onChange={(e) =>
                setEditData((prev) => ({
                  ...prev,
                  groomNotes: e.target.value,
                }))
              }
              style={{
                ...inputStyle,
                resize: "vertical",
                minHeight: 44,
                textAlign: "right",
              }}
            />,
          )}

          {detailRow(
            <LogisticsLabel text="Date" />,
            formatFullDate(isEditing ? editData.date : currentDateObj),
            <button
              onClick={() => setShowDatePicker(true)}
              style={{
                ...inputStyle,
                flex: 1,
                textAlign: "left",
                background: BRAND.white,
                cursor: "pointer",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ fontWeight: 600 }}>
                {formatFullDate(editData.date)}
              </span>
              <span style={{ fontSize: 14 }}>{"📅"}</span>
            </button>,
            true,
          )}

          {detailRow(
            <LogisticsLabel text="Drop-off time" />,
            isEditing
              ? editData.slot || (
                  <span style={{ color: BRAND.coral }}>None selected</span>
                )
              : booking.slot,
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
                            ? BRAND.blue
                            : isStaffOpened
                              ? BRAND.blueLight
                              : BRAND.white,
                        color:
                          editData.slot === slot
                            ? BRAND.white
                            : allowed
                              ? BRAND.text
                              : BRAND.textLight,
                        border: `1.5px solid ${
                          editData.slot === slot
                            ? BRAND.blue
                            : isStaffOpened
                              ? BRAND.blue
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
            </div>,
            true,
          )}

          {detailRow(
            <LogisticsLabel text="Service" />,
            `${serviceObj?.icon || ""} ${serviceObj?.name || currentService}`,
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
              style={inputStyle}
            >
              {allowedServices.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.icon} {service.name}
                </option>
              ))}
            </select>,
          )}

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
                        accentColor: BRAND.blue,
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
            detailRow(
              <LogisticsLabel text="Add-ons" />,
              editData.addons.join(", "),
            )
          ) : null}

          {detailRow(
            <LogisticsLabel text="Pick-up Human" />,
            isEditing ? selectedPickupLabel : booking.pickupBy || booking.owner,
            <select
              value={editData.pickupBy}
              onChange={(e) => {
                setEditData((prev) => ({
                  ...prev,
                  pickupBy: e.target.value,
                }));
              }}
              style={inputStyle}
            >
              {pickupOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>,
          )}

          <div style={{ height: 24 }} />

          {detailRow(
            <FinanceLabel text="Base Price" />,
            isEditing ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontWeight: 600 }}>{"£"}</span>
                <input
                  type="number"
                  value={editData.customPrice}
                  onChange={(e) =>
                    setEditData((prev) => ({
                      ...prev,
                      customPrice: Number(e.target.value),
                    }))
                  }
                  style={{ ...inputStyle, width: 80 }}
                />
              </div>
            ) : (
              `£${activePrice}`
            ),
          )}

          {detailRow(
            <FinanceLabel text="Payment Status" />,
            isEditing ? editData.payment : booking.payment || "Due at Pick-up",
            <select
              value={editData.payment}
              onChange={(e) =>
                setEditData((prev) => ({
                  ...prev,
                  payment: e.target.value,
                }))
              }
              style={inputStyle}
            >
              <option value="Due at Pick-up">Due at Pick-up</option>
              <option value="Deposit Paid">Deposit Paid</option>
              <option value="Paid in Full">Paid in Full</option>
            </select>,
          )}

          {detailRow(
            <FinanceLabel text="Amount Due" />,
            <span
              style={{
                fontWeight: 800,
                color: amountDue > 0 ? BRAND.coral : BRAND.openGreen,
                fontSize: 16,
              }}
            >
              £{Math.max(0, amountDue)}
            </span>,
          )}

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

        {isEditing ? (
          <div
            style={{
              padding: "16px 24px 20px",
              display: "flex",
              gap: 10,
              background: BRAND.offWhite,
              borderTop: `1px solid ${BRAND.greyLight}`,
            }}
          >
            <button
              onClick={handleSave}
              disabled={!editData.slot || saving}
              style={{
                flex: 1,
                padding: "12px 0",
                borderRadius: 10,
                border: "none",
                fontSize: 13,
                fontWeight: 700,
                cursor: !editData.slot || saving ? "not-allowed" : "pointer",
                fontFamily: "inherit",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                background:
                  !editData.slot || saving ? BRAND.greyLight : BRAND.blue,
                color: !editData.slot || saving ? BRAND.textLight : BRAND.white,
                transition: "background 0.15s",
              }}
            >
              <IconTick size={16} colour={BRAND.white} />{" "}
              {saving ? "Saving..." : "Save Changes"}
            </button>
            <button
              onClick={() => {
                resetEditState();
                setIsEditing(false);
              }}
              style={{
                flex: 1,
                padding: "12px 0",
                borderRadius: 10,
                border: `1.5px solid ${BRAND.greyLight}`,
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                background: BRAND.white,
                color: BRAND.textLight,
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = BRAND.offWhite)
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = BRAND.white)
              }
            >
              Cancel
            </button>
          </div>
        ) : (
          <div
            style={{
              padding: "16px 24px 20px",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              background: BRAND.offWhite,
              borderTop: `1px solid ${BRAND.greyLight}`,
            }}
          >
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => {
                  resetEditState();
                  setIsEditing(true);
                }}
                style={{
                  flex: 1,
                  padding: "12px 0",
                  borderRadius: 10,
                  border: "none",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  background: BRAND.blue,
                  color: BRAND.white,
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = BRAND.blueDark)
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = BRAND.blue)
                }
              >
                <IconEdit size={16} colour={BRAND.white} /> Edit
              </button>
              <button
                onClick={() => setShowContact(true)}
                style={{
                  flex: 1,
                  padding: "12px 0",
                  borderRadius: 10,
                  border: "none",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  background: BRAND.teal,
                  color: BRAND.white,
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "#236b5d")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = BRAND.teal)
                }
              >
                <IconMessage size={16} colour={BRAND.white} /> Message
              </button>
              <button
                onClick={async () => {
                  const removed = await onRemove(booking.id);
                  if (removed !== false) onClose();
                }}
                style={{
                  flex: 1,
                  padding: "12px 0",
                  borderRadius: 10,
                  border: "none",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  background: BRAND.coralLight,
                  color: BRAND.coral,
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "#fbd4df")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = BRAND.coralLight)
                }
              >
                <IconBlock size={16} colour={BRAND.coral} /> Cancel
              </button>
            </div>
            {booking.status === "Completed" && onRebook && (
              <button
                onClick={() => {
                  onRebook(booking);
                  onClose();
                }}
                style={{
                  width: "100%",
                  padding: "12px 0",
                  borderRadius: 10,
                  border: `2px solid ${BRAND.blue}`,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  background: BRAND.blueLight,
                  color: BRAND.blueDark,
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = BRAND.blue;
                  e.currentTarget.style.color = BRAND.white;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = BRAND.blueLight;
                  e.currentTarget.style.color = BRAND.blueDark;
                }}
              >
                {"🔁"} Rebook this dog
              </button>
            )}
          </div>
        )}
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
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1100,
          }}
        >
          <div
            style={{
              background: BRAND.white,
              borderRadius: 16,
              padding: 24,
              width: 300,
              boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
            }}
          >
            <div
              style={{
                fontSize: 16,
                fontWeight: 700,
                marginBottom: 8,
                color: BRAND.text,
              }}
            >
              Discard changes?
            </div>
            <div
              style={{
                fontSize: 13,
                color: BRAND.textLight,
                marginBottom: 20,
              }}
            >
              You have unsaved changes. Are you sure you want to close?
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => {
                  setShowExitConfirm(false);
                  onClose();
                }}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  borderRadius: 10,
                  border: "none",
                  background: BRAND.coral,
                  color: BRAND.white,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Discard
              </button>
              <button
                onClick={() => setShowExitConfirm(false)}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  borderRadius: 10,
                  border: `1.5px solid ${BRAND.greyLight}`,
                  background: BRAND.white,
                  color: BRAND.text,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Keep editing
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
