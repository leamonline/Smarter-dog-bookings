import { cardAnim } from "./dashboardConstants.js";
import { User, Plus, Pencil, X } from "lucide-react";
import { formatPhoneForDisplay } from "../../utils/phone.js";

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
          <button type="button" className="portal-ghost-add" onClick={onAdd}>
            <Plus size={12} aria-hidden="true" />
            {addPrompt}
          </button>
        </span>
      )}
    </div>
  );
}

export function MyDetailsCard({ editing, setEditing, saving, saveError, details, setDetails, humanRecord, onSave, onCancel }) {
  const fullName = `${details.name} ${details.surname}`.trim();
  const startEdit = () => setEditing(true);

  return (
    <div className={`portal-card portal-card--sky${editing ? " portal-card--static" : ""}`} style={cardAnim(0.05)}>
      <div className="portal-card-header">
        <span className="portal-card-iconbadge portal-card-iconbadge--sky">
          <User size={18} aria-hidden="true" />
        </span>
        <h2 className="portal-card-title">My details</h2>
      </div>

      <div className="flex-1">
        <DetailRow
          label="Name"
          value={fullName}
          editing={editing}
          editor={
            <div className="flex gap-2">
              <input
                aria-label="First name"
                autoComplete="given-name"
                value={details.name}
                onChange={e => setDetails(d => ({ ...d, name: e.target.value }))}
                placeholder="First name"
                className="portal-input"
              />
              <input
                aria-label="Surname"
                autoComplete="family-name"
                value={details.surname}
                onChange={e => setDetails(d => ({ ...d, surname: e.target.value }))}
                placeholder="Surname"
                className="portal-input"
              />
            </div>
          }
          addPrompt="Add name"
          onAdd={startEdit}
        />

        <DetailRow
          label="Address"
          value={details.address}
          editing={editing}
          editor={
            <input
              aria-label="Address"
              autoComplete="street-address"
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
              aria-label="Email address"
              autoComplete="email"
              value={details.email}
              onChange={e => setDetails(d => ({ ...d, email: e.target.value }))}
              placeholder="you@example.com"
              className="portal-input"
            />
          }
          addPrompt="Add email"
          onAdd={startEdit}
        />

        <DetailRow
          label="Mobile"
          value={formatPhoneForDisplay(humanRecord?.phone) || ""}
          editing={false}
        />

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
              <input aria-label="Facebook profile URL" value={details.fb} onChange={e => setDetails(d => ({ ...d, fb: e.target.value }))} placeholder="facebook.com/..."
                className="portal-input flex-1 ml-3 text-right" />
            </div>
            <div className="portal-detail-row">
              <span className="portal-detail-label">Instagram</span>
              <input aria-label="Instagram handle" value={details.insta} onChange={e => setDetails(d => ({ ...d, insta: e.target.value }))} placeholder="@handle"
                className="portal-input flex-1 ml-3 text-right" />
            </div>
            <div className="portal-detail-row">
              <span className="portal-detail-label">TikTok</span>
              <input aria-label="TikTok handle" value={details.tiktok} onChange={e => setDetails(d => ({ ...d, tiktok: e.target.value }))} placeholder="@handle"
                className="portal-input flex-1 ml-3 text-right" />
            </div>
          </>
        )}
      </div>

      {editing && saveError && (
        <div role="alert" className="portal-alert portal-alert--error mb-3 text-[13px]">
          {saveError}
        </div>
      )}

      <div className="portal-card-bottom-action">
        {!editing ? (
          <button
            type="button"
            className="portal-btn portal-btn--secondary w-full"
            onClick={startEdit}
          >
            <Pencil size={14} aria-hidden="true" />
            Edit details
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              className="portal-btn portal-btn--primary flex-1"
              onClick={onSave}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              className="portal-btn portal-btn--ghost portal-btn--small"
              onClick={onCancel}
            >
              <X size={14} aria-hidden="true" />
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
