import { useState, useMemo } from "react";
import { BRAND, SERVICES, PRICING } from "../../constants/index.js";
import { canBookSlot } from "../../engine/capacity.js";
import { IconSearch } from "../icons/index.jsx";

export function AddBookingForm({ slot, onAdd, onCancel, bookings, activeSlots, dogs, humans, prefill }) {
  const [dogQuery, setDogQuery] = useState(prefill?.dogName || "");
  const [selectedDog, setSelectedDog] = useState(prefill ? { name: prefill.dogName, breed: prefill.breed, size: prefill.size, humanId: prefill.owner } : null);
  const [size, setSize] = useState(prefill?.size || "small");
  const [service, setService] = useState(prefill?.service || "full_groom");
  const [error, setError] = useState("");

  // Dog autocomplete results
  const dogResults = useMemo(() => {
    if (!dogQuery.trim() || selectedDog) return [];
    const query = dogQuery.toLowerCase().trim();
    return Object.values(dogs || {})
      .filter(d => {
        const ownerName = d.humanId || "";
        return `${d.name} ${d.breed} ${ownerName}`.toLowerCase().includes(query);
      })
      .slice(0, 6);
  }, [dogQuery, dogs, selectedDog]);

  const handleSelectDog = (dog) => {
    setSelectedDog(dog);
    setDogQuery(dog.name);
    if (dog.size) setSize(dog.size);
    setError("");
  };

  const handleClearDog = () => {
    setSelectedDog(null);
    setDogQuery("");
  };

  const ownerName = selectedDog?.humanId || "";

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!selectedDog) { setError("Select a dog from the list"); return; }
    const check = canBookSlot(bookings, slot, size, activeSlots);
    if (!check.allowed) { setError(check.reason); return; }
    onAdd({
      id: Date.now(),
      slot,
      dogName: selectedDog.name,
      breed: selectedDog.breed,
      size,
      service,
      owner: ownerName,
    });
  };

  const inputStyle = {
    padding: "7px 10px", borderRadius: 8, border: `1.5px solid ${BRAND.greyLight}`,
    fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box", fontFamily: "inherit",
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
      {/* Dog search / selected dog display */}
      {selectedDog ? (
        <div style={{ display: "flex", alignItems: "center", gap: 6, background: BRAND.blueLight, borderRadius: 8, padding: "6px 10px" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: BRAND.blueDark }}>{selectedDog.name}</div>
            <div style={{ fontSize: 11, color: BRAND.text }}>{selectedDog.breed} · {ownerName}</div>
          </div>
          <button type="button" onClick={handleClearDog} style={{
            background: BRAND.white, border: `1px solid ${BRAND.greyLight}`, borderRadius: 6,
            padding: "3px 8px", fontSize: 11, fontWeight: 600, cursor: "pointer", color: BRAND.textLight, fontFamily: "inherit",
          }}>Change</button>
        </div>
      ) : (
        <div style={{ position: "relative" }}>
          <div style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", display: "flex", pointerEvents: "none" }}>
            <IconSearch size={13} colour={BRAND.textLight} />
          </div>
          <input
            placeholder="Search dog by name, breed, or owner..."
            value={dogQuery}
            onChange={(e) => { setDogQuery(e.target.value); setError(""); }}
            style={{ ...inputStyle, paddingLeft: 26 }}
            autoFocus
            onFocus={(e) => (e.target.style.borderColor = BRAND.blue)}
            onBlur={(e) => (e.target.style.borderColor = BRAND.greyLight)}
          />
          {dogResults.length > 0 && (
            <div style={{
              position: "absolute", top: "100%", left: 0, right: 0, marginTop: 2, zIndex: 20,
              background: BRAND.white, border: `1px solid ${BRAND.greyLight}`, borderRadius: 8,
              boxShadow: "0 4px 12px rgba(0,0,0,0.1)", maxHeight: 200, overflow: "auto",
            }}>
              {dogResults.map(dog => (
                <div key={dog.id} onMouseDown={() => handleSelectDog(dog)} style={{
                  padding: "8px 10px", cursor: "pointer", borderBottom: `1px solid ${BRAND.greyLight}`,
                  transition: "background 0.1s",
                }}
                onMouseEnter={e => e.currentTarget.style.background = BRAND.blueLight}
                onMouseLeave={e => e.currentTarget.style.background = BRAND.white}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: BRAND.text }}>{dog.name} <span style={{ fontWeight: 400, color: BRAND.textLight }}>({dog.breed})</span></div>
                  <div style={{ fontSize: 11, color: BRAND.textLight }}>{dog.humanId}{dog.size ? ` · ${dog.size}` : ""}</div>
                </div>
              ))}
            </div>
          )}
          {dogQuery.trim().length >= 2 && dogResults.length === 0 && !selectedDog && (
            <div style={{ fontSize: 11, color: BRAND.textLight, marginTop: 2, paddingLeft: 2 }}>No dogs found. Add a dog from the Dogs directory first.</div>
          )}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        <select value={size} onChange={(e) => { setSize(e.target.value); setError(""); }} style={{ ...inputStyle, cursor: "pointer" }}>
          <option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option>
        </select>
        <select value={service} onChange={(e) => setService(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
          {SERVICES.map((s) => <option key={s.id} value={s.id}>{s.icon} {s.name} — {PRICING[s.id]?.[size] || "N/A"}</option>)}
        </select>
      </div>

      {error && <div style={{ fontSize: 12, color: BRAND.coral, fontWeight: 500, padding: "2px 0" }}>{error}</div>}
      <div style={{ display: "flex", gap: 6 }}>
        <button type="submit" style={{
          flex: 1, padding: "7px 0", borderRadius: 8, border: "none", background: BRAND.blue,
          color: BRAND.white, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
        }} onMouseEnter={(e) => (e.target.style.background = BRAND.blueDark)} onMouseLeave={(e) => (e.target.style.background = BRAND.blue)}>
          Confirm
        </button>
        <button type="button" onClick={onCancel} style={{
          padding: "7px 14px", borderRadius: 8, border: `1.5px solid ${BRAND.greyLight}`,
          background: BRAND.white, color: BRAND.textLight, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
        }}>Cancel</button>
      </div>
    </form>
  );
}
