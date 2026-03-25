import { useState, useMemo } from "react";
import { BRAND, ALERT_OPTIONS, SERVICES } from "../../constants/index.js";
import { IconEdit, IconTick } from "../icons/index.jsx";

function BookingHistory({ dogName, bookingsByDate }) {
  const history = useMemo(() => {
    if (!bookingsByDate) return [];
    const entries = [];
    for (const [dateStr, bookings] of Object.entries(bookingsByDate)) {
      for (const b of bookings) {
        if (b.dogName === dogName) {
          entries.push({ ...b, date: dateStr });
        }
      }
    }
    return entries.sort((a, b) => b.date.localeCompare(a.date));
  }, [dogName, bookingsByDate]);

  if (history.length === 0) return null;

  return (
    <div style={{ padding: "0 24px" }}>
      <div style={{ marginTop: 16, fontWeight: 800, fontSize: 12, color: BRAND.blueDark, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Recent Bookings</div>
      {history.slice(0, 5).map((b, i) => {
        const svc = SERVICES.find(s => s.id === b.service);
        return (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${BRAND.greyLight}`, fontSize: 12 }}>
            <div>
              <span style={{ fontWeight: 600, color: BRAND.text }}>{b.date}</span>
              <span style={{ color: BRAND.textLight, marginLeft: 6 }}>{svc?.icon} {svc?.name}</span>
            </div>
            <span style={{ fontWeight: 600, color: b.status === "Completed" ? BRAND.openGreen : BRAND.textLight, fontSize: 11 }}>{b.status}</span>
          </div>
        );
      })}
    </div>
  );
}

export function DogCardModal({ dogId, onClose, onOpenHuman, dogs, onUpdateDog, bookingsByDate }) {
  const dog = Object.values(dogs).find(d => d.name === dogId) || { name: dogId, breed: "", age: "", humanId: "", alerts: [], groomNotes: "" };

  const [isEditing, setIsEditing] = useState(false);
  const [editNotes, setEditNotes] = useState(dog.groomNotes || "");
  const [editAlerts, setEditAlerts] = useState([...(dog.alerts || [])]);

  const [allergyInput, setAllergyInput] = useState(() => {
    const allergy = (dog.alerts || []).find(a => a.startsWith("Allergic to "));
    return allergy ? allergy.replace("Allergic to ", "") : "";
  });
  const [hasAllergy, setHasAllergy] = useState(() => (dog.alerts || []).some(a => a.startsWith("Allergic to ")));

  const handleSave = () => {
    const finalAlerts = editAlerts.filter(a => !a.startsWith("Allergic to "));
    if (hasAllergy && allergyInput.trim()) {
      finalAlerts.push(`Allergic to ${allergyInput.trim()}`);
    }
    onUpdateDog(dog.name, { groomNotes: editNotes, alerts: finalAlerts });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditNotes(dog.groomNotes || "");
    setEditAlerts([...(dog.alerts || [])]);
    const allergy = (dog.alerts || []).find(a => a.startsWith("Allergic to "));
    setAllergyInput(allergy ? allergy.replace("Allergic to ", "") : "");
    setHasAllergy((dog.alerts || []).some(a => a.startsWith("Allergic to ")));
    setIsEditing(false);
  };

  const detailRow = (label, value) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${BRAND.greyLight}` }}>
      <span style={{ fontSize: 13, color: BRAND.textLight }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: BRAND.text, textAlign: "right" }}>{value || "\u2014"}</span>
    </div>
  );

  const inputStyle = { padding: "8px 12px", borderRadius: 8, border: `1px solid ${BRAND.greyLight}`, fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box", fontFamily: "inherit", color: BRAND.text };

  const displayAlerts = isEditing ? editAlerts : (dog.alerts || []);

  return (
    <div onClick={onClose} style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.35)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: BRAND.white, borderRadius: 16, width: 360, maxHeight: "85vh", overflow: "auto",
        boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
      }}>
        <div style={{
          background: `linear-gradient(135deg, ${BRAND.blue}, ${BRAND.blueDark})`,
          padding: "20px 24px", borderRadius: "16px 16px 0 0",
          display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: BRAND.white }}>{dog.name}</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", marginTop: 4 }}>{dog.breed} {"\u00B7"} {dog.age}</div>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.2)", border: "none", borderRadius: 8, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 14, color: BRAND.white, fontWeight: 700 }}>{"\u00D7"}</button>
        </div>

        <div style={{ padding: "16px 24px 0" }}>
          {detailRow("Owner", dog.humanId)}
          {dog.humanId && (
            <div style={{ textAlign: "right", marginTop: -2, marginBottom: 8 }}>
              <span onClick={() => { onClose(); onOpenHuman && onOpenHuman(dog.humanId); }} style={{ fontSize: 12, color: BRAND.teal, cursor: "pointer", fontWeight: 600, borderBottom: `1px dashed ${BRAND.teal}` }}>View human card {"\u2192"}</span>
            </div>
          )}

          {/* Groom Notes */}
          {isEditing ? (
            <div style={{ padding: "8px 0", borderBottom: `1px solid ${BRAND.greyLight}` }}>
              <div style={{ fontSize: 13, color: BRAND.textLight, marginBottom: 6 }}>Groom Notes</div>
              <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} style={{...inputStyle, resize: "vertical", minHeight: 60}} />
            </div>
          ) : (
            detailRow("Groom Notes", dog.groomNotes)
          )}

          {/* Alerts */}
          {isEditing ? (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 800, fontSize: 12, color: BRAND.coral, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10, textAlign: "center" }}>Alerts</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
                {ALERT_OPTIONS.map(opt => {
                  const active = editAlerts.includes(opt.label);
                  return (
                    <button key={opt.label} type="button"
                      onClick={() => {
                        if (active) setEditAlerts(editAlerts.filter(a => a !== opt.label));
                        else setEditAlerts([...editAlerts, opt.label]);
                      }}
                      style={{
                        background: active ? opt.color : BRAND.white,
                        color: active ? BRAND.white : opt.color,
                        border: `2px solid ${opt.color}`,
                        padding: "6px 12px", borderRadius: 16, fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all 0.15s",
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
                    padding: "8px 14px", borderRadius: 20, fontSize: 13, fontWeight: 800, cursor: "pointer", transition: "all 0.15s",
                  }}
                >
                  {"\u26A0\uFE0F"} Allergy {"\u26A0\uFE0F"}
                </button>
              </div>
              {hasAllergy && (
                <div style={{ marginTop: 10, display: "flex", justifyContent: "center" }}>
                  <input type="text" placeholder="Allergic to..." value={allergyInput} onChange={e => setAllergyInput(e.target.value)} style={{...inputStyle, textAlign: "center", borderColor: BRAND.coral, borderWidth: 2}} />
                </div>
              )}
            </div>
          ) : (
            displayAlerts.length > 0 && (
              <>
                <div style={{ marginTop: 16, fontWeight: 800, fontSize: 12, color: BRAND.coral, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Alerts</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {displayAlerts.map(alert => (
                    <span key={alert} style={{ background: BRAND.coralLight, color: BRAND.coral, padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700 }}>
                      {"\u26A0\uFE0F"} {alert}
                    </span>
                  ))}
                </div>
              </>
            )
          )}
        </div>

        {/* Booking History */}
        <BookingHistory dogName={dog.name} bookingsByDate={bookingsByDate} />

        {/* Footer actions */}
        <div style={{ padding: "16px 24px 20px", display: "flex", gap: 10, background: BRAND.offWhite, borderTop: `1px solid ${BRAND.greyLight}`, marginTop: 16 }}>
          {isEditing ? (
            <>
              <button onClick={handleSave} style={{
                flex: 1, padding: "10px 0", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 700,
                cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                background: BRAND.blue, color: BRAND.white, transition: "background 0.15s"
              }} onMouseEnter={e => e.currentTarget.style.background = BRAND.blueDark} onMouseLeave={e => e.currentTarget.style.background = BRAND.blue}>
                <IconTick size={16} colour={BRAND.white} /> Save
              </button>
              <button onClick={handleCancel} style={{
                flex: 1, padding: "10px 0", borderRadius: 10, border: `1.5px solid ${BRAND.greyLight}`, fontSize: 13, fontWeight: 700,
                cursor: "pointer", fontFamily: "inherit", background: BRAND.white, color: BRAND.textLight, transition: "background 0.15s"
              }} onMouseEnter={e => e.currentTarget.style.background = BRAND.offWhite} onMouseLeave={e => e.currentTarget.style.background = BRAND.white}>
                Cancel
              </button>
            </>
          ) : (
            <button onClick={() => setIsEditing(true)} style={{
              flex: 1, padding: "10px 0", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              background: BRAND.blue, color: BRAND.white, transition: "background 0.15s"
            }} onMouseEnter={e => e.currentTarget.style.background = BRAND.blueDark} onMouseLeave={e => e.currentTarget.style.background = BRAND.blue}>
              <IconEdit size={16} colour={BRAND.white} /> Edit
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
