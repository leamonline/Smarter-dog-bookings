import { useState, lazy, Suspense } from "react";
import { BRAND, SERVICES, BOOKING_STATUSES, PRICING } from "../../constants/index.js";
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
  small:  { dot: "#F5C518", border: "#D4A500" },
  medium: { dot: "#2D8B7A", border: "#1E6B5C" },
  large:  { dot: "#E8567F", border: "#C93D63" },
};

const SIZE_FALLBACK_THEME = { dot: "#00B8E0", border: "#0099BD" };

const STATUS_DISPLAY = {
  "Not Arrived":       { bg: "#FFF8E0", color: "#92400E", label: "Not Arrived" },
  "Checked In":        { bg: "#DCFCE7", color: "#16A34A", label: "Checked In" },
  "In the Bath":       { bg: "#E0F7FC", color: "#0099BD", label: "In the Bath" },
  "Ready for Pick-up": { bg: "#EDE9FE", color: "#7C3AED", label: "Ready" },
  "Completed":         { bg: "#F3F4F6", color: "#374151", label: "Completed" },
};

const PILL_BASE = {
  flex: 1,
  borderRadius: 6,
  padding: "5px 0",
  fontSize: 10,
  fontWeight: 700,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
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

  const [hovered, setHovered] = useState(false);
  const [showDetail, setShowDetail] = useState(false);

  const sizeTheme = SIZE_DOT[booking.size] || SIZE_FALLBACK_THEME;

  const service = SERVICES.find((s) => s.id === booking.service);
  const statusObj = STATUS_DISPLAY[booking.status] || STATUS_DISPLAY["Not Arrived"];

  const price =
    PRICING[booking.service]?.[booking.size] ??
    PRICING[booking.service]?.small ??
    "";

  const pickupText = booking.status === "Completed"
    ? `Collected${booking.pickup_time ? ` ${booking.pickup_time}` : ""}`
    : booking.pickup_time
      ? `Pick-up ${booking.pickup_time}`
      : "";

  const dogRecord = getDogByIdOrName(dogs, booking.dog_id || booking.dogName);
  const humanRecord = getHumanByIdOrName(humans, booking._ownerId || booking.owner || booking.ownerName);

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
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: BRAND.white,
        border: `1.5px solid ${hovered ? BRAND.blue : BRAND.greyLight}`,
        borderLeft: `4px solid ${sizeTheme.border}`,
        borderRadius: 12,
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        cursor: "pointer",
        boxShadow: hovered ? "0 2px 8px rgba(0,184,224,0.15)" : "none",
        transform: hovered ? "translateY(-1px)" : "none",
        transition: "all 0.15s",
        boxSizing: "border-box",
      }}
    >
      {/* Row 1: size dot + dog name + price */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: sizeTheme.dot,
            flexShrink: 0,
            display: "inline-block",
          }}
        />
        <span
          style={{
            fontSize: 17,
            fontWeight: 800,
            color: BRAND.text,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {displayDogName}
        </span>
        {price && (
          <span
            style={{
              fontSize: 17,
              fontWeight: 900,
              color: "#1E6B5C",
              marginLeft: "auto",
              flexShrink: 0,
            }}
          >
            {price}
          </span>
        )}
      </div>

      {/* Row 2: breed */}
      {displayBreed && (
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: BRAND.grey,
            paddingLeft: 20,
          }}
        >
          {displayBreed}
        </div>
      )}

      {/* Row 3: owner */}
      {displayOwner && (
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: BRAND.teal,
            paddingLeft: 20,
          }}
        >
          {displayOwner}
        </div>
      )}

      {/* Row 4: pill row */}
      <div
        style={{
          display: "flex",
          gap: 5,
          paddingLeft: 20,
          marginTop: 6,
        }}
      >
        {/* Service pill */}
        <span
          style={{
            ...PILL_BASE,
            background: "#F1F3F5",
            color: "#374151",
          }}
        >
          {service?.name || booking.service || "—"}
        </span>

        {/* Pickup pill */}
        <span
          style={{
            ...PILL_BASE,
            background: "#F3EEFF",
            color: "#7C3AED",
          }}
        >
          {pickupText || "—"}
        </span>

        {/* Status pill */}
        <span
          style={{
            ...PILL_BASE,
            background: statusObj.bg,
            color: statusObj.color,
          }}
        >
          {statusObj.label}
        </span>
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
