import { useState, useEffect, useCallback } from "react";
import { customerSupabase as supabase } from "../../../supabase/customerClient.js";
import { BRAND, SALON_SLOTS } from "../../../constants/index.js";
import { findGroupedSlots } from "../../../engine/capacity.js";
import type { WizardDog, WizardState, ServiceId, SlotAllocation, Booking } from "../../../types/index.js";
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
  const [dogsError, setDogsError] = useState<string | null>(null);
  const [selectedDogs, setSelectedDogs] = useState<WizardDog[]>([]);
  const [services, setServices] = useState<Record<string, ServiceId>>({});
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [slotAllocation, setSlotAllocation] = useState<SlotAllocation | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booked, setBooked] = useState(false);

  const fetchDogs = useCallback(async () => {
    setDogsLoading(true);
    setDogsError(null);
    try {
      if (!supabase) return;
      const { data, error: fetchErr } = await supabase
        .from("dogs")
        .select("id, name, breed, size")
        .eq("human_id", humanRecord.id)
        .order("name");
      if (fetchErr) throw fetchErr;
      setDogs(
        (data || []).map((d: any) => ({
          id: d.id,
          name: d.name,
          breed: d.breed || "",
          size: d.size || null,
        }))
      );
    } catch (e: any) {
      setDogsError(e.message || "Could not load your dogs");
    } finally {
      setDogsLoading(false);
    }
  }, [humanRecord.id]);

  useEffect(() => { fetchDogs(); }, [fetchDogs]);

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

      // Re-validate slot availability before inserting (guards against race conditions)
      const { data: currentBookings } = await supabase
        .from("bookings")
        .select("id, slot, size, service, status, addons, payment, confirmed, dog_id, pickup_by_id, booking_date")
        .eq("booking_date", selectedDate);

      const bookings: Booking[] = (currentBookings || []).map((row: any) => ({
        id: row.id, slot: row.slot, size: row.size, dogName: "", breed: "",
        service: row.service, owner: "", status: row.status, addons: row.addons || [],
        pickupBy: "", payment: row.payment || "", confirmed: row.confirmed || false,
        _dogId: row.dog_id, _ownerId: null, _pickupById: row.pickup_by_id || null,
        _bookingDate: row.booking_date,
      }));

      const dogsForSlots = selectedDogs.map((d) => ({ id: d.dogId, size: d.size }));
      const stillAvailable = findGroupedSlots(dogsForSlots, bookings, SALON_SLOTS);
      const match = stillAvailable.find((a) => a.dropOffTime === slotAllocation.dropOffTime);

      if (!match) {
        setError("Sorry, that time slot is no longer available. Please go back and choose another.");
        setStep(4);
        setSubmitting(false);
        return;
      }

      const groupId = slotAllocation.groupId;

      const records = selectedDogs.map((dog) => {
        const assignment = slotAllocation.assignments.find((a) => a.dogId === dog.dogId);
        const slot = assignment?.slot ?? slotAllocation.dropOffTime;
        return {
          booking_date: selectedDate,
          slot,
          dog_id: dog.dogId,
          size: dog.size,
          service: services[dog.dogId],
          status: "Not Arrived",
          confirmed: false,
          addons: [],
          payment: "Due at Pick-up",
          group_id: selectedDogs.length > 1 ? groupId : null,
        };
      });

      const { error: insertError } = await supabase.from("bookings").insert(records);
      if (insertError) throw insertError;

      setBooked(true);
    } catch (e: any) {
      setError(e.message || "Could not create booking");
    } finally {
      setSubmitting(false);
    }
  };

  // --- Success screen ---
  if (booked) {
    const dateLabel = selectedDate
      ? new Date(selectedDate + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
      : "";
    const dropOff = slotAllocation?.dropOffTime || "";
    const fmtTime = (s: string) => { const [h, m] = s.split(":").map(Number); return `${h > 12 ? h - 12 : h}:${String(m).padStart(2, "0")}${h >= 12 ? "pm" : "am"}`; };

    return (
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "48px 16px", textAlign: "center", fontFamily: "inherit" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: BRAND.text, marginBottom: 8 }}>
          Booking confirmed!
        </div>
        <div style={{ fontSize: 14, color: BRAND.textLight, marginBottom: 24, lineHeight: 1.5 }}>
          {selectedDogs.map((d) => d.name).join(" & ")} — {dateLabel} at {fmtTime(dropOff)}
        </div>
        <div style={{
          padding: "12px 16px", borderRadius: 10, background: BRAND.tealLight,
          color: BRAND.teal, fontSize: 13, fontWeight: 600, marginBottom: 24,
        }}>
          You'll receive a confirmation message shortly.
        </div>
        <button onClick={onComplete} style={{
          padding: "12px 32px", borderRadius: 8, border: "none",
          background: BRAND.teal, color: BRAND.white, fontWeight: 700,
          fontSize: 15, cursor: "pointer", fontFamily: "inherit",
        }}>
          Back to dashboard
        </button>
      </div>
    );
  }

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

      {/* Dogs fetch error */}
      {dogsError && step === 1 && (
        <div style={{
          padding: "14px 16px", borderRadius: 10, background: BRAND.coralLight,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ color: BRAND.coral, fontSize: 13, fontWeight: 600 }}>
            {dogsError}
          </span>
          <button onClick={fetchDogs} style={{
            padding: "6px 14px", borderRadius: 6, border: "none",
            background: BRAND.coral, color: BRAND.white, fontSize: 12,
            fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
          }}>
            Retry
          </button>
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
