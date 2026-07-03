// Needs attention now — the ranked "act now" queue: late arrivals, dogs
// waiting too long to be collected, unconfirmed bookings, and outstanding
// payments on dogs in the salon. Each row leads with who + why + when, then
// one strong action and one quiet one. Money never gets a "dismiss": a
// payment row only leaves this list when it's recorded paid or the booking
// is opened and resolved properly.
import { SectionCard, StatusPill, WelfareChips, PrimaryButton, SecondaryButton, TertiaryLink, formatMinutes, formatMoney } from "./parts.jsx";

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
    case "ready":
      return item.waitMinutes != null ? `waiting ${formatMinutes(item.waitMinutes)}` : "ready to go home";
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
  const owesMoney = item.kinds.includes("payment") && pay.amountDue != null && pay.amountDue > 0;
  const collectionSent = !!b.collectionSentAt;

  return (
    <li className="flex items-stretch gap-3 rounded-xl border border-slate-200 bg-white p-3">
      <span aria-hidden className={`w-1.5 rounded-full shrink-0 ${ACCENT[item.primary] || "bg-slate-300"}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-slate-800 text-[15px]">{d.dogName}</span>
          <span className="text-[13px] text-slate-600">{d.owner}</span>
          <span className="text-[13px] font-semibold text-slate-700 tabular-nums">{b.slot}</span>
          <StatusPill status={b.status} />
        </div>
        <div className="flex items-center gap-x-2 gap-y-0.5 flex-wrap mt-1 text-[13px]">
          <span className="font-bold text-brand-coral-text">{KIND_LABEL[item.primary]}</span>
          {detail && <span className="font-semibold text-slate-700">· {detail}</span>}
          {owesMoney && (
            <span className="font-bold text-slate-800">· {formatMoney(pay.amountDue)} due</span>
          )}
          {item.primary === "unconfirmed" && (
            <span className="text-slate-600">· {lastContact(b)}</span>
          )}
        </div>
        <WelfareChips alerts={welfare.alerts} pregnant={welfare.pregnant} notes={welfare.notes} />
        <div className="flex items-center gap-2 flex-wrap mt-2.5">
          {item.primary === "late" && (
            <>
              <PrimaryButton onClick={() => onMarkArrived(b)}>Mark arrived</PrimaryButton>
              <SecondaryButton onClick={() => onMessageOwner(b)}>Message owner</SecondaryButton>
              <TertiaryLink onClick={() => onDidntShow(b)}>Didn&apos;t show</TertiaryLink>
            </>
          )}
          {item.primary === "ready" &&
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
              <PrimaryButton onClick={() => onMarkPaid(b)}>Mark paid</PrimaryButton>
              <SecondaryButton onClick={() => onOpenBooking(b.id)}>Open booking</SecondaryButton>
            </>
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
