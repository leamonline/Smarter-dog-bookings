import { cardAnim } from "./dashboardConstants.js";

export function MyDetailsCard({ editing, setEditing, saving, details, setDetails, humanRecord, onSave, onCancel }) {
  return (
    <div className="pink-card" style={cardAnim(0.05)}>
      <div className="pink-card-header">
        <span className="pink-card-icon" aria-hidden="true">{"\uD83D\uDC64"}</span>
        <h2 className="pink-card-title">My Details</h2>
        {!editing ? (
          <button className="wobbly-btn wobbly-btn--edit" onClick={() => setEditing(true)}>
            Edit
          </button>
        ) : (
          <div style={{ display: "flex", gap: "6px" }}>
            <button className="wobbly-btn wobbly-btn--save" onClick={onSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </button>
            <button className="wobbly-btn wobbly-btn--cancel-text" onClick={onCancel}>
              Cancel
            </button>
          </div>
        )}
      </div>

      {editing ? (
        <div style={{ display: "flex", gap: "10px", padding: "10px 0", borderBottom: "2px dashed #FFD6E4" }}>
          <div style={{ flex: 1 }}>
            <div className="portal-detail-label" style={{ marginBottom: "4px", fontSize: "11px" }}>First Name</div>
            <input
              value={details.name}
              onChange={e => setDetails(d => ({ ...d, name: e.target.value }))}
              className="portal-input portal-input--full"
            />
          </div>
          <div style={{ flex: 1 }}>
            <div className="portal-detail-label" style={{ marginBottom: "4px", fontSize: "11px" }}>Surname</div>
            <input
              value={details.surname}
              onChange={e => setDetails(d => ({ ...d, surname: e.target.value }))}
              className="portal-input portal-input--full"
            />
          </div>
        </div>
      ) : (
        <div className="portal-detail-row">
          <span className="portal-detail-label">Name</span>
          <span className="portal-detail-value">{`${details.name} ${details.surname}`.trim() || "\u2014"}</span>
        </div>
      )}

      <div className="portal-detail-row">
        <span className="portal-detail-label">Address</span>
        {editing ? (
          <input value={details.address} onChange={e => setDetails(d => ({ ...d, address: e.target.value }))} className="portal-input" />
        ) : (
          <span className="portal-detail-value">{details.address || "\u2014"}</span>
        )}
      </div>

      <div className="portal-detail-row">
        <span className="portal-detail-label">Email</span>
        {editing ? (
          <input type="email" value={details.email} onChange={e => setDetails(d => ({ ...d, email: e.target.value }))} className="portal-input" />
        ) : (
          <span className="portal-detail-value">{details.email || "\u2014"}</span>
        )}
      </div>

      <div className="portal-detail-row">
        <span className="portal-detail-label">Mobile</span>
        <span className="portal-detail-value">{humanRecord?.phone || "\u2014"}</span>
      </div>

      {editing && (
        <div className="portal-detail-row">
          <span className="portal-detail-label">WhatsApp</span>
          <button
            className={`portal-toggle ${details.whatsapp ? "portal-toggle--on" : "portal-toggle--off"}`}
            onClick={() => setDetails(d => ({ ...d, whatsapp: !d.whatsapp }))}
          >
            <div className="portal-toggle-knob" style={{ left: details.whatsapp ? "25px" : "3px" }} />
          </button>
        </div>
      )}

      {editing && (
        <div className="portal-detail-row">
          <span className="portal-detail-label">Facebook</span>
          <input value={details.fb} onChange={e => setDetails(d => ({ ...d, fb: e.target.value }))} placeholder="facebook.com/..." className="portal-input" />
        </div>
      )}

      {editing && (
        <div className="portal-detail-row">
          <span className="portal-detail-label">Instagram</span>
          <input value={details.insta} onChange={e => setDetails(d => ({ ...d, insta: e.target.value }))} placeholder="@handle" className="portal-input" />
        </div>
      )}

      {editing && (
        <div className="portal-detail-row">
          <span className="portal-detail-label">TikTok</span>
          <input value={details.tiktok} onChange={e => setDetails(d => ({ ...d, tiktok: e.target.value }))} placeholder="@handle" className="portal-input" />
        </div>
      )}
    </div>
  );
}
