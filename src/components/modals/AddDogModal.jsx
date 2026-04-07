import { useState, useMemo } from "react";
import { BRAND, getSizeForBreed } from "../../constants/index.js";
import { IconSearch } from "../icons/index.jsx";

function titleCase(str) {
  if (!str) return "";
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function AddDogModal({ onClose, onAdd, onAddHuman, humans }) {
  const [name, setName] = useState("");
  const [breed, setBreed] = useState("");
  const [dobMonth, setDobMonth] = useState("");
  const [dobYear, setDobYear] = useState("");
  const [size, setSize] = useState("");
  const [sizeAutoSet, setSizeAutoSet] = useState(false);
  const [sizeOverridden, setSizeOverridden] = useState(false);
  const [ownerQuery, setOwnerQuery] = useState("");
  const [selectedOwner, setSelectedOwner] = useState(null); // { id, label, phone }
  const [groomNotes, setGroomNotes] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // New owner form
  const [showNewOwner, setShowNewOwner] = useState(false);
  const [newOwnerName, setNewOwnerName] = useState("");
  const [newOwnerSurname, setNewOwnerSurname] = useState("");
  const [newOwnerPhone, setNewOwnerPhone] = useState("");

  const sizeColourMap = {
    small: { from: "#F5C518", to: "#D4A500", text: "#5C4600", sub: "rgba(60,40,0,0.65)" },
    medium: { from: "#2D8B7A", to: "#1E6B5C", text: BRAND.white, sub: "rgba(255,255,255,0.8)" },
    large: { from: "#E8567F", to: "#C93D63", text: BRAND.white, sub: "rgba(255,255,255,0.8)" },
  };
  const headerTheme = sizeColourMap[size] || { from: BRAND.blue, to: BRAND.blueDark, text: BRAND.white, sub: "rgba(255,255,255,0.8)" };
  const accent = sizeColourMap[size]?.to || BRAND.blueDark;

  const ownerResults = useMemo(() => {
    if (!ownerQuery.trim() || selectedOwner) return [];
    const query = ownerQuery.toLowerCase().trim();
    return Object.values(humans)
      .filter((h) => {
        if (!h) return false;
        const fullName = (h.fullName || `${h.name || ""} ${h.surname || ""}`).toLowerCase();
        const phone = (h.phone || "").toLowerCase();
        return fullName.includes(query) || phone.includes(query);
      })
      .slice(0, 5);
  }, [ownerQuery, humans, selectedOwner]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !breed.trim()) {
      setError("Dog name and breed are required.");
      return;
    }
    if (!size) {
      setError("This breed isn't recognised — please select a size manually.");
      return;
    }

    let ownerId = selectedOwner?.id;

    // If adding a new owner, create them first
    if (showNewOwner) {
      const oName = newOwnerName.trim();
      const oSurname = newOwnerSurname.trim();
      const oPhone = newOwnerPhone.trim();
      if (!oName || !oSurname || !oPhone) {
        setError("New owner needs a first name, surname, and phone number.");
        return;
      }
      if (!onAddHuman) {
        setError("Cannot create new owners right now.");
        return;
      }
      setSubmitting(true);
      setError("");
      const newHuman = await onAddHuman({ name: oName, surname: oSurname, phone: oPhone });
      if (!newHuman) {
        setSubmitting(false);
        setError("Failed to create new owner.");
        return;
      }
      ownerId = newHuman.id;
    }

    if (!ownerId) {
      setError("Please select or add an owner.");
      return;
    }

    setSubmitting(true);
    setError("");

    const dob = dobMonth && dobYear ? `${dobYear}-${dobMonth}` : "";

    const result = await onAdd({
      name: name.trim(),
      breed: breed.trim(),
      age: "",
      dob,
      size,
      humanId: ownerId,
      groomNotes: groomNotes.trim(),
    });
    setSubmitting(false);
    if (result) {
      onClose();
    } else {
      setError("Failed to add dog. A dog with this name may already exist.");
    }
  };

  const labelStyle = {
    fontSize: 11, fontWeight: 700, color: BRAND.textLight,
    textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 4,
  };

  const inputStyle = {
    width: "100%", padding: "10px 14px", borderRadius: 8,
    border: `1.5px solid ${BRAND.greyLight}`, fontSize: 13,
    fontFamily: "inherit", boxSizing: "border-box", outline: "none",
    color: BRAND.text, transition: "border-color 0.15s",
  };

  const focusHandlers = {
    onFocus: (e) => (e.target.style.borderColor = accent),
    onBlur: (e) => (e.target.style.borderColor = BRAND.greyLight),
  };

  return (
    <div onClick={onClose} style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.35)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: BRAND.white, borderRadius: 16, width: 400, maxHeight: "90vh", overflow: "auto",
        boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
      }}>
        {/* Header */}
        <div style={{
          background: `linear-gradient(135deg, ${headerTheme.from}, ${headerTheme.to})`,
          padding: "20px 24px", borderRadius: "16px 16px 0 0",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: headerTheme.text }}>Add New Dog</div>
          <button onClick={onClose} style={{
            background: "rgba(255,255,255,0.2)", border: "none", borderRadius: 8,
            width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", fontSize: 14, color: headerTheme.text, fontWeight: 700,
          }}>{"\u00D7"}</button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Name & Breed */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={labelStyle}>Dog Name *</label>
              <input value={name} onChange={(e) => { setName(e.target.value); setError(""); }}
                placeholder="Bella" style={inputStyle} autoFocus {...focusHandlers} />
            </div>
            <div>
              <label style={labelStyle}>Breed *</label>
              <input value={breed} onChange={(e) => {
                const val = e.target.value;
                setBreed(val);
                setError("");
                const detected = getSizeForBreed(val);
                if (detected && !sizeOverridden) {
                  setSize(detected);
                  setSizeAutoSet(true);
                } else if (!detected) {
                  if (sizeAutoSet && !sizeOverridden) {
                    setSize("");
                    setSizeAutoSet(false);
                  }
                }
              }} placeholder="Cockapoo" style={inputStyle} {...focusHandlers} />
            </div>
          </div>

          {/* DOB & Size */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={labelStyle}>Date of Birth</label>
              <div style={{ display: "flex", gap: 6 }}>
                <select value={dobMonth} onChange={(e) => setDobMonth(e.target.value)}
                  style={{ ...inputStyle, flex: 1, cursor: "pointer" }} {...focusHandlers}>
                  <option value="">Month</option>
                  {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m, i) => (
                    <option key={m} value={String(i + 1).padStart(2, "0")}>{m}</option>
                  ))}
                </select>
                <select value={dobYear} onChange={(e) => setDobYear(e.target.value)}
                  style={{ ...inputStyle, flex: 1, cursor: "pointer" }} {...focusHandlers}>
                  <option value="">Year</option>
                  {Array.from({ length: 26 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                    <option key={y} value={String(y)}>{y}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label style={labelStyle}>
                Size *
                {sizeAutoSet && !sizeOverridden && (
                  <span style={{ fontWeight: 500, textTransform: "none", letterSpacing: 0, color: BRAND.openGreen, marginLeft: 6 }}>auto</span>
                )}
                {!size && breed.trim() && (
                  <span style={{ fontWeight: 500, textTransform: "none", letterSpacing: 0, color: BRAND.coral, marginLeft: 6 }}>unknown breed</span>
                )}
              </label>
              <select value={size} onChange={(e) => {
                setSize(e.target.value);
                setSizeOverridden(true);
                setSizeAutoSet(false);
              }} style={{
                ...inputStyle, cursor: "pointer",
                borderColor: sizeAutoSet && !sizeOverridden ? BRAND.openGreen : !size && breed.trim() ? BRAND.coral : BRAND.greyLight,
              }}>
                <option value="">Select size</option>
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
              </select>
            </div>
          </div>

          {/* Owner */}
          <div>
            <label style={labelStyle}>Owner *</label>
            {selectedOwner && !showNewOwner ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1, background: BRAND.tealLight, padding: "10px 14px", borderRadius: 8 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: BRAND.teal }}>{titleCase(selectedOwner.label)}</div>
                  {selectedOwner.phone && (
                    <div style={{ fontSize: 12, color: BRAND.textLight, marginTop: 2 }}>{selectedOwner.phone}</div>
                  )}
                </div>
                <button type="button" onClick={() => { setSelectedOwner(null); setOwnerQuery(""); }} style={{
                  background: BRAND.coralLight, border: "none", borderRadius: 8, padding: "8px 12px",
                  color: BRAND.coral, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                }}>Change</button>
              </div>
            ) : !showNewOwner ? (
              <div>
                <div style={{ position: "relative" }}>
                  <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", display: "flex" }}>
                    <IconSearch size={14} colour={BRAND.textLight} />
                  </div>
                  <input
                    value={ownerQuery}
                    onChange={(e) => { setOwnerQuery(e.target.value); setError(""); }}
                    placeholder="Search by name or phone..."
                    style={{ ...inputStyle, paddingLeft: 34 }}
                    {...focusHandlers}
                  />
                  {ownerResults.length > 0 && (
                    <div style={{
                      position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4,
                      border: `1px solid ${BRAND.greyLight}`, borderRadius: 8, overflow: "hidden",
                      background: BRAND.white, zIndex: 10, boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                    }}>
                      {ownerResults.map((h) => {
                        const fullName = h.fullName || `${h.name || ""} ${h.surname || ""}`.trim();
                        return (
                          <div key={h.id || fullName} onMouseDown={() => {
                            setSelectedOwner({ id: h.id || fullName, label: fullName, phone: h.phone || "" });
                            setOwnerQuery(fullName);
                          }} style={{
                            padding: "10px 14px", cursor: "pointer",
                            borderBottom: `1px solid ${BRAND.greyLight}`, transition: "background 0.1s",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = BRAND.tealLight)}
                          onMouseLeave={(e) => (e.currentTarget.style.background = BRAND.white)}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: BRAND.text }}>{titleCase(fullName)}</div>
                            {h.phone && <div style={{ fontSize: 12, color: BRAND.textLight }}>{h.phone}</div>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                {onAddHuman && (
                  <button type="button" onClick={() => { setShowNewOwner(true); setOwnerQuery(""); setSelectedOwner(null); }} style={{
                    width: "100%", marginTop: 8, padding: "8px", borderRadius: 8,
                    border: `1.5px solid ${BRAND.teal}`, background: BRAND.white,
                    color: BRAND.teal, fontSize: 12, fontWeight: 700,
                    cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
                  }}>
                    + Add new owner
                  </button>
                )}
              </div>
            ) : (
              <div style={{ padding: 12, background: BRAND.offWhite, borderRadius: 8, border: `1px solid ${BRAND.greyLight}` }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: BRAND.text, marginBottom: 8 }}>New owner</div>
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <input
                    type="text" placeholder="First name" value={newOwnerName}
                    onChange={(e) => setNewOwnerName(e.target.value)} autoFocus
                    style={{ ...inputStyle, flex: 1 }} {...focusHandlers}
                  />
                  <input
                    type="text" placeholder="Surname" value={newOwnerSurname}
                    onChange={(e) => setNewOwnerSurname(e.target.value)}
                    style={{ ...inputStyle, flex: 1 }} {...focusHandlers}
                  />
                </div>
                <input
                  type="tel" placeholder="Phone number" value={newOwnerPhone}
                  onChange={(e) => setNewOwnerPhone(e.target.value)}
                  style={{ ...inputStyle, width: "100%", boxSizing: "border-box", marginBottom: 8 }} {...focusHandlers}
                />
                <button type="button" onClick={() => {
                  setShowNewOwner(false);
                  setNewOwnerName(""); setNewOwnerSurname(""); setNewOwnerPhone("");
                }} style={{
                  background: "none", border: "none", color: BRAND.textLight,
                  fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", padding: 0,
                }}>
                  Cancel — search existing instead
                </button>
              </div>
            )}
          </div>

          {/* Groom Notes */}
          <div>
            <label style={labelStyle}>Groom Notes</label>
            <textarea value={groomNotes} onChange={(e) => setGroomNotes(e.target.value)}
              placeholder="Teddy bear cut, short on ears..." rows={2}
              style={{ ...inputStyle, resize: "vertical" }} {...focusHandlers} />
          </div>

          {error && (
            <div style={{ fontSize: 13, color: BRAND.coral, fontWeight: 600, background: BRAND.coralLight, padding: "8px 12px", borderRadius: 8 }}>
              {error}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <button type="submit" disabled={submitting} style={{
              flex: 1, padding: "12px", borderRadius: 10, border: "none",
              background: submitting ? BRAND.greyLight : headerTheme.from,
              color: submitting ? BRAND.textLight : headerTheme.text,
              fontSize: 14, fontWeight: 700, cursor: submitting ? "not-allowed" : "pointer",
              fontFamily: "inherit", transition: "all 0.15s",
            }}
            onMouseEnter={(e) => { if (!submitting) e.currentTarget.style.background = headerTheme.to; }}
            onMouseLeave={(e) => { if (!submitting) e.currentTarget.style.background = headerTheme.from; }}>
              {submitting ? "Adding..." : "Add Dog"}
            </button>
            <button type="button" onClick={onClose} style={{
              padding: "12px 20px", borderRadius: 10, border: `1.5px solid ${BRAND.greyLight}`,
              background: BRAND.white, color: BRAND.textLight, fontSize: 14, fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit",
            }}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
