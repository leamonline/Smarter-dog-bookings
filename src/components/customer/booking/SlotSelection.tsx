import { useEffect, useState } from "react";
import { SALON_SLOTS } from "../../../constants/index";
import { findGroupedSlots } from "../../../engine/capacity";
import { allocationIsImmediate } from "../../../engine/immediateBooking";
import { buildSlotGrid } from "../../../engine/slotGrid";
import { DAY_CAPACITY } from "../../../engine/utilisation";
import { useCustomerAvailability } from "../../../supabase/hooks/useCustomerAvailability";
import { partitionSlotsForHuman } from "../../../engine/deposits";
import { toDateStr } from "../../../supabase/transforms";
import type { WizardDog, SlotAllocation } from "../../../types/index";
import { Clock, ArrowRight, PawPrint, Star } from "lucide-react";
import { WizardTick } from "./WizardTick";

interface SlotSelectionProps {
  selectedDogs: WizardDog[];
  selectedDate: string | null;
  slotAllocation: SlotAllocation | null;
  onSelect: (allocation: SlotAllocation) => void;
  onNext: () => void;
  onBack: () => void;
  onJoinWaitlist?: () => void;
  /** Fired once when a genuinely open date returns no bookable slots for the
   *  selected dogs (not on a fetch error) — drives best-effort denial logging. */
  onNoAvailability?: (info: { date: string; isToday: boolean }) => void;
  /** When set, per-human booking rules apply: the owner's blocked slots are
   *  filtered out (defence in depth — the DB trigger is the authority) and
   *  preferred slots are surfaced first as "Your usual time". */
  humanId?: string;
}

