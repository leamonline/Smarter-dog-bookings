import React, { useState, useMemo } from "react";
import { useFocusTrap } from "../../hooks/useFocusTrap.ts";
import { BRAND, SERVICES, PRICING, SALON_SLOTS, LARGE_DOG_SLOTS, ALERT_OPTIONS } from "../../constants/index.ts";
import { computeSlotCapacities } from "../../engine/capacity.ts";
import { formatFullDate } from "../../engine/utils.ts";
import { toDateStr } from "../../supabase/transforms.ts";
import { SizeTag } from "../ui/SizeTag.tsx";
import { IconTick, IconEdit, IconMessage, IconBlock } from "../icons/index.tsx";
import { DatePickerModal } from "./DatePickerModal.tsx";
import { ContactPopup } from "./ContactPopup.tsx";
import type { Booking, Dog, BookingsByDate, DogsMap, HumansMap } from "../../types.ts";

interface Props {
  booking: Booking;
  onClose: () => void;
  onRemove: (bookingId: string | number) => void;
  onOpenHuman: (id: string) => void;
  onUpdate: (booking: Booking, fromDate: string, toDate: string) => void;
  currentDateStr: string;
  currentDateObj: Date;
  bookingsByDate: BookingsByDate;
  dayOpenState: Record<string, boolean>;
  dogs: DogsMap;
  humans: HumansMap;
  onUpdateDog: (name: string, updates: Partial<Dog>) => void;
}

