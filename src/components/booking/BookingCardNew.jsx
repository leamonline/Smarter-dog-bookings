// src/components/booking/BookingCardNew.jsx
import { useState, useRef, useEffect, lazy, Suspense } from "react";
import { Calendar, LogIn, Droplets, Sparkles, Check, AlertTriangle, AlertCircle } from "lucide-react";
import { createPortal } from "react-dom";
import { SERVICES, STATUS_DISPLAY, BOOKING_STATUS, BOOKING_STATUSES } from "../../constants/index";
import { SizeDot } from "../ui/SizeDot.jsx";
import { useSalon } from "../../contexts/SalonContext";
import { useToast } from "../../contexts/ToastContext.jsx";
import {
  getDogByIdOrName,
  computeBookingPricing,
  buildMarkPaidPatch,
  resolveBookingDisplay,
} from "../../engine/bookingRules";
import { PAYMENT_METHODS } from "../../constants/salon";
import { isAwaitingDeposit } from "../../engine/deposits";
import { titleCase } from "../../utils/text";
import { ConfirmDialog } from "../shared/ConfirmDialog.jsx";
import { useBookingDeliveryFailure } from "../../supabase/hooks/useDeliveryFailures.js";

const BookingDetailModal = lazy(() =>
  import("../modals/BookingDetailModal.jsx").then((module) => ({
    default: module.BookingDetailModal,
  })),
);

const SIZE_DOT = {
  small:  { dot: "var(--color-size-small)", border: "var(--color-brand-yellow-dark)", gradient: "linear-gradient(90deg, var(--color-size-small), #FACC15)", glow: "rgba(245,197,24," },
  medium: { dot: "var(--color-brand-teal)", border: "var(--color-brand-teal-dark)", gradient: "linear-gradient(90deg, var(--color-brand-teal), var(--color-brand-teal-light))", glow: "rgba(45,139,122," },
  large:  { dot: "var(--color-brand-coral)", border: "var(--color-brand-coral-dark)", gradient: "linear-gradient(90deg, var(--color-brand-coral), #F472B6)", glow: "rgba(231,84,108," },
};

const SIZE_FALLBACK_THEME = { dot: "#00B8E0", border: "#0099BD", gradient: "linear-gradient(90deg, #00B8E0, #38BDF8)", glow: "rgba(14,165,233," };

const STATUS_PROGRESSION = BOOKING_STATUSES.map((s) => s.id);

const STATUS_ICONS = {
  [BOOKING_STATUS.BOOKED]: Calendar,
  [BOOKING_STATUS.CHECKED_IN]: LogIn,
  [BOOKING_STATUS.IN_BATH]: Droplets,
  [BOOKING_STATUS.READY_FOR_PICKUP]: Sparkles,
  [BOOKING_STATUS.COMPLETED]: Check,
};


