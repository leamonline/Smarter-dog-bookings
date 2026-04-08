import { useState, useEffect, useCallback } from "react";
import { customerSupabase as supabase } from "../../../supabase/customerClient.js";
import { SALON_SLOTS } from "../../../constants/index.js";
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
  const [waitlistJoined, setWaitlistJoined] = useState(false);

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
          status: "No-show",
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

  const handleJoinWaitlist = async () => {
    if (!selectedDate) return;
    setSubmitting(true);
    setError(null);
    try {
      if (!supabase) throw new Error("Not connected");
      const { error: waitErr } = await supabase.from("waitlist_entries").insert({
        human_id: humanRecord.id,
        target_date: selectedDate
      });
      if (waitErr) throw waitErr;
      setWaitlistJoined(true);
    } catch (e: any) {
      setError(e.message || "Could not join waitlist");
    } finally {
      setSubmitting(false);
    }
  };

  // --- Success screens ---
  if (booked || waitlistJoined) {
    const dateLabel = selectedDate
      ? new Date(selectedDate + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
      : "";
    const dropOff = slotAllocation?.dropOffTime || "";
    const fmtTime = (s: string) => { const [h, m] = s.split(":").map(Number); return `${h > 12 ? h - 12 : h}:${String(m).padStart(2, "0")}${h >= 12 ? "pm" : "am"}`; };

    return (
      <div className="max-w-[480px] mx-auto py-12 px-4 text-center font-[inherit]">
        <div className="text-5xl mb-4">{"\u2705"}</div>
        <div className="text-xl font-extrabold text-slate-800 mb-2">
          Booking confirmed!
        </div>
        <div className="text-sm text-slate-500 mb-6 leading-relaxed">
          {selectedDogs.map((d) => d.name).join(" & ")} — {dateLabel} at {fmtTime(dropOff)}
        </div>
        <div className="py-3 px-4 rounded-[10px] bg-emerald-50 text-brand-teal text-[13px] font-semibold mb-6">
          You'll receive a confirmation message shortly.
        </div>
        <button
          onClick={onComplete}
          className="py-3 px-8 rounded-lg border-none bg-brand-teal text-white font-bold text-[15px] cursor-pointer font-[inherit]"
        >
          Back to dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-[480px] mx-auto font-[inherit] flex flex-col gap-6 py-6 px-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="font-bold text-brand-teal text-lg">
          Book an appointment
        </div>
        <button
          onClick={onCancel}
          className="bg-transparent border-none text-slate-500 text-sm cursor-pointer py-1 px-2 font-semibold"
        >
          Cancel
        </button>
      </div>

      {/* Progress bar */}
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((s) => (
          <div
            key={s}
            className={`flex-1 h-1 rounded transition-colors ${s <= step ? "bg-brand-teal" : "bg-slate-200"}`}
          />
        ))}
      </div>

      {/* Step title */}
      <div className="font-semibold text-slate-800 text-base">
        Step {step} of 5 — {STEP_TITLES[step - 1]}
      </div>

      {/* Error banner */}
      {error && (
        <div className="py-2.5 px-3.5 rounded-lg bg-brand-coral-light text-brand-coral text-sm font-semibold">
          {error}
        </div>
      )}

      {/* Dogs fetch error */}
      {dogsError && step === 1 && (
        <div className="py-3.5 px-4 rounded-[10px] bg-brand-coral-light flex items-center justify-between">
          <span className="text-brand-coral text-[13px] font-semibold">
            {dogsError}
          </span>
          <button
            onClick={fetchDogs}
            className="py-1.5 px-3.5 rounded-md border-none bg-brand-coral text-white text-xs font-bold cursor-pointer font-[inherit]"
          >
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
          onJoinWaitlist={handleJoinWaitlist}
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
