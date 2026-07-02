// Section A — Immediate attention. The ranked "act now" queue: late arrivals,
// dogs waiting to be collected, unconfirmed bookings, and outstanding payments
// on dogs in the salon. Each row shows the reason + a time-sensitivity cue and
// one visible primary action.
import { SectionCard, EmptyState, StatusPill, WelfareChips, PrimaryButton, GhostButton, formatMinutes, formatMoney } from "./parts.jsx";

const ACCENT = {
  late: "bg-brand-coral",
  ready: "bg-emerald-500",
  unconfirmed: "bg-amber-400",
  payment: "bg-slate-400",
};

function reasonText(item) {
  switch (item.primary) {
    case "late":
      return `${formatMinutes(item.overdueMinutes)} overdue`;
    case "ready":
      return item.waitMinutes != null ? `Ready — waiting ${formatMinutes(item.waitMinutes)}` : "Ready to collect";
    case "unconfirmed":
      return "Reminder sent — not yet confirmed";
    case "payment":
      return "Payment outstanding";
    default:
      return "";
  }
}

export function ImmediateAttention({
  items,
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
  onDismiss,
}) {
  return (
    <SectionCard
      title="Needs attention now"
      subtitle="The day's live priorities, most urgent first"
      count={items.length}
      accent="bg-brand-coral"
    >
      {items.length === 0 ? (
        <EmptyState>Nothing needs chasing right now. Lovely and calm. 🐾</EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => {
            const b = item.booking;
            const d = resolve(b);
            const welfare = getWelfare(b);
            const pay = paymentOf(b);
            return (
              <li
                key={b.id}
                className="flex items-stretch gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3"
              >
                <span aria-hidden className={`w-1.5 rounded-full shrink-0 ${ACCENT[item.primary] || "bg-slate-300"}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-800 text-[15px]">{d.dogName}</span>
                    <span className="text-[13px] text-slate-500">{d.owner}</span>
                    <StatusPill status={b.status} />
                  </div>
                  <div className="flex items-center gap-2 flex-wrap mt-0.5 text-[13px]">
                    <span className="font-semibold text-slate-700">{b.slot}</span>
                    <span className="text-slate-400" aria-hidden>·</span>
                    <span className="font-semibold text-brand-coral-dark">{reasonText(item)}</span>
                    {item.primary === "payment" && pay.amountDue != null && (
                      <span className="text-slate-600">{formatMoney(pay.amountDue)} due</span>
                    )}
                  </div>
                  <WelfareChips alerts={welfare.alerts} pregnant={welfare.pregnant} notes={welfare.notes} />
                  <div className="flex items-center gap-2 flex-wrap mt-2">
                    {item.primary === "late" && (
                      <>
                        <PrimaryButton onClick={() => onMarkArrived(b)}>Mark arrived</PrimaryButton>
                        <GhostButton onClick={() => onMessageOwner(b)}>Message owner</GhostButton>
                        <GhostButton onClick={() => onDidntShow(b)}>Didn&apos;t show</GhostButton>
                      </>
                    )}
                    {item.primary === "ready" && (
                      <>
                        <PrimaryButton onClick={() => onSendCollection(b)}>Send collection message</PrimaryButton>
                        <GhostButton onClick={() => onMarkCollected(b)}>Mark collected</GhostButton>
                      </>
                    )}
                    {item.primary === "unconfirmed" && (
                      <>
                        <PrimaryButton onClick={() => onMessageOwner(b)}>Message owner</PrimaryButton>
                        <GhostButton onClick={() => onMarkArrived(b)}>Mark arrived</GhostButton>
                      </>
                    )}
                    {item.primary === "payment" && (
                      <>
                        <PrimaryButton onClick={() => onMarkPaid(b)}>Mark paid</PrimaryButton>
                        <GhostButton onClick={() => onOpenBooking(b.id)}>Open booking</GhostButton>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => onDismiss(b.id)}
                      className="ml-auto text-[12px] text-slate-400 hover:text-slate-600 underline underline-offset-2"
                    >
                      Dismiss for today
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
