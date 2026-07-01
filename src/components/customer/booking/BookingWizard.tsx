import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "react-router-dom";
import { customerSupabase as supabase } from "../../../supabase/customerClient.js";
import {
  cancelMany,
  createMany,
  joinWaitlist,
  listIdsInGroup,
  listOnDateForCapacity,
  listBlockedSeats,
} from "../../../supabase/repositories/bookingsRepo";
import { listForHuman, type CustomerDog } from "../../../supabase/repositories/dogsRepo";
import { useDraftPersistence } from "../../../hooks/useDraftPersistence.js";
import { SALON_SLOTS, DAILY_DOG_CAP } from "../../../constants/index";
import { findGroupedSlots } from "../../../engine/capacity";
import { PRICING } from "../../../constants/index";
import { getSizeForBreed } from "../../../constants/breeds";
import type { WizardDog, DogSize, ServiceId, SlotAllocation } from "../../../types/index";
import { DogSelection } from "./DogSelection";
import { ServiceSelection } from "./ServiceSelection";
import { DateSelection } from "./DateSelection";
import { SlotSelection } from "./SlotSelection";
import { BookingConfirmation } from "./BookingConfirmation";
import { AddToCalendarButton } from "../AddToCalendarButton";
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

/**
 * State the dashboard's BookingCard passes via `navigate("/customer/book", { state })`
 * when the customer chooses Reschedule. Tells the wizard which existing
 * booking to cancel *after* the new one is successfully created — so a
 * customer who abandons the wizard never loses their original slot.
 */
interface RescheduleFromState {
  id: string;
  groupId: string | null;
  // Pre-formatted display labels so the wizard's banner doesn't have
  // to re-fetch the original booking just to show what's being moved.
  dateLabel: string;
  timeLabel: string;
  dogName: string;
}

