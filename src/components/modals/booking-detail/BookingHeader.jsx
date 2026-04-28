import { SERVICES } from "../../../constants/index.js";
import {
  getNumericPrice,
  getServicePriceLabel,
} from "../../../engine/bookingRules.js";
import { IconEdit, IconCamera } from "../../icons/index.jsx";
import { titleCase } from "../../../utils/text.js";
import { IconBtn, PawWatermark } from "./shared.jsx";

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
  onOpenCamera,
  titleId,
  alerts = [],
  allergyText = "",
}) {
  const currentService = isEditing ? editData.service : booking.service;
  const serviceObj = SERVICES.find((s) => s.id === currentService);
  const ageYo = dogData?.age ? dogData.age.replace(" yrs", "yo") : "";

  const subtitle = [
    titleCase(booking.breed),
    ageYo,
  ].filter(Boolean).join(" · ");

  return (
    <div className="relative px-6 py-6 rounded-t-2xl bg-gradient-to-br from-amber-300 to-amber-400 overflow-hidden">
      <PawWatermark className="absolute -top-3 -right-2 w-32 h-32 text-white/15 rotate-12" />
      <PawWatermark className="absolute -bottom-4 left-4 w-20 h-20 text-white/10 -rotate-12" />

      <div className="absolute top-5 right-5 flex items-center gap-2 z-10">
        {!isEditing && onOpenCamera && (
          <IconBtn onClick={onOpenCamera} ariaLabel="Add groom photo">
            <IconCamera size={16} colour="#7C2D12" />
          </IconBtn>
        )}
        {!isEditing && onEnterEdit && (
          <IconBtn onClick={onEnterEdit} ariaLabel="Edit booking">
            <IconEdit size={16} colour="#7C2D12" />
          </IconBtn>
        )}
        <IconBtn onClick={onClose} ariaLabel="Close booking details">
          <span className="text-base font-bold leading-none text-amber-900">{"×"}</span>
        </IconBtn>
      </div>

      <span
        id={titleId}
        className="relative z-10 text-[28px] font-extrabold leading-tight cursor-pointer hover:underline text-amber-900 font-display"
        role="button"
        tabIndex={0}
        onClick={() => onOpenDog?.(dogData?.id || booking._dogId || booking.dogName)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenDog?.(dogData?.id || booking._dogId || booking.dogName); } }}
      >
        {titleCase(booking.dogName)}
      </span>

      {subtitle && (
        <div className="relative z-10 text-[14px] font-medium mt-1 text-amber-800/90">
          {subtitle}
        </div>
      )}

      <div className="relative z-10 mt-2.5 flex justify-between items-end gap-2">
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
              className="bg-white/30 border border-white/40 rounded-md px-2.5 py-1.5 text-[13px] font-semibold outline-none cursor-pointer font-inherit text-amber-900"
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
            <span className="relative z-10 inline-flex items-center gap-1 px-3 py-1 rounded-full text-[13px] font-bold bg-white/30 text-amber-900 ring-1 ring-white/40 backdrop-blur-sm">
              {serviceObj?.name}
            </span>
          )}
        </div>

        {!isEditing && (alerts.length > 0 || allergyText) && (
          <div className="relative z-10 flex flex-wrap gap-1 justify-end max-w-[55%]">
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
