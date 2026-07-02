// Section D — Collection queue. Every dog marked Ready and not yet collected,
// longest wait first. "Mark collected" sits behind a lightweight inline confirm
// (no heavy modal, no accidental taps).
import { useState } from "react";
import { SectionCard, EmptyState, PrimaryButton, GhostButton, formatMinutes, formatMoney } from "./parts.jsx";

function CollectRow({ entry, resolve, paymentOf, onSendCollection, onMarkCollected, onOpenBooking }) {
  const b = entry.booking;
  const d = resolve(b);
  const pay = paymentOf(b);
  const [confirming, setConfirming] = useState(false);

  const sentTime = b.collectionSentAt
    ? new Date(b.collectionSentAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" })
    : null;

  return (
    <li className="rounded-xl border border-slate-100 bg-white p-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-bold text-slate-800 text-[15px]">{d.dogName}</span>
        <span className="text-[13px] text-slate-500">{d.owner}</span>
        {entry.waitMinutes != null && (
          <span className="text-[12px] font-semibold text-emerald-700">waiting {formatMinutes(entry.waitMinutes)}</span>
        )}
      </div>
      <div className="text-[13px] text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
        {b.pickupBy && <span>Pick-up: {b.pickupBy}</span>}
        {pay.kind !== "paid" && pay.amountDue != null && (
          <span className="text-slate-600">{formatMoney(pay.amountDue)} due</span>
        )}
        {b.notes && b.notes.trim() && <span className="italic text-slate-500">“{b.notes.trim()}”</span>}
      </div>
      <div className="text-[12px] mt-1">
        {sentTime ? (
          <span className="text-emerald-700">✓ Collection message sent at {sentTime}</span>
        ) : (
          <span className="text-slate-400">Collection message not sent yet</span>
        )}
      </div>
      <div className="flex items-center gap-2 flex-wrap mt-2">
        <GhostButton onClick={() => onSendCollection(b)}>{sentTime ? "Resend message" : "Send collection message"}</GhostButton>
        {confirming ? (
          <>
            <PrimaryButton onClick={() => { onMarkCollected(b); setConfirming(false); }}>Confirm collected</PrimaryButton>
            <button type="button" onClick={() => setConfirming(false)} className="text-[12px] text-slate-400 hover:text-slate-600 underline">Cancel</button>
          </>
        ) : (
          <PrimaryButton onClick={() => setConfirming(true)}>Mark collected</PrimaryButton>
        )}
        <button type="button" onClick={() => onOpenBooking(b.id)} className="ml-auto text-[12px] font-semibold text-brand-purple hover:underline">Open</button>
      </div>
    </li>
  );
}

export function CollectionQueue(props) {
  const { entries } = props;
  return (
    <SectionCard title="Collection queue" subtitle="Dogs ready to go home" count={entries.length} accent="bg-emerald-500">
      {entries.length === 0 ? (
        <EmptyState>No dogs waiting to be collected. All home. 🏡</EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((e) => (
            <CollectRow key={e.booking.id} entry={e} {...props} />
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
