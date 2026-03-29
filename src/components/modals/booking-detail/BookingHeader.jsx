import { BRAND, SERVICES } from "../../../constants/index.js";
import {
  getNumericPrice,
  getServicePriceLabel,
} from "../../../engine/bookingRules.js";
import { SizeTag } from "../../ui/SizeTag.jsx";

export function BookingHeader({
  booking,
  dogData,
  isEditing,
  editData,
  setEditData,
  setSaveError,
  allowedServices,
  onClose,
}) {
  const currentService = isEditing ? editData.service : booking.service;
  const serviceObj = SERVICES.find((s) => s.id === currentService);
  const ageYo = dogData?.age ? dogData.age.replace(" yrs", "yo") : "";

  return (
    <div
      style={{
        background: `linear-gradient(135deg, ${BRAND.blue}, ${BRAND.blueDark})`,
        padding: "20px 24px",
        borderRadius: "16px 16px 0 0",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flex: 1,
          minWidth: 0,
        }}
      >
        <SizeTag size={booking.size} headerMode />
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 20,
              fontWeight: 800,
              color: BRAND.white,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {booking.dogName}
            {ageYo && (
              <span
                style={{
                  fontWeight: 500,
                  fontSize: 14,
                  opacity: 0.8,
                  marginLeft: 6,
                }}
              >
                {ageYo}
              </span>
            )}
          </div>
          <div
            style={{
              fontSize: 13,
              color: "rgba(255,255,255,0.8)",
              marginTop: 2,
            }}
          >
            {booking.breed}
          </div>
          {isEditing ? (
            <select
              value={editData.service}
              onChange={(e) => {
                setEditData((prev) => ({
                  ...prev,
                  service: e.target.value,
                  customPrice:
                    dogData?.customPrice !== undefined
                      ? dogData.customPrice
                      : getNumericPrice(
                          getServicePriceLabel(e.target.value, booking.size),
                        ),
                }));
                setSaveError("");
              }}
              style={{
                background: "rgba(255,255,255,0.2)",
                color: BRAND.white,
                border: "1px solid rgba(255,255,255,0.3)",
                borderRadius: 6,
                padding: "6px 10px",
                fontSize: 13,
                fontWeight: 600,
                outline: "none",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {allowedServices.map((service) => (
                <option
                  key={service.id}
                  value={service.id}
                  style={{ color: BRAND.text }}
                >
                  {service.icon} {service.name}
                </option>
              ))}
            </select>
          ) : (
            <div
              style={{
                fontSize: 13,
                color: "rgba(255,255,255,0.8)",
                marginTop: 2,
              }}
            >
              {serviceObj?.icon} {serviceObj?.name}
            </div>
          )}
        </div>
      </div>
      <button
        onClick={onClose}
        style={{
          background: "rgba(255,255,255,0.2)",
          border: "none",
          borderRadius: 8,
          width: 28,
          height: 28,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          fontSize: 14,
          color: BRAND.white,
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {"\u00D7"}
      </button>
    </div>
  );
}