function fmtTimeForReason(slot: string): string {
  const [h, m] = slot.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour}:${m.toString().padStart(2, "0")}${suffix}`;
}

function fmtDateForReason(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

/**
 * Errors surfaced by the booking repos. Supabase trigger failures carry a
 * Postgres `code` (P0001 for raise_exception); handleConfirm also stamps
 * that code onto a plain Error so its catch-block matcher can read it.
 */
interface RepoErrorShape {
  message?: string;
  code?: string;
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
  const location = useLocation();
  // Read the reschedule context exactly once on mount. If the customer reloads
  // the page mid-wizard, route state is gone — they fall back into a normal
  // booking flow, and their original slot stays untouched. That's the right
  // failure mode.
  const [rescheduleFrom] = useState<RescheduleFromState | null>(() => {
    const state = location.state as { rescheduleFrom?: RescheduleFromState } | null;
    return state?.rescheduleFrom ?? null;
  });

  // Persist an in-progress booking to localStorage so navigating away (back
  // button, refresh) doesn't wipe the customer's selections. Disabled during a
  // reschedule: that flow carries one-shot route state and its own cancel-after
  // semantics, so a leftover draft from an abandoned normal booking must not
  // bleed into it.
  interface BookingDraft {
    step: 1 | 2 | 3 | 4 | 5;
    selectedDogs: WizardDog[];
    services: Record<string, ServiceId>;
    selectedDate: string | null;
    slotAllocation: SlotAllocation | null;
  }
  const draftKey = `sdb:draft:booking:${humanRecord.id}`;
  const {
    restored,
    save: saveDraft,
    clear: clearDraft,
  } = useDraftPersistence(draftKey, { enabled: !rescheduleFrom });
  const draft = restored as unknown as BookingDraft | null;

  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(() => draft?.step ?? 1);
  const [dogs, setDogs] = useState<CustomerDog[]>([]);
  const [dogsLoading, setDogsLoading] = useState(true);
  const [dogsError, setDogsError] = useState<string | null>(null);
  const [selectedDogs, setSelectedDogs] = useState<WizardDog[]>(() => draft?.selectedDogs ?? []);
  const [services, setServices] = useState<Record<string, ServiceId>>(() => draft?.services ?? {});
  const [selectedDate, setSelectedDate] = useState<string | null>(() => draft?.selectedDate ?? null);
  const [slotAllocation, setSlotAllocation] = useState<SlotAllocation | null>(
    () => draft?.slotAllocation ?? null,
  );
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

  // Warn before navigating away mid-wizard (U5). With the draft persistence
  // below this is now a backstop rather than the only protection.
  useEffect(() => {
    if (step <= 1 || booked || waitlistJoined) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [step, booked, waitlistJoined]);

  // Save a draft snapshot as selections change; clear it once the flow has
  // reached a terminal state so a completed booking can't be "restored".
  useEffect(() => {
    if (booked || waitlistJoined) {
      clearDraft();
      return;
    }
    saveDraft({ step, selectedDogs, services, selectedDate, slotAllocation });
  }, [saveDraft, clearDraft, booked, waitlistJoined, step, selectedDogs, services, selectedDate, slotAllocation]);

  // Shared so both the auto-fetch effect and the retry button below
  // route through one signal — clicking retry aborts the prior load,
  // and unmount aborts whichever request is in flight.
  const dogsFetchControllerRef = useRef<AbortController | null>(null);

  const fetchDogs = useCallback(async () => {
    if (!supabase) return;
    dogsFetchControllerRef.current?.abort();
    const controller = new AbortController();
    dogsFetchControllerRef.current = controller;

    setDogsLoading(true);
    setDogsError(null);
    try {
      if (!supabase) throw new Error("Not connected");
      const { dogs: rows, error: fetchErr } = await listForHuman(supabase, {
        humanId: humanRecord.id,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (fetchErr) throw fetchErr;
      setDogs(
        rows.map((d) => {
          const breed = d.breed || "";
          const storedSize = d.size || null;
          const derivedSize = !storedSize && breed ? (getSizeForBreed(breed) as DogSize | null) : null;
          return {
            id: d.id,
            name: d.name,
            breed,
            size: storedSize ?? derivedSize ?? null,
            isPregnant: d.isPregnant,
          };
        })
      );
    } catch (err) {
      if (controller.signal.aborted) return;
      setDogsError((err as RepoErrorShape).message || "Could not load your dogs");
    } finally {
      if (!controller.signal.aborted) setDogsLoading(false);
    }
  }, [humanRecord.id]);

  useEffect(() => {
    fetchDogs();
    return () => dogsFetchControllerRef.current?.abort();
  }, [fetchDogs]);

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

  const handleDogAdded = (dog: CustomerDog) => {
    setDogs((prev) => [...prev, dog]);
  };

  const handleConfirm = async () => {
    if (!slotAllocation || !selectedDate) return;
    setSubmitting(true);
    setError(null);
    try {
      if (!supabase) throw new Error("Not connected");

      const [{ bookings, error: rereadError }, { byDate: blockedByDate }] =
        await Promise.all([
          listOnDateForCapacity(supabase, selectedDate),
          listBlockedSeats(supabase, selectedDate, selectedDate),
        ]);
      if (rereadError) throw rereadError;

      const dogsForSlots = selectedDogs.map((d) => ({ id: d.dogId, size: d.size }));
      // Re-check against the same blocked-seat overrides the slot picker used,
      // so a seat blocked after the customer picked it is caught here too.
      const stillAvailable = findGroupedSlots(
        dogsForSlots,
        bookings,
        SALON_SLOTS,
        DAILY_DOG_CAP,
        blockedByDate[selectedDate] || {},
      );
      const match = stillAvailable.find((a) => a.dropOffTime === slotAllocation.dropOffTime);

      if (!match) {
        setError("Sorry, that time slot is no longer available — please choose another.");
        setSlotAllocation(null);
        setStep(4);
        setSubmitting(false);
        return;
      }

      const groupId = slotAllocation.groupId;

      const inputs = selectedDogs.map((dog) => {
        const assignment = slotAllocation.assignments.find((a) => a.dogId === dog.dogId);
        const slot = assignment?.slot ?? slotAllocation.dropOffTime;
        return {
          bookingDate: selectedDate,
          slot,
          dogId: dog.dogId,
          size: dog.size,
          service: services[dog.dogId],
          groupId: selectedDogs.length > 1 ? groupId : null,
        };
      });

      const { ids: insertedIds, error: insertError } = await createMany(
        supabase,
        inputs,
      );
      if (insertError) {
        // Preserve the original Postgres error code so the catch
        // block's trigger-error matcher (P0001) still fires.
        const err = new Error(insertError.message);
        (err as { code?: string }).code = insertError.code;
        throw err;
      }

      // If this run started as a reschedule, the original booking(s) only get
      // cancelled once the new insert has succeeded. Both writes share this
      // try/catch — an insert failure means the cancel never runs (original
      // stays held); a cancel failure after a successful insert surfaces as
      // an error so the salon catches the rare duplicate, rather than us
      // silently leaving two active bookings.
      if (rescheduleFrom) {
        const idsToCancel = await listIdsInGroup(supabase, {
          groupId: rescheduleFrom.groupId ?? null,
          fallbackId: rescheduleFrom.id,
        });

        const { error: cancelError } = await cancelMany(supabase, {
          ids: idsToCancel,
          reason: `Rescheduled to ${fmtDateForReason(selectedDate)} at ${fmtTimeForReason(slotAllocation.dropOffTime)}`,
        });
        if (cancelError) throw cancelError;
      }

      setBookedIds(insertedIds);
      setBooked(true);
    } catch (err) {
      // The server-side capacity trigger raises useful messages like
      // "Slot is full", "Capped at 1 (2-2-1 rule)", "Back-to-back large dogs only allowed at 12:30 + 13:00".
      // Surface those directly so the customer knows why we couldn't book.
      const cause = err as RepoErrorShape | null;
      const msg: string = cause?.message || "";
      const isTriggerError =
        cause?.code === "P0001" ||                          // raise_exception
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
      const { error: waitErr } = await joinWaitlist(supabase, {
        humanId: humanRecord.id,
        targetDate: selectedDate,
      });
      if (waitErr) throw waitErr;
      setWaitlistJoined(true);
    } catch (err) {
      setError((err as RepoErrorShape).message || "Could not join waitlist");
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
            onClick={() => { clearDraft(); onCancel(); }}
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

        {/* Rescheduling banner — only present when the BookingCard sent us
            here with a rescheduleFrom in route state. Reassures the customer
            that nothing has been cancelled yet. */}
        {rescheduleFrom && (
          <div role="status" className="portal-alert portal-alert--info">
            <span>
              <strong>
                Rescheduling {rescheduleFrom.dogName}&apos;s {rescheduleFrom.dateLabel}, {rescheduleFrom.timeLabel} slot.
              </strong>
              {" "}
              Your original booking stays held until you confirm a new time. Cancel out and nothing changes.
            </span>
          </div>
        )}

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
            dogs={dogs}
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
            selectedDogs={selectedDogs}
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
            dogs={dogs}
          />
        )}
      </div>
    </div>
  );
}
