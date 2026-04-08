import { SERVICES, PRICING } from "../../../constants/index.js";
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

  const sizes = [...new Set(selectedDogs.map((d) => d.size))];
  const allSameSize = sizes.length === 1 && selectedDogs.length > 1;
  const commonSize = allSameSize ? sizes[0] : null;
  const allowedForCommon = commonSize ? getAllowedServicesForSize(commonSize) : [];

  const applyToAll = (serviceId: ServiceId) => {
    selectedDogs.forEach((dog) => onSelect(dog.dogId, serviceId));
  };

  return (
    <div className="flex flex-col gap-5">
      <p className="m-0 text-slate-500 text-sm">
        Choose a service for each dog.
      </p>

      {allSameSize && allowedForCommon.length > 0 && (
        <div className="bg-emerald-50 rounded-lg py-3 px-3.5 flex flex-col gap-2">
          <div className="text-[13px] font-semibold text-brand-teal">
            Same service for all dogs:
          </div>
          <div className="flex gap-2 flex-wrap">
            {allowedForCommon.map((svc) => (
              <button
                key={svc.id}
                onClick={() => applyToAll(svc.id as ServiceId)}
                className="py-1.5 px-3 rounded-md border-2 border-brand-teal bg-white text-brand-teal font-semibold text-[13px] cursor-pointer"
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
          <div key={dog.dogId} className="flex flex-col gap-2">
            <div className="font-semibold text-slate-800 text-[15px]">{dog.name}</div>
            <div className="flex flex-col gap-1.5">
              {allowed.map((svc) => {
                const selected = services[dog.dogId] === svc.id;
                return (
                  <button
                    key={svc.id}
                    onClick={() => onSelect(dog.dogId, svc.id as ServiceId)}
                    className={`flex items-center justify-between py-2.5 px-3.5 rounded-lg border-2 cursor-pointer text-left w-full ${
                      selected
                        ? "border-brand-teal bg-emerald-50"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <span className="text-sm text-slate-800">
                      {svc.icon} {svc.name}
                    </span>
                    <span className={`text-sm font-semibold ${selected ? "text-brand-teal" : "text-slate-500"}`}>
                      {getPriceLabel(svc.id, dog.size)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="flex gap-2.5 mt-2">
        <button
          onClick={onBack}
          className="py-[11px] px-5 rounded-lg border border-slate-200 bg-white text-slate-500 font-semibold text-sm cursor-pointer"
        >
          {"\u2190"} Back
        </button>
        <button
          onClick={onNext}
          disabled={!allServiced}
          className={`flex-1 py-[11px] px-5 rounded-lg border-none font-bold text-[15px] ${
            allServiced
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
