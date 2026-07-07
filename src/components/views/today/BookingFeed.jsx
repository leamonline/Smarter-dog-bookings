// The booking feed — one time-ordered list, one card per booking/dog. Every
// reason a booking might need attention (late, waiting to be collected, not
// confirmed, owed payment, care notes) folds onto its single card, so a booking
// never appears twice. The next upcoming booking is highlighted. Each card
// leads with ONE state-aware primary action (the same contextual-action system
// the sticky Now strip uses), one secondary where genuinely useful, and a
// "More" menu for the rest — never five equal buttons. Rail colour + status
// label both come from the engine's entryOpStatus, so a card can never show a
// rail that disagrees with its label or its action.
import { useState } from "react";
import { entryOpStatus } from "../../../engine/today";
import { BOOKING_STATUS } from "../../../constants/index";
import {
  Chip,
  OpStatusChip,
  RAIL_TONE_CLASS,
  WelfareChips,
  BookingStatusLine,
  OnTheWayChip,
  PrimaryButton,
  SecondaryButton,
  MarkPaidAction,
  MoreMenu,
  formatMinutes,
} from "./parts.jsx";

function lastContact(b) {
  if (!b.reminderSentAt) return "not contacted yet";
  const t = new Date(b.reminderSentAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
  return `reminder sent ${t}`;
}

export function BookingFeedCard({
  entry,
  highlighted = false,
  resolve,
  getWelfare,
  paymentOf,
  onTheWaySignals,
  onMarkArrived,
  onStartGroom,
  onMarkReady,
  onMarkCollected,
  onSendCollection,
  onMessageOwner,
  onMarkPaid,
  onDidntShow,
  onOpenBooking,
  onHideUntilTomorrow,
}) {
  const b = entry.booking;
  const d = resolve(b);
  const welfare = getWelfare(b);
  const pay = paymentOf(b);
  const op = entryOpStatus(entry);
  const [confirming, setConfirming] = useState(false);

  const isReady = entry.stage === "ready";
  const isCollected = entry.stage === "collected";
  const collectionSent = !!b.collectionSentAt;
  const otw = isReady && b.whatsappConversationId ? onTheWaySignals?.[b.whatsappConversationId] : null;
  // Payment is only actionable once the dog has arrived — a not-yet-arrived dog
  // pays at pick-up, so we never nudge "Mark paid" on a still-Booked card.
  const owesNow = entry.owes && entry.stage !== "booked";
  // Money never hides; only a not-yet-arrived, not-owing booking can be tucked away.
  const canHide = entry.stage === "booked" && !entry.owes;

  // The one urgency/status chip — engine-decided, calm states show nothing here
  // (their StatusPill in the status line already says it).
  const chipKinds = ["overdue", "paymentDue", "unconfirmed", "readyWaiting", "next"];
  const statusChip = chipKinds.includes(op.kind) ? <OpStatusChip opStatus={op} /> : null;
  // Secondary "owes" flag when payment isn't already the headline.
  const owesChip = owesNow && op.kind !== "paymentDue" && (
    <Chip dot className="bg-brand-yellow/25 text-slate-800">Payment due</Chip>
  );

  // ---- Action set, adapted to the booking's state ----
  let primary = null;
  let secondary = null;
  const moreItems = [];

  const messageOwner = { label: "Message owner", onClick: () => onMessageOwner(b) };
  const openBooking = { label: "Open booking", onClick: () => onOpenBooking(b.id) };

  if (entry.isLate) {
    primary = <PrimaryButton onClick={() => onMarkArrived(b)}>Mark arrived</PrimaryButton>;
    secondary = <SecondaryButton onClick={() => onMessageOwner(b)}>Message owner</SecondaryButton>;
    moreItems.push({ label: "Didn't show", onClick: () => onDidntShow(b) }, openBooking);
  } else if (isReady) {
    if (confirming) {
      primary = <PrimaryButton onClick={() => { onMarkCollected(b); setConfirming(false); }}>Confirm collected</PrimaryButton>;
      secondary = <SecondaryButton onClick={() => setConfirming(false)}>Cancel</SecondaryButton>;
    } else if (collectionSent) {
      primary = <PrimaryButton onClick={() => setConfirming(true)}>Mark collected</PrimaryButton>;
      secondary = <SecondaryButton onClick={() => onSendCollection(b)}>Resend message</SecondaryButton>;
    } else {
      primary = <PrimaryButton onClick={() => onSendCollection(b)}>Send collection message</PrimaryButton>;
      secondary = <SecondaryButton onClick={() => setConfirming(true)}>Mark collected</SecondaryButton>;
    }
    moreItems.push(messageOwner, openBooking);
  } else if (entry.stage === "inSalon") {
    // Checked in → the groom is the next step; In bath → it's finishing.
    if (b.status === BOOKING_STATUS.CHECKED_IN) {
      primary = <PrimaryButton onClick={() => onStartGroom(b)}>Start groom</PrimaryButton>;
      secondary = <SecondaryButton onClick={() => onMarkReady(b)}>Mark ready</SecondaryButton>;
    } else {
      primary = <PrimaryButton onClick={() => onMarkReady(b)}>Mark ready</PrimaryButton>;
    }
    moreItems.push(messageOwner, openBooking);
  } else if (isCollected) {
    if (owesNow) {
      // Money at risk — recording the payment IS the primary action.
      primary = <MarkPaidAction booking={b} onMarkPaid={onMarkPaid} variant="primary" />;
      moreItems.push(messageOwner, openBooking);
    } else {
      secondary = <SecondaryButton onClick={() => onOpenBooking(b.id)}>Open booking</SecondaryButton>;
      moreItems.push(messageOwner);
    }
  } else if (entry.isUnconfirmed) {
    // A reminder was sent and went unanswered — the job is to chase it, which
    // happens in the owner's message thread.
    primary = <PrimaryButton onClick={() => onMessageOwner(b)}>Chase confirmation</PrimaryButton>;
    secondary = <SecondaryButton onClick={() => onMarkArrived(b)}>Mark arrived</SecondaryButton>;
    moreItems.push(openBooking);
  } else {
    // Plain booked / next.
    primary = <PrimaryButton onClick={() => onMarkArrived(b)}>Mark arrived</PrimaryButton>;
    moreItems.push(messageOwner, openBooking);
  }

  if (canHide) moreItems.push({ label: "Hide until tomorrow", onClick: () => onHideUntilTomorrow(b.id) });

  // "Mark paid" stays reachable (not primary) for an arrived/ready dog that owes.
  const showMarkPaidSecondary = owesNow && !isCollected;

  const muted = isCollected && !owesNow;

  return (
    <li
      id={`today-card-${b.id}`}
      className={`flex items-stretch gap-3 rounded-xl border p-3 scroll-mt-32 motion-safe:transition-shadow ${
        highlighted
          ? "border-brand-teal ring-2 ring-brand-teal/50"
          : entry.isNext
            ? "border-brand-teal/40 bg-brand-teal/[0.04]"
            : muted
              ? "border-slate-200 bg-slate-50/60"
              : "border-slate-200 bg-white"
      }`}
    >
      <span aria-hidden className={`w-1.5 rounded-full shrink-0 ${RAIL_TONE_CLASS[op.tone] || RAIL_TONE_CLASS.neutral}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`font-bold text-[15px] ${muted ? "text-slate-600" : "text-slate-800"}`}>{d.dogName}</span>
          <span className="text-[13px] text-slate-600">{d.owner}</span>
          {d.breed && <span className="text-[12px] text-slate-500">{d.breed}</span>}
          {b.service && <span className="text-[12px] text-slate-500">· {b.service}</span>}
          <span className="ml-auto text-[13px] font-bold text-slate-700 tabular-nums">{b.slot}</span>
        </div>

        {(statusChip || owesChip) && (
          <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
            {statusChip}
            {owesChip}
          </div>
        )}

        <BookingStatusLine booking={b} waitMinutes={entry.waitMinutes} pay={pay}>
          {entry.isLate && <span className="font-semibold text-brand-coral-text">{formatMinutes(entry.overdueMinutes)} overdue</span>}
          {entry.isUnconfirmed && <span>· {lastContact(b)}</span>}
          {isReady && b.pickupBy && <span>Pick-up: {b.pickupBy}</span>}
          {otw && <OnTheWayChip signal={otw} />}
          {b.notes && b.notes.trim() && <span className="italic">“{b.notes.trim()}”</span>}
        </BookingStatusLine>

        <WelfareChips alerts={welfare.alerts} pregnant={welfare.pregnant} notes={welfare.notes} />

        <div className="flex items-center gap-2 flex-wrap mt-2.5">
          {primary}
          {secondary}
          {showMarkPaidSecondary && <MarkPaidAction booking={b} onMarkPaid={onMarkPaid} variant="secondary" />}
          {moreItems.length > 0 && (
            <span className="ml-auto">
              <MoreMenu items={moreItems} menuLabel={`More actions for ${d.dogName}`} />
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

export function BookingFeed({ entries, highlightId = null, ...handlers }) {
  return (
    <section
      className="rounded-2xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] overflow-hidden"
      aria-label="Today's bookings"
    >
      <ul className="flex flex-col gap-2 p-2 sm:p-3">
        {entries.map((entry) => (
          <BookingFeedCard
            key={entry.booking.id}
            entry={entry}
            highlighted={highlightId === entry.booking.id}
            {...handlers}
          />
        ))}
      </ul>
    </section>
  );
}
