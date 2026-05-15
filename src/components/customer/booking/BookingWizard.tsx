import { useState, useEffect, useCallback, useRef } from "react";
import { customerSupabase as supabase } from "../../../supabase/customerClient.js";
import { SALON_SLOTS } from "../../../constants/index.js";
import { findGroupedSlots } from "../../../engine/capacity.js";
import { PRICING } from "../../../constants/index.js";
import { getSizeForBreed } from "../../../constants/breeds.js";
import type { WizardDog, DogSize, ServiceId, SlotAllocation, Booking } from "../../../types/index.js";
import { DogSelection } from "./DogSelection.js";
import { ServiceSelection } from "./ServiceSelection.js";
import { DateSelection } from "./DateSelection.js";
import { SlotSelection } from "./SlotSelection.js";
import { BookingConfirmation } from "./BookingConfirmation.js";
import { AddToCalendarButton } from "../AddToCalendarButton.js";
import { ScribbleUnderline } from "../../ui/ScribbleUnderline.jsx";
import { Clipboard, PawPrint, Check, ChevronLeft, ArrowRight } from "lucide-react";
import "./booking-wizard.css";

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

// Five paw prints scattered around the success screen, gently floating.
// Decorative — purely a one-time joy moment, hidden from screen readers.
const CONFETTI_PAWS: Array<{ top: string; left: string; size: number; color: string; rot: number; delay: string }> = [
  { top: "8%",  left: "10%", size: 22, color: "var(--sd-yellow)",      rot: -18, delay: "0s"   },
  { top: "22%", left: "82%", size: 18, color: "var(--sd-cyan-dark)",   rot:  12, delay: "0.4s" },
  { top: "55%", left: "6%",  size: 16, color: "var(--sd-coral)",       rot:  -8, delay: "0.8s" },
  { top: "70%", left: "88%", size: 20, color: "var(--sd-yellow-dark)", rot:  22, delay: "1.2s" },
  { top: "85%", left: "20%", size: 14, color: "var(--sd-cyan-dark)",   rot:  -6, delay: "1.6s" },
];

