import { getServicePriceLabel } from "../../../engine/bookingRules";
import { getAllowedServicesForSize } from "../../../engine/bookingRules";
import type { WizardDog, ServiceId } from "../../../types/index";
import { ArrowRight, Sparkles } from "lucide-react";
import { WizardTick } from "./WizardTick";
import { ServiceMascot } from "../../ui/ServiceMascot.jsx";

interface ServiceSelectionProps {
  selectedDogs: WizardDog[];
  services: Record<string, ServiceId>;
  onSelect: (dogId: string, serviceId: ServiceId) => void;
  onNext: () => void;
  onBack: () => void;
}

const SERVICE_DESCRIPTIONS: Record<string, string> = {
  "full-groom": "Bath, dry, and full clip to breed standard",
  "bath-and-brush": "Bath, blow-dry, and a thorough brush-out",
  "bath-and-deshed": "Bath, blow-dry, and de-shedding treatment",
  "puppy-groom": "A gentle introduction to grooming for pups under 6 months",
};

function getPriceLabel(serviceId: string, size: string): string {
  return getServicePriceLabel(serviceId, size);
}

export function ServiceSelection({
  selectedDogs,
  services,
  onSelect,
  onNext,
  onBack,
}: ServiceSelectionProps) {
  const allServiced = selectedDogs.every((d) => !!services[d.dogId]);

  const sizes = [...new Set(selectedDogs.map((d) => d.size))];
  const allSameSize = sizes.length === 1 && selectedDogs.length > 1;
  const commonSize = allSameSize ? sizes[0] : null;
  const allowedForCommon = commonSize ? getAllowedServicesForSize(commonSize) : [];

  const applyToAll = (serviceId: ServiceId) => {
    selectedDogs.forEach((dog) => onSelect(dog.dogId, serviceId));
  };

  return (
    <>
      <p className="wizard-helper">
        Choose a service for each pup. Prices shown are starting prices &mdash; the final cost depends on coat condition and any extras.
      </p>

      {allSameSize && allowedForCommon.length > 0 && (
        <div className="wizard-card wizard-card--mint">
          <div className="flex items-start gap-2">
            <Sparkles size={16} aria-hidden="true" style={{ color: "#0F6B3A", marginTop: 2, flexShrink: 0 }} />
            <span className="text-body font-semibold" style={{ color: "#0F6B3A" }}>
              Same service for all pups? Tap to apply to everyone.
            </span>
          </div>
          <div className="flex gap-2 flex-wrap mt-2.5">
            {allowedForCommon.map((svc) => (
              <button
                key={svc.id}
                type="button"
                onClick={() => applyToAll(svc.id as ServiceId)}
                className="portal-btn portal-btn--secondary portal-btn--small"
              >
                {svc.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedDogs.map((dog) => {
        const allowed = getAllowedServicesForSize(dog.size);
        return (
          <div key={dog.dogId} className="wizard-card">
            <div className="font-display text-[15px] font-bold text-[var(--color-ink)] mb-2.5">
              {dog.name}
            </div>
            <div className="flex flex-col gap-2">
              {allowed.map((svc) => {
                const selected = services[dog.dogId] === svc.id;
                return (
                  <button
                    key={svc.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onSelect(dog.dogId, svc.id as ServiceId)}
                    className={`wizard-option wizard-service-tile${selected ? " is-selected" : ""}`}
                  >
                    {/* The flyer's mascot for this service (decorative; the name sits beside it). */}
                    <ServiceMascot serviceId={svc.id} size={52} />
                    <div className="wizard-service-body">
                      <span className="font-display text-[15px] font-bold">{svc.name}</span>
                      {SERVICE_DESCRIPTIONS[svc.id] && (
                        <span className="text-xs text-[var(--color-ink-muted)]">{SERVICE_DESCRIPTIONS[svc.id]}</span>
                      )}
                      <span className="price text-body">From {getPriceLabel(svc.id, dog.size)}</span>
                    </div>
                    <WizardTick selected={selected} />
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="wizard-actions">
        <button type="button" className="wizard-btn wizard-btn--back" onClick={onBack}>
          Back
        </button>
        <button
          type="button"
          className="wizard-btn wizard-btn--primary"
          onClick={onNext}
          disabled={!allServiced}
        >
          Continue
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      </div>
    </>
  );
}
