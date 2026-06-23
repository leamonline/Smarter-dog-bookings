import { SERVICES, PRICING } from "../../../constants/index";
import type { WizardDog, ServiceId, SlotAllocation } from "../../../types/index";
import type { CustomerDog } from "../../../supabase/repositories/dogsRepo";
import { PawPrint } from "lucide-react";

interface BookingConfirmationProps {
  selectedDogs: WizardDog[];
  services: Record<string, ServiceId>;
  selectedDate: string | null;
  slotAllocation: SlotAllocation | null;
  onConfirm: () => void;
  onBack: () => void;
  submitting: boolean;
  dogs: CustomerDog[];
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
  const allServices = SERVICES as Array<{ id: string; name: string }>;
  return allServices.find((s) => s.id === serviceId)?.name || serviceId;
}

function getPriceLabel(serviceId: string, size: string): string {
  const pricing = PRICING as Record<string, Record<string, string>>;
  return pricing?.[serviceId]?.[size] || "";
}

function priceNumber(serviceId: string, size: string): number {
  const label = getPriceLabel(serviceId, size);
  const m = label.match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
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
  const total = selectedDogs.reduce((sum, dog) => {
    const serviceId = services[dog.dogId];
    if (!serviceId) return sum;
    const size = dogMap[dog.dogId]?.size || dog.size;
    return sum + priceNumber(serviceId, size);
  }, 0);

  return (
    <>
      <p className="wizard-helper">
        One last check before we book it in.
      </p>

      <div className="wizard-card wizard-confirm-polaroid">
        <div className="portal-detail-row">
          <span className="portal-detail-label">When</span>
          <span className="portal-detail-value">
            {selectedDate ? formatDate(selectedDate) : "—"}
            {slotAllocation && (
              <>
                {" "}at <strong>{formatSlot(slotAllocation.dropOffTime)}</strong>
              </>
            )}
          </span>
        </div>

        {selectedDogs.map((dog) => {
          const serviceId = services[dog.dogId];
          const rawDog = dogMap[dog.dogId];
          const size = rawDog?.size || dog.size;
          const slotForDog = slotAllocation?.assignments.find((a) => a.dogId === dog.dogId)?.slot;
          const sizeLabel = size ? `${size.charAt(0).toUpperCase()}${size.slice(1)}` : "—";
          return (
            <div key={dog.dogId} className="portal-detail-row" style={{ alignItems: "flex-start" }}>
              <span className="portal-detail-label">{dog.name}</span>
              <span className="portal-detail-value">
                {serviceId ? getServiceLabel(serviceId) : "—"}
                {serviceId && size && (
                  <>
                    {" · "}
                    {getPriceLabel(serviceId, size)}
                  </>
                )}
                <div className="text-[12px] font-medium text-[var(--sd-ink-light)] mt-0.5">
                  {rawDog?.breed || "—"}
                  {" · "}
                  {sizeLabel}
                  {slotForDog && slotAllocation && slotForDog !== slotAllocation.dropOffTime && (
                    <>
                      {" · slot "}
                      {formatSlot(slotForDog)}
                    </>
                  )}
                </div>
              </span>
            </div>
          );
        })}

        {total > 0 && (
          <div className="portal-detail-row">
            <span className="portal-detail-label">Total</span>
            <span className="portal-detail-value">From {"£"}{total} (paid at pick-up)</span>
          </div>
        )}
      </div>

      <p className="text-[12px] text-[var(--sd-ink-light)] inline-flex items-center gap-1.5 justify-center text-center" style={{ alignSelf: "center" }}>
        <PawPrint size={12} aria-hidden="true" />
        Need to cancel? You can do that from your dashboard up until the day before.
      </p>

      <div className="wizard-actions">
        <button
          type="button"
          className="wizard-btn wizard-btn--back"
          onClick={onBack}
          disabled={submitting}
        >
          Back
        </button>
        <button
          type="button"
          className="wizard-btn wizard-btn--confirm"
          onClick={onConfirm}
          disabled={submitting}
        >
          {submitting ? "Booking…" : `Confirm booking${selectedDogs.length > 1 ? "s" : ""}`}
        </button>
      </div>
    </>
  );
}
