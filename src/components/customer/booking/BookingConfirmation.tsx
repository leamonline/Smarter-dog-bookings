import { SERVICES, PRICING } from "../../../constants/index.js";
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
  const allServices = SERVICES as Array<{ id: string; name: string }>;
  return allServices.find((s) => s.id === serviceId)?.name || serviceId;
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
    <div className="flex flex-col gap-5">
      <p className="m-0 text-slate-500 text-sm">
        Please check the details below before confirming.
      </p>

      {/* Date & time summary */}
      <div className="bg-cyan-50 rounded-[10px] py-3.5 px-4 flex flex-col gap-1">
        <div className="font-bold text-brand-cyan-dark text-[15px]">
          {selectedDate ? formatDate(selectedDate) : "\u2014"}
        </div>
        <div className="text-slate-800 text-sm">
          Drop-off: <strong>{slotAllocation ? formatSlot(slotAllocation.dropOffTime) : "\u2014"}</strong>
        </div>
      </div>

      {/* Per-dog summary */}
      <div className="flex flex-col gap-2">
        {selectedDogs.map((dog) => {
          const serviceId = services[dog.dogId];
          const rawDog = dogMap[dog.dogId];
          const size = rawDog?.size || dog.size;
          const slotForDog = slotAllocation?.assignments.find((a) => a.dogId === dog.dogId)?.slot;

          return (
            <div
              key={dog.dogId}
              className="border border-slate-200 rounded-lg py-3 px-3.5 bg-white"
            >
              <div className="font-semibold text-slate-800 text-[15px] mb-1">
                {dog.name}
              </div>
              <div className="text-[13px] text-slate-600">
                {rawDog?.breed || "\u2014"} · {size ? size.charAt(0).toUpperCase() + size.slice(1) : "\u2014"}
              </div>
              {serviceId && (
                <div className="mt-1.5 text-sm text-slate-800">
                  {getServiceLabel(serviceId)}
                  {size && (
                    <span className="ml-2 text-brand-cyan-dark font-semibold">
                      {getPriceLabel(serviceId, size)}
                    </span>
                  )}
                </div>
              )}
              {slotForDog && slotAllocation && slotForDog !== slotAllocation.dropOffTime && (
                <div className="text-xs text-slate-500 mt-1">
                  Slot: {formatSlot(slotForDog)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-slate-500 leading-relaxed mt-1 m-0">
        Need to cancel? Please give us at least 24 hours' notice so we can offer the slot to another pup. You can cancel from your dashboard or contact the salon directly.
      </p>

      <div className="flex gap-2.5">
        <button
          onClick={onBack}
          disabled={submitting}
          className={`py-[11px] px-5 rounded-lg border border-slate-200 bg-white text-slate-500 font-semibold text-sm ${
            submitting ? "cursor-not-allowed" : "cursor-pointer"
          }`}
        >
          {"\u2190"} Back
        </button>
        <button
          onClick={onConfirm}
          disabled={submitting}
          className={`flex-1 py-[11px] px-5 rounded-lg border-none font-bold text-[15px] ${
            submitting
              ? "bg-slate-200 text-slate-500 cursor-not-allowed"
              : "bg-brand-yellow text-brand-cyan-dark cursor-pointer"
          }`}
        >
          {submitting ? "Booking\u2026" : `Confirm Booking${selectedDogs.length > 1 ? "s" : ""}`}
        </button>
      </div>
    </div>
  );
}
