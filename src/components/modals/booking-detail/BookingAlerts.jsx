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
            Allergy
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

  // View mode — alerts are now rendered in BookingHeader
  return null;
}
