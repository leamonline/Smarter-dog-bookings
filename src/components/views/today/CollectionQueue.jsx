// Ready for collection — every dog marked Ready and not yet collected,
// longest wait first. "Mark collected" sits behind a lightweight inline
// confirm (no heavy modal, no accidental taps), and the collection-message
// state is spelled out so nobody wonders whether the owner was told.
import { useState } from "react";
import { SectionCard, PrimaryButton, SecondaryButton, TertiaryLink, BookingStatusLine, OnTheWayChip } from "./parts.jsx";

function CollectRow({ entry, resolve, paymentOf, onSendCollection, onMarkCollected, onOpenBooking, onTheWaySignals }) {
  const b = entry.booking;
  const d = resolve(b);
  const pay = paymentOf(b);
  const [confirming, setConfirming] = useState(false);
  const otw = b.whatsappConversationId ? onTheWaySignals?.[b.whatsappConversationId] : null;
  const collectionSent = !!b.collectionSentAt;

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-bold text-slate-800 text-[15px]">{d.dogName}</span>
        <span className="text-[13px] text-slate-600">{d.owner}</span>
      </div>
      <BookingStatusLine booking={b} waitMinutes={entry.waitMinutes} pay={pay}>
        {b.pickupBy && <span>Pick-up: {b.pickupBy}</span>}
        {otw && <OnTheWayChip signal={otw} />}
        {b.notes && b.notes.trim() && <span className="italic">“{b.notes.trim()}”</span>}
      </BookingStatusLine>
      <div className="flex items-center gap-2 flex-wrap mt-2">
        {confirming ? (
          <>
            <PrimaryButton onClick={() => { onMarkCollected(b); setConfirming(false); }}>Confirm collected</PrimaryButton>
            <TertiaryLink onClick={() => setConfirming(false)}>Cancel</TertiaryLink>
          </>
        ) : collectionSent ? (
          <>
            <PrimaryButton onClick={() => setConfirming(true)}>Mark collected</PrimaryButton>
            <SecondaryButton onClick={() => onSendCollection(b)}>Resend message</SecondaryButton>
          </>
        ) : (
          <>
            <PrimaryButton onClick={() => onSendCollection(b)}>Send collection message</PrimaryButton>
            <SecondaryButton onClick={() => setConfirming(true)}>Mark collected</SecondaryButton>
          </>
        )}
        <span className="ml-auto -my-1">
          <TertiaryLink tone="purple" onClick={() => onOpenBooking(b.id)}>Open</TertiaryLink>
        </span>
      </div>
    </li>
  );
}

export function CollectionQueue(props) {
  const { entries } = props;
  return (
    <SectionCard title="Ready for collection" subtitle="Groomed, gorgeous and waiting to go home" count={entries.length} accent="bg-emerald-500">
      <ul className="flex flex-col gap-2">
        {entries.map((e) => (
          <CollectRow key={e.booking.id} entry={e} {...props} />
        ))}
      </ul>
    </SectionCard>
  );
}
