import { useState, useCallback, useRef } from "react";
import { useCustomerDogActions } from "../../supabase/hooks/useCustomerDogActions";
import { useCustomerDogPhoto, useDogPhotoUrl } from "../../supabase/hooks/useCustomerDogPhoto";
import { friendlyDogPhotoError } from "../../lib/dogPhoto";
import { getSizeForBreed } from "../../constants/breeds";
import { cardAnim } from "./dashboardConstants.js";
import { AddDogInline } from "./booking/AddDogInline.tsx";
import { useToast } from "../../contexts/ToastContext.jsx";
import { Camera, PawPrint, Pencil, Plus, X } from "lucide-react";
import { titleCase } from "../../utils/text";
import { Input, Select } from "../ui/index.js";

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

function reportedSize(dog) {
  return dog.reportedSize || dog.reported_size || (!dog.size && getSizeForBreed(dog.breed)) || "";
}

function displaySize(dog) {
  if (dog.size) return dog.size;
  const reported = reportedSize(dog);
  return reported ? `reported ${reported}` : "";
}

const SIZES = [
  { value: "", label: "Not sure" },
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
];

// Date of birth is stored as "YYYY-MM" (month & year only), matching the
// staff Add Dog modal and the Join the Pack signup. Older rows may hold a
// full "YYYY-MM-DD" — slicing the year/month off handles both.
const MONTHS = [
  ["01", "Jan"], ["02", "Feb"], ["03", "Mar"], ["04", "Apr"],
  ["05", "May"], ["06", "Jun"], ["07", "Jul"], ["08", "Aug"],
  ["09", "Sep"], ["10", "Oct"], ["11", "Nov"], ["12", "Dec"],
];
const DOB_YEARS = Array.from({ length: 26 }, (_, i) => String(new Date().getFullYear() - i));
const composeDob = (month, year) => (month && year ? `${year}-${month}` : "");

const AVATAR_PALETTE = ["sky", "buttercup", "mint", "coral"];
function avatarTintFor(id) {
  if (!id) return AVATAR_PALETTE[0];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

/**
 * The dog's picture, and the way to add or change it: tapping it opens the
 * photo picker (the familiar profile-picture convention). Without a photo it
 * shows the dog's initial and a small camera badge. Removing a photo lives in
 * the dog's Edit form, with every other change to the dog.
 */
function DogAvatar({ dog, tint, onPhotoChanged, onError }) {
  const toast = useToast();
  const inputRef = useRef(null);
  const { uploadDogPhoto } = useCustomerDogPhoto();
  const signedUrl = useDogPhotoUrl(dog.photoPath);
  // A photo that will not load (expired link, file gone, offline) shows the
  // initial rather than an empty circle; a new URL gets a fresh try.
  const [brokenUrl, setBrokenUrl] = useState(null);
  const photoUrl = signedUrl && signedUrl !== brokenUrl ? signedUrl : null;
  const [uploading, setUploading] = useState(false);
  const name = titleCase(dog.name) || "your dog";
  const label = dog.photoPath ? `Change ${name}'s photo` : `Add a photo of ${name}`;

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    onError?.(null);
    const { photoPath, error: uploadError } = await uploadDogPhoto(dog.id, file);
    setUploading(false);
    if (uploadError) {
      onError?.(friendlyDogPhotoError(uploadError));
      return;
    }
    // Only the field this action changed: the dog captured when the upload
    // began may be older than an edit saved while it was in flight.
    onPhotoChanged?.({ id: dog.id, photoPath });
    toast.show(`${name}'s photo saved`, "success");
  };

  return (
    <>
      <button
        type="button"
        className={`portal-avatar portal-avatar--lg portal-avatar--${tint} portal-avatar-button`}
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        aria-busy={uploading || undefined}
        aria-label={label}
        title={label}
      >
        {photoUrl ? (
          <img className="portal-avatar-photo" src={photoUrl} alt="" onError={() => setBrokenUrl(photoUrl)} />
        ) : (
          <span aria-hidden="true">{(dog.name || "?").trim().charAt(0).toUpperCase()}</span>
        )}
        {!dog.photoPath && (
          <span className="portal-avatar-badge" aria-hidden="true">
            <Camera size={11} />
          </span>
        )}
        {uploading && <span className="portal-avatar-busy" aria-hidden="true" />}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleFile}
      />
    </>
  );
}

