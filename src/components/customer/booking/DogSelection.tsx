import { useState } from "react";
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
    if (!dog.size) return;
    const already = isSelected(dog.id);
    if (!already && selectedDogs.length >= 4) return;
    onSelect({ dogId: dog.id, name: dog.name, size: dog.size });
  };

  const handleDogAdded = (dog: RawDog) => {
    onDogAdded(dog);
    setShowAddDog(false);
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-slate-500 text-sm">
        Select up to 4 dogs to book for this visit.
      </p>

      {loading && (
        <p className="text-slate-500 text-sm">Loading your dogs\u2026</p>
      )}

      {!loading && dogs.length === 0 && !showAddDog && (
        <p className="text-slate-500 text-sm">
          No dogs on your account yet. Add one below.
        </p>
      )}

      <div className="flex flex-col gap-2.5">
        {dogs.map((dog) => {
          const selected = isSelected(dog.id);
          const disabled = !dog.size || (!selected && selectedDogs.length >= 4);
          return (
            <button
              key={dog.id}
              onClick={() => !disabled && toggleDog(dog)}
              className={`flex items-center justify-between py-3 px-4 rounded-[10px] border-2 text-left w-full ${
                selected
                  ? "border-brand-purple bg-purple-50"
                  : "border-slate-200 bg-white"
              } ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
            >
              <div>
                <div className="font-semibold text-slate-800 text-[15px]">{dog.name}</div>
                <div className="text-slate-600 text-[13px]">
                  {dog.breed || "Unknown breed"} · {dog.size ? dog.size.charAt(0).toUpperCase() + dog.size.slice(1) : "Size not set"}
                </div>
                {!dog.size && (
                  <div className="text-brand-coral text-xs mt-0.5">
                    Size not confirmed — contact the salon
                  </div>
                )}
              </div>
              {selected && (
                <span className="text-brand-purple text-xl font-bold">{"\u2713"}</span>
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
          className="py-2.5 px-4 rounded-lg border-2 border-dashed border-slate-200 bg-transparent text-brand-purple font-semibold text-sm cursor-pointer"
        >
          + Add a new dog
        </button>
      )}

      <button
        onClick={onNext}
        disabled={selectedDogs.length === 0}
        className={`mt-2 py-3 px-6 rounded-lg border-none font-bold text-[15px] ${
          selectedDogs.length === 0
            ? "bg-slate-200 text-slate-500 cursor-not-allowed"
            : "bg-brand-purple text-white cursor-pointer"
        }`}
      >
        Next {"\u2192"}
      </button>
    </div>
  );
}
