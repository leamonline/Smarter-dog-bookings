import { SERVICES, SIZE_THEME, SIZE_FALLBACK } from "../../../constants/index.js";
import {
  getNumericPrice,
  getServicePriceLabel,
} from "../../../engine/bookingRules.js";
import { SizeTag } from "../../ui/SizeTag.jsx";

function titleCase(str) {
  if (!str) return "";
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}


export function BookingHeader({
  booking,
  dogData,
  isEditing,
  editData,
  setEditData,
  setSaveError,
  allowedServices,
  onClose,
  titleId,
}) {
  const currentService = isEditing ? editData.service : booking.service;
  const serviceObj = SERVICES.find((s) => s.id === currentService);
  const ageYo = dogData?.age ? dogData.age.replace(" yrs", "yo") : "";
  const sizeTheme = SIZE_THEME[booking.size] || SIZE_FALLBACK;
  const gradient = `linear-gradient(135deg, ${sizeTheme.gradient[0]}, ${sizeTheme.gradient[1]})`;

  const subtitle = [
    titleCase(booking.breed),
    ageYo,
  ].filter(Boolean).join(" · ");

  return (
    <div
      className="px-6 py-6 rounded-t-2xl relative"
      style={{ background: gradient }}
    >
      <button
        onClick={onClose}
        className="absolute top-5 right-5 bg-white/20 border-none rounded-lg w-9 h-9 flex items-center justify-center cursor-pointer text-base font-bold shrink-0"
        style={{ color: sizeTheme.headerText }}
      >
        {"\u00D7"}
      </button>

      <div
        id={titleId}
        className="text-[28px] font-extrabold leading-tight"
        style={{ color: sizeTheme.headerText }}
      >
        {titleCase(booking.dogName)}
      </div>

      {subtitle && (
        <div
          className="text-[15px] font-medium mt-1"
          style={{ color: sizeTheme.headerTextSub }}
        >
          {subtitle}
        </div>
      )}

      <div className="mt-2.5">
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
            className="bg-white/20 border border-white/30 rounded-md px-2.5 py-1.5 text-[13px] font-semibold outline-none cursor-pointer font-inherit"
            style={{ color: sizeTheme.headerText }}
          >
            {allowedServices.map((service) => (
              <option
                key={service.id}
                value={service.id}
                style={{ color: "#1F2937" }}
              >
                {service.icon} {service.name}
              </option>
            ))}
          </select>
        ) : (
          <span
            className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[13px] font-bold"
            style={{
              background: "rgba(255,255,255,0.2)",
              color: sizeTheme.headerText,
            }}
          >
            {serviceObj?.icon} {serviceObj?.name}
          </span>
        )}
      </div>
    </div>
  );
}
