import { useState } from "react";
import type { WizardDog } from "../../../types/index";
import type { CustomerDog } from "../../../supabase/repositories/dogsRepo";
import { DOG_SIZES } from "../../../constants/index";
import { AddDogInline } from "./AddDogInline";
import { PawPrint, ArrowRight } from "lucide-react";
import { WizardTick } from "./WizardTick";
import { titleCase } from "../../../utils/text";

interface DogSelectionProps {
  dogs: CustomerDog[];
  selectedDogs: WizardDog[];
  onSelect: (dog: WizardDog) => void;
  onNext: () => void;
  onDogAdded: (dog: CustomerDog) => void;
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

  const toggleDog = (dog: CustomerDog) => {
    if (!dog.size) return;
    if (dog.isPregnant) return;
    const already = isSelected(dog.id);
    if (!already && selectedDogs.length >= 4) return;
    onSelect({ dogId: dog.id, name: dog.name, size: dog.size });
  };

  const handleDogAdded = (dog: CustomerDog) => {
    onDogAdded(dog);
    setShowAddDog(false);
  };

  if (loading) {
    return (
      <div className="wizard-card" aria-busy="true" aria-live="polite">
        <div className="flex flex-col gap-2">
          <div className="skeleton-row" />
          <div className="skeleton-row" />
          <div className="skeleton-row" />
        </div>
        <span className="sr-only">Loading your dogs…</span>
      </div>
    );
  }

  return (
    <>
      <p className="wizard-helper">
        Select up to 4 pups to book for this visit.
      </p>

      <div className="wizard-card">
        <div className="flex flex-col gap-2">
          {dogs.map((dog) => {
            const selected = isSelected(dog.id);
            const sizeKnown = (DOG_SIZES as readonly string[]).includes(dog.size as string);
            const disabled = !sizeKnown || dog.isPregnant || (!selected && selectedDogs.length >= 4);
            const sizeLabel = sizeKnown ? `${dog.size!.charAt(0).toUpperCase()}${dog.size!.slice(1)}` : null;
            return (
              <button
                key={dog.id}
                type="button"
                aria-pressed={selected}
                disabled={disabled}
                onClick={() => toggleDog(dog)}
                className="wizard-option"
              >
                <div className="flex flex-col items-start gap-0.5 min-w-0">
                  <span className="font-['Quicksand',sans-serif] text-[15px] font-bold">{titleCase(dog.name)}</span>
                  <span className="text-[12px] font-medium text-[var(--sd-ink-light)]">
                    {dog.breed ? titleCase(dog.breed) : "Breed not set"}
                    {sizeLabel ? ` · ${sizeLabel}` : ""}
                  </span>
                  {!sizeKnown && (
                    <span className="text-[12px] font-semibold text-[var(--sd-coral)]">
                      Size not confirmed — message us first
                    </span>
                  )}
                  {dog.isPregnant && (
                    <span className="text-[12px] font-semibold text-[var(--sd-coral)]">
                      Can't book online while pregnant — please call us
                    </span>
                  )}
                </div>
                <WizardTick selected={selected} />
              </button>
            );
          })}

          {!showAddDog && (
            <button
              type="button"
              className="wizard-option wizard-option--add"
              onClick={() => setShowAddDog(true)}
            >
              <PawPrint size={16} aria-hidden="true" />
              Add another pup
            </button>
          )}
        </div>

        {selectedDogs.length >= 4 && (
          <div className="mt-3 text-[12px] text-[var(--sd-ink-light)] text-center">
            Four pups per booking max. Need more? Message us on WhatsApp.
          </div>
        )}
      </div>

      {showAddDog && (
        <AddDogInline
          humanId={humanId}
          onDogAdded={handleDogAdded}
          onCancel={() => setShowAddDog(false)}
        />
      )}

      <div className="wizard-actions">
        <button
          type="button"
          className="wizard-btn wizard-btn--primary"
          onClick={onNext}
          disabled={selectedDogs.length === 0}
        >
          Continue
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      </div>
    </>
  );
}
