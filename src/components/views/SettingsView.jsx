import { useState } from "react";
import { BRAND, SERVICES } from "../../constants/index.js";
import { IconTick } from "../icons/index.jsx";

export function SettingsView({ onBack, config, onUpdateConfig }) {
  const [newSlotTime, setNewSlotTime] = useState("");

  const updatePricing = (serviceId, size, value) => {
    onUpdateConfig(prev => ({
      ...prev,
      pricing: {
        ...prev.pricing,
        [serviceId]: { ...prev.pricing[serviceId], [size]: value }
      }
    }));
  };

  const toggleCapacity = () => {
    onUpdateConfig(prev => ({ ...prev, enforceCapacity: !prev.enforceCapacity }));
  };

  const updatePickupOffset = (value) => {
    onUpdateConfig(prev => ({ ...prev, defaultPickupOffset: Number(value) }));
  };

  const addLargeDogSlot = () => {
    if (!newSlotTime) return;
    const formatted = newSlotTime; // HH:MM from input type="time"
    if (config.largeDogSlots[formatted]) return; // already exists
    onUpdateConfig(prev => ({
      ...prev,
      largeDogSlots: {
        ...prev.largeDogSlots,
        [formatted]: { seats: 2, canShare: false, needsApproval: false }
      }
    }));
    setNewSlotTime("");
  };

  const removeLargeDogSlot = (time) => {
    onUpdateConfig(prev => {
      const updated = { ...prev.largeDogSlots };
      delete updated[time];
      return { ...prev, largeDogSlots: updated };
    });
  };

  const SectionTitle = ({ children, description }) => (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontWeight: 800, fontSize: 14, color: BRAND.blueDark, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {children}
      </div>
      {description && <div style={{ fontSize: 13, color: BRAND.textLight, marginTop: 4 }}>{description}</div>}
    </div>
  );

  const Card = ({ children }) => (
    <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyLight}`, borderRadius: 14, padding: "24px", marginBottom: 20, boxShadow: "0 2px 12px rgba(0,0,0,0.03)" }}>
      {children}
    </div>
  );

  const SettingRow = ({ label, control, border = true }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 0", borderBottom: border ? `1px solid ${BRAND.greyLight}` : "none" }}>
      <span style={{ fontSize: 14, fontWeight: 600, color: BRAND.text }}>{label}</span>
      <div>{control}</div>
    </div>
  );

  const inputStyle = { padding: "8px 12px", borderRadius: 8, border: `1px solid ${BRAND.greyLight}`, fontSize: 13, outline: "none", fontFamily: "inherit", color: BRAND.text, width: 100, textAlign: "right" };

  return (
    <div style={{ animation: "fadeIn 0.2s ease-in" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: BRAND.text }}>Salon Settings</h2>
          <div style={{ fontSize: 13, color: BRAND.textLight, marginTop: 4 }}>Manage operations, pricing, and capacity rules.</div>
        </div>
        <button onClick={onBack} style={{
          background: BRAND.blueLight, color: BRAND.blueDark, border: "none", borderRadius: 8,
          padding: "10px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "all 0.15s",
          display: "flex", alignItems: "center", gap: 8
        }} onMouseEnter={e => e.currentTarget.style.background = "#cbf0fa"} onMouseLeave={e => e.currentTarget.style.background = BRAND.blueLight}>
          <IconTick size={16} colour={BRAND.blueDark} /> Back to Dashboard
        </button>
      </div>

      <Card>
        <SectionTitle description="Default time allocations for new appointments.">Salon Operations</SectionTitle>
        <SettingRow label="Default estimated pick-up offset (minutes)" control={
          <input type="number" value={config.defaultPickupOffset} onChange={e => updatePickupOffset(e.target.value)} style={inputStyle} />
        } border={false} />
      </Card>

      <Card>
        <SectionTitle description="Base prices applied when booking a dog based on their size profile.">Services & Pricing</SectionTitle>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${BRAND.greyLight}` }}>
                <th style={{ padding: "12px 0", color: BRAND.textLight, fontWeight: 700 }}>Service</th>
                <th style={{ padding: "12px 0", color: BRAND.textLight, fontWeight: 700, textAlign: "right" }}>Small</th>
                <th style={{ padding: "12px 0", color: BRAND.textLight, fontWeight: 700, textAlign: "right" }}>Medium</th>
                <th style={{ padding: "12px 0", color: BRAND.textLight, fontWeight: 700, textAlign: "right" }}>Large</th>
              </tr>
            </thead>
            <tbody>
              {SERVICES.map((s, index) => (
                <tr key={s.id} style={{ borderBottom: index === SERVICES.length - 1 ? "none" : `1px solid ${BRAND.greyLight}` }}>
                  <td style={{ padding: "16px 0", fontWeight: 600 }}>{s.icon} {s.name}</td>
                  <td style={{ padding: "16px 0", textAlign: "right" }}><input type="text" value={config.pricing[s.id].small} onChange={e => updatePricing(s.id, "small", e.target.value)} style={{...inputStyle, width: 70}} /></td>
                  <td style={{ padding: "16px 0", textAlign: "right" }}><input type="text" value={config.pricing[s.id].medium} onChange={e => updatePricing(s.id, "medium", e.target.value)} style={{...inputStyle, width: 70}} /></td>
                  <td style={{ padding: "16px 0", textAlign: "right" }}><input type="text" value={config.pricing[s.id].large} onChange={e => updatePricing(s.id, "large", e.target.value)} style={{...inputStyle, width: 70}} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <SectionTitle description="Rules governing how many dogs can be booked at once.">Capacity Engine (2-2-1 Rule)</SectionTitle>
        <SettingRow label="Enforce 2-2-1 strict capacity rules" control={
          <div onClick={toggleCapacity} style={{
            width: 44, height: 24, background: config.enforceCapacity ? BRAND.openGreen : BRAND.greyLight,
            borderRadius: 12, position: "relative", cursor: "pointer", transition: "background 0.2s"
          }}>
            <div style={{
              width: 20, height: 20, background: BRAND.white, borderRadius: 10, position: "absolute",
              top: 2, transition: "left 0.2s",
              left: config.enforceCapacity ? 22 : 2,
            }}></div>
          </div>
        } />
        <div style={{ padding: "16px 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: BRAND.text, marginBottom: 4 }}>Large Dog approved slots</div>
            <div style={{ fontSize: 12, color: BRAND.textLight, maxWidth: 300 }}>Slots where large dogs are permitted. Click a slot to remove it.</div>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: 300 }}>
            {Object.keys(config.largeDogSlots).sort().map(time => (
              <span key={time} onClick={() => removeLargeDogSlot(time)} style={{
                background: BRAND.coralLight, color: BRAND.coral, padding: "6px 12px", borderRadius: 8,
                fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = BRAND.coral; e.currentTarget.style.color = BRAND.white; }}
              onMouseLeave={e => { e.currentTarget.style.background = BRAND.coralLight; e.currentTarget.style.color = BRAND.coral; }}>
                {time} {"\u00D7"}
              </span>
            ))}
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <input type="time" value={newSlotTime} onChange={e => setNewSlotTime(e.target.value)} style={{
                padding: "4px 8px", borderRadius: 8, border: `1px dashed ${BRAND.grey}`, fontSize: 12,
                fontFamily: "inherit", color: BRAND.text, outline: "none", width: 80
              }} />
              <button onClick={addLargeDogSlot} style={{
                background: BRAND.offWhite, border: `1px dashed ${BRAND.grey}`, color: BRAND.textLight,
                padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = BRAND.tealLight; e.currentTarget.style.color = BRAND.teal; }}
              onMouseLeave={e => { e.currentTarget.style.background = BRAND.offWhite; e.currentTarget.style.color = BRAND.textLight; }}>
                + Add
              </button>
            </div>
          </div>
        </div>
      </Card>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(5px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
