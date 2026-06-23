import { useState } from "react";
import { customerSupabase as supabase } from "../../../supabase/customerClient.js";
import { getSizeForBreed } from "../../../constants/breeds";
import { BreedCombobox } from "../../shared/BreedCombobox.jsx";
import type { DogSize } from "../../../types/index";

interface AddDogInlineProps {
  humanId: string;
  onDogAdded: (dog: { id: string; name: string; breed: string; size: DogSize | null; isPregnant: boolean }) => void;
  onCancel: () => void;
}

export function AddDogInline({ humanId, onDogAdded, onCancel }: AddDogInlineProps) {
  const [name, setName] = useState("");
  const [breed, setBreed] = useState("");
  const [size, setSize] = useState<DogSize | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleBreedChange = (next: string) => {
    setBreed(next);
    const detected = getSizeForBreed(next);
    setSize(detected ? (detected as DogSize) : null);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      if (!supabase) throw new Error("Not connected");

      const finalBreed = breed.trim();
      const dogSize = size || getSizeForBreed(finalBreed) as DogSize || null;

      const { data, error: err } = await supabase
        .from("dogs")
        .insert({
          name: name.trim(),
          breed: finalBreed || null,
          size: dogSize,
          human_id: humanId,
        })
        .select()
        .single();

      if (err) throw err;

      onDogAdded({
        id: data.id,
        name: data.name,
        breed: data.breed || "",
        size: data.size || null,
        isPregnant: false,
      });
    } catch (e: any) {
      setError(e.message || "Could not save dog");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="wizard-card flex flex-col gap-3">
      <div className="font-['Quicksand',sans-serif] font-bold text-[15px] text-[var(--sd-navy)]">
        Add a new pup
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="add-dog-name" className="text-[13px] text-[var(--sd-navy)] font-semibold">Name *</label>
        <input
          id="add-dog-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Biscuit"
          className="portal-input portal-input--sm"
        />
      </div>

      <div className="flex flex-col gap-1">
        <span id="add-dog-breed-label" className="text-[13px] text-[var(--sd-navy)] font-semibold">Breed</span>
        <BreedCombobox
          value={breed}
          onChange={handleBreedChange}
          ariaLabelledBy="add-dog-breed-label"
          placeholder="Select or search breed"
          inputClassName="portal-input portal-input--sm"
          inputStyle={{}}
        />
        {breed && getSizeForBreed(breed) && (
          <span className="text-xs text-[var(--sd-cyan-dark)]">
            Size auto-set: {getSizeForBreed(breed)}
          </span>
        )}
      </div>

      {error && (
        <div role="alert" className="portal-alert portal-alert--error">{error}</div>
      )}

      <div className="wizard-actions">
        <button
          type="button"
          onClick={onCancel}
          className="wizard-btn wizard-btn--back"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className="wizard-btn wizard-btn--primary"
        >
          {saving ? "Saving…" : "Save pup"}
        </button>
      </div>
    </div>
  );
}
