import { SERVICES } from "../../../constants/index";
import { getServicePriceLabel, getServicePriceAmount } from "../../../engine/bookingRules";
import { ScribbleUnderline } from "../../ui/ScribbleUnderline.jsx";
import { titleCase } from "../../../utils/text";
import type { WizardDog, ServiceId, SlotAllocation } from "../../../types/index";
import type { CustomerDog } from "../../../supabase/repositories/dogsRepo";

interface BookingSummarySidebarProps {
  selectedDogs: WizardDog[];
  services: Record<string, ServiceId>;
  selectedDate: string | null;
  slotAllocation: SlotAllocation | null;
  dogs: CustomerDog[];
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
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

/**
 * Desktop-only (see .booking-wizard-summary) sticky "your booking so far"
 * panel — fills in live as the customer moves through steps 1-5, so the
 * reclaimed desktop width does something useful instead of just stretching
 * the flow. Always rendered; CSS hides it below the two-column breakpoint.
 */
export function BookingSummarySidebar({
  selectedDogs,
  services,
  selectedDate,
  slotAllocation,
  dogs,
}: BookingSummarySidebarProps) {
  const dogMap = Object.fromEntries(dogs.map((d) => [d.id, d]));
  const total = selectedDogs.reduce((sum, dog) => {
    const serviceId = services[dog.dogId];
    if (!serviceId) return sum;
    const size = dogMap[dog.dogId]?.size || dog.size;
    return sum + getServicePriceAmount(serviceId, size);
  }, 0);

  return (
    <aside className="booking-wizard-summary" aria-label="Your booking so far">
      <div className="wizard-card wizard-summary-card">
        <h2 className="wizard-summary-title">
          Your booking so far
          <ScribbleUnderline color="var(--sd-yellow)" />
        </h2>

        {selectedDogs.length === 0 ? (
          <p className="wizard-summary-empty">
            Pick a pup to get started — we&apos;ll fill this in as you go.
          </p>
        ) : (
          <ul className="wizard-summary-list">
            {selectedDogs.map((dog) => {
              const serviceId = services[dog.dogId];
              const rawDog = dogMap[dog.dogId];
              const size = rawDog?.size || dog.size;
              return (
                <li key={dog.dogId} className="wizard-summary-dog">
                  <span className="wizard-summary-dog-name">{titleCase(dog.name)}</span>
                  <span className="wizard-summary-dog-meta">
                    {serviceId ? getServiceLabel(serviceId) : "Choose a service"}
                    {serviceId && size && ` · ${getServicePriceLabel(serviceId, size)}`}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        {selectedDogs.length > 0 && (
          <>
            <div className="wizard-summary-divider" />
            <dl className="wizard-summary-meta">
              <div>
                <dt>Date</dt>
                <dd>{selectedDate ? formatDate(selectedDate) : "Not chosen yet"}</dd>
              </div>
              <div>
                <dt>Drop-off</dt>
                <dd>{slotAllocation ? formatSlot(slotAllocation.dropOffTime) : "Not chosen yet"}</dd>
              </div>
            </dl>
          </>
        )}

        {total > 0 && (
          <div className="wizard-summary-total">
            <span>Estimated total</span>
            <strong>From £{total}</strong>
          </div>
        )}
      </div>
    </aside>
  );
}
