// Needs attention now — the ranked "act now" queue: late arrivals, dogs
// waiting too long to be collected, unconfirmed bookings, and outstanding
// payments on dogs in the salon. Each row leads with who + why + when, then
// one strong action and one quiet one. Money never gets a "dismiss": a
// payment row only leaves this list when it's recorded paid or the booking
// is opened and resolved properly.
import { BOOKING_STATUS } from "../../../constants/index";
import { SectionCard, WelfareChips, PrimaryButton, SecondaryButton, TertiaryLink, BookingStatusLine, OnTheWayChip, MarkPaidAction, formatMinutes } from "./parts.jsx";

const ACCENT = {
  late: "bg-brand-coral",
  ready: "bg-emerald-500",
  unconfirmed: "bg-amber-400",
  payment: "bg-brand-yellow-dark",
};

const KIND_LABEL = {
  late: "Late arrival",
  ready: "Waiting for collection",
  unconfirmed: "Not yet confirmed",
  payment: "Payment outstanding",
};

function reasonDetail(item) {
  switch (item.primary) {
    case "late":
      return `${formatMinutes(item.overdueMinutes)} overdue`;
    // "ready" carries no detail here — the wait duration lives on the status
    // line, so the headline doesn't double the word "waiting".
    case "unconfirmed":
      return "reminder sent, no reply";
    default:
      return null;
  }
}

function lastContact(b) {
  if (!b.reminderSentAt) return "Not contacted yet";
  const t = new Date(b.reminderSentAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
  return `Reminder sent ${t}`;
}

function AttentionItem({
  item,
  resolve,
  getWelfare,
  paymentOf,
  onTheWaySignals,
  onMarkArrived,
  onMarkCollected,
  onSendCollection,
  onMessageOwner,
  onMarkPaid,
  onDidntShow,
  onOpenBooking,
  onHideUntilTomorrow,
}) {
  const b = item.booking;
  const d = resolve(b);
  const welfare = getWelfare(b);
  const pay = paymentOf(b);
  const detail = reasonDetail(item);
  const collectionSent = !!b.collectionSentAt;
  // This is the booking's only card on the page now, so it must carry every
  // action its old duplicate rows offered: a ready dog keeps the collection
  // workflow, an unpaid dog keeps "Mark paid" (with the method chooser, so
  // the takings never lose the payment method), and "Open" stays reachable.
  const isReady = b.status === BOOKING_STATUS.READY_FOR_PICKUP;
  const owesMoney = pay.kind !== "paid";
  const showCollectionActions = item.primary === "ready" || (item.primary === "payment" && isReady);
  const otw = isReady && b.whatsappConversationId ? onTheWaySignals?.[b.whatsappConversationId] : null;

  return (
    <li className="flex items-stretch gap-3 rounded-xl border border-slate-200 bg-white p-3">
      <span aria-hidden className={`w-1.5 rounded-full shrink-0 ${ACCENT[item.primary] || "bg-slate-300"}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-slate-800 text-[15px]">{d.dogName}</span>
          <span className="text-[13px] text-slate-600">{d.owner}</span>
          <span className="text-[13px] font-semibold text-slate-700 tabular-nums">{b.slot}</span>
        </div>
        <div className="flex items-center gap-x-2 gap-y-0.5 flex-wrap mt-1 text-[13px]">
          <span className="font-bold text-brand-coral-text">{KIND_LABEL[item.primary]}</span>
          {detail && <span className="font-semibold text-slate-700">· {detail}</span>}
          {item.primary === "unconfirmed" && (
            <span className="text-slate-600">· {lastContact(b)}</span>
          )}
        </div>
        {/* Only the "Waiting for collection" headline already says "waiting" —
            other headlines keep the word so a bare duration can't be misread. */}
        <BookingStatusLine booking={b} waitMinutes={item.waitMinutes} pay={pay} showWaitWord={item.primary !== "ready"}>
          {isReady && b.pickupBy && <span>Pick-up: {b.pickupBy}</span>}
          {otw && <OnTheWayChip signal={otw} />}
        </BookingStatusLine>
        <WelfareChips alerts={welfare.alerts} pregnant={welfare.pregnant} notes={welfare.notes} />
        <div className="flex items-center gap-2 flex-wrap mt-2.5">
          {item.primary === "late" && (
            <>
              <PrimaryButton onClick={() => onMarkArrived(b)}>Mark arrived</PrimaryButton>
              <SecondaryButton onClick={() => onMessageOwner(b)}>Message owner</SecondaryButton>
              <TertiaryLink onClick={() => onDidntShow(b)}>Didn&apos;t show</TertiaryLink>
            </>
          )}
          {showCollectionActions &&
            (collectionSent ? (
              <>
                <PrimaryButton onClick={() => onMarkCollected(b)}>Mark collected</PrimaryButton>
                <SecondaryButton onClick={() => onSendCollection(b)}>Resend message</SecondaryButton>
              </>
            ) : (
              <>
                <PrimaryButton onClick={() => onSendCollection(b)}>Send collection message</PrimaryButton>
                <SecondaryButton onClick={() => onMarkCollected(b)}>Mark collected</SecondaryButton>
              </>
            ))}
          {item.primary === "unconfirmed" && (
            <>
              <PrimaryButton onClick={() => onMessageOwner(b)}>Message owner</PrimaryButton>
              <SecondaryButton onClick={() => onMarkArrived(b)}>Mark arrived</SecondaryButton>
              <TertiaryLink onClick={() => onHideUntilTomorrow(b.id)}>Hide until tomorrow</TertiaryLink>
            </>
          )}
          {item.primary === "payment" && (
            <>
              <MarkPaidAction booking={b} onMarkPaid={onMarkPaid} variant={isReady ? "secondary" : "primary"} />
              <SecondaryButton onClick={() => onOpenBooking(b.id)}>Open booking</SecondaryButton>
            </>
          )}
          {item.primary !== "payment" && owesMoney && (
            <MarkPaidAction booking={b} onMarkPaid={onMarkPaid} variant="secondary" />
          )}
          {item.primary !== "payment" && (isReady || owesMoney) && (
            <span className="ml-auto -my-1">
              <TertiaryLink tone="purple" onClick={() => onOpenBooking(b.id)}>Open</TertiaryLink>
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

export function AttentionPanel(props) {
  const { items } = props;
  return (
    <SectionCard
      title="Needs attention now"
      subtitle="Most urgent first"
      count={items.length}
      accent="bg-brand-coral"
    >
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <AttentionItem key={item.booking.id} item={item} {...props} />
        ))}
      </ul>
    </SectionCard>
  );
}