export function BookingDetailModal({ booking, onClose, onRemove, onOpenHuman, onUpdate, currentDateStr, currentDateObj, bookingsByDate, dayOpenState, dogs, humans, onUpdateDog }: Props) {
  const trapRef = useFocusTrap(onClose);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [showDatePicker, setShowDatePicker] = useState<boolean>(false);
  const [showExitConfirm, setShowExitConfirm] = useState<boolean>(false);
  const [showContact, setShowContact] = useState<boolean>(false);

  const dogData: Dog | undefined = Object.values(dogs).find(d => d.name === booking.dogName);
  const AVAILABLE_ADDONS = ["Flea Bath", "Sensitive Shampoo", "Anal Glands"];

  const initialDefaultPriceNum = parseInt(((PRICING as Record<string, Record<string, string>>)[booking.service]?.[booking.size] || "0").replace(/\D/g, '')) || 0;
  const initialBasePrice: number = dogData?.customPrice !== undefined ? (parseInt(dogData.customPrice.replace(/\D/g, '')) || 0) : initialDefaultPriceNum;

  interface EditData {
    service: string;
    pickupBy: string;
    payment: string;
    groomNotes: string;
    alerts: string[];
    addons: string[];
    date: Date;
    slot: string;
    customPrice: number;
  }

  const [editData, setEditData] = useState<EditData>({
    service: booking.service,
    pickupBy: booking.pickupBy || booking.owner,
    payment: booking.payment || "Due at Pick-up",
    groomNotes: dogData?.groomNotes || "",
    alerts: [...(dogData?.alerts || [])],
    addons: [...(booking.addons || [])],
    date: currentDateObj,
    slot: booking.slot,
    customPrice: initialBasePrice
  });

  const currentService = isEditing ? (editData?.service || booking.service) : booking.service;
  const serviceObj = SERVICES.find((s) => s.id === currentService);

  const [allergyInput, setAllergyInput] = useState<string>(() => {
    const allergy = dogData?.alerts?.find((a: string) => a.startsWith("Allergic to "));
    return allergy ? allergy.replace("Allergic to ", "") : "";
  });
  const [hasAllergy, setHasAllergy] = useState<boolean>(() => dogData?.alerts?.some((a: string) => a.startsWith("Allergic to ")) ?? false);

  const primaryHuman = humans[booking.owner];
  const trustedHumans = primaryHuman?.trustedIds || [];

  const inputStyle = { padding: "8px 12px", borderRadius: 8, border: `1px solid ${BRAND.greyLight}`, fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" as const, fontFamily: "inherit", color: BRAND.text };

  const editDateStr = toDateStr(editData.date);
  const editDayBookings = bookingsByDate[editDateStr] || [];
  const otherBookings = editDayBookings.filter(b => b.id !== booking.id);
  const editDayCapacities = computeSlotCapacities(otherBookings, [...SALON_SLOTS]);

  const availableSlots = useMemo(() => {
    return SALON_SLOTS.filter(s => {
      const cap = editDayCapacities[s];
      const needed = booking.size === "large" ? (LARGE_DOG_SLOTS[s]?.seats ?? 2) : 1;
      if (booking.size === "large" && LARGE_DOG_SLOTS[s] && !LARGE_DOG_SLOTS[s].canShare && cap.used > 0) return false;
      return cap && cap.available >= needed;
    });
  }, [editDayCapacities, booking.size]);

  const LogisticsLabel = ({ text }: { text: string }) => (
    <span style={{ color: BRAND.blueDark, textTransform: "uppercase", fontWeight: 800, fontSize: 12, letterSpacing: 0.5 }}>{text}</span>
  );

  const FinanceLabel = ({ text }: { text: string }) => (
    <span style={{ color: BRAND.openGreen, textTransform: "uppercase", fontWeight: 800, fontSize: 12, letterSpacing: 0.5 }}>{text}</span>
  );

  const detailRow = (label: React.ReactNode, value: React.ReactNode, editNode: React.ReactNode = null, verticalEdit: boolean = false) => (
    <div style={{ padding: "10px 0", borderBottom: `1px solid ${BRAND.greyLight}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: isEditing && editNode && !verticalEdit ? "center" : "flex-start" }}>
        <span style={{ fontSize: 13, color: BRAND.textLight, flexShrink: 0, paddingRight: 12, paddingTop: isEditing && editNode && !verticalEdit ? 0 : 2 }}>{label}</span>
        {isEditing && editNode && !verticalEdit ? (
          <div style={{ flex: 1, display: "flex", justifyContent: "flex-end", maxWidth: "65%" }}>{editNode}</div>
        ) : (
          <span style={{ fontSize: 13, fontWeight: 600, color: BRAND.text, textAlign: "right", wordBreak: "break-word" }}>{value}</span>
        )}
      </div>
      {isEditing && editNode && verticalEdit && (
        <div style={{ marginTop: 8 }}>{editNode}</div>
      )}
    </div>
  );

  const handleCloseAttempt = () => {
    if (isEditing) {
      setShowExitConfirm(true);
    } else {
      onClose();
    }
  };

  const handleSave = () => {
    if (!editData.slot) return;

    let finalNotes = editData.groomNotes;
    const originalDateDisplay = formatFullDate(currentDateObj);
    const newDateDisplay = formatFullDate(editData.date);

    if (originalDateDisplay !== newDateDisplay || booking.slot !== editData.slot) {
      const stamp = `\n\n[Booking moved by Staff from ${originalDateDisplay} at ${booking.slot} to ${newDateDisplay} at ${editData.slot}]`;
      finalNotes += stamp;
    }

    const finalAlerts = editData.alerts.filter(a => !a.startsWith("Allergic to "));
    if (hasAllergy && allergyInput.trim()) {
      finalAlerts.push(`Allergic to ${allergyInput.trim()}`);
    }

    // Update dog via callback (no direct mutation)
    onUpdateDog(booking.dogName, {
      alerts: finalAlerts,
      groomNotes: finalNotes,
      customPrice: String(editData.customPrice),
    });

    const newDateStr = toDateStr(editData.date);

    onUpdate({
      ...booking,
      service: editData.service,
      addons: editData.addons,
      pickupBy: editData.pickupBy,
      payment: editData.payment,
      slot: editData.slot
    }, currentDateStr, newDateStr);

    setIsEditing(false);
  };

  const activePrice = isEditing ? editData.customPrice : initialBasePrice;
  const activeAddons = isEditing ? editData.addons : (booking.addons || []);
  const activePayment = isEditing ? editData.payment : (booking.payment || "Due at Pick-up");

  let amountDue = activePrice;
  if (activeAddons.includes("Flea Bath")) amountDue += 10;

  if (activePayment === "Deposit Paid") amountDue -= 10;
  else if (activePayment === "Paid in Full") amountDue = 0;

  const ageYo = dogData?.age ? dogData.age.replace(' yrs', 'yo') : '';

  return (
    <div ref={trapRef} onClick={handleCloseAttempt} style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.35)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
    }}>
      <div role="dialog" aria-modal="true" aria-labelledby="modal-title" onClick={(e: React.MouseEvent<HTMLDivElement>) => e.stopPropagation()} style={{
        background: BRAND.white, borderRadius: 16, width: 420, maxHeight: "90vh", overflow: "auto",
        boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
      }}>
        {/* Header */}
        <div style={{
          background: `linear-gradient(135deg, ${BRAND.blue}, ${BRAND.blueDark})`,
          padding: "20px 24px", borderRadius: "16px 16px 0 0",
          display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
            <SizeTag size={booking.size} headerMode />
            <div style={{ minWidth: 0 }}>
              <div id="modal-title" style={{ fontSize: 20, fontWeight: 800, color: BRAND.white, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {booking.dogName}
                {ageYo && <span style={{ fontWeight: 500, fontSize: 14, opacity: 0.8, marginLeft: 6 }}>{ageYo}</span>}
              </div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", marginTop: 2 }}>{booking.breed}</div>
              {isEditing ? (
                <select value={editData.service} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setEditData({...editData, service: e.target.value})} style={{ background: "rgba(255,255,255,0.2)", color: BRAND.white, border: "1px solid rgba(255,255,255,0.3)", borderRadius: 6, padding: "6px 10px", fontSize: 13, fontWeight: 600, outline: "none", cursor: "pointer", fontFamily: "inherit" }}>
                  {SERVICES.map(s => <option key={s.id} value={s.id} style={{ color: BRAND.text }}>{s.icon} {s.name}</option>)}
                </select>
              ) : (
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", marginTop: 2 }}>{serviceObj?.icon} {serviceObj?.name}</div>
              )}
            </div>
          </div>
          <button onClick={handleCloseAttempt} style={{ background: "rgba(255,255,255,0.2)", border: "none", borderRadius: 8, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 14, color: BRAND.white, fontWeight: 700, flexShrink: 0 }}>{"\u00D7"}</button>
        </div>

        {/* Body */}
        <div style={{ padding: "16px 24px 0" }}>
          {/* Status row */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: BRAND.textLight, textTransform: "uppercase", letterSpacing: 0.5 }}>Status</span>
            <span style={{
              fontSize: 13, fontWeight: 700, padding: "4px 12px", borderRadius: 8,
              background: booking.status === "Checked In" ? BRAND.openGreenBg : booking.status === "Completed" ? BRAND.blueLight : BRAND.yellowLight,
              color: booking.status === "Checked In" ? BRAND.openGreen : booking.status === "Completed" ? BRAND.blueDark : "#92400E",
            }}>{booking.status || "Not Arrived"}</span>
          </div>

          {/* Owner */}
          <div style={{ padding: "10px 0", borderBottom: `1px solid ${BRAND.greyLight}` }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, color: BRAND.textLight }}>Human</span>
              <span onClick={() => onOpenHuman && onOpenHuman(booking.owner)} style={{ fontSize: 13, fontWeight: 600, color: BRAND.teal, cursor: "pointer", borderBottom: `1px dashed ${BRAND.teal}` }}>{booking.owner}</span>
            </div>
          </div>

          {/* Alerts section */}
          {isEditing ? (
            <div style={{ marginTop: 20, marginBottom: 16 }}>
              <div style={{ fontWeight: 800, fontSize: 12, color: BRAND.coral, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12, textAlign: "center" }}>Alerts</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
                {ALERT_OPTIONS.map(opt => {
                  const active = editData.alerts.includes(opt.label);
                  return (
                    <button key={opt.label} type="button"
                      onClick={() => {
                        if (active) setEditData({...editData, alerts: editData.alerts.filter(a => a !== opt.label)});
                        else setEditData({...editData, alerts: [...editData.alerts, opt.label]});
                      }}
                      style={{
                        background: active ? opt.color : BRAND.white,
                        color: active ? BRAND.white : opt.color,
                        border: `2px solid ${opt.color}`,
                        padding: "8px 14px", borderRadius: 20, fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "all 0.15s",
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
                <button type="button"
                  onClick={() => setHasAllergy(!hasAllergy)}
                  style={{
                    background: hasAllergy ? BRAND.coral : BRAND.white,
                    color: hasAllergy ? BRAND.white : BRAND.coral,
                    border: `2px solid ${BRAND.coral}`,
                    padding: "10px 18px", borderRadius: 24, fontSize: 14, fontWeight: 800, cursor: "pointer", transition: "all 0.15s",
                    display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center"
                  }}
                >
                  {"\u26A0\uFE0F"} Allergy {"\u26A0\uFE0F"}
                </button>
              </div>

              {hasAllergy && (
                <div style={{ marginTop: 12, width: "100%", display: "flex", justifyContent: "center" }}>
                  <input type="text" placeholder="What is the dog allergic to? (e.g. oatmeal shampoo)" value={allergyInput} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAllergyInput(e.target.value)} style={{...inputStyle, textAlign: "center", borderColor: BRAND.coral, borderWidth: 2, padding: "10px", width: "100%"}} />
                </div>
              )}
            </div>
          ) : (
            ((dogData?.alerts && dogData.alerts.length > 0) || (hasAllergy && allergyInput)) && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16, marginTop: 28, justifyContent: "center", width: "100%" }}>
                 {editData.alerts.filter(a => !a.startsWith("Allergic to ")).map(alertLabel => (
                   <div key={alertLabel} style={{ background: BRAND.coral, color: BRAND.white, padding: "10px 18px", borderRadius: 24, fontSize: 14, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, boxShadow: "0 4px 12px rgba(232,86,127,0.25)", textAlign: "center" }}>
                     {"\u26A0\uFE0F"} {alertLabel} {"\u26A0\uFE0F"}
                   </div>
                 ))}
                 {hasAllergy && allergyInput && (
                   <div style={{ background: BRAND.coral, color: BRAND.white, padding: "10px 18px", borderRadius: 24, fontSize: 14, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, boxShadow: "0 4px 12px rgba(232,86,127,0.25)", textAlign: "center" }}>
                     {"\u26A0\uFE0F"} Allergic to {allergyInput} {"\u26A0\uFE0F"}
                   </div>
                 )}
              </div>
            )
          )}

          {detailRow(<LogisticsLabel text="Grooming Notes" />,
            <span style={{ whiteSpace: "pre-wrap" }}>{editData.groomNotes || "Standard groom (no specific notes)"}</span>,
            <textarea value={editData.groomNotes} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditData({...editData, groomNotes: e.target.value})} style={{...inputStyle, resize: "vertical", minHeight: 44, textAlign: "right"}} />
          )}

          {detailRow(<LogisticsLabel text="Date" />, formatFullDate(isEditing ? editData.date : currentDateObj),
            <button onClick={() => setShowDatePicker(true)} style={{...inputStyle, flex: 1, textAlign: "left", background: BRAND.white, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center"}}>
              <span style={{ fontWeight: 600 }}>{formatFullDate(editData.date)}</span> <span style={{fontSize: 14}}>{"\uD83D\uDCC5"}</span>
            </button>,
            true
          )}

          {detailRow(<LogisticsLabel text="Drop-off time" />, isEditing ? (editData.slot || <span style={{color: BRAND.coral}}>None selected</span>) : booking.slot,
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(70px, 1fr))", gap: 6, width: "100%" }}>
              {availableSlots.length > 0 ? availableSlots.map(s => (
                 <button key={s} onClick={() => setEditData({...editData, slot: s})} style={{
                   padding: "8px 0", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
                   background: editData.slot === s ? BRAND.blue : BRAND.white,
                   color: editData.slot === s ? BRAND.white : BRAND.text,
                   border: `1.5px solid ${editData.slot === s ? BRAND.blue : BRAND.greyLight}`,
                   textAlign: "center"
                 }}>{s}</button>
              )) : <span style={{fontSize: 13, color: BRAND.coral, fontWeight: 600, gridColumn: "1 / -1"}}>No available slots on this date</span>}
            </div>,
            true
          )}

          {detailRow(<LogisticsLabel text="Service" />, `${serviceObj?.icon || ""} ${serviceObj?.name || currentService}`,
            <select value={editData.service} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setEditData({...editData, service: e.target.value})} style={inputStyle}>
              {SERVICES.map(s => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
            </select>
          )}

          {isEditing ? (
            <div style={{ padding: "10px 0", borderBottom: `1px solid ${BRAND.greyLight}` }}>
              <div style={{ marginBottom: 8 }}><LogisticsLabel text="Add-ons" /></div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {AVAILABLE_ADDONS.map(addon => (
                  <label key={addon} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer", fontWeight: 500 }}>
                    <input type="checkbox" style={{ accentColor: BRAND.blue, width: 18, height: 18, cursor: "pointer" }}
                      checked={editData.addons.includes(addon)}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        if (e.target.checked) setEditData({...editData, addons: [...editData.addons, addon]});
                        else setEditData({...editData, addons: editData.addons.filter(a => a !== addon)});
                      }}
                    /> {addon}
                  </label>
                ))}
              </div>
            </div>
          ) : (
            (editData.addons && editData.addons.length > 0) ? detailRow(<LogisticsLabel text="Add-ons" />, editData.addons.join(", ")) : null
          )}

          {detailRow(<LogisticsLabel text="Pick-up Human" />, isEditing ? editData.pickupBy : (booking.pickupBy || booking.owner),
            <select value={editData.pickupBy} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setEditData({...editData, pickupBy: e.target.value})} style={inputStyle}>
              {[booking.owner, ...[...trustedHumans].sort()].map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          )}

          {/* Financial & Admin */}
          <div style={{ height: 24 }}></div>

          {detailRow(<FinanceLabel text="Base Price" />,
            isEditing ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontWeight: 600 }}>{"\u00A3"}</span>
                <input type="number" value={editData.customPrice} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditData({...editData, customPrice: Number(e.target.value)})} style={{...inputStyle, width: 80}} />
              </div>
            ) : `\u00A3${activePrice}`
          )}

          {detailRow(<FinanceLabel text="Payment Status" />, isEditing ? editData.payment : (booking.payment || "Due at Pick-up"),
            <select value={editData.payment} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setEditData({...editData, payment: e.target.value})} style={inputStyle}>
              <option value="Due at Pick-up">Due at Pick-up</option>
              <option value="Deposit Paid">Deposit Paid</option>
              <option value="Paid in Full">Paid in Full</option>
            </select>
          )}

          {detailRow(<FinanceLabel text="Amount Due" />, <span style={{ fontWeight: 800, color: amountDue > 0 ? BRAND.coral : BRAND.openGreen, fontSize: 16 }}>{"\u00A3"}{Math.max(0, amountDue)}</span>)}

          {primaryHuman?.historyFlag && (
             <div style={{ fontSize: 13, color: BRAND.coral, marginTop: 12, textAlign: "right", fontWeight: 700, background: BRAND.coralLight, padding: "8px 12px", borderRadius: 8, display: "inline-block", float: "right" }}>
               Flag: {primaryHuman.historyFlag}
             </div>
          )}
          <div style={{ clear: "both" }} />
        </div>

        {/* Actions */}
        {isEditing ? (
          <div style={{ padding: "16px 24px 20px", display: "flex", gap: 10, background: BRAND.offWhite, borderTop: `1px solid ${BRAND.greyLight}` }}>
            <button onClick={handleSave} disabled={!editData.slot} style={{
              flex: 1, padding: "12px 0", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 700,
              cursor: !editData.slot ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              background: !editData.slot ? BRAND.greyLight : BRAND.blue, color: !editData.slot ? BRAND.textLight : BRAND.white,
              transition: "background 0.15s"
            }}><IconTick size={16} colour={BRAND.white} /> Save Changes</button>
            <button onClick={() => {
              setEditData({ service: booking.service, pickupBy: booking.pickupBy || booking.owner, payment: booking.payment || "Due at Pick-up", groomNotes: dogData?.groomNotes || "", alerts: [...(dogData?.alerts || [])], addons: [...(booking.addons || [])], date: currentDateObj, slot: booking.slot, customPrice: initialBasePrice });
              setIsEditing(false);
            }} style={{
              flex: 1, padding: "12px 0", borderRadius: 10, border: `1.5px solid ${BRAND.greyLight}`, fontSize: 13, fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              background: BRAND.white, color: BRAND.textLight, transition: "background 0.15s"
            }} onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => e.currentTarget.style.background = BRAND.offWhite} onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => e.currentTarget.style.background = BRAND.white}>Cancel</button>
          </div>
        ) : (
          <div style={{ padding: "16px 24px 20px", display: "flex", gap: 10, background: BRAND.offWhite, borderTop: `1px solid ${BRAND.greyLight}` }}>
            <button onClick={() => setIsEditing(true)} style={{
              flex: 1, padding: "12px 0", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              background: BRAND.blue, color: BRAND.white, transition: "background 0.15s"
            }} onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => e.currentTarget.style.background = BRAND.blueDark} onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => e.currentTarget.style.background = BRAND.blue}><IconEdit size={16} colour={BRAND.white} /> Edit</button>
            <button onClick={() => setShowContact(true)} style={{
              flex: 1, padding: "12px 0", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              background: BRAND.teal, color: BRAND.white, transition: "background 0.15s"
            }} onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => e.currentTarget.style.background = "#236b5d"} onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => e.currentTarget.style.background = BRAND.teal}><IconMessage size={16} colour={BRAND.white} /> Message</button>
            <button onClick={() => { onRemove(booking.id); onClose(); }} style={{
              flex: 1, padding: "12px 0", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              background: BRAND.coralLight, color: BRAND.coral, transition: "background 0.15s"
            }} onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => e.currentTarget.style.background = "#fbd4df"} onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => e.currentTarget.style.background = BRAND.coralLight}><IconBlock size={16} colour={BRAND.coral} /> Cancel</button>
          </div>
        )}
      </div>

      {showDatePicker && (
        <DatePickerModal
          currentDate={editData.date}
          dayOpenState={dayOpenState}
          onSelectDate={(newDate) => {
            setEditData(prev => ({...prev, date: newDate}));
            setShowDatePicker(false);

            const newDateStr = toDateStr(newDate);
            const dayBk = bookingsByDate[newDateStr] || [];
            const filteredBookings = dayBk.filter(b => b.id !== booking.id);
            const dayCapacities = computeSlotCapacities(filteredBookings, [...SALON_SLOTS]);

            const needed = booking.size === "large" ? (LARGE_DOG_SLOTS[editData.slot]?.seats ?? 2) : 1;
            const cap = dayCapacities[editData.slot];

            let canKeepSlot = false;
            if (cap && cap.available >= needed) {
               if (booking.size === "large" && LARGE_DOG_SLOTS[editData.slot] && !LARGE_DOG_SLOTS[editData.slot].canShare && cap.used > 0) {
                   canKeepSlot = false;
               } else {
                   canKeepSlot = true;
               }
            }
            if (!canKeepSlot) {
                setEditData(prev => ({...prev, slot: ""}));
            }
          }}
          onClose={() => setShowDatePicker(false)}
        />
      )}

      {showContact && <ContactPopup human={primaryHuman} onClose={() => setShowContact(false)} />}

      {/* Exit Confirmation Modal */}
      {showExitConfirm && (
        <div onClick={(e: React.MouseEvent<HTMLDivElement>) => e.stopPropagation()} style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100,
        }}>
          <div style={{ background: BRAND.white, borderRadius: 16, padding: 24, width: 300, boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: BRAND.text }}>Discard changes?</div>
            <div style={{ fontSize: 13, color: BRAND.textLight, marginBottom: 20 }}>You have unsaved changes. Are you sure you want to close?</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setShowExitConfirm(false); onClose(); }} style={{
                flex: 1, padding: "10px 0", borderRadius: 10, border: "none", background: BRAND.coral, color: BRAND.white,
                fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit"
              }}>Discard</button>
              <button onClick={() => setShowExitConfirm(false)} style={{
                flex: 1, padding: "10px 0", borderRadius: 10, border: `1.5px solid ${BRAND.greyLight}`, background: BRAND.white, color: BRAND.text,
                fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit"
              }}>Keep editing</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