function formatConfirmedAt(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const date = d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${date} at ${time}`;
}

function AlertsPopover({ alerts, anchorRect, onClose, dogName }) {
  const popRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    const onDown = (e) => {
      if (!popRef.current?.contains(e.target)) onClose();
    };
    document.addEventListener("keydown", onKey);
    const t = setTimeout(() => document.addEventListener("mousedown", onDown), 0);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
      clearTimeout(t);
    };
  }, [onClose]);

  if (!anchorRect) return null;

  const POPUP_WIDTH = 260;
  const margin = 8;
  const top = Math.min(
    anchorRect.bottom + 6,
    window.innerHeight - margin - 60,
  );
  let left = anchorRect.left;
  if (left + POPUP_WIDTH > window.innerWidth - margin) {
    left = window.innerWidth - margin - POPUP_WIDTH;
  }
  if (left < margin) left = margin;

  return createPortal(
    <div
      role="region"
      aria-label={`Notes on ${dogName}`}
      ref={popRef}
      onClick={(e) => e.stopPropagation()}
      style={{ position: "fixed", top, left, width: POPUP_WIDTH, zIndex: 1100 }}
      className="bg-white border border-red-300 rounded-2xl shadow-elevated p-3 animate-pop-in"
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 text-label text-red-700">
          <AlertCircle size={13} className="stroke-[2.4]" aria-hidden="true" />
          Notes on {dogName}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close notes"
          className="tap-target w-6 h-6 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer border-none bg-transparent font-[inherit]"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <ul className="list-none m-0 p-0 flex flex-col gap-1.5">
        {alerts.map((alert, idx) => (
          <li
            key={idx}
            className="text-xs font-medium text-red-900 bg-red-50 border border-red-300 rounded-lg px-2.5 py-1.5 leading-snug break-words"
          >
            {alert}
          </li>
        ))}
      </ul>
    </div>,
    document.body,
  );
}

export function BookingCardNew({ booking, onClick, searchDimmed, draggable, onDragStart, onDragEnd, isBeingDragged }) {
  const {
    dogs,
    humans,
    currentDateStr,
    currentDateObj,
    bookingsByDate,
    dayOpenState,
    daySettings,
    onAdd,
    onRemove,
    onUpdate,
    onUpdateDog,
    onUpdateHuman,
    onAddHuman,
    fetchHumanById,
    findHumanByFullName,
    searchHumansByTerm,
    onOpenHuman,
    onOpenDog,
    configPricing,
  } = useSalon();

  const [showDetail, setShowDetail] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [payChooserOpen, setPayChooserOpen] = useState(false);
  const [alertsAnchor, setAlertsAnchor] = useState(null);
  const [pendingSkipStatus, setPendingSkipStatus] = useState(null);
  const alertsButtonRef = useRef(null);
  const statusOptionRefs = useRef([]);
  const toast = useToast();
  const deliveryFailure = useBookingDeliveryFailure(booking.id);

  useEffect(() => {
    if (!statusOpen) return;
    const curIdx = Math.max(0, STATUS_PROGRESSION.indexOf(booking.status));
    statusOptionRefs.current[curIdx]?.focus();
  }, [statusOpen, booking.status]);

  const applyStatusChange = (nextStatus, previous) => {
    if (onUpdate) onUpdate({ ...booking, status: nextStatus }, currentDateStr, currentDateStr);
    toast.show(
      `Marked as ${STATUS_DISPLAY[nextStatus]?.label ?? nextStatus}`,
      "info",
      () => onUpdate?.({ ...booking, status: previous }, currentDateStr, currentDateStr),
    );
  };

  const changeStatus = (nextStatus) => {
    if (!nextStatus || nextStatus === booking.status) return;
    const previous = booking.status || BOOKING_STATUS.BOOKED;
    const prevIdx = STATUS_PROGRESSION.indexOf(previous);
    const nextIdx = STATUS_PROGRESSION.indexOf(nextStatus);
    const skipped = nextIdx - prevIdx;
    if (skipped >= 2) {
      setPendingSkipStatus({ nextStatus, previous });
      return;
    }
    applyStatusChange(nextStatus, previous);
  };

  const sizeTheme = SIZE_DOT[booking.size] || SIZE_FALLBACK_THEME;
  const service = SERVICES.find((s) => s.id === booking.service);
  const statusObj = STATUS_DISPLAY[booking.status] || STATUS_DISPLAY[BOOKING_STATUS.BOOKED];
  const dogRecord = getDogByIdOrName(dogs, booking.dog_id || booking._dogId || booking.dogName);
  const display = resolveBookingDisplay(booking, dogs, humans);

  const pricing = computeBookingPricing({
    service: booking.service,
    size: booking.size,
    addons: booking.addons,
    payment: booking.payment,
    depositAmount: booking.depositAmount,
    priceOverride: booking.priceOverride,
    customPrice: dogRecord?.customPrice,
    configPricing,
  });

  const needsPayment =
    (booking.status === BOOKING_STATUS.READY_FOR_PICKUP ||
      booking.status === BOOKING_STATUS.COMPLETED) &&
    !pricing.isPaidInFull &&
    pricing.amountDue > 0;

  const markPaid = (methodId) => {
    if (!onUpdate) return;
    onUpdate(
      {
        ...booking,
        ...buildMarkPaidPatch(
          {
            service: booking.service,
            size: booking.size,
            addons: booking.addons,
            priceOverride: booking.priceOverride,
            customPrice: dogRecord?.customPrice,
            configPricing,
          },
          methodId,
        ),
      },
      currentDateStr,
      currentDateStr,
    );
    setPayChooserOpen(false);
    toast.show(`${displayDogName} — payment recorded`, "success");
  };

  const displayDogName = titleCase(
    display.dogMissing ? "Unnamed booking" : display.dogName,
  );
  const displayBreed = titleCase(display.breed);
  const displayOwner = titleCase(display.ownerMissing ? "" : display.owner);

  const handleCardClick = onClick || (() => setShowDetail(true));

  return (
    <>
      <div
        aria-hidden={searchDimmed || undefined}
        draggable={draggable || undefined}
        onDragStart={onDragStart ? (e) => onDragStart(booking, e) : undefined}
        onDragEnd={onDragEnd}
        onClick={handleCardClick}
        className={`bg-white border-[1.5px] border-slate-200 rounded-2xl flex flex-col cursor-pointer transition-all hover:border-brand-purple hover:-translate-y-px box-border focus-within:ring-2 focus-within:ring-brand-yellow focus-within:ring-offset-1 min-h-[76px] lg:min-h-[80px] h-auto ${searchDimmed ? "opacity-30 pointer-events-none" : ""} ${isBeingDragged ? "opacity-50" : ""}`}
        style={{ boxShadow: `0 1px 4px rgba(0,0,0,0.03), 0 2px 8px ${sizeTheme.glow}0.06)` }}
      >
        {/* Top accent bar */}
        <div className="h-[3px] shrink-0" style={{ background: sizeTheme.gradient }} />

        <div className="p-2 sm:p-3 flex flex-col gap-1.5 justify-between flex-1 min-w-0">
          {/* Row 1: Dog name, breed and alerts | Price or amount due aligned right */}
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <span className="inline-flex shrink-0">
                <SizeDot size={booking.size} dim={13} />
              </span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleCardClick(); }}
                tabIndex={searchDimmed ? -1 : 0}
                aria-label={`Open booking for ${displayDogName}`}
                className="text-xs sm:text-[13px] md:text-sm font-bold font-display text-brand-purple truncate text-left bg-transparent border-none p-0 m-0 cursor-pointer font-[inherit] focus:outline-none rounded hover:underline shrink-0 max-w-[50%]"
              >
                {displayDogName}
              </button>

              {dogRecord?.alerts?.length > 0 && (
                <button
                  ref={alertsButtonRef}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (alertsAnchor) {
                      setAlertsAnchor(null);
                    } else {
                      const rect = alertsButtonRef.current?.getBoundingClientRect();
                      if (rect) setAlertsAnchor(rect);
                    }
                  }}
                  aria-expanded={!!alertsAnchor}
                  aria-haspopup="true"
                  aria-label={`${dogRecord.alerts.length} notes`}
                  className="w-4 h-4 rounded-full flex items-center justify-center text-red-700 bg-red-50 border border-red-300 cursor-pointer hover:bg-red-700 hover:text-white shrink-0 relative after:content-[''] after:absolute after:-inset-[10px]"
                >
                  <AlertCircle size={10} strokeWidth={3} aria-hidden="true" />
                </button>
              )}

              {booking.staffCapacityOverride && (
                <span
                  role="img"
                  aria-label="Capacity overridden by staff"
                  title="Capacity overridden by staff"
                  className="w-2 h-2 rounded-full bg-amber-400 ring-2 ring-amber-100 shrink-0"
                />
              )}

              {deliveryFailure && deliveryFailure.length > 0 && (
                <span
                  role="img"
                  aria-label="Delivery failure"
                  title="Delivery failure"
                  className="w-4 h-4 rounded-full flex items-center justify-center text-red-700 bg-red-50 border border-red-300 shrink-0"
                >
                  <AlertTriangle size={10} strokeWidth={3} aria-hidden="true" />
                </span>
              )}

              {displayBreed && (
                <span className="truncate text-[10px] sm:text-[11px] font-semibold text-slate-400 ml-1">
                  {displayBreed}
                </span>
              )}
            </div>

            {/* Price or amount due aligned right */}
            <div className="shrink-0 text-right font-display text-xs sm:text-[13px] font-black tabular-nums flex items-center gap-1.5">
              <span className="text-slate-800">£{pricing.subtotal}</span>
              {isAwaitingDeposit(booking) ? (
                <span className="text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-300 px-1.5 py-0.5 rounded leading-none">
                  Awaiting deposit
                </span>
              ) : needsPayment ? (
                <span className="text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded leading-none">
                  £{pricing.amountDue} due
                </span>
              ) : pricing.isDepositPaid ? (
                <span className="text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded leading-none">
                  £{pricing.amountDue} due
                </span>
              ) : pricing.isPaidInFull ? (
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded leading-none">
                  Paid
                </span>
              ) : null}
            </div>
          </div>

          {/* Row 2: Owner and service | Compact status control aligned right */}
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="text-[11px] sm:text-[12px] font-medium text-slate-500 truncate flex-1 flex items-center gap-1.5">
              <span className="truncate font-semibold text-slate-600">{displayOwner || "No owner"}</span>
              <span className="text-slate-300 font-normal">·</span>
              <span className="truncate text-slate-500">{service?.name || booking.service || "—"}</span>
              {booking.reminderConfirmedAt && (
                <span
                  data-reminder-confirmation
                  role="status"
                  aria-label={
                    booking.reminderConfirmedBy === "staff"
                      ? `Confirmed by staff at ${formatConfirmedAt(booking.reminderConfirmedAt)}`
                      : `Customer confirmed at ${formatConfirmedAt(booking.reminderConfirmedAt)}`
                  }
                  title={
                    booking.reminderConfirmedBy === "staff"
                      ? `Confirmed by staff at ${formatConfirmedAt(booking.reminderConfirmedAt)}`
                      : `Confirmed via WhatsApp at ${formatConfirmedAt(booking.reminderConfirmedAt)}`
                  }
                  className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold leading-none text-emerald-700"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Confirmed
                </span>
              )}
            </div>

            {/* Compact status trigger */}
            <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setStatusOpen(true); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation();
                    e.preventDefault();
                    setStatusOpen(true);
                  }
                }}
                aria-haspopup="listbox"
                aria-expanded={statusOpen}
                aria-label={`Change status, currently ${statusObj.label}`}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] sm:text-[12px] font-extrabold rounded-lg border cursor-pointer transition-all hover:brightness-95 min-h-[32px] md:min-h-0 touch-manipulation"
                style={{ background: statusObj.bg, color: statusObj.color, borderColor: statusObj.border }}
              >
                <span>{statusObj.label}</span>
                <span aria-hidden="true" className="text-[9px] opacity-75">▼</span>
              </button>
            </div>
          </div>

          {/* Quick Pay / Status controls inline options */}
          {statusOpen && (
            <div
              className="flex flex-col gap-[3px] border-t border-slate-100 pt-1.5 animate-pop-in"
              role="listbox"
              aria-label="Set booking status"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Escape") { e.stopPropagation(); setStatusOpen(false); return; }
                const navKeys = ["ArrowDown", "ArrowUp", "Home", "End"];
                if (!navKeys.includes(e.key)) return;
                e.preventDefault();
                e.stopPropagation();
                const count = STATUS_PROGRESSION.length;
                let idx = statusOptionRefs.current.findIndex((el) => el === document.activeElement);
                if (idx < 0) idx = Math.max(0, STATUS_PROGRESSION.indexOf(booking.status));
                let next = idx;
                if (e.key === "ArrowDown") next = (idx + 1) % count;
                else if (e.key === "ArrowUp") next = (idx - 1 + count) % count;
                else if (e.key === "Home") next = 0;
                else if (e.key === "End") next = count - 1;
                statusOptionRefs.current[next]?.focus();
              }}
            >
              {STATUS_PROGRESSION.map((id, i) => {
                const s = { id, ...STATUS_DISPLAY[id] };
                const isCurrent = s.id === booking.status;
                return (
                  <button
                    key={s.id}
                    ref={(el) => (statusOptionRefs.current[i] = el)}
                    type="button"
                    role="option"
                    aria-selected={isCurrent}
                    tabIndex={isCurrent ? 0 : -1}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isCurrent) changeStatus(s.id);
                      setStatusOpen(false);
                    }}
                    className="w-full text-left text-xs font-bold py-1.5 px-3 rounded-lg border flex items-center justify-between cursor-pointer transition-all font-[inherit]"
                    style={{ background: s.bg, color: s.color, borderColor: s.border }}
                  >
                    <span className="flex items-center gap-1.5">
                      {(() => { const Icon = STATUS_ICONS[s.id] || Calendar; return <Icon size={12} strokeWidth={2.5} aria-hidden="true" />; })()}
                      {s.label}
                    </span>
                    {isCurrent && <span className="text-[10px]">Active</span>}
                  </button>
                );
              })}
            </div>
          )}

          {payChooserOpen && needsPayment && (
            <div
              className="flex items-center gap-1.5 flex-wrap border-t border-slate-100 pt-1.5"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="text-[10px] font-bold text-slate-500">Pay:</span>
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => markPaid(m.id)}
                  className="text-[10px] font-bold py-1 px-1.5 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-800 hover:brightness-95 cursor-pointer touch-manipulation min-h-[32px] md:min-h-0"
                >
                  {m.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPayChooserOpen(false)}
                className="text-[10px] text-slate-500 underline ml-auto cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {alertsAnchor && dogRecord?.alerts?.length > 0 && (
        <AlertsPopover
          alerts={dogRecord.alerts}
          anchorRect={alertsAnchor}
          onClose={() => setAlertsAnchor(null)}
          dogName={displayDogName}
        />
      )}

      {showDetail && (
        <Suspense fallback={null}>
          <BookingDetailModal
            booking={booking}
            onClose={() => setShowDetail(false)}
            onAdd={onAdd}
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
            onUpdateHuman={onUpdateHuman}
            onAddHuman={onAddHuman}
            fetchHumanById={fetchHumanById}
            findHumanByFullName={findHumanByFullName}
            searchHumansByTerm={searchHumansByTerm}
            daySettings={daySettings}
          />
        </Suspense>
      )}

      {pendingSkipStatus && (
        <ConfirmDialog
          title="Skip ahead?"
          message={`Skip from "${STATUS_DISPLAY[pendingSkipStatus.previous]?.label || pendingSkipStatus.previous}" straight to "${STATUS_DISPLAY[pendingSkipStatus.nextStatus]?.label || pendingSkipStatus.nextStatus}"?`}
          confirmLabel="Skip and update"
          cancelLabel="Cancel"
          variant="primary"
          onConfirm={() => {
            const { nextStatus, previous } = pendingSkipStatus;
            setPendingSkipStatus(null);
            applyStatusChange(nextStatus, previous);
          }}
          onCancel={() => setPendingSkipStatus(null)}
        />
      )}
    </>
  );
}
