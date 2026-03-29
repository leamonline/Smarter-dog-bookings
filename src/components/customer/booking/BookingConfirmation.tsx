import { BRAND, SERVICES, PRICING } from "../../../constants/index.js";
import type { WizardDog, ServiceId, SlotAllocation } from "../../../types/index.js";

interface RawDog {
  id: string;
  name: string;
  breed: string;
  size: string;
}

interface BookingConfirmationProps {
  selectedDogs: WizardDog[];
  services: Record<string, ServiceId>;
  selectedDate: string | null;
  slotAllocation: SlotAllocation | null;
  onConfirm: () => void;
  onBack: () => void;
  submitting: boolean;
  dogs: RawDog[];
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function formatSlot(slot: string): string {
  const [h, m] = slot.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour}:${m.toString().padStart(2, "0")}${suffix}`;
}

function getServiceLabel(serviceId: ServiceId): string {
  const allServices = SERVICES as Array<{ id: string; name: string; icon: string }>;
  return allServices.find((s) => s.id === serviceId)?.name || serviceId;
}

function getServiceIcon(serviceId: ServiceId): string {
  const allServices = SERVICES as Array<{ id: string; name: string; icon: string }>;
  return allServices.find((s) => s.id === serviceId)?.icon || "";
}

function getPriceLabel(serviceId: string, size: string): string {
  const pricing = PRICING as Record<string, Record<string, string>>;
  return pricing?.[serviceId]?.[size] || "";
}

export function BookingConfirmation({
  selectedDogs,
  services,
  selectedDate,
  slotAllocation,
  onConfirm,
  onBack,
  submitting,
  dogs,
}: BookingConfirmationProps) {
  const dogMap = Object.fromEntries(dogs.map((d) => [d.id, d]));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <p style={{ margin: 0, color: BRAND.textLight, fontSize: 14 }}>
        Please check the details below before confirming.
      </p>

      {/* Date & time summary */}
      <div
        style={{
          background: BRAND.tealLight,
          borderRadius: 10,
          padding: "14px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        <div style={{ fontWeight: 700, color: BRAND.teal, fontSize: 15 }}>
          📅 {selectedDate ? formatDate(selectedDate) : "—"}
        </div>
        <div style={{ color: BRAND.text, fontSize: 14 }}>
          Drop-off: <strong>{slotAllocation ? formatSlot(slotAllocation.dropOffTime) : "—"}</strong>
        </div>
      </div>

      {/* Per-dog summary */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {selectedDogs.map((dog) => {
          const serviceId = services[dog.dogId];
          const rawDog = dogMap[dog.dogId];
          const size = rawDog?.size || dog.size;
          const slotForDog = slotAllocation?.assignments.find((a) => a.dogId === dog.dogId)?.slot;

          return (
            <div
              key={dog.dogId}
              style={{
                border: `1px solid ${BRAND.greyLight}`,
                borderRadius: 8,
                padding: "12px 14px",
                background: BRAND.white,
              }}
            >
              <div style={{ fontWeight: 600, color: BRAND.text, fontSize: 15, marginBottom: 4 }}>
                {dog.name}
              </div>
              <div style={{ fontSize: 13, color: BRAND.textLight }}>
                {rawDog?.breed || "—"} · {size ? size.charAt(0).toUpperCase() + size.slice(1) : "—"}
              </div>
              {serviceId && (
                <div style={{ marginTop: 6, fontSize: 14, color: BRAND.text }}>
                  {getServiceIcon(serviceId)} {getServiceLabel(serviceId)}
                  {size && (
                    <span style={{ marginLeft: 8, color: BRAND.teal, fontWeight: 600 }}>
                      {getPriceLabel(serviceId, size)}
                    </span>
                  )}
                </div>
              )}
              {slotForDog && slotAllocation && slotForDog !== slotAllocation.dropOffTime && (
                <div style={{ fontSize: 12, color: BRAND.textLight, marginTop: 4 }}>
                  Slot: {formatSlot(slotForDog)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <button
          onClick={onBack}
          disabled={submitting}
          style={{
            padding: "11px 20px",
            borderRadius: 8,
            border: `1px solid ${BRAND.greyLight}`,
            background: BRAND.white,
            color: BRAND.grey,
            fontWeight: 600,
            fontSize: 14,
            cursor: submitting ? "not-allowed" : "pointer",
          }}
        >
          ← Back
        </button>
        <button
          onClick={onConfirm}
          disabled={submitting}
          style={{
            flex: 1,
            padding: "11px 20px",
            borderRadius: 8,
            border: "none",
            background: submitting ? BRAND.greyLight : BRAND.teal,
            color: submitting ? BRAND.grey : BRAND.white,
            fontWeight: 700,
            fontSize: 15,
            cursor: submitting ? "not-allowed" : "pointer",
          }}
        >
          {submitting ? "Booking…" : `Confirm Booking${selectedDogs.length > 1 ? "s" : ""}`}
        </button>
      </div>
    </div>
  );
}
