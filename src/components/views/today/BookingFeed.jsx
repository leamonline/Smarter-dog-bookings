// The booking feed — one time-ordered list, one card per booking/dog. Every
// reason a booking might need attention (late, waiting to be collected, not
// confirmed, owed payment, care notes) folds onto its single card, so a booking
// never appears twice. The next upcoming booking is highlighted. Each card
// leads with one primary action that adapts to the booking's state, one
// secondary if useful, and a "More" menu for the rest — never five equal
// buttons. Built on the shared parts.jsx primitives + the pure buildTodayFeed
// selector, so the logic stays testable.
import { useState } from "react";
import {
  Chip,
  WelfareChips,
  BookingStatusLine,
  OnTheWayChip,
  PrimaryButton,
  SecondaryButton,
  MarkPaidAction,
  MoreMenu,
  formatMinutes,
} from "./parts.jsx";

/** Left accent bar colour — the most salient state wins, never colour alone. */
function accentFor(entry) {
  if (entry.isLate) return "bg-brand-coral";
  if (entry.needsAction) return "bg-amber-400";
  if (entry.isNext) return "bg-brand-teal";
  if (entry.stage === "ready") return "bg-emerald-500";
  if (entry.stage === "inSalon") return "bg-brand-cyan";
  if (entry.stage === "collected") return "bg-slate-300";
  return "bg-slate-200";
}

function lastContact(b) {
  if (!b.reminderSentAt) return "not contacted yet";
  const t = new Date(b.reminderSentAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
  return `reminder sent ${t}`;
}

export function BookingFeedCard({
  entry,
  resolve,
  getWelfare,
  paymentOf,
  onTheWaySignals,
  onMarkArrived,
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
  const [confirming, setConfirming] = useState(false);

  const isReady = entry.stage === "ready";
  const isInSalon = entry.stage === "inSalon";
  const isCollected = entry.stage === "collected";
  const collectionSent = !!b.collectionSentAt;
  const otw = isReady && b.whatsappConversationId ? onTheWaySignals?.[b.whatsappConversationId] : null;
  // Payment is only actionable once the dog has arrived — a not-yet-arrived dog
  // pays at pick-up, so we never nudge "Mark paid" on a still-Booked card.
  const showMarkPaid = entry.owes && entry.stage !== "booked";
  // Money never hides; only a not-yet-arrived, not-owing booking can be tucked away.
  const canHide = entry.stage === "booked" && !entry.owes;

  // ---- The one urgency chip (specific reason preferred over a generic one) ----
  const urgencyChip = entry.isLate ? (
    <Chip dot className="bg-brand-coral/10 text-brand-coral-text">Late</Chip>
  ) : entry.isUnconfirmed ? (
    <Chip dot className="bg-amber-50 text-amber-800">Not confirmed</Chip>
  ) : entry.needsAction && !showMarkPaid ? (
    <Chip dot className="bg-brand-coral/10 text-brand-coral-text">Needs action</Chip>
  ) : null;

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
  } else if (isInSalon) {
    primary = <PrimaryButton onClick={() => onMarkReady(b)}>Mark ready</PrimaryButton>;
    if (!showMarkPaid) secondary = <SecondaryButton onClick={() => onMessageOwner(b)}>Message owner</SecondaryButton>;
    moreItems.push(openBooking);
    if (showMarkPaid) moreItems.push(messageOwner);
  } else if (isCollected) {
    if (!showMarkPaid) secondary = <SecondaryButton onClick={() => onOpenBooking(b.id)}>Open booking</SecondaryButton>;
    moreItems.push(messageOwner);
    if (showMarkPaid) moreItems.push(openBooking);
  } else if (entry.isUnconfirmed) {
    primary = <PrimaryButton onClick={() => onMessageOwner(b)}>Message owner</PrimaryButton>;
    secondary = <SecondaryButton onClick={() => onMarkArrived(b)}>Mark arrived</SecondaryButton>;
    moreItems.push(openBooking);
  } else {
    // Plain booked / next.
    primary = <PrimaryButton onClick={() => onMarkArrived(b)}>Mark arrived</PrimaryButton>;
    secondary = <SecondaryButton onClick={() => onMessageOwner(b)}>Message owner</SecondaryButton>;
    moreItems.push(openBooking);
  }

  if (canHide) moreItems.push({ label: "Hide until tomorrow", onClick: () => onHideUntilTomorrow(b.id) });

  const muted = isCollected;

  return (
    <li className={`flex items-stretch gap-3 rounded-xl border p-3 ${entry.isNext ? "border-brand-teal/40 bg-brand-teal/[0.04]" : muted ? "border-slate-200 bg-slate-50/60" : "border-slate-200 bg-white"}`}>
      <span aria-hidden className={`w-1.5 rounded-full shrink-0 ${accentFor(entry)}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`font-bold text-[15px] ${muted ? "text-slate-600" : "text-slate-800"}`}>{d.dogName}</span>
          <span className="text-[13px] text-slate-600">{d.owner}</span>
          {d.breed && <span className="text-[12px] text-slate-500">{d.breed}</span>}
          {b.service && <span className="text-[12px] text-slate-500">· {b.service}</span>}
          <span className="ml-auto text-[13px] font-bold text-slate-700 tabular-nums">{b.slot}</span>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
          {urgencyChip}
          {entry.isNext && <Chip dot className="bg-brand-teal/15 text-brand-teal-text">Next</Chip>}
          {showMarkPaid && <Chip dot className="bg-brand-yellow/25 text-slate-800">Payment due</Chip>}
        </div>

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
          {showMarkPaid && <MarkPaidAction booking={b} onMarkPaid={onMarkPaid} variant="secondary" />}
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

export function BookingFeed({ entries, ...handlers }) {
  return (
    <section
      className="rounded-2xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] overflow-hidden"
      aria-label="Today's bookings"
    >
      <ul className="flex flex-col gap-2 p-2 sm:p-3">
        {entries.map((entry) => (
          <BookingFeedCard key={entry.booking.id} entry={entry} {...handlers} />
        ))}
      </ul>
    </section>
  );
}
