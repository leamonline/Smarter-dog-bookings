import { useEffect, useState } from "react";
import { customerSupabase as supabase } from "../../../supabase/customerClient.js";
import { BRAND, SALON_SLOTS } from "../../../constants/index.js";
import { findGroupedSlots } from "../../../engine/capacity.js";
import type { WizardDog, SlotAllocation, Booking } from "../../../types/index.js";

interface SlotSelectionProps {
  selectedDogs: WizardDog[];
  selectedDate: string | null;
  slotAllocation: SlotAllocation | null;
  onSelect: (allocation: SlotAllocation) => void;
  onNext: () => void;
  onBack: () => void;
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
          .select("id, slot, size, dog_name, breed, service, owner, status, addons, pickup_by, payment, confirmed, dog_id, owner_id, pickup_by_id, booking_date")
          .eq("booking_date", selectedDate);

        if (cancelled) return;

        const bookings: Booking[] = (data || []).map((row: any) => ({
          id: row.id,
          slot: row.slot,
          size: row.size,
          dogName: row.dog_name,
          breed: row.breed || "",
          service: row.service,
          owner: row.owner || "",
          status: row.status,
          addons: row.addons || [],
          pickupBy: row.pickup_by || "",
          payment: row.payment || "",
          confirmed: row.confirmed || false,
          _dogId: row.dog_id,
          _ownerId: row.owner_id || null,
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
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <p style={{ margin: 0, color: BRAND.textLight, fontSize: 14 }}>
        Choose a drop-off time.
      </p>

      {loading && (
        <p style={{ color: BRAND.textLight, fontSize: 14 }}>Checking availability…</p>
      )}

      {!loading && availableSlots.length === 0 && (
        <div
          style={{
            padding: "16px",
            borderRadius: 8,
            background: BRAND.coralLight,
            color: BRAND.coral,
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          No availability on this date for your selected dogs. Please try another day.
        </div>
      )}

      {!loading && availableSlots.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {availableSlots.map((allocation) => {
            const selected = selectedDropOff === allocation.dropOffTime;
            return (
              <button
                key={allocation.dropOffTime}
                onClick={() => onSelect(allocation)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 16px",
                  borderRadius: 8,
                  border: selected
                    ? `2px solid ${BRAND.teal}`
                    : `2px solid ${BRAND.greyLight}`,
                  background: selected ? BRAND.tealLight : BRAND.white,
                  cursor: "pointer",
                  textAlign: "left",
                  width: "100%",
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: BRAND.text }}>
                    {formatSlot(allocation.dropOffTime)}
                  </div>
                  <div style={{ fontSize: 13, color: BRAND.textLight }}>
                    Drop off all dogs at this time
                  </div>
                </div>
                {selected && (
                  <span style={{ color: BRAND.teal, fontSize: 20, fontWeight: 700 }}>✓</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <button
          onClick={onBack}
          style={{
            padding: "11px 20px",
            borderRadius: 8,
            border: `1px solid ${BRAND.greyLight}`,
            background: BRAND.white,
            color: BRAND.grey,
            fontWeight: 600,
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          ← Back
        </button>
        <button
          onClick={onNext}
          disabled={!selectedDropOff}
          style={{
            flex: 1,
            padding: "11px 20px",
            borderRadius: 8,
            border: "none",
            background: selectedDropOff ? BRAND.teal : BRAND.greyLight,
            color: selectedDropOff ? BRAND.white : BRAND.grey,
            fontWeight: 700,
            fontSize: 15,
            cursor: selectedDropOff ? "pointer" : "not-allowed",
          }}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
