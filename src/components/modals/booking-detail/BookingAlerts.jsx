import { BRAND, ALERT_OPTIONS } from "../../../constants/index.js";
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
      <div style={{ marginTop: 20, marginBottom: 16 }}>
        <div
          style={{
            fontWeight: 800,
            fontSize: 12,
            color: BRAND.coral,
            textTransform: "uppercase",
            letterSpacing: 0.5,
            marginBottom: 12,
            textAlign: "center",
          }}
        >
          Alerts
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            justifyContent: "center",
          }}
        >
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
                style={{
                  background: active ? opt.color : BRAND.white,
                  color: active ? BRAND.white : opt.color,
                  border: `2px solid ${opt.color}`,
                  padding: "8px 14px",
                  borderRadius: 20,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                {opt.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setHasAllergy(!hasAllergy)}
            style={{
              background: hasAllergy ? BRAND.coral : BRAND.white,
              color: hasAllergy ? BRAND.white : BRAND.coral,
              border: `2px solid ${BRAND.coral}`,
              padding: "10px 18px",
              borderRadius: 24,
              fontSize: 14,
              fontWeight: 800,
              cursor: "pointer",
              transition: "all 0.15s",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
            }}
          >
            {"\u26A0\uFE0F"} Allergy {"\u26A0\uFE0F"}
          </button>
        </div>

        {hasAllergy && (
          <div
            style={{
              marginTop: 12,
              width: "100%",
              display: "flex",
              justifyContent: "center",
            }}
          >
            <input
              type="text"
              placeholder="What is the dog allergic to?"
              value={allergyInput}
              onChange={(e) => setAllergyInput(e.target.value)}
              className={MODAL_INPUT_CLS}
              style={{
                textAlign: "center",
                borderColor: BRAND.coral,
                borderWidth: 2,
                padding: "10px",
              }}
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
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 10,
        marginBottom: 16,
        marginTop: 28,
        justifyContent: "center",
        width: "100%",
      }}
    >
      {(dogData.alerts || [])
        .filter((a) => !a.startsWith("Allergic to "))
        .map((alertLabel) => (
          <div
            key={alertLabel}
            style={{
              background: BRAND.coral,
              color: BRAND.white,
              padding: "10px 18px",
              borderRadius: 24,
              fontSize: 14,
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              boxShadow: "0 4px 12px rgba(232,86,127,0.25)",
              textAlign: "center",
            }}
          >
            {"\u26A0\uFE0F"} {alertLabel} {"\u26A0\uFE0F"}
          </div>
        ))}
      {hasAllergy && allergyInput && (
        <div
          style={{
            background: BRAND.coral,
            color: BRAND.white,
            padding: "10px 18px",
            borderRadius: 24,
            fontSize: 14,
            fontWeight: 800,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            boxShadow: "0 4px 12px rgba(232,86,127,0.25)",
            textAlign: "center",
          }}
        >
          {"\u26A0\uFE0F"} Allergic to {allergyInput} {"\u26A0\uFE0F"}
        </div>
      )}
    </div>
  );
}
