import { useState } from "react";
import { BRAND } from "../../constants/index.js";

export function AddHumanModal({ onClose, onAdd }) {
  const [name, setName] = useState("");
  const [surname, setSurname] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [sms, setSms] = useState(false);
  const [whatsapp, setWhatsapp] = useState(false);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !surname.trim()) {
      setError("First name and surname are required.");
      return;
    }
    setSubmitting(true);
    setError("");
    const result = await onAdd({
      name: name.trim(),
      surname: surname.trim(),
      phone: phone.trim(),
      email: email.trim(),
      address: address.trim(),
      sms,
      whatsapp,
      notes: notes.trim(),
    });
    setSubmitting(false);
    if (result) {
      onClose();
    } else {
      setError("Failed to add human. They may already exist.");
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
          background: `linear-gradient(135deg, ${BRAND.teal}, #236b5d)`,
          padding: "20px 24px", borderRadius: "16px 16px 0 0",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: BRAND.white }}>Add New Human</div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.2)", border: "none", borderRadius: 8, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 14, color: BRAND.white, fontWeight: 700 }}>{"\u00D7"}</button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: BRAND.textLight, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 4 }}>First Name *</label>
              <input value={name} onChange={e => { setName(e.target.value); setError(""); }} placeholder="Sarah" style={inputStyle} autoFocus
                onFocus={e => e.target.style.borderColor = BRAND.teal} onBlur={e => e.target.style.borderColor = BRAND.greyLight} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: BRAND.textLight, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 4 }}>Surname *</label>
              <input value={surname} onChange={e => { setSurname(e.target.value); setError(""); }} placeholder="Jones" style={inputStyle}
                onFocus={e => e.target.style.borderColor = BRAND.teal} onBlur={e => e.target.style.borderColor = BRAND.greyLight} />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: BRAND.textLight, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 4 }}>Phone</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="07700 900111" style={inputStyle}
              onFocus={e => e.target.style.borderColor = BRAND.teal} onBlur={e => e.target.style.borderColor = BRAND.greyLight} />
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: BRAND.textLight, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 4 }}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="sarah@example.com" style={inputStyle}
              onFocus={e => e.target.style.borderColor = BRAND.teal} onBlur={e => e.target.style.borderColor = BRAND.greyLight} />
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: BRAND.textLight, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 4 }}>Address</label>
            <input value={address} onChange={e => setAddress(e.target.value)} placeholder="123 Main St" style={inputStyle}
              onFocus={e => e.target.style.borderColor = BRAND.teal} onBlur={e => e.target.style.borderColor = BRAND.greyLight} />
          </div>

          <div style={{ display: "flex", gap: 20 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer", fontWeight: 500 }}>
              <input type="checkbox" checked={sms} onChange={e => setSms(e.target.checked)} style={{ accentColor: BRAND.teal, width: 18, height: 18, cursor: "pointer" }} />
              SMS
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer", fontWeight: 500 }}>
              <input type="checkbox" checked={whatsapp} onChange={e => setWhatsapp(e.target.checked)} style={{ accentColor: BRAND.teal, width: 18, height: 18, cursor: "pointer" }} />
              WhatsApp
            </label>
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: BRAND.textLight, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 4 }}>Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any notes about this person..." rows={2} style={{ ...inputStyle, resize: "vertical" }}
              onFocus={e => e.target.style.borderColor = BRAND.teal} onBlur={e => e.target.style.borderColor = BRAND.greyLight} />
          </div>

          {error && (
            <div style={{ fontSize: 13, color: BRAND.coral, fontWeight: 600, background: BRAND.coralLight, padding: "8px 12px", borderRadius: 8 }}>
              {error}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <button type="submit" disabled={submitting} style={{
              flex: 1, padding: "12px", borderRadius: 10, border: "none",
              background: submitting ? BRAND.greyLight : BRAND.teal,
              color: submitting ? BRAND.textLight : BRAND.white,
              fontSize: 14, fontWeight: 700, cursor: submitting ? "not-allowed" : "pointer",
              fontFamily: "inherit", transition: "all 0.15s",
            }}
            onMouseEnter={e => { if (!submitting) e.currentTarget.style.background = "#236b5d"; }}
            onMouseLeave={e => { if (!submitting) e.currentTarget.style.background = BRAND.teal; }}>
              {submitting ? "Adding..." : "Add Human"}
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