function ConfettiPaws() {
  return (
    <div className="booking-success-paws" aria-hidden="true">
      {CONFETTI_PAWS.map((p, i) => (
        <PawPrint
          key={i}
          size={p.size}
          style={{
            top: p.top,
            left: p.left,
            color: p.color,
            transform: `rotate(${p.rot}deg)`,
            animationDelay: p.delay,
            ["--rot" as string]: `${p.rot}deg`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

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
  const [bookedIds, setBookedIds] = useState<string[]>([]);
  const [waitlistJoined, setWaitlistJoined] = useState(false);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);

  // Focus the step heading when the step changes (A2: focus management)
  useEffect(() => {
    stepHeadingRef.current?.focus();
  }, [step]);

  // Warn before navigating away mid-wizard (U5)
  useEffect(() => {
    if (step <= 1 || booked || waitlistJoined) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [step, booked, waitlistJoined]);

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
        (data || []).map((d: any) => {
          const breed = d.breed || "";
          const storedSize = d.size || null;
          const derivedSize = !storedSize && breed ? (getSizeForBreed(breed) as DogSize | null) : null;
          return {
            id: d.id,
            name: d.name,
            breed,
            size: storedSize ?? derivedSize ?? null,
          };
        })
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
        breedSnapshot: null, ownerNameSnapshot: null,
        whatsappConversationId: null, whatsappMessageId: null,
        _dogId: row.dog_id, _ownerId: null, _pickupById: row.pickup_by_id || null,
        _bookingDate: row.booking_date, _groupId: row.group_id || null,
      }));

      const dogsForSlots = selectedDogs.map((d) => ({ id: d.dogId, size: d.size }));
      const stillAvailable = findGroupedSlots(dogsForSlots, bookings, SALON_SLOTS);
      const match = stillAvailable.find((a) => a.dropOffTime === slotAllocation.dropOffTime);

      if (!match) {
        setError("Sorry, that time slot is no longer available — please choose another.");
        setSlotAllocation(null);
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
          status: "Booked",
          confirmed: false,
          addons: [],
          payment: "Due at Pick-up",
          group_id: selectedDogs.length > 1 ? groupId : null,
        };
      });

      const { data: inserted, error: insertError } = await supabase.from("bookings").insert(records).select("id");
      if (insertError) throw insertError;

      setBookedIds((inserted ?? []).map((r: { id: string }) => r.id));
      setBooked(true);
    } catch (e: any) {
      // The server-side capacity trigger raises useful messages like
      // "Slot is full", "Capped at 1 (2-2-1 rule)", "Back-to-back large dogs only allowed at 12:30 + 13:00".
      // Surface those directly so the customer knows why we couldn't book.
      const msg: string = e?.message || "";
      const isTriggerError =
        e?.code === "P0001" ||                              // raise_exception
        /Slot is full|2-2-1|Large dog|Capped at 1|early close|Back-to-back/i.test(msg);
      setError(isTriggerError ? msg : "Sorry, we couldn't create that booking. Please try again, or message us if it keeps happening.");
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

    const dogNames = selectedDogs.map((d) => d.name);
    const dogNameStr = dogNames.length === 1
      ? dogNames[0]
      : dogNames.slice(0, -1).join(", ") + " & " + dogNames[dogNames.length - 1];
    const bookingRef = selectedDate
      ? `${selectedDate.replace(/-/g, "")}-${dropOff.replace(":", "")}`
      : "";

    if (waitlistJoined && !booked) {
      return (
        <div className="booking-success booking-success--waitlist">
          <ConfettiPaws />
          <div className="booking-success-polaroid" aria-hidden="true">
            <div className="booking-success-polaroid-photo">
              <Clipboard size={48} />
            </div>
          </div>
          <h1 className="booking-success-title">
            You&apos;re on the waitlist!
            <ScribbleUnderline color="var(--sd-coral)" />
          </h1>
          <p className="booking-success-subtitle">
            We&apos;ve added {dogNameStr} to the waitlist for <strong>{dateLabel}</strong>. We&apos;ll text you the moment a slot opens up.
          </p>
          <div className="booking-success-actions">
            <button onClick={onComplete} className="wizard-btn wizard-btn--primary">
              Back to dashboard
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="booking-success">
        <ConfettiPaws />
        <div className="booking-success-polaroid" aria-hidden="true">
          <div className="booking-success-polaroid-photo">
            <PawPrint size={48} />
          </div>
        </div>
        <h1 className="booking-success-title">
          All booked in!
          <ScribbleUnderline />
        </h1>
        <p className="booking-success-subtitle">
          Can&apos;t wait to see {dogNameStr} on <strong>{dateLabel}</strong> at <strong>{fmtTime(dropOff)}</strong>.
        </p>
        {bookingRef && (
          <div className="booking-success-ref">
            Booking ref · <code>{bookingRef}</code>
          </div>
        )}
        <div className="booking-success-actions">
          {bookedIds.map((id) => (
            <AddToCalendarButton key={id} bookingId={id} />
          ))}
          <button onClick={onComplete} className="wizard-btn wizard-btn--primary">
            Back to dashboard
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>
        <p className="booking-success-footnote">
          We&apos;ll text a reminder the day before. Need to change something? Message us on WhatsApp.
        </p>
      </div>
    );
  }

  return (
    <div className="booking-wizard">
      <div className="booking-wizard-inner">
        {/* Header */}
        <div className="booking-wizard-header">
          <button
            onClick={onCancel}
            className="booking-wizard-back"
            aria-label="Cancel booking and return to dashboard"
          >
            <ChevronLeft size={16} aria-hidden="true" /> Cancel
          </button>
          <div className="booking-wizard-title">
            <span className="booking-wizard-kicker">Step {step} of 5</span>
            <h1 ref={stepHeadingRef} tabIndex={-1}>
              {STEP_TITLES[step - 1]}
              <ScribbleUnderline />
            </h1>
          </div>
        </div>

        {/* Paw-print stepper (A5: progressbar semantics; A3: dots + filled state are non-colour indicators) */}
        <ol
          className="booking-wizard-steps"
          role="progressbar"
          aria-valuenow={step}
          aria-valuemin={1}
          aria-valuemax={5}
          aria-label={`Booking progress: step ${step} of 5`}
        >
          {[1, 2, 3, 4, 5].map((s) => (
            <li key={s} className={s < step ? "is-done" : s === step ? "is-current" : "is-future"}>
              <span className="booking-wizard-step-dot" aria-hidden="true">
                {s < step ? <Check size={12} /> : <PawPrint size={12} />}
              </span>
            </li>
          ))}
        </ol>

        {/* Running price estimate (U3: shows from step 2 once services selected) */}
        {step >= 2 && Object.keys(services).length > 0 && (() => {
          const prices = selectedDogs
            .filter((d) => services[d.dogId])
            .map((d) => {
              const svc = services[d.dogId] as keyof typeof PRICING;
              const size = d.size as "small" | "medium" | "large";
              return PRICING[svc]?.[size] ?? null;
            })
            .filter(Boolean) as string[];
          if (prices.length === 0) return null;
          const total = prices.reduce((sum, p) => sum + parseInt(p.replace(/[^0-9]/g, ""), 10), 0);
          return (
            <div className="text-[13px] font-semibold text-[var(--sd-ink-light)]">
              Estimated total: from {"£"}{total} (final price confirmed at your appointment)
            </div>
          );
        })()}

        {/* Error banner (A4: role=alert for screen reader announcement) */}
        {error && (
          <div role="alert" className="portal-alert portal-alert--error">
            {error}
          </div>
        )}

        {/* Dogs fetch error */}
        {dogsError && step === 1 && (
          <div role="alert" className="portal-alert portal-alert--error" style={{ justifyContent: "space-between" }}>
            <span>{dogsError}</span>
            <button
              onClick={fetchDogs}
              className="portal-btn portal-btn--danger portal-btn--small"
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
    </div>
  );
}
