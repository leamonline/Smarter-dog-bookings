import { useState } from "react";
import { BRAND, SERVICES, PRICING } from "../../constants/index.js";
import { canBookSlot } from "../../engine/capacity.js";

export function AddBookingForm({ slot, onAdd, onCancel, bookings, activeSlots }) {
  const [dogName, setDogName] = useState("");
  const [breed, setBreed] = useState("");
  const [size, setSize] = useState("small");
  const [service, setService] = useState("full_groom");
  const [owner, setOwner] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!dogName.trim() || !breed.trim() || !owner.trim()) { setError("Fill in all fields"); return; }
    const check = canBookSlot(bookings, slot, size, activeSlots);
    if (!check.allowed) { setError(check.reason); return; }
    onAdd({ id: Date.now(), slot, dogName: dogName.trim(), breed: breed.trim(), size, service, owner: owner.trim() });
  };

  const inputStyle = {
    padding: "7px 10px", borderRadius: 8, border: `1.5px solid ${BRAND.greyLight}`,
    fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box", fontFamily: "inherit",
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        <input placeholder="Dog name" value={dogName} onChange={(e) => { setDogName(e.target.value); setError(""); }} style={inputStyle} autoFocus
          onFocus={(e) => (e.target.style.borderColor = BRAND.blue)} onBlur={(e) => (e.target.style.borderColor = BRAND.greyLight)} />
        <input placeholder="Breed" value={breed} onChange={(e) => { setBreed(e.target.value); setError(""); }} style={inputStyle}
          onFocus={(e) => (e.target.style.borderColor = BRAND.blue)} onBlur={(e) => (e.target.style.borderColor = BRAND.greyLight)} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        <input placeholder="Human name" value={owner} onChange={(e) => { setOwner(e.target.value); setError(""); }} style={inputStyle}
          onFocus={(e) => (e.target.style.borderColor = BRAND.blue)} onBlur={(e) => (e.target.style.borderColor = BRAND.greyLight)} />
        <select value={size} onChange={(e) => { setSize(e.target.value); setError(""); }} style={{ ...inputStyle, cursor: "pointer" }}>
          <option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option>
        </select>
      </div>
      <select value={service} onChange={(e) => setService(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
        {SERVICES.map((s) => <option key={s.id} value={s.id}>{s.icon} {s.name} {"\u2014"} {PRICING[s.id]?.[size] || "N/A"}</option>)}
      </select>
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
