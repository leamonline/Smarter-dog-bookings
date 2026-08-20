import { SERVICES, DEPOSIT_PER_DOG_PENCE } from "../../../constants/index";
import { getServicePriceLabel, getServicePriceAmount } from "../../../engine/bookingRules";
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
  approvalRequired?: boolean;
  /**
   * Total deposit in pounds for this visit (flat per dog), or null when no deposit
   * is due OR when the per-owner rule could not be read. Null renders nothing:
   * the rule fails open, so silence here is not a promise that nothing is owed.
   */
  depositTotal?: number | null;
  /**
   * Staff-configured sentence describing the change deadline, straight from
   * `current_customer_booking_rules()`. Null when cancellation is switched off or
   * the policy could not be read — in both cases no promise is displayed.
   */
  changeDeadlineNote?: string | null;
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
  const label = getServicePriceLabel(serviceId, size);
  return label === "N/A" ? "" : label;
}

function priceNumber(serviceId: string, size: string): number {
  return getServicePriceAmount(serviceId, size);
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
  approvalRequired = false,
  depositTotal = null,
  changeDeadlineNote = null,
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
        {approvalRequired
          ? "One last check before we send your preferred time to the team."
          : "One last check before we book it in."}
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
            <span className="portal-detail-value">
              From {"£"}{total}
              {depositTotal == null ? " (paid at pick-up)" : ""}
            </span>
          </div>
        )}

        {/* A deposit changes what confirming means — the appointment is HELD, not
            booked outright — so it belongs beside the total, before the commit,
            rather than only on the success screen after it. */}
        {depositTotal != null && (
          <div className="portal-detail-row">
            <span className="portal-detail-label">Deposit</span>
            <span className="portal-detail-value">
              <strong>{"£"}{depositTotal}</strong> to hold this appointment
              <div className="text-[12px] font-medium text-[var(--sd-ink-light)] mt-0.5">
                {selectedDogs.length > 1
                  ? `£${DEPOSIT_PER_DOG_PENCE / 100} per pup · the rest is paid at pick-up`
                  : "The rest is paid at pick-up"}
              </div>
            </span>
          </div>
        )}
      </div>

      {changeDeadlineNote && (
        <p className="text-[12px] text-[var(--sd-ink-light)] inline-flex items-center gap-1.5 justify-center text-center" style={{ alignSelf: "center" }}>
          <PawPrint size={12} aria-hidden="true" />
          {changeDeadlineNote}
        </p>
      )}

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
          {submitting
            ? approvalRequired
              ? "Sending…"
              : "Booking…"
            : approvalRequired
              ? "Send request"
              : `Confirm booking${selectedDogs.length > 1 ? "s" : ""}`}
        </button>
      </div>
    </>
  );
}
