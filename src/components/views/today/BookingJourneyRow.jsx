import {
  Banknote,
  Bubbles,
  Car,
  Coins,
  CreditCard,
  Landmark,
  LogIn,
  MessageCircle,
  PoundSterling,
  Scissors,
} from "lucide-react";
import { BOOKING_STATUS } from "../../../constants/index";
import { buildJourneyActions, paymentVisual } from "../../../engine/dailyBrief";
import { JourneyIconButton } from "./JourneyIconButton.jsx";

const ACTION_ICONS = {
  checkIn: LogIn,
  startGroom: Bubbles,
  ready: Scissors,
  waiting: Scissors,
  collected: Car,
};

function PaymentIcon({ visual }) {
  if (visual === "cash") {
    return (
      <span className="flex items-center gap-0.5" aria-hidden="true">
        <Banknote size={19} />
        <Coins size={17} />
      </span>
    );
  }
  if (visual === "card") return <CreditCard size={22} aria-hidden="true" />;
  if (visual === "bankTransfer") return <Landmark size={22} aria-hidden="true" />;
  return <PoundSterling size={22} aria-hidden="true" />;
}

function iconFor(action, payment) {
  if (action.id === "paid") return <PaymentIcon visual={payment.visual} />;
  const Icon = ACTION_ICONS[action.id] || PoundSterling;
  return <Icon size={22} aria-hidden="true" />;
}

function priceLabel(price) {
  const amount = Number(price);
  return Number.isFinite(amount)
    ? amount.toLocaleString("en-GB", { maximumFractionDigits: 2 })
    : String(price);
}

function appointmentTone(entry) {
  if (entry.isLate) {
    return {
      state: "late",
      label: "late",
      className: "border-brand-coral bg-brand-coral text-white",
    };
  }
  if (entry.isUnconfirmed) {
    return {
      state: "blocked",
      label: "needs confirmation",
      className: "border-brand-yellow-dark bg-brand-yellow text-brand-purple",
    };
  }
  return {
    state: "scheduled",
    label: null,
    className: "border-brand-purple bg-brand-purple text-white",
  };
}

export function journeyCardTone(entry) {
  const booking = entry.booking;
  if (booking.status === BOOKING_STATUS.CANCELLED) return "cancelled";
  if (
    booking.reminderConfirmedAt ||
    [
      BOOKING_STATUS.CHECKED_IN,
      BOOKING_STATUS.IN_BATH,
      BOOKING_STATUS.READY_FOR_PICKUP,
      BOOKING_STATUS.COMPLETED,
    ].includes(booking.status)
  ) {
    return "success";
  }
  return "default";
}

const CARD_TONE = {
  success: "border-emerald-300 bg-emerald-50/80",
  cancelled: "border-brand-coral/30 bg-brand-coral/[0.06]",
  default: "border-brand-paper-line bg-white",
};

function formatConfirmedAt(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/London",
  });
}

const sentenceButtonClass =
  "inline-flex min-h-11 items-center rounded-md px-0.5 outline-none hover:bg-brand-yellow/20 focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2";

export function BookingJourneyRow({ entry, slotLabel, display, price, handlers = {} }) {
  const booking = entry.booking;
  const journey = buildJourneyActions(booking);
  const payment = paymentVisual(booking);
  const formattedPrice = priceLabel(price);
  const timeTone = appointmentTone(entry);
  const cardTone = journeyCardTone(entry);
  const confirmedAt = formatConfirmedAt(booking.reminderConfirmedAt);

  return (
    <article
      id={`today-card-${booking.id}`}
      aria-label={`${display.dogName} booking`}
      data-journey-tone={cardTone}
      className={`rounded-2xl border px-3 py-2.5 sm:px-4 sm:py-3 ${CARD_TONE[cardTone]}`}
    >
      <p className="min-w-0 text-center font-sans text-lg font-bold leading-tight text-brand-purple sm:text-xl">
        <button
          type="button"
          aria-label={`Open ${display.dogName}'s dog file`}
          onClick={() => handlers.onOpenDog?.(booking._dogId)}
          className={sentenceButtonClass}
        >
          {display.dogName} · {display.breed}
        </button>
        {booking.reminderConfirmedAt && (
          <span
            role="img"
            aria-label={`Customer confirmed at ${confirmedAt}`}
            title={`Confirmed via WhatsApp at ${confirmedAt}`}
            className="ml-1 inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 align-middle text-emerald-700"
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </span>
        )}
        <span aria-hidden="true"> · </span>
        <button
          type="button"
          aria-label={`Open ${display.serviceLabel} booking`}
          onClick={() => handlers.onOpenBooking?.(booking.id)}
          className={sentenceButtonClass}
        >
          {display.serviceLabel}
        </button>
        <span aria-hidden="true"> · </span>
        <button
          type="button"
          aria-label={`Open ${display.owner}'s human file`}
          onClick={() => handlers.onOpenHuman?.(booking._ownerId)}
          className={sentenceButtonClass}
        >
          {display.owner}
        </button>
        <span aria-hidden="true"> · </span>
        <button
          type="button"
          aria-label={`Open £${formattedPrice} invoice`}
          onClick={() => handlers.onOpenInvoice?.(booking)}
          className={sentenceButtonClass}
        >
          £{formattedPrice}
        </button>
      </p>

      <div
        data-testid="booking-journey-grid"
        data-centres={journey.length + 2}
        className="journey-grid mt-2 grid grid-cols-8 items-start justify-items-center gap-y-3 sm:mt-3 sm:gap-y-1 sm:grid-cols-[repeat(var(--journey-centres),minmax(0,1fr))]"
        style={{ "--journey-centres": journey.length + 2 }}
      >
        <span className="relative flex justify-center pb-0 [@media(hover:hover)]:pb-7">
          <button
            type="button"
            id={`today-card-${booking.id}-time`}
            aria-label={`Open ${slotLabel} booking${timeTone.label ? ` — ${timeTone.label}` : ""}`}
            title={timeTone.label || undefined}
            data-appointment-state={timeTone.state}
            onClick={() => handlers.onOpenBooking?.(booking.id)}
            className={`flex size-11 items-center justify-center rounded-full border text-sm font-extrabold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2 ${timeTone.className}`}
          >
            {slotLabel}
          </button>
        </span>
        {journey.map((action) => (
          <JourneyIconButton
            key={action.id}
            label={action.label}
            active={action.next}
            complete={
              action.completed &&
              (action.id !== "paid" || payment.visual !== "paidUnknown")
            }
            onClick={() => handlers.onJourneyAction?.(booking, action)}
          >
            {iconFor(action, payment)}
          </JourneyIconButton>
        ))}
        <span className="relative flex justify-center pb-0 [@media(hover:hover)]:pb-7">
          <button
            type="button"
            aria-label={`Message ${display.owner}`}
            onClick={() => handlers.onMessageOwner?.(booking)}
            className="flex size-11 items-center justify-center rounded-full border border-brand-purple/20 bg-brand-purple/5 text-brand-purple outline-none transition-colors hover:bg-brand-purple/10 focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2"
          >
            <MessageCircle size={26} strokeWidth={2.2} aria-hidden="true" />
          </button>
        </span>
      </div>
    </article>
  );
}
