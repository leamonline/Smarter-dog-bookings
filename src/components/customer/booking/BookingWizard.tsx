import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "react-router-dom";
import { customerSupabase as supabase } from "../../../supabase/customerClient";
import {
  createMany,
  joinWaitlist,
  listOnDateForCapacity,
  listBlockedSeats,
  listImmediateSlots,
  getDepositSettings,
  requestCustomerOverrideReschedule,
  rescheduleCustomerBooking,
} from "../../../supabase/repositories/bookingsRepo";
import { listForHuman, type CustomerDog } from "../../../supabase/repositories/dogsRepo";
import { useDraftPersistence } from "../../../hooks/useDraftPersistence.js";
import {
  SALON_SLOTS,
  DAILY_DOG_CAP,
  DEPOSIT_PER_DOG_PENCE,
  depositForDogsPence,
} from "../../../constants/index";
import { findGroupedSlots } from "../../../engine/capacity";
import { allocationIsImmediate } from "../../../engine/immediateBooking";
import { buildSlotGrid } from "../../../engine/slotGrid";
import { toDateStr } from "../../../supabase/transforms";
import { logBookingDenial, logFunnelEvent, type BookingDenialInput } from "../../../supabase/rpc";
import { claimFunnelStep, clearFunnelSession } from "../../../lib/funnelSession";
import {
  LEGACY_BOOKING_HORIZON_DAYS,
  UNKNOWN_PORTAL_POLICY,
  resolveCustomerPortalPolicy,
  type CustomerPortalPolicy,
} from "../../../supabase/customerBookingRules";
import { getBookingRules } from "../../../supabase/repositories/humansRepo";
import { mapDenialReason, friendlyDenialMessage } from "../../../engine/denials";
import { resolveServicePricePence } from "../../../engine/bookingRules";
import { logger } from "../../../lib/logger";
import type { WizardDog, ServiceId, SlotAllocation } from "../../../types/index";
import { DogSelection } from "./DogSelection";
import { ServiceSelection } from "./ServiceSelection";
import { DateSelection, type DatePageAvailability } from "./DateSelection";
import { SlotSelection } from "./SlotSelection";
import { BookingConfirmation } from "./BookingConfirmation";
import { BookingSummarySidebar } from "./BookingSummarySidebar";
import { AddToCalendarButton } from "../AddToCalendarButton";
import { DepositHoldInstructions } from "../DepositHoldInstructions";
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
 * Optional display state passed by BookingCard when the customer chooses
 * Reschedule. The original booking UUID in the URL is authoritative; these
 * labels may disappear across refresh/auth navigation without changing the
 * operation back into an ordinary booking.
 */
