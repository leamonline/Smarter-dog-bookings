import { useEffect, useState } from "react";
import { customerSupabase as supabase } from "../../../supabase/customerClient.js";
import { SALON_SLOTS } from "../../../constants/index";
import { findGroupedSlots } from "../../../engine/capacity";
import { allocationIsImmediate } from "../../../engine/immediateBooking";
import { DAY_CAPACITY } from "../../../engine/utilisation";
import { listOnDateForCapacity, listBlockedSeats, listImmediateSlots } from "../../../supabase/repositories/bookingsRepo";
import { toDateStr } from "../../../supabase/transforms";
import type { WizardDog, SlotAllocation } from "../../../types/index";
import { Clock, ArrowRight, PawPrint } from "lucide-react";
import { WizardTick } from "./WizardTick";

interface SlotSelectionProps {
  selectedDogs: WizardDog[];
  selectedDate: string | null;
  slotAllocation: SlotAllocation | null;
  onSelect: (allocation: SlotAllocation) => void;
  onNext: () => void;
  onBack: () => void;
  onJoinWaitlist?: () => void;
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
}: SlotSelectionProps) {
  const [availableSlots, setAvailableSlots] = useState<SlotAllocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedDate || selectedDogs.length === 0) return;

    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        if (!supabase) {
          setAvailableSlots([]);
          return;
        }
        // Full occupancy via the get_slot_occupancy SECURITY DEFINER RPC —
        // the per-customer bookings RLS would otherwise hide other
        // customers' bookings and let full slots show as available. Blocked
        // seats (staff overrides) come from get_blocked_seats: day_settings is
        // staff-only, so without this the engine can't see a blocked seat and
        // would offer it. listBlockedSeats degrades to {} on error.
        const [{ bookings, error }, { byDate: blockedByDate }, immediateRes] = await Promise.all([
          listOnDateForCapacity(supabase, selectedDate),
          listBlockedSeats(supabase, selectedDate, selectedDate),
          listImmediateSlots(supabase),
        ]);

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
        let results = findGroupedSlots(
          dogs,
          bookings,
          SALON_SLOTS,
          DAY_CAPACITY,
          blockedByDate[selectedDate] || {},
        );
        // Same-day ("last minute") rule: today's times must sit WHOLLY on
        // staff-flagged slots (get_immediate_slots re-applies the 30-minute
        // cutoff server-side on every call, so a slot silently drops off this
        // list as its cutoff passes). The device-local today check makes the
        // filter fail CLOSED — if the RPC errored, today shows no times
        // rather than times the trigger would reject.
        if (selectedDate === immediateRes.date || selectedDate === toDateStr(new Date())) {
          const flagged = new Set(selectedDate === immediateRes.date ? immediateRes.slots : []);
          results = results.filter((a) => allocationIsImmediate(a, flagged));
        }
        if (!cancelled) setAvailableSlots(results);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [selectedDate, selectedDogs]);

  const selectedDropOff = slotAllocation?.dropOffTime ?? null;
  const isToday = selectedDate === toDateStr(new Date());

  const morning = availableSlots.filter((s) => parseInt(s.dropOffTime.split(":")[0], 10) < 12);
  const afternoon = availableSlots.filter((s) => parseInt(s.dropOffTime.split(":")[0], 10) >= 12);

  const renderSlotTile = (allocation: SlotAllocation) => {
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
            <Clock size={16} aria-hidden="true" className="text-[var(--sd-cyan-dark)]" />
            <span className="font-['Quicksand',sans-serif] text-[15px] font-bold">
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
            <div className="skeleton-row skeleton-row--sm" />
            <div className="skeleton-row skeleton-row--sm" />
            <div className="skeleton-row skeleton-row--sm" />
            <div className="skeleton-row skeleton-row--sm" />
            <span className="sr-only">Checking availability…</span>
          </div>
        )}

        {!loading && loadError && (
          <div role="alert" className="portal-alert portal-alert--error">
            {loadError}
          </div>
        )}

        {!loading && !loadError && availableSlots.length === 0 && (
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
                  : "Try a different day, or pop on the waitlist and we'll text you if a slot opens up."}
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

        {!loading && availableSlots.length > 0 && (
          <>
            {morning.length > 0 && (
              <>
                <h3 className="wizard-slot-group">Morning drop-offs</h3>
                <div className="flex flex-col gap-2">
                  {morning.map(renderSlotTile)}
                </div>
              </>
            )}
            {afternoon.length > 0 && (
              <>
                <h3 className="wizard-slot-group">Afternoon drop-offs</h3>
                <div className="flex flex-col gap-2">
                  {afternoon.map(renderSlotTile)}
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
