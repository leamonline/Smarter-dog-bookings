import { useEffect, useState } from "react";
import { customerSupabase as supabase } from "../../../supabase/customerClient.js";
import { SALON_SLOTS } from "../../../constants/index.js";
import { findGroupedSlots } from "../../../engine/capacity.js";
import type { WizardDog, SlotAllocation, Booking } from "../../../types/index.js";

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
          _dogId: row.dog_id,
          _ownerId: null,
          _pickupById: row.pickup_by_id || null,
          _bookingDate: row.booking_date,
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

  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-slate-500 text-sm">
        Choose a drop-off time.
      </p>

      {loading && (
        <p className="text-slate-500 text-sm">Checking availability\u2026</p>
      )}

      {!loading && availableSlots.length === 0 && (
        <div role="alert" className="p-4 rounded-lg bg-brand-coral-light text-brand-coral text-sm font-semibold flex flex-col gap-3">
          <div>No availability on this date. Please try another day, or join the waitlist below.</div>
          <button
            onClick={onJoinWaitlist}
            className="self-start py-2.5 px-4 rounded-lg border-none bg-brand-coral text-white font-bold text-[13px] cursor-pointer"
          >
            Join Waitlist for this date
          </button>
          <span className="text-xs text-brand-coral opacity-80">
            We'll let you know if a slot opens up on this date.
          </span>
        </div>
      )}

      {!loading && availableSlots.length > 0 && (
        <div className="flex flex-col gap-2">
          {availableSlots.map((allocation) => {
            const selected = selectedDropOff === allocation.dropOffTime;
            return (
              <button
                key={allocation.dropOffTime}
                onClick={() => onSelect(allocation)}
                className={`flex items-center justify-between py-3 px-4 rounded-lg border-2 cursor-pointer text-left w-full ${
                  selected
                    ? "border-brand-teal bg-emerald-50"
                    : "border-slate-200 bg-white"
                }`}
              >
                <div>
                  <div className="font-bold text-base text-slate-800">
                    {formatSlot(allocation.dropOffTime)}
                  </div>
                  {selectedDogs.length > 1 && (
                    <div className="text-[13px] text-slate-600">
                      Drop off all dogs at this time
                    </div>
                  )}
                </div>
                {selected && (
                  <span className="text-brand-teal text-xl font-bold">{"\u2713"}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex gap-2.5 mt-2">
        <button
          onClick={onBack}
          className="py-[11px] px-5 rounded-lg border border-slate-200 bg-white text-slate-500 font-semibold text-sm cursor-pointer"
        >
          {"\u2190"} Back
        </button>
        <button
          onClick={onNext}
          disabled={!selectedDropOff}
          className={`flex-1 py-[11px] px-5 rounded-lg border-none font-bold text-[15px] ${
            selectedDropOff
              ? "bg-brand-teal text-white cursor-pointer"
              : "bg-slate-200 text-slate-500 cursor-not-allowed"
          }`}
        >
          Next {"\u2192"}
        </button>
      </div>
    </div>
  );
}
