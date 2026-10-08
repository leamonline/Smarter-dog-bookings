import { useEffect, useRef, useState } from "react";
import type { WizardDog } from "../../../types/index";
import type { CustomerDog } from "../../../supabase/repositories/dogsRepo";
import { DOG_SIZES } from "../../../constants/index";
import { AddDogInline } from "./AddDogInline";
import { PawPrint, ArrowRight } from "lucide-react";
import { WizardTick } from "./WizardTick";
import { titleCase } from "../../../utils/text";
import { SALON_WHATSAPP_URL } from "../../../constants/salonContact";

interface DogSelectionProps {
  dogs: CustomerDog[];
  selectedDogs: WizardDog[];
  onSelect: (dog: WizardDog) => void;
  onNext: () => void;
  onDogAdded: (dog: CustomerDog) => void;
  humanId: string;
  loading: boolean;
  /**
   * Ask staff to confirm a dog's size (a to-do on their dashboard). Resolves
   * true when the request was recorded. Optional: without it, or when it
   * fails, the row falls back to "message us first".
   */
  onRequestSizeCheck?: (dogId: string) => Promise<boolean>;
}

const hasConfirmedSize = (dog: CustomerDog) => (DOG_SIZES as readonly string[]).includes(dog.size as string);

export function DogSelection({
  dogs,
  selectedDogs,
  onSelect,
  onNext,
  onDogAdded,
  humanId,
  loading,
  onRequestSizeCheck,
}: DogSelectionProps) {
  const [showAddDog, setShowAddDog] = useState(false);
  // Dogs whose size check the team has been asked for, this visit.
  const [sizeCheckRequested, setSizeCheckRequested] = useState<ReadonlySet<string>>(() => new Set());
  const askedRef = useRef<Set<string>>(new Set());
  // Unmount only. A per-effect flag would be cleared whenever `dogs` changes
  // (say the customer adds another pup mid-request), dropping a success for a
  // dog that askedRef then never retries.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Showing a dog we can't book IS the request: the customer came here to book
  // it. Ask once per dog per visit; the server keeps one open to-do per dog, so
  // a repeat on another visit only refreshes it.
  useEffect(() => {
    if (!onRequestSizeCheck || loading) return;
    for (const dog of dogs) {
      if (hasConfirmedSize(dog) || askedRef.current.has(dog.id)) continue;
      askedRef.current.add(dog.id);
      void onRequestSizeCheck(dog.id).then((ok) => {
        if (!ok || !mountedRef.current) return;
        setSizeCheckRequested((prev) => new Set(prev).add(dog.id));
      });
    }
  }, [dogs, loading, onRequestSizeCheck]);

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

  const unsizedDogs = dogs.filter((dog) => !hasConfirmedSize(dog));
  const allSizeChecksRequested =
    unsizedDogs.length > 0 && unsizedDogs.every((dog) => sizeCheckRequested.has(dog.id));

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
            const sizeKnown = hasConfirmedSize(dog);
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
                  <span className="font-display text-[15px] font-bold">{titleCase(dog.name)}</span>
                  <span className="text-[12px] font-medium text-[var(--sd-ink-light)]">
                    {dog.breed ? titleCase(dog.breed) : "Breed not set"}
                    {sizeLabel ? ` · ${sizeLabel}` : ""}
                  </span>
                  {!sizeKnown && (
                    <span className="text-[12px] font-semibold text-[var(--sd-coral)]">
                      {sizeCheckRequested.has(dog.id)
                        ? "We're confirming their size"
                        : "Size not confirmed — message us first"}
                    </span>
                  )}
                  {dog.isPregnant && (
                    <span className="text-[12px] font-semibold text-[var(--sd-coral)]">
                      Pregnant — message us below
                    </span>
                  )}
                </div>
                <WizardTick selected={selected} />
              </button>
            );
          })}

          {/* A blocked dog must come with the means to unblock it. The row itself
              is a disabled button, so the link lives out here where it stays
              focusable — same placement as the pregnancy note below. */}
          {unsizedDogs.length > 0 && (
            <p
              role="note"
              className="m-0 px-1 text-[12px] font-semibold text-[var(--sd-coral)]"
            >
              {allSizeChecksRequested ? (
                <>
                  We&apos;ve asked the team to confirm{" "}
                  {unsizedDogs.length === 1 ? `${titleCase(unsizedDogs[0].name)}'s size` : "their sizes"}.
                  You can book online once it&apos;s set — or if you&apos;d rather not wait,{" "}
                </>
              ) : (
                <>We need to confirm a pup&apos;s size before booking them in —{" "}</>
              )}
              <a
                href={SALON_WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
              >
                message us on WhatsApp 🐾
              </a>
              .
            </p>
          )}

          {dogs.some((dog) => dog.isPregnant) && (
            <p
              role="note"
              className="m-0 px-1 text-[12px] font-semibold text-[var(--sd-coral)]"
            >
              Pregnant dogs need a quick chat first —{" "}
              <a
                href={SALON_WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
              >
                message us on WhatsApp 🐾
              </a>
              .
            </p>
          )}

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
