import { BRAND } from "../../constants/index.js";
import { SAMPLE_DOGS } from "../../data/sample.js";

export function DogCardModal({ dogId, onClose, onOpenHuman }) {
  const dog = Object.values(SAMPLE_DOGS).find(d => d.name === dogId) || { name: dogId, breed: "", age: "", humanId: "", alerts: [], groomNotes: "" };

  const detailRow = (label, value) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${BRAND.greyLight}` }}>
      <span style={{ fontSize: 13, color: BRAND.textLight }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: BRAND.text, textAlign: "right" }}>{value || "\u2014"}</span>
    </div>
  );

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
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", marginTop: 4 }}>{dog.breed} \u00B7 {dog.age}</div>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.2)", border: "none", borderRadius: 8, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 14, color: BRAND.white, fontWeight: 700 }}>\u00D7</button>
        </div>

        <div style={{ padding: "16px 24px 20px" }}>
          {detailRow("Owner", dog.humanId)}
          {dog.humanId && (
            <div style={{ textAlign: "right", marginTop: -2, marginBottom: 8 }}>
              <span onClick={() => { onClose(); onOpenHuman && onOpenHuman(dog.humanId); }} style={{ fontSize: 12, color: BRAND.teal, cursor: "pointer", fontWeight: 600, borderBottom: `1px dashed ${BRAND.teal}` }}>View human card \u2192</span>
            </div>
          )}
          {detailRow("Groom Notes", dog.groomNotes)}

          {dog.alerts && dog.alerts.length > 0 && (
            <>
              <div style={{ marginTop: 16, fontWeight: 800, fontSize: 12, color: BRAND.coral, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Alerts</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {dog.alerts.map(alert => (
                  <span key={alert} style={{ background: BRAND.coralLight, color: BRAND.coral, padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700 }}>
                    \u26A0\uFE0F {alert}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
