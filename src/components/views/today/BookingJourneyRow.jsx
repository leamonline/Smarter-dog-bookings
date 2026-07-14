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
  Send,
} from "lucide-react";
import { buildJourneyActions, paymentVisual } from "../../../engine/dailyBrief";
import { JourneyIconButton } from "./JourneyIconButton.jsx";

const ACTION_ICONS = {
  checkIn: LogIn,
  startGroom: Bubbles,
  ready: Scissors,
  messageCollection: Send,
  waiting: Car,
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

const sentenceButtonClass =
  "inline-flex min-h-11 items-center rounded-md px-0.5 outline-none hover:bg-brand-yellow/20 focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2";

export function BookingJourneyRow({ entry, slotLabel, display, price, handlers = {} }) {
  const booking = entry.booking;
  const journey = buildJourneyActions(booking);
  const payment = paymentVisual(booking);
  const formattedPrice = priceLabel(price);

  return (
    <article
      id={`today-card-${booking.id}`}
      className="rounded-2xl border border-brand-paper-line bg-white px-3 py-3 sm:px-4"
    >
      <p className="min-w-0 text-center font-handwriting text-[clamp(1.45rem,3vw,2rem)] font-bold leading-tight text-brand-purple">
        <button
          type="button"
          aria-label={`Open ${display.dogName}'s dog file`}
          onClick={() => handlers.onOpenDog?.(booking._dogId)}
          className={sentenceButtonClass}
        >
          {display.dogName} · {display.breed}
        </button>
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
        data-centres={journey.length === 6 ? "8" : "7"}
        className="journey-grid mt-3 grid grid-cols-8 items-start justify-items-center gap-y-1 sm:grid-cols-[repeat(var(--journey-centres),minmax(0,1fr))]"
        style={{ "--journey-centres": journey.length + 2 }}
      >
        <span className="relative flex justify-center pb-7">
          <button
            type="button"
            aria-label={`Open ${slotLabel} booking`}
            onClick={() => handlers.onOpenBooking?.(booking.id)}
            className="flex size-13 items-center justify-center rounded-full bg-brand-purple text-sm font-extrabold text-white tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2"
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
        <span className="relative flex justify-center pb-7">
          <button
            type="button"
            aria-label={`Message ${display.owner}`}
            onClick={() => handlers.onMessageOwner?.(booking)}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-brand-purple outline-none focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2"
          >
            <MessageCircle size={52} fill="currentColor" strokeWidth={1.8} aria-hidden="true" />
          </button>
        </span>
      </div>
    </article>
  );
}
