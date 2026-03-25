import { useState } from "react";
import { BRAND, SERVICES, PRICING } from "../../constants/index.ts";
import { canBookSlot } from "../../engine/capacity.ts";
import type { Booking, DogSize, ServiceId } from "../../types.ts";

interface Props {
  slot: string;
  onAdd: (booking: Booking) => void;
  onCancel: () => void;
  bookings: Booking[];
  activeSlots: string[];
}

export function AddBookingForm({ slot, onAdd, onCancel, bookings, activeSlots }: Props) {
  const [dogName, setDogName] = useState<string>("");
  const [breed, setBreed] = useState<string>("");
  const [size, setSize] = useState<DogSize>("small");
  const [service, setService] = useState<ServiceId | string>("full_groom");
  const [owner, setOwner] = useState<string>("");
  const [error, setError] = useState<string>("");

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!dogName.trim() || !breed.trim() || !owner.trim()) { setError("Fill in all fields"); return; }
    const check = canBookSlot(bookings, slot, size, activeSlots);
    if (!check.allowed) { setError(check.reason || "Cannot book this slot"); return; }
    onAdd({ id: Date.now(), slot, dogName: dogName.trim(), breed: breed.trim(), size, service, owner: owner.trim() });
  };

  const inputStyle: React.CSSProperties = {
    padding: "7px 10px", borderRadius: 8, border: `1.5px solid ${BRAND.greyLight}`,
    fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box", fontFamily: "inherit",
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        <input placeholder="Dog name" aria-label="Dog name" aria-required="true" value={dogName} onChange={(e) => { setDogName(e.target.value); setError(""); }} style={inputStyle} autoFocus
          onFocus={(e) => (e.target.style.borderColor = BRAND.blue)} onBlur={(e) => (e.target.style.borderColor = BRAND.greyLight)} />
        <input placeholder="Breed" aria-label="Breed" aria-required="true" value={breed} onChange={(e) => { setBreed(e.target.value); setError(""); }} style={inputStyle}
          onFocus={(e) => (e.target.style.borderColor = BRAND.blue)} onBlur={(e) => (e.target.style.borderColor = BRAND.greyLight)} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        <input placeholder="Human name" aria-label="Owner name" aria-required="true" value={owner} onChange={(e) => { setOwner(e.target.value); setError(""); }} style={inputStyle}
          onFocus={(e) => (e.target.style.borderColor = BRAND.blue)} onBlur={(e) => (e.target.style.borderColor = BRAND.greyLight)} />
        <select value={size} aria-label="Dog size" onChange={(e) => { setSize(e.target.value as DogSize); setError(""); }} style={{ ...inputStyle, cursor: "pointer" }}>
          <option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option>
        </select>
      </div>
      <select value={service} aria-label="Service type" onChange={(e) => setService(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
        {SERVICES.map((s) => <option key={s.id} value={s.id}>{s.icon} {s.name} {"\u2014"} {PRICING[s.id]?.[size] || "N/A"}</option>)}
      </select>
      {error && <div role="alert" id="form-error" style={{ fontSize: 12, color: BRAND.coral, fontWeight: 500, padding: "2px 0" }}>{error}</div>}
      <div style={{ display: "flex", gap: 6 }}>
        <button type="submit" style={{
          flex: 1, padding: "7px 0", borderRadius: 8, border: "none", background: BRAND.blue,
          color: BRAND.white, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
        }} onMouseEnter={(e) => (e.currentTarget.style.background = BRAND.blueDark)} onMouseLeave={(e) => (e.currentTarget.style.background = BRAND.blue)}>
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
