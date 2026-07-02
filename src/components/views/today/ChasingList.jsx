// Section C — Late & unconfirmed chasing. A focused list combining late
// arrivals and sent-but-unconfirmed bookings, showing how late / the
// confirmation state and when the owner was last contacted, with one-click
// messaging and resolve-with-reason.
import { SectionCard, EmptyState, formatMinutes } from "./parts.jsx";

function lastContact(b) {
  if (b.reminderConfirmedAt) return null; // confirmed — nothing to chase
  if (b.reminderSentAt) {
    const t = new Date(b.reminderSentAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
    return `Reminder sent ${t}`;
  }
  return "Not contacted yet";
}

export function ChasingList({ items, resolve, onMessageOwner, onMarkArrived, onDidntShow, onDismiss }) {
  const chasing = items.filter((i) => i.primary === "late" || i.primary === "unconfirmed");
  return (
    <SectionCard title="Late & to confirm" subtitle="Who to chase, and how they were last contacted" count={chasing.length} accent="bg-amber-400">
      {chasing.length === 0 ? (
        <EmptyState>Nobody to chase — everyone&apos;s on track.</EmptyState>
      ) : (
        <ul className="flex flex-col divide-y divide-slate-100">
          {chasing.map((item) => {
            const b = item.booking;
            const d = resolve(b);
            return (
              <li key={b.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-800 text-[14px]">{d.dogName}</span>
                    <span className="text-[12px] text-slate-500">{d.owner}</span>
                    <span className="text-[12px] font-semibold text-slate-600 tabular-nums">{b.slot}</span>
                  </div>
                  <div className="text-[12px] mt-0.5">
                    <span className="font-semibold text-brand-coral-dark">
                      {item.primary === "late" ? `${formatMinutes(item.overdueMinutes)} overdue` : "Awaiting confirmation"}
                    </span>
                    <span className="text-slate-400"> · {lastContact(b)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button type="button" onClick={() => onMessageOwner(b)} className="text-[12px] font-semibold text-brand-whatsapp hover:underline">Message</button>
                  {item.primary === "late" ? (
                    <>
                      <button type="button" onClick={() => onMarkArrived(b)} className="text-[12px] font-semibold text-brand-teal-dark hover:underline">Arrived</button>
                      <button type="button" onClick={() => onDidntShow(b)} className="text-[12px] font-semibold text-slate-500 hover:underline">No-show</button>
                    </>
                  ) : (
                    <button type="button" onClick={() => onDismiss(b.id)} className="text-[12px] text-slate-400 hover:text-slate-600 underline">Resolve</button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
