import { SERVICES, SIZE_THEME, SIZE_FALLBACK } from "../../../constants/index.js";
import {
  getNumericPrice,
  getServicePriceLabel,
} from "../../../engine/bookingRules.js";
import { IconEdit } from "../../icons/index.jsx";
import { titleCase } from "../../../utils/text.js";

export function BookingHeader({
  booking,
  dogData,
  isEditing,
  editData,
  setEditData,
  setSaveError,
  allowedServices,
  onClose,
  onEnterEdit,
  onOpenDog,
  titleId,
  alerts = [],
  allergyText = "",
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
      <div className="absolute top-5 right-5 flex items-center gap-2">
        {!isEditing && onEnterEdit && (
          <button
            onClick={onEnterEdit}
            className="bg-white/20 border-none rounded-lg w-9 h-9 flex items-center justify-center cursor-pointer shrink-0"
            style={{ color: sizeTheme.headerText }}
          >
            <IconEdit size={16} colour={sizeTheme.headerText} />
          </button>
        )}
        <button
          onClick={onClose}
          className="bg-white/20 border-none rounded-lg w-9 h-9 flex items-center justify-center cursor-pointer text-base font-bold shrink-0"
          style={{ color: sizeTheme.headerText }}
        >
          {"\u00D7"}
        </button>
      </div>

      <span
        id={titleId}
        className="text-[28px] font-extrabold leading-tight cursor-pointer hover:underline"
        style={{ color: sizeTheme.headerText }}
        role="button"
        tabIndex={0}
        onClick={() => onOpenDog?.(dogData?.id || booking._dogId || booking.dogName)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenDog?.(dogData?.id || booking._dogId || booking.dogName); } }}
      >
        {titleCase(booking.dogName)}
      </span>

      {subtitle && (
        <div
          className="text-[15px] font-medium mt-1"
          style={{ color: sizeTheme.headerTextSub }}
        >
          {subtitle}
        </div>
      )}

      <div className="mt-2.5 flex justify-between items-end gap-2">
        <div>
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
                  {service.name}
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
              {serviceObj?.name}
            </span>
          )}
        </div>

        {!isEditing && (alerts.length > 0 || allergyText) && (
          <div className="flex flex-wrap gap-1 justify-end max-w-[55%]">
            {alerts
              .filter((a) => !a.startsWith("Allergic to "))
              .map((alertLabel) => (
                <span
                  key={alertLabel}
                  className="text-white py-1 px-2.5 rounded-full text-[10px] font-extrabold whitespace-nowrap shadow-[0_2px_8px_rgba(201,61,99,0.3)]"
                  style={{ background: "#C93D63" }}
                >
                  {alertLabel}
                </span>
              ))}
            {allergyText && (
              <span
                className="text-white py-1 px-2.5 rounded-full text-[10px] font-extrabold whitespace-nowrap shadow-[0_2px_8px_rgba(201,61,99,0.3)]"
                style={{ background: "#C93D63" }}
              >
                Allergic to {allergyText}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
