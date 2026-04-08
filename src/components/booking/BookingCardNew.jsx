// src/components/booking/BookingCardNew.jsx
import { useState, lazy, Suspense } from "react";
import { SERVICES } from "../../constants/index.js";
import { useSalon } from "../../contexts/SalonContext.jsx";
import {
  getDogByIdOrName,
  getHumanByIdOrName,
} from "../../engine/bookingRules.js";

const BookingDetailModal = lazy(() =>
  import("../modals/BookingDetailModal.jsx").then((module) => ({
    default: module.BookingDetailModal,
  })),
);

function titleCase(str) {
  if (!str) return "";
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

const SIZE_DOT = {
  small:  { dot: "#F5C518", border: "#D4A500", gradient: "linear-gradient(90deg, #F5C518, #FACC15)", glow: "rgba(245,197,24," },
  medium: { dot: "#2D8B7A", border: "#1E6B5C", gradient: "linear-gradient(90deg, #2D8B7A, #3BA594)", glow: "rgba(45,139,122," },
  large:  { dot: "#E8567F", border: "#C93D63", gradient: "linear-gradient(90deg, #E8567F, #F472B6)", glow: "rgba(232,86,127," },
};

const SIZE_FALLBACK_THEME = { dot: "#00B8E0", border: "#0099BD", gradient: "linear-gradient(90deg, #00B8E0, #38BDF8)", glow: "rgba(14,165,233," };

const STATUS_DISPLAY = {
  "No-show":            { bg: "#FFF8E0", color: "#92400E", label: "No-show" },
  "Checked in":         { bg: "#DCFCE7", color: "#16A34A", label: "Checked in" },
  "Ready for pick-up":  { bg: "#EDE9FE", color: "#7C3AED", label: "Ready" },
};

export function BookingCardNew({ booking, onClick }) {
  const {
    dogs,
    humans,
    currentDateStr,
    currentDateObj,
    bookingsByDate,
    dayOpenState,
    daySettings,
    onRemove,
    onUpdate,
    onUpdateDog,
    onOpenHuman,
    onOpenDog,
    onRebook,
  } = useSalon();

  const [showDetail, setShowDetail] = useState(false);

  const sizeTheme = SIZE_DOT[booking.size] || SIZE_FALLBACK_THEME;

  const service = SERVICES.find((s) => s.id === booking.service);
  const statusObj = STATUS_DISPLAY[booking.status] || STATUS_DISPLAY["No-show"];

  const pickupText = booking.status === "Ready for pick-up"
    ? `Collected${booking.pickup_time ? ` ${booking.pickup_time}` : ""}`
    : booking.pickup_time
      ? `Pick-up ${booking.pickup_time}`
      : "";

  const dogRecord = getDogByIdOrName(dogs, booking.dog_id || booking.dogName);
  const humanRecord = getHumanByIdOrName(humans, booking._ownerId || booking.owner || booking.ownerName);

  const price = dogRecord?.customPrice != null
    ? `£${dogRecord.customPrice}`
    : "";

  const displayDogName = titleCase(
    dogRecord?.name || booking.dogName || "Unknown Dog"
  );
  const displayBreed = titleCase(
    dogRecord?.breed || booking.breed || ""
  );
  const displayOwner = titleCase(
    humanRecord?.name || booking.owner || booking.ownerName || ""
  );

  const handleCardClick = onClick || (() => setShowDetail(true));

  return (
    <>
      <div
        onClick={handleCardClick}
        className="bg-white border-[1.5px] border-slate-200 rounded-xl overflow-hidden flex flex-col cursor-pointer transition-all hover:border-brand-blue hover:-translate-y-px box-border"
        style={{ boxShadow: `0 1px 4px rgba(0,0,0,0.04), 0 2px 8px ${sizeTheme.glow}0.08)` }}
        onMouseEnter={(e) => { e.currentTarget.style.boxShadow = `0 4px 16px ${sizeTheme.glow}0.15)`; }}
        onMouseLeave={(e) => { e.currentTarget.style.boxShadow = `0 1px 4px rgba(0,0,0,0.04), 0 2px 8px ${sizeTheme.glow}0.08)`; }}
      >
        {/* Gradient top accent bar */}
        <div className="h-[3px]" style={{ background: sizeTheme.gradient }} />

        <div className="p-2.5 md:p-3.5 flex flex-col gap-1">
        {/* Row 1: size dot + dog name + price */}
        <div className="flex items-center gap-2">
          <span
            className="w-3 h-3 rounded-full shrink-0 inline-block"
            style={{ background: sizeTheme.dot, boxShadow: `0 0 0 2px ${sizeTheme.dot}33` }}
          />
          <span className="text-sm md:text-[17px] font-extrabold text-slate-800 whitespace-nowrap overflow-hidden text-ellipsis">
            {displayDogName}
          </span>
          {dogRecord?.alerts?.length > 0 && (
            <svg width="14" height="14" viewBox="0 0 24 24" className="shrink-0">
              <path d="M12 2L1 21h22L12 2z" fill="#E8567F" />
              <text x="12" y="18" textAnchor="middle" fill="white" fontSize="14" fontWeight="900" fontFamily="inherit">!</text>
            </svg>
          )}
          {price && (
            <span className="text-sm md:text-[17px] font-black text-[#1E6B5C] ml-auto shrink-0">
              {price}
            </span>
          )}
        </div>

        {/* Row 2: breed */}
        {displayBreed && (
          <div className="text-xs md:text-sm font-semibold text-slate-500 pl-4 md:pl-5">
            {displayBreed}
          </div>
        )}

        {/* Row 3: owner */}
        {displayOwner && (
          <div className="text-xs md:text-sm font-bold text-brand-teal pl-4 md:pl-5">
            {displayOwner}
          </div>
        )}

        {/* Row 4: pill row */}
        <div className="flex gap-1 md:gap-[5px] pl-4 md:pl-5 mt-1 md:mt-1.5">
          {/* Service pill */}
          <span className="flex-1 min-w-0 text-[8px] md:text-[10px] font-bold py-1 md:py-[5px] px-1.5 rounded-md text-center truncate bg-slate-100 text-slate-700">
            {service?.name || booking.service || "\u2014"}
          </span>

          {/* Pickup pill */}
          <span className="flex-1 min-w-0 text-[8px] md:text-[10px] font-bold py-1 md:py-[5px] px-1.5 rounded-md text-center truncate bg-[#F3EEFF] text-[#7C3AED]">
            {pickupText || "\u2014"}
          </span>

          {/* Status pill */}
          <span
            className="flex-1 min-w-0 text-[8px] md:text-[10px] font-bold py-1 md:py-[5px] px-1.5 rounded-md text-center truncate"
            style={{ background: statusObj.bg, color: statusObj.color }}
          >
            {statusObj.label}
          </span>
        </div>
        </div>
      </div>

      {showDetail && (
        <Suspense fallback={null}>
          <BookingDetailModal
            booking={booking}
            onClose={() => setShowDetail(false)}
            onRemove={onRemove}
            onOpenHuman={onOpenHuman}
            onOpenDog={onOpenDog}
            onUpdate={onUpdate}
            currentDateStr={currentDateStr}
            currentDateObj={currentDateObj}
            bookingsByDate={bookingsByDate}
            dayOpenState={dayOpenState}
            dogs={dogs}
            humans={humans}
            onUpdateDog={onUpdateDog}
            onRebook={onRebook}
            daySettings={daySettings}
          />
        </Suspense>
      )}
    </>
  );
}
