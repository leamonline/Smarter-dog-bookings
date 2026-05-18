import { useEffect, useState } from "react";
import { customerSupabase as supabase } from "../../../supabase/customerClient.js";
import { SALON_SLOTS } from "../../../constants/index.js";
import { findGroupedSlots } from "../../../engine/capacity.js";
import type { WizardDog, SlotAllocation, Booking } from "../../../types/index.js";
import { Clock, ArrowRight, PawPrint } from "lucide-react";

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

  useEffect(() => {
    if (!selectedDate || selectedDogs.length === 0) return;

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        if (!supabase) {
          setAvailableSlots([]);
          return;
        }
        const { data } = await supabase
          .from("bookings")
          .select("id, slot, size, service, status, addons, payment, confirmed, dog_id, pickup_by_id, booking_date")
          .eq("booking_date", selectedDate);

        if (cancelled) return;

        const bookings: Booking[] = (data || []).map((row: any) => ({
          id: row.id,
          slot: row.slot,
          size: row.size,
          dogName: "",
          breed: "",
          service: row.service,
          owner: "",
          status: row.status,
          addons: row.addons || [],
          pickupBy: "",
          payment: row.payment || "",
          confirmed: row.confirmed || false,
          dogNameSnapshot: null,
          breedSnapshot: null,
          ownerNameSnapshot: null,
          whatsappConversationId: null,
          whatsappMessageId: null,
          staffCapacityOverride: false,
          staffCapacityOverrideBy: null,
          staffCapacityOverrideAt: null,
          _dogId: row.dog_id,
          _ownerId: null,
          _pickupById: row.pickup_by_id || null,
          _bookingDate: row.booking_date,
          _groupId: row.group_id || null,
        }));

        const dogs = selectedDogs.map((d) => ({ id: d.dogId, size: d.size }));
        const results = findGroupedSlots(dogs, bookings, SALON_SLOTS);
        if (!cancelled) setAvailableSlots(results);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [selectedDate, selectedDogs]);

  const selectedDropOff = slotAllocation?.dropOffTime ?? null;

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
        <span className="inline-flex items-center gap-2">
          <Clock size={16} aria-hidden="true" className="text-[var(--sd-cyan-dark)]" />
          <span className="font-['Quicksand',sans-serif] text-[15px] font-bold">
            {formatSlot(allocation.dropOffTime)}
          </span>
        </span>
        {selectedDogs.length > 1 && (
          <span className="text-[12px] text-[var(--sd-ink-light)]">Drop all pups together</span>
        )}
      </button>
    );
  };

  return (
    <>
      <p className="wizard-helper">
        Choose a drop-off time.
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

        {!loading && availableSlots.length === 0 && (
          <div className="wizard-empty-slots" style={{ background: "var(--sd-coral-tint)", borderRadius: "var(--radius-sd-card)", padding: 20 }}>
            <div className="portal-polaroid">
              <div className="portal-polaroid-frame">
                <div className="portal-polaroid-photo">
                  <PawPrint size={36} aria-hidden="true" />
                </div>
              </div>
              <h3 className="portal-empty-title" style={{ fontSize: 16, marginTop: 4 }}>
                Fully booked on {formatDateLabel(selectedDate)}
              </h3>
              <p className="portal-empty-body">
                Try a different day, or pop on the waitlist and we&apos;ll text you if a slot opens up.
              </p>
              {onJoinWaitlist && (
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