function formatSlot(slot: string): string {
  const [h, m] = slot.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour}:${m.toString().padStart(2, "0")}${suffix}`;
}

function formatDateLabel(dateStr: string | null): string {
  if (!dateStr) return "this day";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

export function SlotSelection({
  selectedDogs,
  selectedDate,
  slotAllocation,
  onSelect,
  onNext,
  onBack,
  onJoinWaitlist,
  onNoAvailability,
  humanId,
}: SlotSelectionProps) {
  const [availableSlots, setAvailableSlots] = useState<SlotAllocation[]>([]);
  const [preferredSlots, setPreferredSlots] = useState<SlotAllocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const availability = useCustomerAvailability();

  useEffect(() => {
    if (!selectedDate || selectedDogs.length === 0) return;

    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        if (!availability.connected) {
          setAvailableSlots([]);
          return;
        }
        // Occupancy (SECURITY DEFINER RPC, so other customers' bookings count),
        // staff blocked seats, today's flagged slots and this owner's rules —
        // see useCustomerAvailability for why each read exists.
        const [{ bookings, error }, { byDate: blockedByDate }, immediateRes, rules] =
          await availability.loadDayAvailability(selectedDate, humanId);

        if (cancelled) return;

        if (error) {
          // Distinguish a transient fetch failure from a genuinely
          // fully-booked day so we don't mislabel a network blip as
          // "fully booked" (and nudge the customer onto the waitlist).
          setAvailableSlots([]);
          setLoadError(
            "We couldn't check availability just now. Please try again.",
          );
          return;
        }

        const dogs = selectedDogs.map((d) => ({ id: d.dogId, size: d.size }));
        // DAY_CAPACITY mirrors the authoritative DB cap (salon_config.daily_dog_cap,
        // default 14): a full day shows "Fully booked" rather than offering a slot
        // the create_customer_booking_group trigger would reject.
        // Same-day runs on the extended grid (canonical + flagged extra
        // slots) so a staff-opened 14:00 can be offered; future dates stay
        // canonical — extra slots reach customers only as same-day openings.
        const isImmediateDay = selectedDate === immediateRes.date;
        let results = findGroupedSlots(
          dogs,
          bookings,
          isImmediateDay ? buildSlotGrid(immediateRes.slots) : SALON_SLOTS,
          DAY_CAPACITY,
          blockedByDate[selectedDate] || {},
        );
        // Same-day ("last minute") rule: today's times must sit WHOLLY on
        // staff-flagged slots (get_immediate_slots re-applies the 30-minute
        // cutoff server-side on every call, so a slot silently drops off this
        // list as its cutoff passes). The device-local today check makes the
        // filter fail CLOSED — if the RPC errored, today shows no times
        // rather than times the trigger would reject.
        if (isImmediateDay || selectedDate === toDateStr(new Date())) {
          const flagged = new Set(isImmediateDay ? immediateRes.slots : []);
          results = results.filter((a) => allocationIsImmediate(a, flagged));
        }
        // Per-human rules: blocked slots vanish, preferred float to the top.
        const { preferred, rest } = partitionSlotsForHuman(results, rules ?? {});
        if (!cancelled) {
          setPreferredSlots(preferred);
          setAvailableSlots(rest);
          // A genuinely open date with nothing bookable for these dogs is
          // capacity-prevented demand — signal it once (the parent dedupes +
          // logs best-effort). Errors already returned above, so this is a real
          // "fully booked", not a fetch blip.
          if (preferred.length + rest.length === 0) {
            onNoAvailability?.({ date: selectedDate, isToday: selectedDate === toDateStr(new Date()) });
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [selectedDate, selectedDogs, onNoAvailability, humanId, availability]);

  const selectedDropOff = slotAllocation?.dropOffTime ?? null;
  const isToday = selectedDate === toDateStr(new Date());

  const totalSlots = preferredSlots.length + availableSlots.length;
  // findGroupedSlots returns every "all dogs in one slot" option first, then the
  // ones that split the group across adjacent slots — a sensible preference
  // order for the engine, but an invisible one here, where the headings promise
  // times. Left unsorted it renders as 12:30pm above 12:00pm. Sort for display
  // only; the engine's ordering is not ours to change (it is duplicated in the
  // Deno edge functions and mirrored by the DB trigger).
  const byTime = (a: SlotAllocation, b: SlotAllocation) =>
    a.dropOffTime.localeCompare(b.dropOffTime);
  const morning = availableSlots
    .filter((s) => parseInt(s.dropOffTime.split(":")[0], 10) < 12)
    .sort(byTime);
  const afternoon = availableSlots
    .filter((s) => parseInt(s.dropOffTime.split(":")[0], 10) >= 12)
    .sort(byTime);
  const preferredInOrder = [...preferredSlots].sort(byTime);

  const renderSlotTile = (allocation: SlotAllocation, starred = false) => {
    const selected = selectedDropOff === allocation.dropOffTime;
    return (
      <button
        key={allocation.dropOffTime}
        type="button"
        aria-pressed={selected}
        onClick={() => onSelect(allocation)}
        className="wizard-option"
      >
        <span className="inline-flex flex-col items-start gap-0.5 min-w-0">
          <span className="inline-flex items-center gap-2">
            {starred ? (
              <Star size={16} aria-hidden="true" className="text-[var(--sd-yellow-dark)] fill-current" />
            ) : (
              <Clock size={16} aria-hidden="true" className="text-[var(--sd-cyan-dark)]" />
            )}
            <span className="font-display text-[15px] font-bold">
              {formatSlot(allocation.dropOffTime)}
            </span>
          </span>
          {selectedDogs.length > 1 && (
            <span className="text-[12px] text-[var(--sd-ink-light)]">Drop all pups together</span>
          )}
        </span>
        <WizardTick selected={selected} />
      </button>
    );
  };

  return (
    <>
      <p className="wizard-helper">
        {isToday
          ? "Today's last-minute times — bookable up to 30 minutes before."
          : "Choose a drop-off time."}
      </p>

      <div className="wizard-card">
        {loading && (
          <div className="flex flex-col gap-2" aria-busy="true" aria-live="polite">
            {/* Matches wizard-option's real rendered height (~56px, same as
                DogSelection's skeleton) so loaded slots don't jump the page. */}
            <div className="skeleton-row" />
            <div className="skeleton-row" />
            <div className="skeleton-row" />
            <div className="skeleton-row" />
            <span className="sr-only">Checking availability…</span>
          </div>
        )}

        {!loading && loadError && (
          <div role="alert" className="portal-alert portal-alert--error">
            {loadError}
          </div>
        )}

        {!loading && !loadError && totalSlots === 0 && (
          <div className="wizard-empty-slots" style={{ background: "var(--sd-coral-tint)", borderRadius: "var(--radius-sd-card)", padding: 20 }}>
            <div className="portal-polaroid">
              <div className="portal-polaroid-frame">
                <div className="portal-polaroid-photo">
                  <PawPrint size={36} aria-hidden="true" />
                </div>
              </div>
              <h3 className="portal-empty-title" style={{ fontSize: 16, marginTop: 4 }}>
                {isToday
                  ? "Today's last-minute times have gone"
                  : `Fully booked on ${formatDateLabel(selectedDate)}`}
              </h3>
              <p className="portal-empty-body">
                {isToday
                  ? "They do get snapped up fast — pick another day and we'll see you then."
                  : "Try a different day, or pop on the waitlist and we'll be in touch if a slot opens up."}
              </p>
              {!isToday && onJoinWaitlist && (
                <button
                  type="button"
                  onClick={onJoinWaitlist}
                  className="portal-btn portal-btn--cta portal-btn--cta-inline"
                >
                  Join the waitlist
                </button>
              )}
            </div>
          </div>
        )}

        {!loading && totalSlots > 0 && (
          <>
            {preferredSlots.length > 0 && (
              <>
                <h3 className="wizard-slot-group">Your usual time</h3>
                <div className="flex flex-col gap-2">
                  {preferredInOrder.map((a) => renderSlotTile(a, true))}
                </div>
              </>
            )}
            {morning.length > 0 && (
              <>
                <h3 className="wizard-slot-group">Morning drop-offs</h3>
                <div className="flex flex-col gap-2">
                  {morning.map((a) => renderSlotTile(a))}
                </div>
              </>
            )}
            {afternoon.length > 0 && (
              <>
                <h3 className="wizard-slot-group">Afternoon drop-offs</h3>
                <div className="flex flex-col gap-2">
                  {afternoon.map((a) => renderSlotTile(a))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      <div className="wizard-actions">
        <button type="button" className="wizard-btn wizard-btn--back" onClick={onBack}>
          Back
        </button>
        <button
          type="button"
          className="wizard-btn wizard-btn--primary"
          onClick={onNext}
          disabled={!selectedDropOff}
        >
          Continue
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      </div>
    </>
  );
}
