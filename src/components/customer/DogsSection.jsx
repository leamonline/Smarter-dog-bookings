import { useState, useCallback } from "react";
import { customerSupabase as supabase } from "../../supabase/customerClient.js";
import { getSizeForBreed } from "../../constants/breeds.js";
import { cardAnim } from "./dashboardConstants.js";
import { AddDogInline } from "./booking/AddDogInline.tsx";
import { useToast } from "../../contexts/ToastContext.jsx";
import { PawPrint, Pencil, Plus, X } from "lucide-react";
import { titleCase } from "../../utils/text.js";

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

function effectiveSize(dog) {
  return dog.size || getSizeForBreed(dog.breed) || "";
}

const SIZES = [
  { value: "", label: "Not sure" },
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
];

const AVATAR_PALETTE = ["sky", "buttercup", "mint", "coral"];
function avatarTintFor(id) {
  if (!id) return AVATAR_PALETTE[0];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

function lastGroomLabel(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function DogRow({ dog, lastGroomDate, onSaved }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({
    name: dog.name || "",
    breed: dog.breed || "",
    size: effectiveSize(dog),
    dob: dog.dob || "",
  });

  const reset = useCallback(() => {
    setForm({
      name: dog.name || "",
      breed: dog.breed || "",
      size: effectiveSize(dog),
      dob: dog.dob || "",
    });
    setError(null);
    setEditing(false);
  }, [dog]);

  const handleBreedChange = (newBreed) => {
    setForm((f) => {
      const derived = getSizeForBreed(newBreed);
      const shouldDerive = derived && (!f.size || f.size === effectiveSize(dog));
      return { ...f, breed: newBreed, size: shouldDerive ? derived : f.size };
    });
  };

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
    toast.show(`${(form.name || dog.name || "Dog").trim()}'s details saved`, "success");
  }, [dog, form, onSaved, toast]);

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
          onChange={e => handleBreedChange(e.target.value)}
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
            {saving ? "Saving…" : "Save"}
          </button>
          <button type="button" className="portal-btn portal-btn--ghost portal-btn--small" onClick={reset}>
            <X size={14} aria-hidden="true" />
            Cancel
          </button>
        </div>
      </form>
    );
  }

  const initial = (dog.name || "?").trim().charAt(0).toUpperCase();
  const tint = avatarTintFor(dog.id);
  const sizeLabel = effectiveSize(dog);
  const sizeBit = sizeLabel ? ` · ${sizeLabel}` : "";
  const lastGroom = lastGroomLabel(lastGroomDate);

  return (
    <div className="portal-entity-row">
      <span className={`portal-avatar portal-avatar--${tint}`} aria-hidden="true">
        {initial}
      </span>
      <div className="portal-entity-row-body">
        <p className="portal-entity-row-name">{titleCase(dog.name)}</p>
        <p className="portal-entity-row-meta">
          {dog.breed ? titleCase(dog.breed) : "Breed not set"}{sizeBit}
        </p>
        {lastGroom && (
          <p className="portal-entity-row-meta">Last groom: {lastGroom}</p>
        )}
      </div>
      <button
        type="button"
        className="portal-btn portal-btn--ghost portal-btn--small"
        onClick={() => setEditing(true)}
        aria-label={`Edit ${dog.name}`}
      >
        <Pencil size={12} aria-hidden="true" />
        Edit
      </button>
    </div>
  );
}

export function DogsSection({ dogs, lastGroomByDog = {}, humanId, onDogUpdated, onDogAdded }) {
  const toast = useToast();
  const [addingNew, setAddingNew] = useState(false);

  const handleAdded = (dog) => {
    onDogAdded?.(dog);
    setAddingNew(false);
    toast.show(dog?.name ? `${dog.name} added` : "Dog added", "success");
  };

  const isEmpty = dogs.length === 0;

  return (
    <div className="portal-card portal-card--coral" style={cardAnim(0.1)}>
      <div className="portal-card-header">
        <span className="portal-card-iconbadge portal-card-iconbadge--coral">
          <PawPrint size={18} aria-hidden="true" />
        </span>
        <h2 className="portal-card-title">My dogs</h2>
      </div>

      <div className="flex-1">
        {isEmpty && !addingNew && (
          <p className="portal-empty-body" style={{ marginTop: 0 }}>
            Add your pup so we can keep their grooming history together.
          </p>
        )}

        {!isEmpty && dogs.map(dog => (
          <DogRow
            key={dog.id}
            dog={dog}
            lastGroomDate={lastGroomByDog[dog.id]}
            onSaved={onDogUpdated}
          />
        ))}

        {addingNew && humanId && (
          <div className="mt-3">
            <AddDogInline
              humanId={humanId}
              onDogAdded={handleAdded}
              onCancel={() => setAddingNew(false)}
            />
          </div>
        )}
      </div>

      {!addingNew && (
        <div className="portal-card-bottom-action">
          <button
            type="button"
            className="portal-btn portal-btn--secondary w-full"
            onClick={() => setAddingNew(true)}
          >
            <Plus size={14} aria-hidden="true" />
            {isEmpty ? "Add a dog" : "Add another dog"}
          </button>
        </div>
      )}
    </div>
  );
}
