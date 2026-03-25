import { useState, useMemo } from "react";
import { BRAND } from "../../constants/index.js";
import { IconSearch } from "../icons/index.jsx";

export function AddDogModal({ onClose, onAdd, humans }) {
  const [name, setName] = useState("");
  const [breed, setBreed] = useState("");
  const [age, setAge] = useState("");
  const [size, setSize] = useState("small");
  const [ownerQuery, setOwnerQuery] = useState("");
  const [selectedOwner, setSelectedOwner] = useState("");
  const [groomNotes, setGroomNotes] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const ownerResults = useMemo(() => {
    if (!ownerQuery.trim() || selectedOwner) return [];
    const query = ownerQuery.toLowerCase().trim();
    return Object.entries(humans)
      .filter(([key]) => key.toLowerCase().includes(query))
      .slice(0, 5);
  }, [ownerQuery, humans, selectedOwner]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !breed.trim()) {
      setError("Dog name and breed are required.");
      return;
    }
    if (!selectedOwner) {
      setError("Please select an owner.");
      return;
    }
    setSubmitting(true);
    setError("");
    const result = await onAdd({
      name: name.trim(),
      breed: breed.trim(),
      age: age.trim(),
      size,
      humanId: selectedOwner,
      groomNotes: groomNotes.trim(),
    });
    setSubmitting(false);
    if (result) {
      onClose();
    } else {
      setError("Failed to add dog. A dog with this name may already exist.");
    }
  };

  const inputStyle = {
    width: "100%", padding: "10px 14px", borderRadius: 8,
    border: `1.5px solid ${BRAND.greyLight}`, fontSize: 13,
    fontFamily: "inherit", boxSizing: "border-box", outline: "none",
    color: BRAND.text, transition: "border-color 0.15s",
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
          background: `linear-gradient(135deg, ${BRAND.blue}, ${BRAND.blueDark})`,
          padding: "20px 24px", borderRadius: "16px 16px 0 0",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: BRAND.white }}>Add New Dog</div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.2)", border: "none", borderRadius: 8, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 14, color: BRAND.white, fontWeight: 700 }}>{"\u00D7"}</button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: BRAND.textLight, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 4 }}>Dog Name *</label>
              <input value={name} onChange={e => { setName(e.target.value); setError(""); }} placeholder="Bella" style={inputStyle} autoFocus
                onFocus={e => e.target.style.borderColor = BRAND.blue} onBlur={e => e.target.style.borderColor = BRAND.greyLight} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: BRAND.textLight, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 4 }}>Breed *</label>
              <input value={breed} onChange={e => { setBreed(e.target.value); setError(""); }} placeholder="Cockapoo" style={inputStyle}
                onFocus={e => e.target.style.borderColor = BRAND.blue} onBlur={e => e.target.style.borderColor = BRAND.greyLight} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: BRAND.textLight, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 4 }}>Age</label>
              <input value={age} onChange={e => setAge(e.target.value)} placeholder="3 yrs" style={inputStyle}
                onFocus={e => e.target.style.borderColor = BRAND.blue} onBlur={e => e.target.style.borderColor = BRAND.greyLight} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: BRAND.textLight, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 4 }}>Size *</label>
              <select value={size} onChange={e => setSize(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
              </select>
            </div>
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: BRAND.textLight, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 4 }}>Owner *</label>
            {selectedOwner ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: BRAND.teal, background: BRAND.tealLight, padding: "10px 14px", borderRadius: 8 }}>{selectedOwner}</span>
                <button type="button" onClick={() => { setSelectedOwner(""); setOwnerQuery(""); }} style={{
                  background: BRAND.coralLight, border: "none", borderRadius: 8, padding: "8px 12px",
                  color: BRAND.coral, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                }}>Change</button>
              </div>
            ) : (
              <div style={{ position: "relative" }}>
                <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", display: "flex" }}>
                  <IconSearch size={14} colour={BRAND.textLight} />
                </div>
                <input
                  value={ownerQuery}
                  onChange={e => { setOwnerQuery(e.target.value); setError(""); }}
                  placeholder="Search for owner..."
                  style={{ ...inputStyle, paddingLeft: 34 }}
                  onFocus={e => e.target.style.borderColor = BRAND.blue}
                  onBlur={e => e.target.style.borderColor = BRAND.greyLight}
                />
                {ownerResults.length > 0 && (
                  <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, border: `1px solid ${BRAND.greyLight}`, borderRadius: 8, overflow: "hidden", background: BRAND.white, zIndex: 10, boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
                    {ownerResults.map(([key, h]) => (
                      <div key={key} onMouseDown={() => { setSelectedOwner(key); setOwnerQuery(key); }} style={{
                        padding: "10px 14px", cursor: "pointer", borderBottom: `1px solid ${BRAND.greyLight}`,
                        transition: "background 0.1s",
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = BRAND.blueLight}
                      onMouseLeave={e => e.currentTarget.style.background = BRAND.white}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: BRAND.text }}>{h.name} {h.surname}</div>
                        <div style={{ fontSize: 12, color: BRAND.textLight }}>{h.phone}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: BRAND.textLight, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 4 }}>Groom Notes</label>
            <textarea value={groomNotes} onChange={e => setGroomNotes(e.target.value)} placeholder="Teddy bear cut, short on ears..." rows={2} style={{ ...inputStyle, resize: "vertical" }}
              onFocus={e => e.target.style.borderColor = BRAND.blue} onBlur={e => e.target.style.borderColor = BRAND.greyLight} />
          </div>

          {error && (
            <div style={{ fontSize: 13, color: BRAND.coral, fontWeight: 600, background: BRAND.coralLight, padding: "8px 12px", borderRadius: 8 }}>
              {error}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <button type="submit" disabled={submitting} style={{
              flex: 1, padding: "12px", borderRadius: 10, border: "none",
              background: submitting ? BRAND.greyLight : BRAND.blue,
              color: submitting ? BRAND.textLight : BRAND.white,
              fontSize: 14, fontWeight: 700, cursor: submitting ? "not-allowed" : "pointer",
              fontFamily: "inherit", transition: "all 0.15s",
            }}
            onMouseEnter={e => { if (!submitting) e.currentTarget.style.background = BRAND.blueDark; }}
            onMouseLeave={e => { if (!submitting) e.currentTarget.style.background = BRAND.blue; }}>
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
