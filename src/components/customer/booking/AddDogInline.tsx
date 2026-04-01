import { useState } from "react";
import { customerSupabase as supabase } from "../../../supabase/customerClient.js";
import { BRAND } from "../../../constants/index.js";
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

      // Try direct insert first (works for authenticated customers)
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
        // RLS failure (e.g. demo mode) — fall back to RPC
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
    <div
      style={{
        border: `2px solid ${BRAND.teal}`,
        borderRadius: 10,
        padding: 16,
        background: BRAND.tealLight,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ fontWeight: 600, color: BRAND.teal, fontSize: 14 }}>Add a new dog</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <label style={{ fontSize: 13, color: BRAND.text, fontWeight: 600 }}>Name *</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Biscuit"
          style={{
            padding: "8px 12px",
            borderRadius: 6,
            border: `1px solid ${BRAND.greyLight}`,
            fontSize: 14,
            background: BRAND.white,
            color: BRAND.text,
          }}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <label style={{ fontSize: 13, color: BRAND.text, fontWeight: 600 }}>Breed</label>
        <input
          type="text"
          value={breed}
          onChange={(e) => handleBreedChange(e.target.value)}
          placeholder="e.g. Cockapoo"
          style={{
            padding: "8px 12px",
            borderRadius: 6,
            border: `1px solid ${BRAND.greyLight}`,
            fontSize: 14,
            background: BRAND.white,
            color: BRAND.text,
          }}
        />
        {breed && getSizeForBreed(breed) && (
          <span style={{ fontSize: 12, color: BRAND.teal }}>
            Auto-detected size: {getSizeForBreed(breed)}
          </span>
        )}
      </div>

      {/* Size is auto-detected from breed — no manual selector for customers */}
      {!getSizeForBreed(breed) && breed.trim() && (
        <div style={{ fontSize: 12, color: BRAND.textLight }}>
          We'll confirm {name.trim() || "your dog"}'s size when you visit — just enter the breed and we'll sort it.
        </div>
      )}

      {error && (
        <div style={{ color: BRAND.coral, fontSize: 13 }}>{error}</div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          style={{
            flex: 1,
            padding: "10px 16px",
            borderRadius: 8,
            border: "none",
            background: !name.trim() ? BRAND.greyLight : BRAND.teal,
            color: !name.trim() ? BRAND.grey : BRAND.white,
            fontWeight: 700,
            fontSize: 14,
            cursor: saving || !name.trim() ? "not-allowed" : "pointer",
          }}
        >
          {saving ? "Saving…" : "Save dog"}
        </button>
        <button
          onClick={onCancel}
          style={{
            padding: "10px 16px",
            borderRadius: 8,
            border: `1px solid ${BRAND.greyLight}`,
            background: BRAND.white,
            color: BRAND.grey,
            fontWeight: 600,
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
