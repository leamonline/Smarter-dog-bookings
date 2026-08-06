// One appointment-slot group for the Arriving lane. Several dogs due at the
// same time share ONE heading (time, dog count, countdown, confirmation
// count) instead of each card repeating the same slot and countdown — the
// "shared slot heading" from the Daily Brief mobile-prioritisation brief.
// Grouping itself is done by the pure `groupFeedBySlot` engine selector
// (src/engine/today.ts); this file only renders one already-built group.
import { ChevronRight, MessageCircle, Phone } from "lucide-react";
import { LiveArrivalDivider } from "./LiveArrivalDivider.jsx";
import { MoreMenu, OnTheWayChip, WelfareChips } from "./parts.jsx";
import {
  ChatConfirmedChip,
  ConfirmationException,
  ConfirmedMark,
  PaymentState,
  contactClass,
  dogCountLabel,
  firstName,
  primaryClass,
  serviceLabel,
  telephoneHref,
} from "./StatusBoard.jsx";

function ArrivingCardActions({ entry, display, handlers }) {
  const booking = entry.booking;
  const name = display.dogName;
  const contactName = firstName(display.owner);
  const phoneHref = telephoneHref(display.ownerPhone);
  const isUnconfirmed = entry.actionReasons?.includes("confirmation");
  const needsContact = entry.isLate || isUnconfirmed;
  const showCall = entry.isLate && !!phoneHref;
  const journey = (id) => handlers.onJourneyAction?.(booking, { id, completed: false, next: true });
  const commonMore = [
    { label: `Message ${contactName}`, onClick: () => handlers.onMessageOwner?.(booking) },
    { label: "Open booking", onClick: () => handlers.onOpenBooking?.(booking.id) },
  ];

  return (
    <div className="flex w-full flex-wrap items-center justify-end gap-1.5">
      <button data-primary-action="true" type="button" aria-label={`Check in ${name}`} onClick={() => journey("checkIn")} className={primaryClass}>
        Check in
      </button>
      {showCall ? (
        <a href={phoneHref} aria-label={`Call ${contactName} about ${name}`} className={contactClass}>
          <Phone size={14} aria-hidden="true" />
          Call
        </a>
      ) : null}
      {needsContact ? (
        <button
          type="button"
          aria-label={`Message ${contactName} about ${name}`}
          onClick={() => handlers.onMessageOwner?.(booking)}
          className={contactClass}
        >
          <MessageCircle size={14} aria-hidden="true" />
          Message
        </button>
      ) : null}
      <MoreMenu
        menuLabel={`More actions for ${name}`}
        items={[
          ...commonMore,
          { label: "Didn't show", onClick: () => handlers.onDidntShow?.(booking) },
          { label: "Cancel booking", onClick: () => handlers.onOpenBooking?.(booking.id) },
          { label: "Reschedule booking", onClick: () => handlers.onOpenBooking?.(booking.id) },
        ]}
      />
    </div>
  );
}

