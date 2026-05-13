import { useState, useCallback } from "react";
import { customerSupabase as supabase } from "../../supabase/customerClient.js";
import { cardAnim } from "./dashboardConstants.js";
import { PawPrint, AlertTriangle, Camera, MessageCircle, Pencil, X } from "lucide-react";

const ERR_LABEL = {
  not_authenticated: "Please sign in again.",
  no_linked_human: "We couldn't find your account record. Refresh and try again.",
  dog_not_found: "We couldn't find that dog under your account.",
  name_required: "Name is required.",
  invalid_size: "Size must be small, medium or large.",
};

function errorFromRpc(err) {
  if (!err) return null;
  const msg = err?.message || "";
  const key = Object.keys(ERR_LABEL).find(k => msg.includes(k));
  return key ? ERR_LABEL[key] : "Something went wrong. Please try again.";
}

const SIZES = [
  { value: "", label: "Not sure" },
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
];

function DogRow({ dog, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({
    name: dog.name || "",
    breed: dog.breed || "",
    size: dog.size || "",
    dob: dog.dob || "",
  });

  const reset = useCallback(() => {
    setForm({
      name: dog.name || "",
      breed: dog.breed || "",
      size: dog.size || "",
      dob: dog.dob || "",
    });
    setError(null);
    setEditing(false);
  }, [dog]);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (!supabase) return;
    setSaving(true);
    setError(null);
    const { data, error: rpcErr } = await supabase.rpc("update_customer_dog", {
      p_dog_id: dog.id,
      p_name: form.name,
      p_breed: form.breed,
      p_size: form.size,
      p_dob: form.dob,
    });
    setSaving(false);
    if (rpcErr) {
      setError(errorFromRpc(rpcErr));
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (row && onSaved) onSaved({ ...dog, ...row });
    setEditing(false);
  }, [dog, form, onSaved]);

  if (editing) {
    return (
      <form className="portal-inline-form" onSubmit={handleSubmit} noValidate>
        <input
          required
          aria-label="Dog name"
          placeholder="Name"
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          className="portal-input"
        />
        <input
          aria-label="Breed"
          placeholder="Breed (e.g. Boston Terrier)"
          value={form.breed}
          onChange={e => setForm(f => ({ ...f, breed: e.target.value }))}
          className="portal-input"
        />
        <div className="portal-inline-form-row">
          <select
            aria-label="Size"
            value={form.size}
            onChange={e => setForm(f => ({ ...f, size: e.target.value }))}
            className="portal-input"
          >
            {SIZES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <input
            aria-label="Date of birth"
            placeholder="DOB (YYYY-MM-DD)"
            value={form.dob}
            onChange={e => setForm(f => ({ ...f, dob: e.target.value }))}
            className="portal-input"
          />
        </div>
        {error && <div role="alert" className="portal-inline-error">{error}</div>}
        <div className="portal-inline-form-actions">
          <button type="submit" className="portal-btn portal-btn--primary portal-btn--small" disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>
          <button type="button" className="portal-btn portal-btn--ghost portal-btn--small" onClick={reset}>
            <X size={14} aria-hidden="true" />
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex justify-between items-center py-3 border-b border-[rgba(45,0,75,0.07)] last:border-b-0 gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-bold text-brand-purple font-display">{dog.name}</div>
        <div className="text-[13px] font-medium text-slate-500 mt-0.5">
          {dog.breed || "Breed not set"}{dog.size ? ` · ${dog.size}` : ""}
        </div>
        {dog.groom_notes && (
          <div className="text-xs text-brand-purple bg-white/70 py-1 px-2.5 rounded-md mt-1.5 font-medium">
            {dog.groom_notes}
          </div>
        )}
      </div>
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        <button
          type="button"
          className="portal-btn portal-btn--secondary portal-btn--small"
          onClick={() => setEditing(true)}
        >
          <Pencil size={12} aria-hidden="true" />
          Edit
        </button>
        {dog.alerts && dog.alerts.length > 0 && (
          <span className="flex items-center gap-1 text-[11px] font-bold text-brand-coral">
            <AlertTriangle size={12} aria-hidden="true" />
            {dog.alerts.length} alert{dog.alerts.length > 1 ? "s" : ""}
          </span>
        )}
      </div>
    </div>
  );
}

export function DogsSection({ dogs, onDogUpdated }) {
  return (
    <div className="portal-card portal-card--coral" style={cardAnim(0.1)}>
      <div className="portal-card-header">
        <span className="portal-card-iconbadge portal-card-iconbadge--coral">
          <PawPrint size={18} aria-hidden="true" />
        </span>
        <h2 className="portal-card-title">My dogs</h2>
      </div>

      {dogs.length === 0 ? (
        <div className="portal-polaroid">
          <div className="portal-polaroid-frame" aria-hidden="true">
            <div className="portal-polaroid-photo">
              <Camera size={42} strokeWidth={1.5} />
            </div>
            <span className="portal-polaroid-caption">Add your first pup</span>
          </div>
          <p className="portal-empty-title">No dogs on file just yet</p>
          <p className="portal-empty-body">
            We&apos;ll add your dogs once you&apos;ve been in &mdash; or message the salon to add them now.
          </p>
          <a
            href="https://wa.me/447507731487"
            target="_blank"
            rel="noopener noreferrer"
            className="portal-btn portal-btn--whatsapp"
          >
            <MessageCircle size={16} aria-hidden="true" />
            Message the salon
          </a>
        </div>
      ) : (
        dogs.map(dog => (
          <DogRow key={dog.id} dog={dog} onSaved={onDogUpdated} />
        ))
      )}
    </div>
  );
}
