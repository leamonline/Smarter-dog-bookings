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
}) {
  const currentService = isEditing ? editData.service : booking.service;
  const serviceObj = SERVICES.find((s) => s.id === currentService);
  const ageYo = dogData?.age ? dogData.age.replace(" yrs", "yo") : "";
  const sizeTheme = SIZE_THEME[booking.size] || SIZE_FALLBACK;
  const gradient = `linear-gradient(135deg, ${sizeTheme.gradient[0]}, ${sizeTheme.gradient[1]})`;

  return (
    <div
      className="px-6 py-5 rounded-t-2xl flex justify-between items-start"
      style={{ background: gradient }}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <SizeTag size={booking.size} headerMode />
        <div className="min-w-0">
          <div
            className="text-xl font-extrabold whitespace-nowrap overflow-hidden text-ellipsis"
            style={{ color: sizeTheme.headerText }}
          >
            {titleCase(booking.dogName)}
            {ageYo && (
              <span className="font-medium text-sm opacity-80 ml-1.5">
                {ageYo}
              </span>
            )}
          </div>
          <div
            className="text-[13px] mt-0.5"
            style={{ color: sizeTheme.headerTextSub }}
          >
            {titleCase(booking.breed)}
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
            <div
              className="text-[13px] mt-0.5"
              style={{ color: sizeTheme.headerTextSub }}
            >
              {serviceObj?.icon} {serviceObj?.name}
            </div>
          )}
        </div>
      </div>
      <button
        onClick={onClose}
        className="bg-white/20 border-none rounded-lg w-7 h-7 flex items-center justify-center cursor-pointer text-sm font-bold shrink-0"
        style={{ color: sizeTheme.headerText }}
      >
        {"\u00D7"}
      </button>
    </div>
  );
}
