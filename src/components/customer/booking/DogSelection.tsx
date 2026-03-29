import { useState } from "react";
import { BRAND } from "../../../constants/index.js";
import type { WizardDog, DogSize } from "../../../types/index.js";
import { AddDogInline } from "./AddDogInline.js";

interface RawDog {
  id: string;
  name: string;
  breed: string;
  size: DogSize | null;
}

interface DogSelectionProps {
  dogs: RawDog[];
  selectedDogs: WizardDog[];
  onSelect: (dog: WizardDog) => void;
  onNext: () => void;
  onDogAdded: (dog: RawDog) => void;
  humanId: string;
  loading: boolean;
}

export function DogSelection({
  dogs,
  selectedDogs,
  onSelect,
  onNext,
  onDogAdded,
  humanId,
  loading,
}: DogSelectionProps) {
  const [showAddDog, setShowAddDog] = useState(false);

  const isSelected = (dogId: string) => selectedDogs.some((d) => d.dogId === dogId);

  const toggleDog = (dog: RawDog) => {
    if (!dog.size) return; // can't book unsized dogs
    const already = isSelected(dog.id);
    if (!already && selectedDogs.length >= 4) return;
    onSelect({ dogId: dog.id, name: dog.name, size: dog.size });
  };

  const handleDogAdded = (dog: RawDog) => {
    onDogAdded(dog);
    setShowAddDog(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <p style={{ margin: 0, color: BRAND.textLight, fontSize: 14 }}>
        Select up to 4 dogs to book for this visit.
      </p>

      {loading && (
        <p style={{ color: BRAND.textLight, fontSize: 14 }}>Loading your dogs…</p>
      )}

      {!loading && dogs.length === 0 && !showAddDog && (
        <p style={{ color: BRAND.textLight, fontSize: 14 }}>
          No dogs on your account yet. Add one below.
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {dogs.map((dog) => {
          const selected = isSelected(dog.id);
          const disabled = !dog.size || (!selected && selectedDogs.length >= 4);
          return (
            <button
              key={dog.id}
              onClick={() => !disabled && toggleDog(dog)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 16px",
                borderRadius: 10,
                border: selected ? `2px solid ${BRAND.teal}` : `2px solid ${BRAND.greyLight}`,
                background: selected ? BRAND.tealLight : BRAND.white,
                cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.5 : 1,
                textAlign: "left",
                width: "100%",
              }}
            >
              <div>
                <div style={{ fontWeight: 600, color: BRAND.text, fontSize: 15 }}>{dog.name}</div>
                <div style={{ color: BRAND.textLight, fontSize: 13 }}>
                  {dog.breed || "Unknown breed"} · {dog.size ? dog.size.charAt(0).toUpperCase() + dog.size.slice(1) : "Size not set"}
                </div>
                {!dog.size && (
                  <div style={{ color: BRAND.coral, fontSize: 12, marginTop: 2 }}>
                    Size not confirmed — contact the salon
                  </div>
                )}
              </div>
              {selected && (
                <span style={{ color: BRAND.teal, fontSize: 20, fontWeight: 700 }}>✓</span>
              )}
            </button>
          );
        })}
      </div>

      {showAddDog ? (
        <AddDogInline
          humanId={humanId}
          onDogAdded={handleDogAdded}
          onCancel={() => setShowAddDog(false)}
        />
      ) : (
        <button
          onClick={() => setShowAddDog(true)}
          style={{
            padding: "10px 16px",
            borderRadius: 8,
            border: `2px dashed ${BRAND.greyLight}`,
            background: "transparent",
            color: BRAND.teal,
            fontWeight: 600,
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          + Add a new dog
        </button>
      )}

      <button
        onClick={onNext}
        disabled={selectedDogs.length === 0}
        style={{
          marginTop: 8,
          padding: "12px 24px",
          borderRadius: 8,
          border: "none",
          background: selectedDogs.length === 0 ? BRAND.greyLight : BRAND.teal,
          color: selectedDogs.length === 0 ? BRAND.grey : BRAND.white,
          fontWeight: 700,
          fontSize: 15,
          cursor: selectedDogs.length === 0 ? "not-allowed" : "pointer",
        }}
      >
        Next →
      </button>
    </div>
  );
}
