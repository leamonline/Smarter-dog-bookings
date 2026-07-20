import { Fragment, useState } from "react";
import { Check, Phone } from "lucide-react";
import { BOOKING_STATUS, SERVICES, getStatusDisplay } from "../../../constants/index";
import { LiveArrivalDivider } from "./LiveArrivalDivider.jsx";
import { MoreMenu, OnTheWayChip, WelfareChips, formatMoney } from "./parts.jsx";

const LANE_META = {
  due: {
    title: "Arriving",
    purpose: "Dogs expected to arrive.",
    accent: "border-t-brand-yellow",
    count: "bg-brand-yellow/25 text-amber-900",
  },
  withUs: {
    title: "With us",
    purpose: "Dogs physically in the salon.",
    accent: "border-t-brand-teal",
    count: "bg-brand-teal/10 text-brand-teal-text",
  },
  ready: {
    title: "Ready to go",
    purpose: "Finished dogs waiting for collection.",
    accent: "border-t-brand-purple",
    count: "bg-brand-purple/10 text-brand-purple",
  },
};

function dogCountLabel(count) {
  return `${count} ${count === 1 ? "dog" : "dogs"}`;
}

function serviceLabel(service) {
  return SERVICES.find((item) => item.id === service)?.name || service || "Service not set";
}

function firstName(name) {
  return String(name || "the human").trim().split(/\s+/)[0] || "the human";
}

function telephoneHref(phone) {
  const compact = String(phone || "").replace(/[^\d+]/g, "");
  return compact ? `tel:${compact}` : null;
}

function formatConfirmedAt(iso) {
  if (!iso) return null;
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return null;
  return value.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/London",
  });
}

const primaryClass =
  "inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-yellow px-4 text-[13px] font-bold text-brand-purple outline-none transition-colors hover:bg-brand-yellow-dark focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2";
const secondaryClass =
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-brand-purple/20 bg-white px-3.5 text-[13px] font-bold text-brand-purple outline-none transition-colors hover:bg-brand-purple/5 focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2";

function ConfirmationSignal({ confirmedAt, needsConfirmation }) {
  const time = formatConfirmedAt(confirmedAt);
  if (needsConfirmation) {
    return (
      <span
        data-action-reason="confirmation"
        className="inline-flex min-h-6 items-center rounded-full border border-brand-yellow-dark/20 bg-brand-yellow/25 px-2 text-[11px] font-bold text-amber-900"
      >
        Needs confirmation
      </span>
    );
  }
  if (!time) return null;
  return (
    <span
      role="img"
      aria-label={`Customer confirmed at ${time}`}
      title={`Confirmed via WhatsApp at ${time}`}
      className="inline-flex min-h-6 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 text-[11px] font-bold text-emerald-700"
    >
      <Check size={13} strokeWidth={3} aria-hidden="true" />
      Confirmed
    </span>
  );
}

function PaymentState({ payment, actionReason = false }) {
  if (!payment) return null;
  if (payment.kind === "paid") {
    return (
      <span className="inline-flex min-h-6 items-center rounded-full bg-emerald-50 px-2 text-[11px] font-bold text-emerald-700">
        Paid
      </span>
    );
  }
  if (payment.amountDue != null) {
    return (
      <span
        data-action-reason={actionReason ? "payment" : undefined}
        className="inline-flex min-h-6 items-center rounded-full bg-brand-yellow/25 px-2 text-[11px] font-bold text-amber-900"
      >
        {formatMoney(payment.amountDue)} due
      </span>
    );
  }
  return (
    <span
      data-action-reason={actionReason ? "payment" : undefined}
      className="inline-flex min-h-6 items-center rounded-full bg-slate-100 px-2 text-[11px] font-bold text-slate-600"
    >
      {payment.label}
    </span>
  );
}