interface RescheduleFromState {
  id: string;
  // Pre-formatted display labels so the wizard's banner doesn't have
  // to re-fetch the original booking just to show what's being moved.
  dateLabel?: string;
  timeLabel?: string;
  dogName?: string;
  invalid?: boolean;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

// Gives every terminal screen (booked / waitlisted / request sent / invalid
// reschedule) the same branded backdrop as the rest of the wizard — without
// it these screens fell back to the plain page background, breaking
// continuity right at the flow's emotional high point.
function SuccessShell({ children }: { children: React.ReactNode }) {
  return <div className="booking-wizard">{children}</div>;
}

export function BookingWizard({ humanRecord, onComplete, onCancel }: BookingWizardProps) {
  const location = useLocation();
  const approvalMode =
    new URLSearchParams(location.search).get("approval");
  // Keep the original booking ID in the URL so a refresh or auth redirect
  // cannot silently turn a reschedule into an ordinary second booking. Route
  // state still carries the friendly labels, but is no longer authoritative.
  const [rescheduleFrom] = useState<RescheduleFromState | null>(() => {
    const state = location.state as { rescheduleFrom?: RescheduleFromState } | null;
    const queryId = new URLSearchParams(location.search).get("reschedule");
    if (queryId !== null) {
      if (!UUID_RE.test(queryId)) return { id: queryId, invalid: true };
      return state?.rescheduleFrom?.id === queryId
        ? state.rescheduleFrom
        : { id: queryId };
    }
    // Route state is intentionally display-only. If it says this was a
    // reschedule but the durable query parameter has disappeared, stop here
    // instead of silently treating the flow as a brand-new booking.
    return state?.rescheduleFrom
      ? { id: state.rescheduleFrom.id, invalid: true }
      : null;
  });
  const approvalRequired =
    approvalMode === "request" &&
    rescheduleFrom !== null &&
    !rescheduleFrom.invalid;

  // Persist an in-progress booking to localStorage so navigating away (back
  // button, refresh) doesn't wipe the customer's selections. Disabled during a
  // reschedule: a leftover draft from an abandoned normal booking must not
  // bleed into the visit being moved.
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
  const [requestSent, setRequestSent] = useState(false);
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
  const [bookingHorizonDays, setBookingHorizonDays] = useState(LEGACY_BOOKING_HORIZON_DAYS);
  // The customer-visible policy behind step 5's change-deadline sentence. Starts
  // "unknown", which renders no promise at all — never a guessed one.
  const [portalPolicy, setPortalPolicy] = useState<CustomerPortalPolicy>(UNKNOWN_PORTAL_POLICY);
  // Whether THIS owner must pay a deposit to hold the appointment. Fetched here
  // rather than read out of SlotSelection because a restored draft can land
  // straight on step 5 without step 4 ever mounting. null = not established, in
  // which case step 5 says nothing about deposits (the read fails open, so a
  // missing flag is not evidence that no deposit is due).
  const [depositRequired, setDepositRequired] = useState<boolean | null>(null);
  const [datePage, setDatePage] = useState(0);
  const datePageCache = useRef(new Map<string, DatePageAvailability>());
  // Deposit-required owners: the DB stamps reference + due-by at insert;
  // we read them back after creation so the success screen can show the
  // payment instructions. Null = no deposit needed (or lookup failed —
  // the dashboard panel shows the same details).
  const [depositInfo, setDepositInfo] = useState<{
    amount: number;
    reference: string | null;
    dueBy: string | null;
    bank: { accountName: string; sortCode: string; accountNumber: string } | null;
  } | null>(null);
  const [depositStatusUnknown, setDepositStatusUnknown] = useState(false);
  const [waitlistJoined, setWaitlistJoined] = useState(false);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);

  // This customer-safe read is advisory UI configuration only. The legacy
  // 28-day state remains in place for a missing client, an RPC failure, or an
  // unmounted wizard, so a transient read never blocks a customer booking.
  useEffect(() => {
    let cancelled = false;
    if (!supabase) return;
    void resolveCustomerPortalPolicy(supabase, (rpcError) => {
      logger.error("Failed to fetch customer booking rules", rpcError, {
        tags: { component: "BookingWizard", op: "current_customer_booking_rules" },
      });
    }).then((policy) => {
      if (cancelled) return;
      setPortalPolicy(policy);
      setBookingHorizonDays(policy.horizonDays);
    }).catch((rpcError) => {
      logger.error("Failed to fetch customer booking rules", rpcError, {
        tags: { component: "BookingWizard", op: "current_customer_booking_rules" },
      });
    });
    return () => { cancelled = true; };
  }, []);