function ArrivingCard({ entry, resolve, getWelfare, paymentOf, handlers, onTheWaySignals }) {
  const booking = entry.booking;
  const display = resolve(booking);
  const payment = paymentOf(booking);
  const welfare = getWelfare?.(booking) || { alerts: [], pregnant: false, notes: "" };
  const confirmedAt = booking.reminderConfirmedAt;
  const successTone = confirmedAt
    ? "border-emerald-200 bg-emerald-50/45"
    : "border-brand-paper-line bg-white";
  const isConfirmationAction = entry.actionReasons?.includes("confirmation");

  return (
    <div data-status-card-shell className="w-full">
      <article
        id={`today-card-${booking.id}`}
        data-booking-id={booking.id}
        data-needs-action={entry.needsAction ? "true" : "false"}
        tabIndex={-1}
        aria-label={`${display.dogName}, ${booking.slot || "Time missing"}, Arriving`}
        className={`min-w-0 rounded-xl border px-2.5 py-1.5 shadow-[0_1px_3px_rgba(15,23,42,0.05)] sm:px-3 ${successTone}`}
      >
        <div className="flex min-w-0 items-start gap-2">
          <div className="min-w-0 flex-1 py-0.5">
            <div className="flex min-w-0 items-center gap-1.5">
              <h4 className="min-w-0 truncate font-display text-[18px] font-bold leading-tight text-brand-purple">
                <button
                  type="button"
                  aria-label={`Open ${display.dogName}'s dog file`}
                  onClick={() => handlers.onOpenDog?.(booking._dogId)}
                  className="max-w-full truncate rounded-sm text-left outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand-purple"
                >
                  {display.dogName}
                </button>
              </h4>
              {entry.isLate ? (
                <span data-action-reason="late" className="sr-only">Late arrival</span>
              ) : null}
              <ConfirmedMark confirmedAt={confirmedAt} />
            </div>
            <div className="mt-0.5 flex flex-wrap min-w-0 items-center gap-x-1 gap-y-0.5 text-[12px] leading-tight text-slate-600">
              <span className="shrink-0">{serviceLabel(booking.service)}</span>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                aria-label={`Open ${display.owner}'s human file`}
                onClick={() => handlers.onOpenHuman?.(booking._ownerId)}
                className="rounded-sm text-left font-medium text-slate-600 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand-purple"
              >
                {display.owner}
              </button>
              <span className="ml-auto shrink-0">
                <PaymentState payment={payment} actionReason={false} />
              </span>
            </div>
            {isConfirmationAction || entry.chatConfirmation || onTheWaySignals?.[booking.id] ? (
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <ConfirmationException needsConfirmation={isConfirmationAction} />
                <ChatConfirmedChip signal={entry.chatConfirmation} />
                <OnTheWayChip signal={onTheWaySignals?.[booking.id]} />
              </div>
            ) : null}
            <WelfareChips {...welfare} />
          </div>
          <button
            type="button"
            aria-label={`Open ${booking.slot || "unscheduled"} booking`}
            onClick={() => handlers.onOpenBooking?.(booking.id)}
            className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-slate-400 outline-none transition-colors hover:bg-slate-50 hover:text-brand-purple focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2"
          >
            <ChevronRight size={20} aria-hidden="true" />
          </button>
        </div>
        <div className="mt-1 flex min-h-11 items-center border-t border-slate-200/70 pt-1">
          <ArrivingCardActions entry={entry} display={display} handlers={handlers} />
        </div>
      </article>
    </div>
  );
}

/**
 * One slot's heading (time · dog count · shared countdown · to-confirm count)
 * plus its cards. `group` is one entry from `groupFeedBySlot`. The countdown
 * is read from the first entry's already-computed `timingLabel` rather than
 * recomputed here: every booking in a slot group shares the same slot and
 * `now`, so `isLateArrival`/`minutesUntilSlot` are identical across the whole
 * group already — reusing it keeps this component free of date arithmetic
 * and guarantees the heading can never disagree with its own cards.
 */
export function ArrivingSlotGroup({
  group,
  liveFocusId,
  liveContext,
  resolve,
  getWelfare,
  paymentOf,
  handlers,
  onTheWaySignals,
}) {
  const toConfirm = group.entries.filter((entry) => entry.actionReasons?.includes("confirmation")).length;
  const countdown = group.entries[0]?.timingLabel || null;
  const isLateGroup = !!group.entries[0]?.isLate;
  const isFocusGroup = liveContext != null
    && group.entries.some((entry) => entry.booking.id === liveFocusId);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 px-1 pt-1">
        <h3 className="text-[13px] font-bold tabular-nums text-brand-purple">{group.label}</h3>
        <span aria-hidden="true" className="text-slate-300">·</span>
        <span className="text-[12px] font-semibold text-slate-600">{dogCountLabel(group.entries.length)}</span>
        {countdown ? (
          <>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span className={`text-[12px] font-bold tabular-nums ${isLateGroup ? "text-brand-coral-text" : "text-slate-600"}`}>
              {countdown}
            </span>
          </>
        ) : null}
        {toConfirm > 0 ? (
          <>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span className="text-[12px] font-bold text-amber-900">{toConfirm} to confirm</span>
          </>
        ) : null}
      </div>
      {isFocusGroup ? (
        <div className="flex flex-col gap-0.5">
          <span className="px-1 text-[10px] font-bold uppercase tracking-wide text-brand-purple/70">Next arrival</span>
          <LiveArrivalDivider context={liveContext} />
        </div>
      ) : null}
      <div className="flex flex-col gap-1.5">
        {group.entries.map((entry) => (
          <ArrivingCard
            key={entry.booking.id}
            entry={entry}
            resolve={resolve}
            getWelfare={getWelfare}
            paymentOf={paymentOf}
            handlers={handlers}
            onTheWaySignals={onTheWaySignals}
          />
        ))}
      </div>
    </div>
  );
}
