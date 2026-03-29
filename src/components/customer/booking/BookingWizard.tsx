import { useState, useEffect } from "react";
import { customerSupabase as supabase } from "../../../supabase/customerClient.js";
import { BRAND } from "../../../constants/index.js";
import type { WizardDog, WizardState, ServiceId, SlotAllocation } from "../../../types/index.js";
import { DogSelection } from "./DogSelection.js";
import { ServiceSelection } from "./ServiceSelection.js";
import { DateSelection } from "./DateSelection.js";
import { SlotSelection } from "./SlotSelection.js";
import { BookingConfirmation } from "./BookingConfirmation.js";

interface HumanRecord {
  id: string;
  name: string;
  surname: string;
}

interface BookingWizardProps {
  humanRecord: HumanRecord;
  onComplete: () => void;
  onCancel: () => void;
}

interface RawDog {
  id: string;
  name: string;
  breed: string;
  size: string | null;
}

const STEP_TITLES = [
  "Select dogs",
  "Choose services",
  "Pick a date",
  "Choose a time",
  "Confirm booking",
];

export function BookingWizard({ humanRecord, onComplete, onCancel }: BookingWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [dogs, setDogs] = useState<RawDog[]>([]);
  const [dogsLoading, setDogsLoading] = useState(true);
  const [selectedDogs, setSelectedDogs] = useState<WizardDog[]>([]);
  const [services, setServices] = useState<Record<string, ServiceId>>({});
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [slotAllocation, setSlotAllocation] = useState<SlotAllocation | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setDogsLoading(true);
      try {
        if (!supabase) return;
        const { data } = await supabase
          .from("dogs")
          .select("id, name, breed, size")
          .eq("human_id", humanRecord.id)
          .order("name");
        if (cancelled) return;
        setDogs(
          (data || []).map((d: any) => ({
            id: d.id,
            name: d.name,
            breed: d.breed || "",
            size: d.size || null,
          }))
        );
      } finally {
        if (!cancelled) setDogsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [humanRecord.id]);

  const toggleDog = (dog: WizardDog) => {
    setSelectedDogs((prev) => {
      const exists = prev.find((d) => d.dogId === dog.dogId);
      if (exists) return prev.filter((d) => d.dogId !== dog.dogId);
      if (prev.length >= 4) return prev;
      return [...prev, dog];
    });
  };

  const selectService = (dogId: string, serviceId: ServiceId) => {
    setServices((prev) => ({ ...prev, [dogId]: serviceId }));
  };

  const handleDogAdded = (dog: RawDog) => {
    setDogs((prev) => [...prev, dog]);
  };

  const handleConfirm = async () => {
    if (!slotAllocation || !selectedDate) return;
    setSubmitting(true);
    setError(null);
    try {
      if (!supabase) throw new Error("Not connected");

      const groupId = slotAllocation.groupId;

      const records = selectedDogs.map((dog) => {
        const assignment = slotAllocation.assignments.find((a) => a.dogId === dog.dogId);
        const slot = assignment?.slot ?? slotAllocation.dropOffTime;
        const rawDog = dogs.find((d) => d.id === dog.dogId);
        return {
          booking_date: selectedDate,
          slot,
          dog_id: dog.dogId,
          dog_name: dog.name,
          breed: rawDog?.breed || "",
          size: dog.size,
          service: services[dog.dogId],
          owner_id: humanRecord.id,
          owner: `${humanRecord.name} ${humanRecord.surname}`.trim(),
          status: "Not Arrived",
          confirmed: false,
          addons: [],
          group_id: selectedDogs.length > 1 ? groupId : null,
        };
      });

      const { error: insertError } = await supabase.from("bookings").insert(records);
      if (insertError) throw insertError;

      onComplete();
    } catch (e: any) {
      setError(e.message || "Could not create booking");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        maxWidth: 480,
        margin: "0 auto",
        fontFamily: "inherit",
        display: "flex",
        flexDirection: "column",
        gap: 24,
        padding: "24px 16px",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontWeight: 700, color: BRAND.teal, fontSize: 18 }}>
          Book an appointment
        </div>
        <button
          onClick={onCancel}
          style={{
            background: "none",
            border: "none",
            color: BRAND.grey,
            fontSize: 14,
            cursor: "pointer",
            padding: "4px 8px",
            fontWeight: 600,
          }}
        >
          Cancel
        </button>
      </div>

      {/* Progress bar */}
      <div style={{ display: "flex", gap: 4 }}>
        {[1, 2, 3, 4, 5].map((s) => (
          <div
            key={s}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 4,
              background: s <= step ? BRAND.teal : BRAND.greyLight,
              transition: "background 0.2s",
            }}
          />
        ))}
      </div>

      {/* Step title */}
      <div style={{ fontWeight: 600, color: BRAND.text, fontSize: 16 }}>
        Step {step} of 5 — {STEP_TITLES[step - 1]}
      </div>

      {/* Error banner */}
      {error && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            background: BRAND.coralLight,
            color: BRAND.coral,
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          {error}
        </div>
      )}

      {/* Step content */}
      {step === 1 && (
        <DogSelection
          dogs={dogs as any}
          selectedDogs={selectedDogs}
          onSelect={toggleDog}
          onNext={() => setStep(2)}
          onDogAdded={handleDogAdded}
          humanId={humanRecord.id}
          loading={dogsLoading}
        />
      )}

      {step === 2 && (
        <ServiceSelection
          selectedDogs={selectedDogs}
          services={services}
          onSelect={selectService}
          onNext={() => setStep(3)}
          onBack={() => setStep(1)}
        />
      )}

      {step === 3 && (
        <DateSelection
          selectedDate={selectedDate}
          onSelect={setSelectedDate}
          onNext={() => setStep(4)}
          onBack={() => setStep(2)}
        />
      )}

      {step === 4 && (
        <SlotSelection
          selectedDogs={selectedDogs}
          selectedDate={selectedDate}
          slotAllocation={slotAllocation}
          onSelect={(allocation) => setSlotAllocation(allocation)}
          onNext={() => setStep(5)}
          onBack={() => setStep(3)}
        />
      )}

      {step === 5 && (
        <BookingConfirmation
          selectedDogs={selectedDogs}
          services={services}
          selectedDate={selectedDate}
          slotAllocation={slotAllocation}
          onConfirm={handleConfirm}
          onBack={() => setStep(4)}
          submitting={submitting}
          dogs={dogs as any}
        />
      )}
    </div>
  );
}
