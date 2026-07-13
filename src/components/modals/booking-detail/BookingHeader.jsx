import { Camera, MessageCircle, Pencil, X } from "lucide-react";
import { SERVICES, BOOKING_STATUS, getStatusDisplay } from "../../../constants/index";
import {
  getServicePriceAmount,
  resolveBookingDisplay,
} from "../../../engine/bookingRules";
import { titleCase } from "../../../utils/text";
import { HeaderIconButton } from "../shell/index.js";
import { alertTint } from "../shell/alertTints.js";

// Quiet shell header for the booking modal — same anatomy as the human
// and dog cards (eyebrow + badge row, display title, subtitle, icon
// cluster). The status colour no longer tints the whole header; it
// lives in the ModalShell accent bar and the status pill here.

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
  primaryHuman,
  onOpenHuman,
  onMessageOwner,
  titleId,
  alerts = [],
  allergyText = "",
}) {
  const currentService = isEditing ? editData.service : booking.service;
  const serviceObj = SERVICES.find((s) => s.id === currentService);
  const ageYo = dogData?.age ? dogData.age.replace(" yrs", "yo") : "";
  // Same size fallback the edit-state seed uses, so a service change here
  // reseeds the price against the right size even if booking.size is blank.
  const sizeForPricing = booking.size || dogData?.size || "small";

  // The booking's status colour — the same map the dashboard card uses,
  // so the pill and accent bar colour-match the card it was opened from.
  const statusObj = getStatusDisplay(booking.status || BOOKING_STATUS.BOOKED);

  // Use the shared selector so the modal header can never disagree with
  // the grid card on dog/breed/owner. resolveBookingDisplay prefers the
  // live join and falls back to bookings.breed_snapshot when the dog
  // row is missing.
  const display = resolveBookingDisplay(booking, dogs, humans);

  const subtitleParts = [titleCase(display.breed), ageYo].filter(Boolean);
  const ownerName = primaryHuman
    ? primaryHuman.fullName ||
      `${primaryHuman.name || ""} ${primaryHuman.surname || ""}`.trim()
    : "";

  const openDog = () =>
    onOpenDog?.(dogData?.id || booking._dogId || booking.dogName);

  // Price echoed beside the title, mirroring the dashboard card. Payment
  // state belongs to the Services & payment card below.
  const renderPrice = () => {
    if (!pricing || pricing.subtotal <= 0) return null;
    return (
      <span className="text-[15px] font-bold text-slate-800 whitespace-nowrap tabular-nums">
        £{pricing.subtotal}
      </span>
    );
  };

  return (
    <header className="flex items-start justify-between gap-3 px-5 max-[400px]:px-3 pt-5 pb-4 bg-[var(--color-brand-paper)]">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-label text-ink-muted">
            Appointment
          </span>
          <span
            className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider"
            style={{ background: statusObj.bg, color: statusObj.color }}
          >
            {statusObj.label}
          </span>
        </div>

        <div className="flex items-start justify-between gap-3 mt-1">
          <h2
            id={titleId}
            className="text-xl md:text-2xl font-bold font-display text-brand-purple leading-tight min-w-0"
          >
            <span
              className="cursor-pointer hover:underline underline-offset-2"
              role="button"
              aria-label={display.dogMissing ? "Open booking details" : `Open ${titleCase(display.dogName)}'s profile`}
              tabIndex={0}
              onClick={openDog}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openDog();
                }
              }}
            >
              {titleCase(display.dogMissing ? "Unnamed booking" : display.dogName)}
            </span>
            {!isEditing && serviceObj?.name && (
              <span>
                {" · "}
                <span className="whitespace-nowrap">{serviceObj.name}</span>
              </span>
            )}
          </h2>
          {!isEditing && <span className="shrink-0 pt-1">{renderPrice()}</span>}
        </div>

        {(subtitleParts.length > 0 || ownerName) && (
          <div className="text-[13px] text-slate-500 font-semibold mt-1.5 min-w-0">
            {subtitleParts.join(" · ")}
            {ownerName && (
              <>
                {subtitleParts.length > 0 && " · "}
                {onOpenHuman ? (
                  <button
                    type="button"
                    onClick={() => onOpenHuman(primaryHuman.id || ownerName)}
                    className="text-brand-teal-text font-semibold bg-transparent border-none p-0 cursor-pointer font-inherit text-[13px] hover:underline underline-offset-2"
                  >
                    {titleCase(ownerName)}
                  </button>
                ) : (
                  titleCase(ownerName)
                )}
                {onMessageOwner && primaryHuman?.id && (
                  <>
                    {" · "}
                    <button
                      type="button"
                      onClick={() => onMessageOwner(primaryHuman.id)}
                      aria-label={`Message ${titleCase(ownerName)}`}
                      className="inline-flex items-center gap-1 text-brand-whatsapp-dark font-semibold bg-transparent border-none p-0 cursor-pointer font-inherit text-[13px] hover:underline underline-offset-2"
                    >
                      <MessageCircle size={13} strokeWidth={2.4} aria-hidden="true" />
                      Message
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {isEditing && (
          <select
            value={editData.service}
            aria-label="Service"
            onChange={(e) => {
              setEditData((prev) => ({
                ...prev,
                service: e.target.value,
                // Reseed with the dog's usual price (>0 only), else the
                // guide rate for the newly chosen service.
                price:
                  dogData?.customPrice != null && Number(dogData.customPrice) > 0
                    ? Number(dogData.customPrice)
                    : getServicePriceAmount(e.target.value, sizeForPricing),
              }));
              setSaveError("");
            }}
            className="mt-2 bg-white border border-slate-200 rounded-md px-2.5 py-1.5 text-[13px] font-semibold outline-none cursor-pointer font-inherit text-slate-800 focus:border-brand-teal focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-1"
          >
            {allowedServices.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name}
              </option>
            ))}
          </select>
        )}

        {!isEditing && (alerts.length > 0 || allergyText) && (
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {alerts
              .filter((a) => !a.startsWith("Allergic to "))
              .map((alertLabel) => (
                <span
                  key={alertLabel}
                  className={`py-1 px-2.5 rounded-full text-[10px] font-extrabold whitespace-nowrap ${alertTint(alertLabel)}`}
                >
                  {alertLabel}
                </span>
              ))}
            {allergyText && (
              <span className="py-1 px-2.5 rounded-full text-[10px] font-extrabold whitespace-nowrap bg-rose-50 text-[#B83A4F] border border-rose-200">
                Allergic to {allergyText}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {!isEditing && onOpenCamera && (
          <HeaderIconButton label="Add groom photo" onClick={onOpenCamera}>
            <Camera size={15} strokeWidth={2.2} aria-hidden="true" />
          </HeaderIconButton>
        )}
        {!isEditing && onEnterEdit && (
          <HeaderIconButton label="Edit booking" onClick={onEnterEdit}>
            <Pencil size={14} strokeWidth={2.2} aria-hidden="true" />
          </HeaderIconButton>
        )}
        <HeaderIconButton label="Close booking details" onClick={onClose}>
          <X size={16} strokeWidth={2.2} aria-hidden="true" />
        </HeaderIconButton>
      </div>
    </header>
  );
}
