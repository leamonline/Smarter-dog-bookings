import { ALERT_OPTIONS } from "../../../constants/index.js";
import { MODAL_INPUT_CLS } from "./shared.jsx";

export function BookingAlerts({
  isEditing,
  editData,
  setEditData,
  dogData,
  hasAllergy,
  setHasAllergy,
  allergyInput,
  setAllergyInput,
}) {
  if (isEditing) {
    return (
      <div className="mt-5 mb-4">
        <div className="font-extrabold text-xs text-brand-coral uppercase tracking-wide mb-3 text-center">
          Alerts
        </div>
        <div className="flex flex-wrap gap-2.5 justify-center">
          {ALERT_OPTIONS.map((opt) => {
            const active = editData.alerts.includes(opt.label);
            return (
              <button
                key={opt.label}
                type="button"
                onClick={() => {
                  if (active) {
                    setEditData((prev) => ({
                      ...prev,
                      alerts: prev.alerts.filter((a) => a !== opt.label),
                    }));
                  } else {
                    setEditData((prev) => ({
                      ...prev,
                      alerts: [...prev.alerts, opt.label],
                    }));
                  }
                }}
                className="py-2 px-3.5 rounded-[20px] text-[13px] font-bold cursor-pointer transition-all border-2"
                style={{
                  background: active ? opt.color : "white",
                  color: active ? "white" : opt.color,
                  borderColor: opt.color,
                }}
              >
                {opt.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setHasAllergy(!hasAllergy)}
            className={`py-2.5 px-[18px] rounded-3xl text-sm font-extrabold cursor-pointer transition-all border-2 border-brand-coral flex items-center justify-center text-center ${
              hasAllergy ? "bg-brand-coral text-white" : "bg-white text-brand-coral"
            }`}
          >
            {"\u26A0\uFE0F"} Allergy {"\u26A0\uFE0F"}
          </button>
        </div>

        {hasAllergy && (
          <div className="mt-3 w-full flex justify-center">
            <input
              type="text"
              placeholder="What is the dog allergic to?"
              value={allergyInput}
              onChange={(e) => setAllergyInput(e.target.value)}
              className={`${MODAL_INPUT_CLS} text-center !border-brand-coral !border-2 !p-2.5`}
            />
          </div>
        )}
      </div>
    );
  }

  // View mode — only show if there are alerts
  const hasAlerts =
    (dogData.alerts && dogData.alerts.length > 0) ||
    (hasAllergy && allergyInput);
  if (!hasAlerts) return null;

  return (
    <div className="flex flex-wrap gap-2.5 mb-4 mt-7 justify-center w-full">
      {(dogData.alerts || [])
        .filter((a) => !a.startsWith("Allergic to "))
        .map((alertLabel) => (
          <div
            key={alertLabel}
            className="bg-brand-coral text-white py-2.5 px-[18px] rounded-3xl text-sm font-extrabold flex items-center justify-center gap-1.5 shadow-[0_4px_12px_rgba(232,86,127,0.25)] text-center"
          >
            {"\u26A0\uFE0F"} {alertLabel} {"\u26A0\uFE0F"}
          </div>
        ))}
      {hasAllergy && allergyInput && (
        <div className="bg-brand-coral text-white py-2.5 px-[18px] rounded-3xl text-sm font-extrabold flex items-center justify-center gap-1.5 shadow-[0_4px_12px_rgba(232,86,127,0.25)] text-center">
          {"\u26A0\uFE0F"} Allergic to {allergyInput} {"\u26A0\uFE0F"}
        </div>
      )}
    </div>
  );
}
