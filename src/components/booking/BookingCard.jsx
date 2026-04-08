import { lazy, Suspense, useState } from "react";
import { SERVICES, BOOKING_STATUSES, SIZE_THEME, SIZE_FALLBACK, NO_SHOW_STATUS } from "../../constants/index.js";
import { useSalon } from "../../contexts/SalonContext.jsx";
import {
  getDogByIdOrName,
  getHumanByIdOrName,
} from "../../engine/bookingRules.js";
import { SizeTag } from "../ui/SizeTag.jsx";
import { StaffIconBtn } from "../ui/StaffIconBtn.jsx";
import { IconEdit, IconMessage } from "../icons/index.jsx";

function titleCase(str) {
  if (!str) return "";
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}


const BookingDetailModal = lazy(() =>
  import("../modals/BookingDetailModal.jsx").then((module) => ({
    default: module.BookingDetailModal,
  })),
);

const ContactPopup = lazy(() =>
  import("../modals/ContactPopup.jsx").then((module) => ({
    default: module.ContactPopup,
  })),
);

export function BookingCard({ booking }) {
  // All shared data now comes from SalonContext
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
  const [showContact, setShowContact] = useState(false);

  const service = SERVICES.find((s) => s.id === booking.service);
  const dogRecord = getDogByIdOrName(dogs, booking._dogId || booking.dogName);
  const humanRecord = getHumanByIdOrName(
    humans,
    booking._ownerId || booking.owner,
  );

  const currentStatus = booking.status || "Not Arrived";
  const statusObj =
    BOOKING_STATUSES.find((s) => s.id === currentStatus) || BOOKING_STATUSES[0];
  const currentIdx = BOOKING_STATUSES.findIndex((s) => s.id === currentStatus);
  const nextStatus =
    currentIdx < BOOKING_STATUSES.length - 1
      ? BOOKING_STATUSES[currentIdx + 1]
      : null;

  const handleAdvanceStatus = async (e) => {
    e.stopPropagation();
    if (!nextStatus) return;

    await onUpdate(
      { ...booking, status: nextStatus.id },
      currentDateStr,
      currentDateStr,
    );
  };

  const handleNoShow = async (e) => {
    e.stopPropagation();
    if (!window.confirm(`Mark ${booking.dogName} as a No Show?`)) return;
    await onUpdate(
      { ...booking, status: NO_SHOW_STATUS.id },
      currentDateStr,
      currentDateStr,
    );
  };

  const rawTheme = SIZE_THEME[booking.size] || SIZE_FALLBACK;
  const sizeTheme = { dark: rawTheme.primary, light: rawTheme.light };

  const handleOpenDog = (e) => {
    e.stopPropagation();
    onOpenDog?.(dogRecord?.id || booking._dogId || booking.dogName);
  };

  const handleOpenHuman = (e) => {
    e.stopPropagation();
    onOpenHuman?.(humanRecord?.id || booking._ownerId || booking.owner);
  };

  const handleOpenContact = (e) => {
    e.stopPropagation();
    setShowContact(true);
  };

  return (
    <>
      <div
        onClick={() => setShowDetail(true)}
        className="flex items-center gap-2 bg-white border border-slate-200 rounded-[10px] py-1.5 px-2.5 text-[13px] cursor-pointer min-h-[42px] box-border transition-all hover:shadow-md"
        style={{ borderLeft: `3px solid ${statusObj.color}` }}
      >
        <div className="w-7 min-w-[28px] flex items-center justify-center shrink-0">
          <SizeTag size={booking.size} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="font-semibold text-slate-800 whitespace-nowrap overflow-hidden text-ellipsis">
            {booking.confirmed && (
              <span
                title="Confirmed"
                className="text-brand-green mr-[3px] text-[11px]"
              >
                {"\u2713"}
              </span>
            )}
            <span
              className="cursor-pointer"
              style={{
                borderBottom: `1px dashed ${sizeTheme.dark}`,
                color: sizeTheme.dark,
              }}
              onClick={handleOpenDog}
            >
              {titleCase(booking.dogName)}
            </span>
            <span className="font-normal text-slate-500 ml-1 text-xs">
              ({titleCase(booking.breed)})
            </span>
          </div>

          <div className="text-[11px] text-slate-500">
            {service?.icon} {service?.name} {"·"}{" "}
            <span
              className="cursor-pointer border-b border-dashed border-brand-teal text-brand-teal"
              onClick={handleOpenHuman}
            >
              {titleCase(booking.owner)}
            </span>
          </div>
        </div>

        <div className="flex gap-[3px] items-center">
          {nextStatus && (
            <button
              onClick={handleAdvanceStatus}
              title={`Advance to: ${nextStatus.label}`}
              className="rounded-md py-[3px] px-2 text-[10px] font-bold cursor-pointer font-[inherit] whitespace-nowrap transition-all hover:brightness-110"
              style={{
                background: nextStatus.bg,
                color: nextStatus.color,
                border: `1px solid ${nextStatus.color}`,
              }}
            >
              {"\u25B6"} {nextStatus.label}
            </button>
          )}

          {currentStatus === "Not Arrived" && (
            <button
              onClick={handleNoShow}
              title="Mark as No Show"
              className="rounded-md py-[3px] px-2 text-[10px] font-bold cursor-pointer font-[inherit] whitespace-nowrap transition-all hover:opacity-80"
              style={{
                background: NO_SHOW_STATUS.bg,
                color: NO_SHOW_STATUS.color,
                border: `1px solid ${NO_SHOW_STATUS.color}`,
              }}
            >
              ✗ No Show
            </button>
          )}

          {!nextStatus && currentStatus !== "Not Arrived" && (
            <span
              className="text-[10px] font-bold py-[3px] px-2 rounded-md"
              style={{
                color: statusObj.color,
                background: statusObj.bg,
              }}
            >
              {"\u2713"} Done
            </span>
          )}

          <StaffIconBtn
            icon={<IconEdit />}
            title="Edit appointment"
            onClick={(e) => {
              e.stopPropagation();
              setShowDetail(true);
            }}
          />
          <StaffIconBtn
            icon={<IconMessage />}
            title="Message owner"
            onClick={handleOpenContact}
          />
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

      {showContact && (
        <Suspense fallback={null}>
          <ContactPopup
            human={humanRecord || humans[booking.owner]}
            onClose={() => setShowContact(false)}
          />
        </Suspense>
      )}
    </>
  );
}
