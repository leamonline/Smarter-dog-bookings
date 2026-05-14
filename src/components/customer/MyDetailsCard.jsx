import { cardAnim } from "./dashboardConstants.js";
import { User } from "lucide-react";

function DetailRow({ label, value, editing, editor, addPrompt, onAdd }) {
  return (
    <div className="portal-detail-row">
      <span className="portal-detail-label">{label}</span>
      {editing ? (
        <div className="flex-1 ml-3">{editor}</div>
      ) : value ? (
        <span className="portal-detail-value">{value}</span>
      ) : (
        <span className="portal-detail-value">
          <button type="button" className="portal-add-prompt" onClick={onAdd}>
            {addPrompt}
          </button>
        </span>
      )}
    </div>
  );
}

export function MyDetailsCard({ editing, setEditing, saving, details, setDetails, humanRecord, onSave, onCancel }) {
  const fullName = `${details.name} ${details.surname}`.trim();
  const startEdit = () => setEditing(true);

  return (
    <div className="portal-card portal-card--sky" style={cardAnim(0.05)}>
      <div className="portal-card-header">
        <span className="portal-card-iconbadge portal-card-iconbadge--sky">
          <User size={18} aria-hidden="true" />
        </span>
        <h2 className="portal-card-title">My details</h2>
        <div className="portal-card-action">
          {!editing ? (
            <button className="portal-btn portal-btn--secondary portal-btn--small" onClick={startEdit}>
              Edit
            </button>
          ) : (
            <div className="flex gap-1.5">
              <button className="portal-btn portal-btn--primary portal-btn--small" onClick={onSave} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </button>
              <button className="portal-btn portal-btn--secondary portal-btn--small" onClick={onCancel}>
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      <DetailRow
        label="Name"
        value={fullName}
        editing={editing}
        editor={
          <div className="flex gap-2">
            <input
              value={details.name}
              onChange={e => setDetails(d => ({ ...d, name: e.target.value }))}
              placeholder="First name"
              className="portal-input"
            />
            <input
              value={details.surname}
              onChange={e => setDetails(d => ({ ...d, surname: e.target.value }))}
              placeholder="Surname"
              className="portal-input"
            />
          </div>
        }
        addPrompt="Add your name"
        onAdd={startEdit}
      />

      <DetailRow
        label="Address"
        value={details.address}
        editing={editing}
        editor={
          <input
            value={details.address}
            onChange={e => setDetails(d => ({ ...d, address: e.target.value }))}
            placeholder="Street, city, postcode"
            className="portal-input"
          />
        }
        addPrompt="Add address"
        onAdd={startEdit}
      />

      <DetailRow
        label="Email"
        value={details.email}
        editing={editing}
        editor={
          <input
            type="email"
            value={details.email}
            onChange={e => setDetails(d => ({ ...d, email: e.target.value }))}
            placeholder="you@example.com"
            className="portal-input"
          />
        }
        addPrompt="Add email"
        onAdd={startEdit}
      />

      <DetailRow label="Mobile" value={humanRecord?.phone || ""} editing={false} />

      {editing && (
        <div className="portal-detail-row">
          <span className="portal-detail-label">WhatsApp</span>
          <button
            type="button"
            aria-pressed={details.whatsapp}
            aria-label="Toggle WhatsApp"
            className={`relative w-12 h-[26px] rounded-full border-none cursor-pointer transition-colors ${details.whatsapp ? "bg-emerald-500" : "bg-slate-300"}`}
            onClick={() => setDetails(d => ({ ...d, whatsapp: !d.whatsapp }))}
          >
            <div className={`absolute top-[3px] w-5 h-5 rounded-full bg-white shadow-sm transition-[left] ${details.whatsapp ? "left-[25px]" : "left-[3px]"}`} />
          </button>
        </div>
      )}

      {editing && (
        <>
          <div className="portal-detail-row">
            <span className="portal-detail-label">Facebook</span>
            <input value={details.fb} onChange={e => setDetails(d => ({ ...d, fb: e.target.value }))} placeholder="facebook.com/..."
              className="portal-input flex-1 ml-3 text-right" />
          </div>
          <div className="portal-detail-row">
            <span className="portal-detail-label">Instagram</span>
            <input value={details.insta} onChange={e => setDetails(d => ({ ...d, insta: e.target.value }))} placeholder="@handle"
              className="portal-input flex-1 ml-3 text-right" />
          </div>
          <div className="portal-detail-row">
            <span className="portal-detail-label">TikTok</span>
            <input value={details.tiktok} onChange={e => setDetails(d => ({ ...d, tiktok: e.target.value }))} placeholder="@handle"
              className="portal-input flex-1 ml-3 text-right" />
          </div>
        </>
      )}
    </div>
  );
}
