import { BRAND, SERVICES, PRICING } from "../../../constants/index.js";
import { getAllowedServicesForSize } from "../../../engine/bookingRules.js";
import type { WizardDog, ServiceId } from "../../../types/index.js";

interface ServiceSelectionProps {
  selectedDogs: WizardDog[];
  services: Record<string, ServiceId>;
  onSelect: (dogId: string, serviceId: ServiceId) => void;
  onNext: () => void;
  onBack: () => void;
}

function getPriceLabel(serviceId: string, size: string): string {
  const pricing = PRICING as Record<string, Record<string, string>>;
  return pricing?.[serviceId]?.[size] || "N/A";
}

export function ServiceSelection({
  selectedDogs,
  services,
  onSelect,
  onNext,
  onBack,
}: ServiceSelectionProps) {
  const allServiced = selectedDogs.every((d) => !!services[d.dogId]);

  // Check if all dogs are the same size for shortcut buttons
  const sizes = [...new Set(selectedDogs.map((d) => d.size))];
  const allSameSize = sizes.length === 1 && selectedDogs.length > 1;
  const commonSize = allSameSize ? sizes[0] : null;
  const allowedForCommon = commonSize ? getAllowedServicesForSize(commonSize) : [];

  const applyToAll = (serviceId: ServiceId) => {
    selectedDogs.forEach((dog) => onSelect(dog.dogId, serviceId));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <p style={{ margin: 0, color: BRAND.textLight, fontSize: 14 }}>
        Choose a service for each dog.
      </p>

      {allSameSize && allowedForCommon.length > 0 && (
        <div
          style={{
            background: BRAND.tealLight,
            borderRadius: 8,
            padding: "12px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: BRAND.teal }}>
            Same service for all dogs:
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {allowedForCommon.map((svc) => (
              <button
                key={svc.id}
                onClick={() => applyToAll(svc.id as ServiceId)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 6,
                  border: `2px solid ${BRAND.teal}`,
                  background: BRAND.white,
                  color: BRAND.teal,
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                {svc.icon} {svc.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedDogs.map((dog) => {
        const allowed = getAllowedServicesForSize(dog.size);
        return (
          <div key={dog.dogId} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontWeight: 600, color: BRAND.text, fontSize: 15 }}>{dog.name}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {allowed.map((svc) => {
                const selected = services[dog.dogId] === svc.id;
                return (
                  <button
                    key={svc.id}
                    onClick={() => onSelect(dog.dogId, svc.id as ServiceId)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 14px",
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
                    <span style={{ fontSize: 14, color: BRAND.text }}>
                      {svc.icon} {svc.name}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: selected ? BRAND.teal : BRAND.textLight }}>
                      {getPriceLabel(svc.id, dog.size)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

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
          disabled={!allServiced}
          style={{
            flex: 1,
            padding: "11px 20px",
            borderRadius: 8,
            border: "none",
            background: allServiced ? BRAND.teal : BRAND.greyLight,
            color: allServiced ? BRAND.white : BRAND.grey,
            fontWeight: 700,
            fontSize: 15,
            cursor: allServiced ? "pointer" : "not-allowed",
          }}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