function CardActions({ entry, display, payment, handlers }) {
  const booking = entry.booking;
  const name = display.dogName;
  const contactName = firstName(display.owner);
  const phoneHref = telephoneHref(display.ownerPhone);
  const journey = (id) => handlers.onJourneyAction?.(booking, { id, completed: false, next: true });
  const commonMore = [
    { label: `Message ${contactName}`, onClick: () => handlers.onMessageOwner?.(booking) },
    { label: "Open booking", onClick: () => handlers.onOpenBooking?.(booking.id) },
  ];

  if (entry.lane === "due") {
    if (entry.isLate) {
      return (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {phoneHref ? (
            <a href={phoneHref} aria-label={`Call ${contactName} about ${name}`} className={primaryClass}>
              <Phone size={15} className="mr-1.5" aria-hidden="true" />
              Call {contactName}
            </a>
          ) : (
            <button type="button" onClick={() => handlers.onMessageOwner?.(booking)} className={primaryClass}>
              Contact {contactName}
            </button>
          )}
          <button type="button" aria-label={`Check in ${name}`} onClick={() => journey("checkIn")} className={secondaryClass}>
            Check in
          </button>
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
    return (
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button type="button" aria-label={`Check in ${name}`} onClick={() => journey("checkIn")} className={primaryClass}>
          Check in
        </button>
        <MoreMenu menuLabel={`More actions for ${name}`} items={commonMore} />
      </div>
    );
  }

  if (entry.lane === "withUs") {
    const checkedIn = booking.status === BOOKING_STATUS.CHECKED_IN;
    return (
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          aria-label={checkedIn ? `Start ${name}'s groom` : `Mark ${name} ready for collection`}
          onClick={() => journey(checkedIn ? "startGroom" : "ready")}
          className={primaryClass}
        >
          {checkedIn ? "Start groom" : "Ready for collection"}
        </button>
        <MoreMenu menuLabel={`More actions for ${name}`} items={commonMore} />
      </div>
    );
  }

  const amountDue = payment?.amountDue;
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {amountDue != null && amountDue > 0 ? (
        <button
          type="button"
          aria-label={`Take ${formatMoney(amountDue)} from ${name}`}
          onClick={() => handlers.onOpenInvoice?.(booking)}
          className={secondaryClass}
        >
          Take {formatMoney(amountDue)}
        </button>
      ) : null}
      <button
        type="button"
        aria-label={`Mark ${name} collected`}
        onClick={() => handlers.onRequestCollected?.(booking)}
        className={primaryClass}
      >
        Mark collected
      </button>
      <MoreMenu menuLabel={`More actions for ${name}`} items={commonMore} />
    </div>
  );
}

function StatusBookingCard({ entry, laneTitle, resolve, getWelfare, paymentOf, handlers, onTheWaySignals }) {
  const booking = entry.booking;
  const display = resolve(booking);
  const payment = paymentOf(booking);
  const welfare = getWelfare?.(booking) || { alerts: [], pregnant: false, notes: "" };
  const confirmedAt = booking.reminderConfirmedAt;
  const progressed = booking.status !== BOOKING_STATUS.BOOKED;
  const successTone = confirmedAt || progressed
    ? "border-emerald-200 bg-emerald-50/45"
    : "border-brand-paper-line bg-white";
  const actionReasons = entry.actionReasons || [];
  const isConfirmationAction = actionReasons.includes("confirmation");
  const isPaymentAction = actionReasons.includes("payment");
  const isCollectionAction = actionReasons.includes("collection");
  const timingActionReason = entry.isLate
    ? "late"
    : entry.lane === "ready" && isCollectionAction && entry.timingLabel
      ? "collection"
      : undefined;
  const statusLabel = entry.lane === "due" && !entry.isLate && entry.timingLabel !== "Due now"
    ? "Upcoming"
    : getStatusDisplay(booking.status).label;

  return (
    <div data-status-card-shell className="w-full">
      <article
        id={`today-card-${booking.id}`}
        data-booking-id={booking.id}
        data-needs-action={entry.needsAction ? "true" : "false"}
        tabIndex={-1}
        aria-label={`${display.dogName}, ${booking.slot || "Time missing"}, ${laneTitle}`}
        className={`min-w-0 rounded-2xl border px-3 py-3 shadow-[0_1px_3px_rgba(15,23,42,0.06)] sm:px-4 ${successTone}`}
      >
        <div className="flex min-w-0 items-start gap-3">
          <button
            type="button"
            aria-label={`Open ${booking.slot || "unscheduled"} booking`}
            onClick={() => handlers.onOpenBooking?.(booking.id)}
            className={`flex size-11 shrink-0 items-center justify-center rounded-full text-[12px] font-extrabold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2 ${entry.isLate ? "bg-brand-coral text-white" : "bg-brand-purple text-white"}`}
          >
            {booking.slot || "—"}
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <h3 className="min-w-0 font-display text-[20px] font-bold leading-tight text-brand-purple">
                <button
                  type="button"
                  aria-label={`Open ${display.dogName}'s dog file`}
                  onClick={() => handlers.onOpenDog?.(booking._dogId)}
                  className="rounded-sm text-left outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand-purple"
                >
                  {display.dogName}
                </button>
              </h3>
              <button
                type="button"
                aria-label={`Open ${display.owner}'s human file`}
                onClick={() => handlers.onOpenHuman?.(booking._ownerId)}
                className="min-h-6 rounded-sm text-left text-[13px] font-medium text-slate-600 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand-purple"
              >
                {display.owner}
              </button>
            </div>
            <p className="mt-1 text-[13px] text-slate-600">
              {serviceLabel(booking.service)}
              {entry.timingLabel ? <><span aria-hidden="true"> · </span><strong data-action-reason={timingActionReason} className={entry.isLate ? "text-brand-coral-text" : "text-slate-700"}>{entry.timingLabel}</strong></> : null}
            </p>
            <p className="mt-1 text-[12px] font-bold text-slate-700">
              {statusLabel}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <ConfirmationSignal confirmedAt={confirmedAt} needsConfirmation={isConfirmationAction} />
              <PaymentState payment={payment} actionReason={isPaymentAction} />
              {entry.lane === "ready" && isCollectionAction && !entry.timingLabel ? (
                <span
                  data-action-reason="collection"
                  className="inline-flex min-h-6 items-center rounded-full bg-brand-purple/10 px-2 text-[11px] font-bold text-brand-purple"
                >
                  Waiting for collection
                </span>
              ) : null}
              <OnTheWayChip signal={onTheWaySignals?.[booking.id]} />
            </div>
            <WelfareChips {...welfare} />
          </div>
        </div>
        <div className="mt-3 border-t border-slate-200/80 pt-3">
          <CardActions entry={entry} display={display} payment={payment} handlers={handlers} />
        </div>
      </article>
    </div>
  );
}

function StatusLane({ lane, entries, resolve, getWelfare, paymentOf, liveFocusId, liveContext, handlers, onTheWaySignals }) {
  const meta = LANE_META[lane];
  const count = entries.length;
  const focusedEntry = liveContext
    ? entries.find((entry) => entry.booking.id === liveFocusId)
    : null;
  const markerIndex = focusedEntry
    ? entries.findIndex((entry) => {
      const focusedHasTime = Number.isFinite(focusedEntry.slotMinutes);
      const entryHasTime = Number.isFinite(entry.slotMinutes);
      return focusedHasTime && entryHasTime
        ? entry.slotMinutes === focusedEntry.slotMinutes
        : !focusedHasTime && !entryHasTime;
    })
    : -1;
  return (
    <section
      aria-label={`${meta.title}, ${dogCountLabel(count)}`}
      data-lane-populated={count > 0 ? "true" : "false"}
      className={`min-w-0 overflow-visible rounded-2xl border border-slate-200 border-t-4 bg-white ${meta.accent} ${lane === "ready" ? "md:col-span-2 xl:col-span-1" : ""} ${count > 0 ? "xl:flex xl:h-[min(58vh,42rem)] xl:min-h-0 xl:flex-col" : ""}`}
    >
      <header className="flex min-h-[76px] shrink-0 items-start gap-3 border-b border-slate-100 px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[20px] font-bold leading-tight text-brand-purple">{meta.title}</h2>
          <p className="mt-1 text-[12px] text-slate-600">{meta.purpose}</p>
        </div>
        <span className={`inline-flex min-h-7 shrink-0 items-center rounded-full px-2.5 text-[11px] font-bold ${meta.count}`}>
          {dogCountLabel(count)}
        </span>
      </header>
      <div
        data-testid={`${lane}-lane-body`}
        className={`relative space-y-2 p-2.5 sm:p-3 ${count > 0 ? "xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:overscroll-contain" : ""}`}
      >
        {entries.length === 0 ? (
          <p className="px-2 py-2 text-[12px] font-medium text-slate-500">No dogs in this lane</p>
        ) : entries.map((entry, index) => (
          <Fragment key={entry.booking.id}>
            {index === markerIndex ? <LiveArrivalDivider context={liveContext} /> : null}
            <StatusBookingCard
              entry={entry}
              laneTitle={meta.title}
              resolve={resolve}
              getWelfare={getWelfare}
              paymentOf={paymentOf}
              handlers={handlers}
              onTheWaySignals={onTheWaySignals}
            />
          </Fragment>
        ))}
      </div>
    </section>
  );
}

function HomeToday({ entries, resolve, paymentOf, isToday, handlers }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? entries : entries.slice(0, 3);
  const title = isToday ? "Home today" : "Home on this date";
  return (
    <section aria-label={`${title}, ${dogCountLabel(entries.length)}`} className="rounded-2xl border border-slate-200 bg-white">
      <header className="flex min-h-14 items-center gap-3 border-b border-slate-100 px-4 py-2.5">
        <h2 className="font-display text-[18px] font-bold text-brand-purple">{title}</h2>
        <span className="text-[12px] font-bold text-slate-500">{dogCountLabel(entries.length)}</span>
        {entries.length > 3 ? (
          <button type="button" onClick={() => setExpanded((value) => !value)} className="ml-auto min-h-11 px-2 text-[12px] font-bold text-brand-purple underline">
            {expanded ? "Show less" : "View all"}
          </button>
        ) : null}
      </header>
      {entries.length === 0 ? (
        <p className="px-4 py-3 text-[12px] text-slate-500">No dogs have gone home yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100 px-4">
          {visible.map((entry) => {
            const booking = entry.booking;
            const display = resolve(booking);
            const payment = paymentOf(booking);
            return (
              <li
                key={booking.id}
                data-needs-action={entry.needsAction ? "true" : "false"}
                className="flex min-h-12 flex-wrap items-center gap-x-2 gap-y-1 py-2 text-[13px]"
              >
                <button type="button" onClick={() => handlers.onOpenDog?.(booking._dogId)} className="font-display text-[15px] font-bold text-brand-purple hover:underline">
                  {display.dogName}
                </button>
                <span className="text-slate-500">{entry.timingLabel || "Collected"}</span>
                <span className="ml-auto"><PaymentState payment={payment} actionReason={entry.actionReasons?.includes("payment")} /></span>
                <button type="button" onClick={() => handlers.onOpenBooking?.(booking.id)} className="min-h-11 px-2 text-[12px] font-bold text-brand-purple underline">
                  Open booking
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function safeDogName(booking, resolve) {
  const display = resolve(booking);
  const candidates = [display?.dogName, booking.dogName, booking.dogNameSnapshot];
  const privateIds = new Set([booking.id, booking._dogId, booking._ownerId].filter(Boolean));
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;
  return candidates.find((candidate) => {
    const value = String(candidate || "").trim();
    return value && !privateIds.has(value) && !uuidPattern.test(value);
  }) || "Unknown dog";
}

function UnknownStatusRecovery({ bookings, resolve, onOpenBooking }) {
  if (bookings.length === 0) return null;
  return (
    <section
      role="alert"
      className="rounded-2xl border border-brand-coral/30 bg-brand-coral/[0.06] px-3 py-3 text-brand-coral-text sm:px-4"
    >
      <h2 className="text-[13px] font-extrabold">
        {bookings.length === 1
          ? "1 booking needs its status fixed"
          : `${bookings.length} bookings need their status fixed`}
      </h2>
      <p className="mt-0.5 text-[12px] font-medium">
        Fix each status to place the booking in the right lane.
      </p>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {bookings.map((booking) => {
          const dogName = safeDogName(booking, resolve);
          const time = booking.slot || "Time missing";
          return (
            <li key={booking.id} className="flex min-w-0 items-center gap-2 rounded-xl border border-brand-coral/20 bg-white/80 px-3 py-2">
              <span className="min-w-0 flex-1 text-[12px] font-semibold text-slate-700">
                <strong className="text-brand-purple">{dogName}</strong>
                <span aria-hidden="true"> · </span>
                {time}
              </span>
              <button
                type="button"
                aria-label={`Fix ${dogName}'s ${time} booking`}
                onClick={() => onOpenBooking?.(booking.id)}
                className="inline-flex min-h-11 shrink-0 items-center rounded-xl bg-brand-purple px-3 text-[12px] font-bold text-white outline-none hover:bg-brand-purple-light focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2"
              >
                Fix booking
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function StatusBoard({
  board,
  resolve,
  getWelfare,
  paymentOf,
  liveFocusId = null,
  liveContext = null,
  isToday = false,
  handlers = {},
  onTheWaySignals = {},
}) {
  return (
    <section
      aria-label="Daily booking status board"
      data-status-board-root
      tabIndex={-1}
      className="space-y-3 outline-none focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2"
    >
      <UnknownStatusRecovery
        bookings={board.excludedBookings || []}
        resolve={resolve}
        onOpenBooking={handlers.onOpenBooking}
      />
      <div className="grid min-w-0 grid-cols-1 items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
        <StatusLane lane="due" entries={board.due} resolve={resolve} getWelfare={getWelfare} paymentOf={paymentOf} liveFocusId={liveFocusId} liveContext={liveContext} handlers={handlers} onTheWaySignals={onTheWaySignals} />
        <StatusLane lane="withUs" entries={board.withUs} resolve={resolve} getWelfare={getWelfare} paymentOf={paymentOf} liveFocusId={liveFocusId} liveContext={liveContext} handlers={handlers} onTheWaySignals={onTheWaySignals} />
        <StatusLane lane="ready" entries={board.ready} resolve={resolve} getWelfare={getWelfare} paymentOf={paymentOf} liveFocusId={liveFocusId} liveContext={liveContext} handlers={handlers} onTheWaySignals={onTheWaySignals} />
      </div>
      <HomeToday entries={board.home} resolve={resolve} paymentOf={paymentOf} isToday={isToday} handlers={handlers} />
    </section>
  );
}