  // Per-owner deposit rule. Best-effort and fail-open, exactly like SlotSelection's
  // own read: the DB stamping trigger remains the authority, so a failure here
  // only means step 5 stays quiet about deposits.
  useEffect(() => {
    let cancelled = false;
    if (!supabase) return;
    void getBookingRules(supabase, humanRecord.id)
      .then((rules) => {
        if (!cancelled && rules) setDepositRequired(rules.depositRequired);
      })
      .catch((rulesError) => {
        logger.error("Failed to fetch per-human booking rules", rulesError, {
          tags: { component: "BookingWizard", op: "get_booking_rules" },
        });
      });
    return () => { cancelled = true; };
  }, [humanRecord.id]);

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
          return {
            id: d.id,
            name: d.name,
            breed,
            size: d.size,
            reportedSize: d.reportedSize,
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

  // Best-effort capacity-denial logging (report 2F). Strictly fire-and-forget:
  // it never awaits into the booking flow and swallows every error, so a
  // logging failure can't change what the customer sees. Dedupes the "date had
  // no availability" signal per date + dog-set so browsing doesn't spam it.
  const loggedEmptyDates = useRef<Set<string>>(new Set());
  const fireDenialLog = useCallback(
    (input: Omit<BookingDenialInput, "source" | "humanId">) => {
      // Belt-and-braces: this is called from inside the booking flow's own
      // try/catch, so it must not throw synchronously OR reject — either could
      // change what the customer sees. Swallow both.
      try {
        if (!supabase) return;
        logBookingDenial(supabase, { ...input, source: "portal", humanId: humanRecord.id }).then(
          undefined,
          () => {},
        );
      } catch {
        /* never surface a logging failure into the booking flow */
      }
    },
    [humanRecord.id],
  );
  const handleNoAvailability = useCallback(
    (info: { date: string; isToday: boolean }) => {
      const key = `${info.date}|${selectedDogs.map((d) => d.dogId).sort().join(",")}`;
      if (loggedEmptyDates.current.has(key)) return;
      loggedEmptyDates.current.add(key);
      fireDenialLog({
        reasonCode: "unavailable",
        requestedDate: info.date,
        size: selectedDogs[0]?.size ?? null,
        service: selectedDogs[0] ? services[selectedDogs[0].dogId] : null,
        dogCount: selectedDogs.length,
        reasonDetail: info.isToday
          ? "No last-minute slots for these dogs today"
          : "No availability for these dogs on this date",
        alternativeShown: true,
      });
    },
    [selectedDogs, services, fireDenialLog],
  );

  // Booking-wizard funnel telemetry (improvement #4) — best-effort, one
  // session_id per booking *attempt* (sessionStorage via funnelSession.ts, so
  // it survives remounts / refreshes and is cleared when a booking lands).
  // Each event carries a monotonic step index and a client timestamp captured
  // synchronously at the call site, so ordering never depends on the server's
  // insert time. Wrapped/swallowed exactly like fireDenialLog so a telemetry
  // failure can never affect the wizard.
  const funnelMeta = useRef<{ humanId: string; dogCount: number | null }>({
    humanId: humanRecord.id,
    dogCount: selectedDogs.length || null,
  });
  useEffect(() => {
    funnelMeta.current = {
      humanId: humanRecord.id,
      dogCount: selectedDogs.length || null,
    };
  }, [humanRecord.id, selectedDogs.length]);
  const fireFunnel = useCallback((funnelStep: string) => {
    try {
      if (!supabase) return;
      const claim = claimFunnelStep(funnelStep);
      if (!claim) return;
      const occurredAt = new Date().toISOString();
      logFunnelEvent(supabase, {
        sessionId: claim.sessionId,
        step: funnelStep,
        stepIndex: claim.stepIndex,
        occurredAt,
        humanId: funnelMeta.current.humanId,
        dogCount: funnelMeta.current.dogCount,
      }).then(undefined, () => {});
    } catch {
      /* telemetry must never surface into the wizard */
    }
  }, []);
  // "started" is the one funnel event with no user click behind it, so a
  // mount effect is genuinely needed. fireFunnel is stable ([] deps), and the
  // startedLogged flag persisted with the session record makes this once per
  // attempt — not once per mount, however often auth refreshes remount us.
  useEffect(() => {
    fireFunnel("started");
  }, [fireFunnel]);

  const handleConfirm = async () => {
    if (!slotAllocation || !selectedDate) return;
    // Logged from the confirm click itself, synchronously before any await,
    // so the captured occurred_at orders it correctly against "booked".
    fireFunnel("confirm");
    setSubmitting(true);
    setError(null);
    try {
      if (!supabase) throw new Error("Not connected");

      const [{ bookings, error: rereadError }, { byDate: blockedByDate }, immediate] =
        await Promise.all([
          listOnDateForCapacity(supabase, selectedDate),
          listBlockedSeats(supabase, selectedDate, selectedDate),
          listImmediateSlots(supabase),
        ]);
      if (rereadError) throw rereadError;

      const dogsForSlots = selectedDogs.map((d) => ({ id: d.dogId, size: d.size }));
      // Re-check against the same blocked-seat overrides the slot picker used,
      // so a seat blocked after the customer picked it is caught here too.
      // Same-day re-checks run on the extended grid (canonical + flagged
      // extras), mirroring SlotSelection.
      let stillAvailable = findGroupedSlots(
        dogsForSlots,
        bookings,
        selectedDate === immediate.date ? buildSlotGrid(immediate.slots) : SALON_SLOTS,
        DAILY_DOG_CAP,
        blockedByDate[selectedDate] || {},
      );
      // Same-day rule, mirroring SlotSelection: a today booking must sit
      // wholly on staff-flagged last-minute slots (the RPC re-applies the
      // 30-minute cutoff, so a flag that lapsed while the customer dawdled
      // is caught here and bounces them back to the time step). Fails
      // closed on a device-local today when the RPC errored.
      if (selectedDate === immediate.date || selectedDate === toDateStr(new Date())) {
        const flagged = new Set(selectedDate === immediate.date ? immediate.slots : []);
        stillAvailable = stillAvailable.filter((a) => allocationIsImmediate(a, flagged));
      }
      const match = stillAvailable.find((a) => a.dropOffTime === slotAllocation.dropOffTime);

      if (!match) {
        fireDenialLog({
          reasonCode: "slot_full",
          requestedDate: selectedDate,
          slot: slotAllocation.dropOffTime,
          size: selectedDogs[0]?.size ?? null,
          service: selectedDogs[0] ? services[selectedDogs[0].dogId] : null,
          dogCount: selectedDogs.length,
          reasonDetail: "Chosen slot no longer available at final confirm (client re-check).",
          alternativeShown: true,
        });
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

      const reason = `Rescheduled to ${fmtDateForReason(selectedDate)} at ${fmtTimeForReason(slotAllocation.dropOffTime)}`;
      if (rescheduleFrom && approvalRequired) {
        const { request, error: requestError } =
          await requestCustomerOverrideReschedule(supabase, {
            bookingId: rescheduleFrom.id,
            bookingDate: selectedDate,
            bookings: inputs,
            reason,
          });
        if (requestError || !request) {
          const err = new Error(
            requestError?.message || "The reschedule request could not be saved.",
          );
          (err as { code?: string }).code = requestError?.code;
          throw err;
        }
        setRequestSent(true);
        return;
      }

      const { ids: insertedIds, error: insertError } = rescheduleFrom
        ? await rescheduleCustomerBooking(supabase, {
            bookingId: rescheduleFrom.id,
            bookingDate: selectedDate,
            bookings: inputs,
            reason,
          })
        : await createMany(supabase, inputs);
      if (insertError) {
        // Preserve the original Postgres error code so the catch
        // block's trigger-error matcher (P0001) still fires.
        const err = new Error(insertError.message);
        (err as { code?: string }).code = insertError.code;
        throw err;
      }

      // Deposit-tagged owner? The stamping trigger has already written the
      // reference + due-by onto the new rows (one shared reference per
      // visit) — read them back for the success screen. The booking itself
      // remains committed if this read fails, but the success screen then
      // fails honest instead of guessing that the appointment is confirmed.
      setDepositInfo(null);
      setDepositStatusUnknown(false);
      try {
        // Read back EVERY inserted row, not just the first. The deposit is a flat
        // amount per dog, so a two-dog visit holds twice one dog's deposit —
        // reading row[0] alone told the customer half of what they owed, and an
        // underpayment cannot be matched, so the appointment would be released.
        const { data: depRows, error: depositReadError } = await supabase
          .from("bookings")
          .select("deposit_required, deposit_reference, deposit_due_by, deposit_amount")
          .in("id", insertedIds);
        if (depositReadError || !depRows || depRows.length === 0) {
          throw depositReadError ?? new Error("New booking could not be read back");
        }
        const depositRows = depRows.filter((row) => row.deposit_required);
        if (depositRows.length > 0) {
          const depositSettings = await getDepositSettings(supabase);
          // Prefer whatever the stamping trigger wrote per row; fall back to the
          // flat per-dog constant for any row it left null (which is every row in
          // production today). deposit_amount is stored in pounds, not pence.
          const amount = depositRows.reduce(
            (total, row) => total + (row.deposit_amount ?? DEPOSIT_PER_DOG_PENCE / 100),
            0,
          );
          setDepositInfo({
            amount,
            reference: depositRows.find((row) => row.deposit_reference)?.deposit_reference ?? null,
            dueBy: depositRows.find((row) => row.deposit_due_by)?.deposit_due_by ?? null,
            bank: depositSettings.bank,
          });
        }
      } catch {
        setDepositStatusUnknown(true);
      }

      setBookedIds(insertedIds);
      setBooked(true);
      // Terminal funnel event, then end the attempt: clearing the stored
      // session here (and only here) is what stops post-booking remounts
      // minting stub sessions — the next genuine attempt starts fresh.
      fireFunnel("booked");
      clearFunnelSession();
    } catch (err) {
      // The server-side capacity/calendar triggers raise engineer-facing
      // messages like "Slot is full", "Capped at 1 (2-2-1 rule)",
      // "Back-to-back large dogs only allowed at 12:30 + 13:00". We LOG those
      // verbatim (reasonDetail) but never show them to a customer — friendlyDenialMessage
      // turns them into reassuring, actionable copy. Both go through the same
      // mapDenialReason categoriser so the on-screen text and the logged reason
      // can never drift.
      const cause = err as RepoErrorShape | null;
      const msg: string = cause?.message || "";
      const isTriggerError =
        cause?.code === "P0001" ||                          // raise_exception
        /Slot is full|2-2-1|Large dog|Capped at 1|early close|Back-to-back/i.test(msg);
      // A gate rejection is capacity-prevented demand — log it best-effort.
      if (isTriggerError) {
        fireDenialLog({
          reasonCode: mapDenialReason(msg),
          requestedDate: selectedDate,
          slot: slotAllocation?.dropOffTime ?? null,
          size: selectedDogs[0]?.size ?? null,
          service: selectedDogs[0] ? services[selectedDogs[0].dogId] : null,
          dogCount: selectedDogs.length,
          reasonDetail: msg,
          alternativeShown: false,
        });
      }
      setError(
        cause?.code === "SDC02"
          ? "This appointment is within 24 hours, so it can’t be moved online. Please message us and the team will help."
          : cause?.code === "SDR01"
            ? "This appointment needs staff approval before it can move. Return to your dashboard and choose Request a change."
          : cause?.code === "SDR02"
            ? "You already have a change request waiting for the team."
          : cause?.code === "SDC04"
            ? "Please select the same dog or dogs as the groom you’re moving."
          : isTriggerError
            ? friendlyDenialMessage(msg)
            : "Sorry, we couldn’t save that booking change. Please try again, or message us if it keeps happening.",
      );
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
    } catch {
      // Don't surface the raw error — a warm, retryable message is friendlier
      // and the failure here is almost always transient (network/RLS).
      setError("Sorry, we couldn’t add you to the waitlist just now. Please try again in a moment.");
    } finally {
      setSubmitting(false);
    }
  };

  if (rescheduleFrom?.invalid) {
    return (
      <SuccessShell>
        <div className="booking-success booking-success--recovery">
          <div role="alert" className="portal-alert portal-alert--error">
            This reschedule link isn’t valid. Please return to your dashboard and choose Reschedule again.
          </div>
          <div className="booking-success-actions">
            <button onClick={onComplete} className="wizard-btn wizard-btn--primary">
              Back to dashboard
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      </SuccessShell>
    );
  }

  // --- Success screens ---
  if (booked || waitlistJoined || requestSent) {
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

    if (requestSent) {
      return (
        <SuccessShell>
          <div className="booking-success booking-success--waitlist">
            <div className="booking-success-polaroid" aria-hidden="true">
              <div className="booking-success-polaroid-photo">
                <Clipboard size={48} />
              </div>
            </div>
            <h1 className="booking-success-title">
              Request sent
              <ScribbleUnderline color="var(--sd-coral)" />
            </h1>
            <p className="booking-success-subtitle">
              We&apos;ve sent your preferred time for {dogNameStr} on{" "}
              <strong>{dateLabel}</strong> at{" "}
              <strong>{fmtTime(dropOff)}</strong> to the team. Your original
              appointment stays booked unless they approve the change.
            </p>
            <div className="booking-success-actions">
              <button onClick={onComplete} className="wizard-btn wizard-btn--primary">
                Back to dashboard
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
        </SuccessShell>
      );
    }

    if (waitlistJoined && !booked) {
      return (
        <SuccessShell>
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
              We&apos;ve added {dogNameStr} to the waitlist for <strong>{dateLabel}</strong>. We&apos;ll be in touch as soon as a slot opens up.
            </p>
            <div className="booking-success-actions">
              <button onClick={onComplete} className="wizard-btn wizard-btn--primary">
                Back to dashboard
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
        </SuccessShell>
      );
    }

    return (
      <SuccessShell>
        <div className="booking-success">
          <ConfettiPaws />
          <div className="booking-success-polaroid" aria-hidden="true">
            <div className="booking-success-polaroid-photo">
              <PawPrint size={48} />
            </div>
          </div>
          <h1 className="booking-success-title">
            {depositInfo
              ? "Deposit needed"
              : depositStatusUnknown
                ? "Appointment saved"
                : "All booked in!"}
            <ScribbleUnderline />
          </h1>
          <p className="booking-success-subtitle">
            {depositInfo ? (
              <>
                We&apos;re holding {dogNameStr}&apos;s appointment on{" "}
                <strong>{dateLabel}</strong> at{" "}
                <strong>{fmtTime(dropOff)}</strong> until the deposit deadline
                below.
              </>
            ) : depositStatusUnknown ? (
              <>
                Your appointment has been saved. Please check your dashboard for
                any deposit step before treating it as confirmed.
              </>
            ) : (
              <>
                Can&apos;t wait to see {dogNameStr} on{" "}
                <strong>{dateLabel}</strong> at{" "}
                <strong>{fmtTime(dropOff)}</strong>.
              </>
            )}
          </p>
          {depositInfo && (
            <div
              role="status"
              aria-label="Deposit needed"
              className="wizard-card"
              style={{ textAlign: "left", marginTop: 12 }}
            >
              <h2 style={{ fontSize: 16, marginTop: 0 }}>
                Your £{depositInfo.amount} deposit
              </h2>
              <DepositHoldInstructions
                amount={depositInfo.amount}
                reference={depositInfo.reference}
                dueBy={depositInfo.dueBy}
                bank={depositInfo.bank}
                compact
              />
            </div>
          )}
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
      </SuccessShell>
    );
  }

  return (
    <div className="booking-wizard">
      <div className="booking-wizard-inner">
        <div className="booking-wizard-main">
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

        {/* The UUID in the URL keeps reschedule mode durable. Route state adds
            friendly labels when it survives navigation. */}
        {rescheduleFrom && (
          <div role="status" className="portal-alert portal-alert--info">
            <span>
              <strong>
                {approvalRequired
                  ? <>Requesting a different time for your current groom.</>
                  : rescheduleFrom.dogName && rescheduleFrom.dateLabel && rescheduleFrom.timeLabel
                    ? <>Rescheduling {rescheduleFrom.dogName}&apos;s {rescheduleFrom.dateLabel}, {rescheduleFrom.timeLabel} slot.</>
                    : <>Rescheduling your current groom.</>}
              </strong>
              {" "}
              {approvalRequired
                ? "Your original appointment stays booked until the team approves your preferred time. Cancel out and nothing changes."
                : "Your original booking stays held until you confirm a new time. Cancel out and nothing changes."}
            </span>
          </div>
        )}

        {/* Running price estimate (U3: shows from step 2 once services selected) */}
        {step >= 2 && Object.keys(services).length > 0 && (() => {
          const prices = selectedDogs
            .filter((d) => services[d.dogId])
            .map((d) => resolveServicePricePence(services[d.dogId] as string, d.size))
            .filter((p): p is number => p != null);
          if (prices.length === 0) return null;
          const total = prices.reduce((sum, p) => sum + p, 0) / 100;
          return (
            <div className="booking-wizard-inline-total text-[13px] font-semibold text-[var(--sd-ink-light)]">
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
            onNext={() => {
              fireFunnel("select_dogs");
              setStep(2);
            }}
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
            onNext={() => {
              fireFunnel("select_service");
              setStep(3);
            }}
            onBack={() => setStep(1)}
          />
        )}

        {step === 3 && (
          <DateSelection
            bookingHorizonDays={bookingHorizonDays}
            selectedDogs={selectedDogs}
            selectedDate={selectedDate}
            onSelect={setSelectedDate}
            onNext={() => {
              fireFunnel("select_date");
              setStep(4);
            }}
            onBack={() => setStep(2)}
            page={datePage}
            onPageChange={setDatePage}
            pageCache={datePageCache.current}
          />
        )}

        {step === 4 && (
          <SlotSelection
            selectedDogs={selectedDogs}
            selectedDate={selectedDate}
            slotAllocation={slotAllocation}
            onSelect={(allocation) => setSlotAllocation(allocation)}
            onNext={() => {
              fireFunnel("select_slot");
              setStep(5);
            }}
            onBack={() => setStep(3)}
            onJoinWaitlist={handleJoinWaitlist}
            onNoAvailability={handleNoAvailability}
            humanId={humanRecord.id}
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
            approvalRequired={approvalRequired}
            depositTotal={
              depositRequired === true
                ? depositForDogsPence(selectedDogs.length) / 100
                : null
            }
            changeDeadlineNote={
              portalPolicy.allowCancellations === false
                ? null
                : portalPolicy.changeDeadlineDescription
            }
          />
        )}
        </div>

        <BookingSummarySidebar
          selectedDogs={selectedDogs}
          services={services}
          selectedDate={selectedDate}
          slotAllocation={slotAllocation}
          dogs={dogs}
        />
      </div>
    </div>
  );
}
