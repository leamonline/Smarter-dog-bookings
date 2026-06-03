import { SERVICES, getStatusDisplay } from "../../../constants/index.js";
import {
  getNumericPrice,
  getServicePriceLabel,
  resolveBookingDisplay,
} from "../../../engine/bookingRules.js";
import { IconEdit, IconCamera } from "../../icons/index.jsx";
import { titleCase } from "../../../utils/text.js";
import { IconBtn } from "./shared.jsx";

export function BookingHeader({
  booking,
  dogData,
  dogs,
  humans,
  isEditing,
  editData,
  setEditData,
  setSaveError,
  allowedServices,
  pricing,
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

  // The booking's status colour — the same map the dashboard card uses, so the
  // header colour-matches the card it was opened from.
  const statusObj = getStatusDisplay(booking.status || "Booked");

  // Use the shared selector so the modal header can never disagree with
  // the grid card on dog/breed/owner. resolveBookingDisplay prefers the
  // live join and falls back to bookings.breed_snapshot when the dog
  // row is missing.
  const display = resolveBookingDisplay(booking, dogs, humans);

  const subtitle = [
    titleCase(display.breed),
    ageYo,
  ].filter(Boolean).join(" · ");

  // Price echoed top-right, mirroring the dashboard card exactly: a "Paid"
  // badge when settled, otherwise the amount still due (with a "dep." marker
  // when a deposit has been taken).
  const renderPrice = () => {
    if (!pricing) return null;
    if (pricing.isPaidInFull) {
      return (
        <span
          className="text-[12px] font-bold text-brand-green-700 bg-brand-green-50 border border-brand-green-200 px-1.5 py-0.5 rounded-md whitespace-nowrap"
          title={`Paid in full (£${pricing.subtotal})`}
        >
          Paid
        </span>
      );
    }
    if (pricing.subtotal > 0) {
      return (
        <span
          className="text-[13px] font-bold text-slate-500 tabular-nums whitespace-nowrap"
          title={pricing.isDepositPaid ? `£${pricing.amountDue} due (deposit of £${pricing.depositPaid} paid)` : undefined}
        >
          {"£"}{pricing.amountDue}
          {pricing.isDepositPaid && (
            <span className="ml-1 text-[10px] font-semibold text-brand-green-600 align-middle">
              dep.
            </span>
          )}
        </span>
      );
    }
    return null;
  };

  return (
    <div
      className="relative px-5 pt-4 pb-5 overflow-hidden"
      style={{ background: statusObj.bg }}
    >
      {/* Icon button strip — sits above the title so the price can take the
          card's top-right slot. */}
      <div className="flex justify-end items-center gap-2 mb-2">
        {!isEditing && onOpenCamera && (
          <IconBtn onClick={onOpenCamera} ariaLabel="Add groom photo">
            <IconCamera size={16} colour="#475569" />
          </IconBtn>
        )}
        {!isEditing && onEnterEdit && (
          <IconBtn onClick={onEnterEdit} ariaLabel="Edit booking">
            <IconEdit size={16} colour="#475569" />
          </IconBtn>
        )}
        <IconBtn onClick={onClose} ariaLabel="Close booking details">
          <span className="text-base font-bold leading-none text-slate-600">{"×"}</span>
        </IconBtn>
      </div>

      {/* Name + price — mirrors the card's first row (plum name, price right). */}
      <div className="flex items-start justify-between gap-3">
        <span
          id={titleId}
          className="text-[22px] md:text-[24px] font-extrabold leading-tight cursor-pointer hover:underline text-brand-purple font-display min-w-0"
          role="button"
          tabIndex={0}
          onClick={() => onOpenDog?.(dogData?.id || booking._dogId || booking.dogName)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenDog?.(dogData?.id || booking._dogId || booking.dogName); } }}
        >
          {titleCase(display.dogMissing ? "Unnamed booking" : display.dogName)}
        </span>
        {!isEditing && <span className="shrink-0 pt-1.5">{renderPrice()}</span>}
      </div>

      {subtitle && (
        <div className="text-[13px] font-medium mt-0.5 text-slate-500">
          {subtitle}
        </div>
      )}

      <div className="mt-3 flex justify-between items-end gap-2">
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
              className="bg-white border border-slate-200 rounded-md px-2.5 py-1.5 text-[13px] font-semibold outline-none cursor-pointer font-inherit text-slate-800"
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
              className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[13px] font-bold bg-white"
              style={{ color: statusObj.color, border: `1px solid ${statusObj.border}` }}
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
                  style={{ background: "var(--color-brand-coral-dark)" }}
                >
                  {alertLabel}
                </span>
              ))}
            {allergyText && (
              <span
                className="text-white py-1 px-2.5 rounded-full text-[10px] font-extrabold whitespace-nowrap shadow-[0_2px_8px_rgba(201,61,99,0.3)]"
                style={{ background: "var(--color-brand-coral-dark)" }}
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
