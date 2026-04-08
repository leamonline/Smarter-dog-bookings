import { useState } from "react";
import { customerSupabase as supabase } from "../../../supabase/customerClient.js";
import { getSizeForBreed } from "../../../constants/breeds.js";
import type { DogSize } from "../../../types/index.js";

interface AddDogInlineProps {
  humanId: string;
  onDogAdded: (dog: { id: string; name: string; breed: string; size: DogSize | null }) => void;
  onCancel: () => void;
}

export function AddDogInline({ humanId, onDogAdded, onCancel }: AddDogInlineProps) {
  const [name, setName] = useState("");
  const [breed, setBreed] = useState("");
  const [size, setSize] = useState<DogSize | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleBreedChange = (value: string) => {
    setBreed(value);
    const detected = getSizeForBreed(value);
    if (detected) setSize(detected as DogSize);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      if (!supabase) throw new Error("Not connected");

      const dogSize = size || getSizeForBreed(breed) as DogSize || null;

      const { data, error: err } = await supabase
        .from("dogs")
        .insert({
          name: name.trim(),
          breed: breed.trim() || null,
          size: dogSize,
          human_id: humanId,
        })
        .select()
        .single();

      if (err) {
        if (err.message?.includes("row-level security")) {
          const { data: rpcData, error: rpcErr } = await supabase.rpc("demo_add_dog", {
            p_name: name.trim(),
            p_breed: breed.trim() || "",
            p_size: dogSize || "medium",
            p_human_id: humanId,
          });
          if (rpcErr) throw rpcErr;
          const d = rpcData as any;
          onDogAdded({ id: d.id, name: d.name, breed: d.breed || "", size: d.size || null });
          return;
        }
        throw err;
      }

      onDogAdded({
        id: data.id,
        name: data.name,
        breed: data.breed || "",
        size: data.size || null,
      });
    } catch (e: any) {
      setError(e.message || "Could not save dog");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border-2 border-brand-teal rounded-[10px] p-4 bg-emerald-50 flex flex-col gap-3">
      <div className="font-semibold text-brand-teal text-sm">Add a new dog</div>

      <div className="flex flex-col gap-1">
        <label className="text-[13px] text-slate-800 font-semibold">Name *</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Biscuit"
          className="py-2 px-3 rounded-md border border-slate-200 text-sm bg-white text-slate-800"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[13px] text-slate-800 font-semibold">Breed</label>
        <input
          type="text"
          value={breed}
          onChange={(e) => handleBreedChange(e.target.value)}
          placeholder="e.g. Cockapoo"
          className="py-2 px-3 rounded-md border border-slate-200 text-sm bg-white text-slate-800"
        />
        {breed && getSizeForBreed(breed) && (
          <span className="text-xs text-brand-teal">
            Auto-detected size: {getSizeForBreed(breed)}
          </span>
        )}
      </div>

      {!getSizeForBreed(breed) && breed.trim() && (
        <div className="text-xs text-slate-500">
          We'll confirm {name.trim() || "your dog"}'s size when you visit — just enter the breed and we'll sort it.
        </div>
      )}

      {error && (
        <div className="text-brand-coral text-[13px]">{error}</div>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className={`flex-1 py-2.5 px-4 rounded-lg border-none font-bold text-sm ${
            !name.trim()
              ? "bg-slate-200 text-slate-500 cursor-not-allowed"
              : "bg-brand-teal text-white cursor-pointer"
          }`}
        >
          {saving ? "Saving\u2026" : "Save dog"}
        </button>
        <button
          onClick={onCancel}
          className="py-2.5 px-4 rounded-lg border border-slate-200 bg-white text-slate-500 font-semibold text-sm cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