function lastGroomLabel(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function DogRow({ dog, lastGroomDate, onSaved }) {
  const toast = useToast();
  const { updateDog } = useCustomerDogActions();
  const { removeDogPhoto } = useCustomerDogPhoto();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removingPhoto, setRemovingPhoto] = useState(false);
  const [error, setError] = useState(null);
  const [photoError, setPhotoError] = useState(null);

  const handleRemovePhoto = useCallback(async () => {
    setRemovingPhoto(true);
    setError(null);
    const { error: removeError } = await removeDogPhoto(dog.id);
    setRemovingPhoto(false);
    if (removeError) {
      setError("We couldn't remove the photo. Please try again.");
      return;
    }
    onSaved?.({ id: dog.id, photoPath: null });
    toast.show(`${titleCase(dog.name) || "Your dog"}'s photo removed`, "success");
  }, [dog, onSaved, removeDogPhoto, toast]);
  const [form, setForm] = useState({
    name: dog.name || "",
    breed: dog.breed || "",
    size: reportedSize(dog),
    dob: dog.dob || "",
  });

  const reset = useCallback(() => {
    setForm({
      name: dog.name || "",
      breed: dog.breed || "",
      size: reportedSize(dog),
      dob: dog.dob || "",
    });
    setError(null);
    setEditing(false);
  }, [dog]);

  const handleBreedChange = (newBreed) => {
    setForm((f) => {
      const derived = getSizeForBreed(newBreed);
      const shouldDerive = derived && (!f.size || f.size === reportedSize(dog));
      return { ...f, breed: newBreed, size: shouldDerive ? derived : f.size };
    });
  };

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const { dog: updated, error: rpcErr } = await updateDog({
      dogId: dog.id,
      name: form.name,
      breed: form.breed,
      size: form.size,
      dob: form.dob,
    });
    setSaving(false);
    if (rpcErr) {
      setError(errorFromRpc(rpcErr));
      return;
    }
    // `updated` is a partial (the RPC doesn't return is_pregnant), so merge
    // it over the existing dog rather than replacing it.
    if (updated && onSaved) {
      onSaved({ ...dog, ...updated });
    }
    setEditing(false);
    toast.show(`${(form.name || dog.name || "Dog").trim()}'s details saved`, "success");
  }, [dog, form, onSaved, toast, updateDog]);

  if (editing) {
    return (
      <form className="portal-inline-form" onSubmit={handleSubmit} noValidate>
        <Input
          required
          aria-label="Dog name"
          placeholder="Name"
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          surface="paper" size="portal"
        />
        <Input
          aria-label="Breed"
          placeholder="Breed (e.g. Boston Terrier)"
          value={form.breed}
          onChange={e => handleBreedChange(e.target.value)}
          surface="paper" size="portal"
        />
        <div className="portal-inline-form-row">
          <Select
            aria-label="Size"
            value={form.size}
            onChange={e => setForm(f => ({ ...f, size: e.target.value }))}
            surface="paper" size="portal"
          >
            {SIZES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
          <Select
            aria-label="Birth month"
            value={form.dob.slice(5, 7)}
            onChange={e => setForm(f => ({ ...f, dob: composeDob(e.target.value, f.dob.slice(0, 4)) }))}
            surface="paper" size="portal"
          >
            <option value="">Birth month</option>
            {MONTHS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </Select>
          <Select
            aria-label="Birth year"
            value={form.dob.slice(0, 4)}
            onChange={e => setForm(f => ({ ...f, dob: composeDob(f.dob.slice(5, 7), e.target.value) }))}
            surface="paper" size="portal"
          >
            <option value="">Year</option>
            {DOB_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </Select>
        </div>
        {dog.photoPath && (
          <button
            type="button"
            className="portal-btn portal-btn--ghost portal-btn--small portal-btn--align-start"
            onClick={handleRemovePhoto}
            disabled={removingPhoto || saving}
          >
            <X size={12} aria-hidden="true" />
            {removingPhoto ? "Removing photo…" : "Remove photo"}
          </button>
        )}
        {error && <div role="alert" className="portal-inline-error">{error}</div>}
        <div className="portal-inline-form-actions">
          <button type="submit" className="portal-btn portal-btn--primary portal-btn--small" disabled={saving || removingPhoto}>
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

  const sizeLabel = displaySize(dog);
  const sizeBit = sizeLabel ? ` · ${sizeLabel}` : "";
  const lastGroom = lastGroomLabel(lastGroomDate);

  return (
    <>
    <div className="portal-entity-row">
      <DogAvatar dog={dog} tint={avatarTintFor(dog.id)} onPhotoChanged={onSaved} onError={setPhotoError} />
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
    {photoError && <div role="alert" className="portal-inline-error">{photoError}</div>}
    </>
  );
}

export function DogsSection({ dogs, lastGroomByDog = {}, humanId, dataLoaded = true, onDogUpdated, onDogAdded }) {
  const toast = useToast();
  const [addingNew, setAddingNew] = useState(false);

  const handleAdded = (dog) => {
    onDogAdded?.(dog);
    setAddingNew(false);
    toast.show(dog?.name ? `${dog.name} added` : "Dog added", "success");
  };

  const isEmpty = dogs.length === 0;

  return (
    <div className="portal-card" style={cardAnim(0.1)}>
      <div className="portal-card-header">
        <span className="portal-card-iconbadge portal-card-iconbadge--coral">
          <PawPrint size={18} aria-hidden="true" />
        </span>
        <h2 className="portal-card-title">My dogs</h2>
      </div>

      <div className="flex-1">
        {/* Only claim the list is empty once the fetch succeeded — see
            CustomerDashboard's dataLoaded. */}
        {isEmpty && dataLoaded && !addingNew && (
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

      {/* The label is derived from emptiness ("Add a dog" vs "Add another"),
          so it asserts what is on the account just as the copy above does.
          After a failed fetch we do not know, and offering it invites a second
          record for a dog that is already there — so the whole action waits
          for the dog list, with the error banner as the only message. */}
      {!addingNew && dataLoaded && (
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
