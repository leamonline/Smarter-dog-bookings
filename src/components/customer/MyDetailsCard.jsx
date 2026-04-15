import { cardAnim } from "./dashboardConstants.js";
import { User } from "lucide-react";

export function MyDetailsCard({ editing, setEditing, saving, details, setDetails, humanRecord, onSave, onCancel }) {
  return (
    <div className="portal-card" style={cardAnim(0.05)}>
      <div className="portal-card-header">
        <User size={18} className="portal-card-icon" aria-hidden="true" />
        <h2 className="portal-card-title">My Details</h2>
        {!editing ? (
          <button className="portal-btn portal-btn--secondary portal-btn--small" onClick={() => setEditing(true)}>
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

      {editing ? (
        <div className="flex gap-2.5 py-2.5 border-b border-slate-100">
          <div className="flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 font-[Sora] mb-1">First Name</div>
            <input
              value={details.name}
              onChange={e => setDetails(d => ({ ...d, name: e.target.value }))}
              className="w-full py-2 px-3 rounded-lg border-2 border-slate-200 text-sm font-semibold text-brand-purple bg-white outline-none transition-colors focus:border-brand-purple font-[inherit] box-border"
            />
          </div>
          <div className="flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 font-[Sora] mb-1">Surname</div>
            <input
              value={details.surname}
              onChange={e => setDetails(d => ({ ...d, surname: e.target.value }))}
              className="w-full py-2 px-3 rounded-lg border-2 border-slate-200 text-sm font-semibold text-brand-purple bg-white outline-none transition-colors focus:border-brand-purple font-[inherit] box-border"
            />
          </div>
        </div>
      ) : (
        <div className="flex justify-between items-center py-2.5 border-b border-slate-100">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 font-[Sora] min-w-[80px]">Name</span>
          <span className="text-sm font-semibold text-brand-purple text-right flex-1 ml-3 overflow-wrap-anywhere">{`${details.name} ${details.surname}`.trim() || "\u2014"}</span>
        </div>
      )}

      <div className="flex justify-between items-center py-2.5 border-b border-slate-100">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 font-[Sora] min-w-[80px]">Address</span>
        {editing ? (
          <input value={details.address} onChange={e => setDetails(d => ({ ...d, address: e.target.value }))}
            className="flex-1 ml-3 py-2 px-3 rounded-lg border-2 border-slate-200 text-sm font-semibold text-brand-purple bg-white outline-none transition-colors focus:border-brand-purple text-right font-[inherit] box-border" />
        ) : (
          <span className="text-sm font-semibold text-brand-purple text-right flex-1 ml-3 overflow-wrap-anywhere">{details.address || "\u2014"}</span>
        )}
      </div>

      <div className="flex justify-between items-center py-2.5 border-b border-slate-100">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 font-[Sora] min-w-[80px]">Email</span>
        {editing ? (
          <input type="email" value={details.email} onChange={e => setDetails(d => ({ ...d, email: e.target.value }))}
            className="flex-1 ml-3 py-2 px-3 rounded-lg border-2 border-slate-200 text-sm font-semibold text-brand-purple bg-white outline-none transition-colors focus:border-brand-purple text-right font-[inherit] box-border" />
        ) : (
          <span className="text-sm font-semibold text-brand-purple text-right flex-1 ml-3 overflow-wrap-anywhere">{details.email || "\u2014"}</span>
        )}
      </div>

      <div className="flex justify-between items-center py-2.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 font-[Sora] min-w-[80px]">Mobile</span>
        <span className="text-sm font-semibold text-brand-purple text-right flex-1 ml-3">{humanRecord?.phone || "\u2014"}</span>
      </div>

      {editing && (
        <div className="flex justify-between items-center py-2.5 border-t border-slate-100">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 font-[Sora]">WhatsApp</span>
          <button
            className={`relative w-12 h-[26px] rounded-full border-none cursor-pointer transition-colors ${details.whatsapp ? "bg-brand-green" : "bg-slate-300"}`}
            onClick={() => setDetails(d => ({ ...d, whatsapp: !d.whatsapp }))}
          >
            <div className={`absolute top-[3px] w-5 h-5 rounded-full bg-white shadow-sm transition-[left] ${details.whatsapp ? "left-[25px]" : "left-[3px]"}`} />
          </button>
        </div>
      )}

      {editing && (
        <div className="flex justify-between items-center py-2.5 border-t border-slate-100">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 font-[Sora]">Facebook</span>
          <input value={details.fb} onChange={e => setDetails(d => ({ ...d, fb: e.target.value }))} placeholder="facebook.com/..."
            className="flex-1 ml-3 py-2 px-3 rounded-lg border-2 border-slate-200 text-sm font-semibold text-brand-purple bg-white outline-none transition-colors focus:border-brand-purple text-right font-[inherit] box-border" />
        </div>
      )}

      {editing && (
        <div className="flex justify-between items-center py-2.5 border-t border-slate-100">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 font-[Sora]">Instagram</span>
          <input value={details.insta} onChange={e => setDetails(d => ({ ...d, insta: e.target.value }))} placeholder="@handle"
            className="flex-1 ml-3 py-2 px-3 rounded-lg border-2 border-slate-200 text-sm font-semibold text-brand-purple bg-white outline-none transition-colors focus:border-brand-purple text-right font-[inherit] box-border" />
        </div>
      )}

      {editing && (
        <div className="flex justify-between items-center py-2.5 border-t border-slate-100">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 font-[Sora]">TikTok</span>
          <input value={details.tiktok} onChange={e => setDetails(d => ({ ...d, tiktok: e.target.value }))} placeholder="@handle"
            className="flex-1 ml-3 py-2 px-3 rounded-lg border-2 border-slate-200 text-sm font-semibold text-brand-purple bg-white outline-none transition-colors focus:border-brand-purple text-right font-[inherit] box-border" />
        </div>
      )}
    </div>
  );
}
