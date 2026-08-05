import { Fragment, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { BOOKING_STATUS, SERVICES } from "../../../constants/index";
import { groupFeedBySlot } from "../../../engine/today";
import { LiveArrivalDivider } from "./LiveArrivalDivider.jsx";
import { ArrivingSlotGroup } from "./ArrivingSlotGroup.jsx";
import { MobileEmptyLaneSummary } from "./MobileEmptyLaneSummary.jsx";
import { MoreMenu, OnTheWayChip, WelfareChips, formatMoney } from "./parts.jsx";

const LANE_META = {
  due: {
    title: "Arriving",
    purpose: "Dogs expected to arrive.",
    accent: "border-t-brand-yellow",
    countText: "text-amber-900",
  },
  withUs: {
    title: "With us",
    purpose: "Dogs physically in the salon.",
    accent: "border-t-brand-teal",
    countText: "text-brand-teal-text",
  },
  ready: {
    title: "Ready to go",
    purpose: "Finished dogs waiting for collection.",
    accent: "border-t-brand-purple",
    countText: "text-brand-purple",
  },
};

export function dogCountLabel(count) {
  return `${count} ${count === 1 ? "dog" : "dogs"}`;
}

export function serviceLabel(service) {
  return SERVICES.find((item) => item.id === service)?.name || service || "Service not set";
}

export function firstName(name) {
  return String(name || "the human").trim().split(/\s+/)[0] || "the human";
}

export function telephoneHref(phone) {
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

export const primaryClass =
  "inline-flex min-h-11 items-center justify-center rounded-lg bg-brand-yellow px-3 text-[12px] font-bold text-brand-purple outline-none transition-colors hover:bg-brand-yellow-dark focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2";
export const secondaryClass =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-[12px] font-bold text-brand-purple outline-none transition-colors hover:bg-brand-purple/5 focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2";
export const contactClass =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-2 text-[12px] font-bold text-brand-purple outline-none transition-colors hover:bg-brand-purple/5 focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2";

export function ConfirmationException({ needsConfirmation }) {
  if (!needsConfirmation) return null;
  return (
    <span
      data-action-reason="confirmation"
      className="inline-flex items-center text-[12px] font-bold text-amber-900"
    >
      Needs confirmation
    </span>
  );
}

export function ConfirmedMark({ confirmedAt }) {
  const time = formatConfirmedAt(confirmedAt);
  if (!time) return null;
  return (
    <span
      role="img"
      aria-label={`Customer confirmed at ${time}`}
      title={`Confirmed via WhatsApp at ${time}`}
      className="inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700"
    >
      <Check size={13} strokeWidth={3} aria-hidden="true" />
    </span>
  );
}

/**
 * Payment only reads as urgent once the action engine actually considers it
 * actionable (`actionReason`, set from `entry.actionReasons.includes("payment")`
 * — true for With us/Ready/Home once a dog owes money, always false while
 * still Arriving). Otherwise it's neutral secondary information: a dog
 * arriving later today who will owe money isn't yet a problem, so it must
 * not look like one.
 */
export function PaymentState({ payment, actionReason = false }) {
  if (!payment) return null;
  if (payment.kind === "paid") {
    return (
      <span className="inline-flex items-center whitespace-nowrap text-[11px] font-bold text-emerald-700">
        Paid
      </span>
    );
  }
  if (payment.amountDue != null) {
    return (
      <span
        data-action-reason={actionReason ? "payment" : undefined}
        className={`inline-flex items-center whitespace-nowrap font-bold ${
          actionReason ? "text-[13px] text-brand-coral-text" : "text-[11px] text-slate-600"
        }`}
      >
        {formatMoney(payment.amountDue)} due
      </span>
    );
  }
  return (
    <span
      data-action-reason={actionReason ? "payment" : undefined}
      className="inline-flex items-center whitespace-nowrap text-[11px] font-bold text-slate-600"
    >
      {payment.label}
    </span>
  );
}

/**
 * Actions for With us and Ready to go only — Arriving cards use their own
 * ArrivingCardActions (ArrivingSlotGroup.jsx), which needs a three-state
 * contact hierarchy this shared component doesn't.
 */
function CardActions({ entry, display, payment, handlers }) {
  const booking = entry.booking;
  const name = display.dogName;
  const contactName = firstName(display.owner);
  const journey = (id) => handlers.onJourneyAction?.(booking, { id, completed: false, next: true });
  const commonMore = [
    { label: `Message ${contactName}`, onClick: () => handlers.onMessageOwner?.(booking) },
    { label: "Open booking", onClick: () => handlers.onOpenBooking?.(booking.id) },
  ];

  if (entry.lane === "withUs") {
    const checkedIn = booking.status === BOOKING_STATUS.CHECKED_IN;
    return (
      <div className="flex w-full flex-wrap items-center justify-end gap-1.5">
        <button
          data-primary-action="true"
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

  // Ready to go: money still due promotes "Take £N payment" to primary and
  // demotes "Mark collected" to a visible secondary — never hidden in More —
  // so the existing unpaid-collection safeguard (onRequestCollected still
  // re-checks the balance) stays one tap away, not zero.
  const amountDue = payment?.amountDue;
  const hasBalance = amountDue != null && amountDue > 0;
  if (hasBalance) {
    return (
      <div className="flex w-full flex-wrap items-center justify-end gap-1.5">
        <button
          data-primary-action="true"
          type="button"
          aria-label={`Take ${formatMoney(amountDue)} payment from ${name}`}
          onClick={() => handlers.onOpenInvoice?.(booking)}
          className={primaryClass}
        >
          Take {formatMoney(amountDue)} payment
        </button>
        <button
          type="button"
          aria-label={`Mark ${name} collected`}
          onClick={() => handlers.onRequestCollected?.(booking)}
          className={secondaryClass}
        >
          Mark collected
        </button>
        <MoreMenu menuLabel={`More actions for ${name}`} items={commonMore} />
      </div>
    );
  }
  return (
    <div className="flex w-full flex-wrap items-center justify-end gap-1.5">
      <button
        data-primary-action="true"
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
  const displayTiming = entry.timingLabel
    || (entry.lane === "ready" && isCollectionAction ? "Waiting" : null);
  const timingActionReason = entry.isLate
    ? "late"
    : entry.lane === "ready" && isCollectionAction && displayTiming
      ? "collection"
      : undefined;

  return (
    <div data-status-card-shell className="w-full">
      <article
        id={`today-card-${booking.id}`}
        data-booking-id={booking.id}
        data-needs-action={entry.needsAction ? "true" : "false"}
        tabIndex={-1}
        aria-label={`${display.dogName}, ${booking.slot || "Time missing"}, ${laneTitle}`}
        className={`min-w-0 rounded-xl border px-2.5 py-1.5 shadow-[0_1px_3px_rgba(15,23,42,0.05)] sm:px-3 ${successTone}`}
      >
        <div className="flex min-w-0 items-start gap-2">
          <button
            type="button"
            aria-label={`Open ${booking.slot || "unscheduled"} booking`}
            onClick={() => handlers.onOpenBooking?.(booking.id)}
            className={`flex min-h-11 min-w-[3.25rem] shrink-0 items-center justify-center rounded-lg px-1.5 text-[12px] font-extrabold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2 ${entry.isLate ? "bg-brand-coral text-white" : "bg-brand-purple text-white"}`}
          >
            {booking.slot || "—"}
          </button>
          <div className="min-w-0 flex-1 py-0.5">
            <div className="flex min-w-0 items-center gap-1.5">
              <h3 className="min-w-0 truncate font-display text-[18px] font-bold leading-tight text-brand-purple">
                <button
                  type="button"
                  aria-label={`Open ${display.dogName}'s dog file`}
                  onClick={() => handlers.onOpenDog?.(booking._dogId)}
                  className="max-w-full truncate rounded-sm text-left outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand-purple"
                >
                  {display.dogName}
                </button>
              </h3>
              <ConfirmedMark confirmedAt={confirmedAt} />
              {displayTiming ? (
                <strong
                  data-action-reason={timingActionReason}
                  className={`ml-auto shrink-0 whitespace-nowrap text-[12px] font-bold tabular-nums ${entry.isLate ? "text-brand-coral-text" : "text-slate-700"}`}
                >
                  {displayTiming}
                </strong>
              ) : null}
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
                <PaymentState payment={payment} actionReason={isPaymentAction} />
              </span>
            </div>
            {isConfirmationAction || onTheWaySignals?.[booking.id] ? (
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <ConfirmationException needsConfirmation={isConfirmationAction} />
                <OnTheWayChip signal={onTheWaySignals?.[booking.id]} />
              </div>
            ) : null}
            <WelfareChips {...welfare} />
          </div>
        </div>
        <div className="mt-1 flex min-h-11 items-center border-t border-slate-200/70 pt-1">
          <CardActions entry={entry} display={display} payment={payment} handlers={handlers} />
        </div>
      </article>
    </div>
  );
}

function laneWarning(lane, entries) {
  const count = (reason) => entries.filter((entry) => entry.actionReasons?.includes(reason)).length;
  if (lane === "due") {
    const late = entries.filter((entry) => entry.isLate).length;
    if (late > 0) return `${late} late`;
    const confirmations = count("confirmation");
    if (confirmations > 0) return `${confirmations} to confirm`;
  }
  if (lane === "withUs") {
    const payments = count("payment");
    if (payments > 0) return `${payments} unpaid`;
  }
  if (lane === "ready") {
    const collections = count("collection");
    if (collections > 0) return `${collections} waiting`;
    const payments = count("payment");
    if (payments > 0) return `${payments} unpaid`;
  }
  if (lane === "home") {
    const payments = count("payment");
    if (payments > 0) return `${payments} unpaid`;
  }
  return null;
}

function StatusLane({ lane, entries, resolve, getWelfare, paymentOf, liveFocusId, liveContext, handlers, onTheWaySignals, mobileHidden = false }) {
  const meta = LANE_META[lane];
  const count = entries.length;
  const warning = laneWarning(lane, entries);
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
      className={`min-w-0 overflow-visible rounded-2xl border border-slate-200 border-t-4 bg-white ${meta.accent} ${mobileHidden ? "hidden md:block" : ""} ${lane === "ready" ? "md:col-span-2 xl:col-span-1" : ""} ${count > 0 ? "xl:flex xl:max-h-[min(66vh,44rem)] xl:min-h-0 xl:flex-col" : ""}`}
    >
      <header className="flex min-h-11 shrink-0 items-center gap-1.5 border-b border-slate-100 px-3 py-1.5">
        <h2 className="font-display text-[18px] font-bold leading-tight text-brand-purple">{meta.title}</h2>
        <span aria-hidden="true" className="text-slate-300">·</span>
        <span className={`shrink-0 text-[11px] font-bold ${meta.countText}`}>
          {dogCountLabel(count)}
        </span>
        {warning ? (
          <>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span className="truncate text-[11px] font-bold text-brand-coral-text">{warning}</span>
          </>
        ) : null}
        <p className="sr-only">{meta.purpose}</p>
      </header>
      <div
        data-testid={`${lane}-lane-body`}
        className={`relative space-y-1.5 p-2 ${count > 0 ? "xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:overscroll-contain" : ""}`}
      >
        {entries.length === 0 ? (
          <p className="px-2 py-2 text-[12px] font-medium text-slate-500">No dogs in this lane</p>
        ) : lane === "due" ? (
          groupFeedBySlot(entries).map((group) => (
            <ArrivingSlotGroup
              key={group.slot ?? "unscheduled"}
              group={group}
              liveFocusId={liveFocusId}
              liveContext={liveContext}
              resolve={resolve}
              getWelfare={getWelfare}
              paymentOf={paymentOf}
              handlers={handlers}
              onTheWaySignals={onTheWaySignals}
            />
          ))
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
  const title = isToday ? "Home today" : "Home on this date";
  const warning = laneWarning("home", entries);
  const toggleLabel = `${expanded ? "Hide" : "Show"} ${dogCountLabel(entries.length)} sent home`;
  return (
    <section
      aria-label={`${title}, ${dogCountLabel(entries.length)}${warning ? `, ${warning}` : ""}`}
      className={`rounded-xl border border-slate-200 bg-white/80 ${entries.length === 0 ? "hidden md:block" : ""}`}
    >
      <header className={`flex min-h-11 items-center gap-2 px-3 py-1 ${expanded ? "border-b border-slate-100" : ""}`}>
        <h2 className="font-display text-[16px] font-bold text-brand-purple">{title}</h2>
        <span className="text-[12px] font-bold text-slate-500">{dogCountLabel(entries.length)}</span>
        {warning ? (
          <>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span className="truncate text-[11px] font-bold text-brand-coral-text">{warning}</span>
          </>
        ) : null}
        {entries.length > 0 ? (
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={toggleLabel}
            onClick={() => setExpanded((value) => !value)}
            className="ml-auto inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-[12px] font-bold text-brand-purple outline-none hover:bg-brand-purple/5 focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2"
          >
            {expanded ? "Hide" : "Show"}
            <ChevronDown size={15} aria-hidden="true" className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
          </button>
        ) : null}
      </header>
      {entries.length === 0 ? (
        <p className="px-4 py-3 text-[12px] text-slate-500">No dogs have gone home yet.</p>
      ) : expanded ? (
        <ul className="divide-y divide-slate-100 px-4">
          {entries.map((entry) => {
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
      ) : null}
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
        <StatusLane lane="withUs" entries={board.withUs} resolve={resolve} getWelfare={getWelfare} paymentOf={paymentOf} liveFocusId={liveFocusId} liveContext={liveContext} handlers={handlers} onTheWaySignals={onTheWaySignals} mobileHidden={board.withUs.length === 0} />
        <StatusLane lane="ready" entries={board.ready} resolve={resolve} getWelfare={getWelfare} paymentOf={paymentOf} liveFocusId={liveFocusId} liveContext={liveContext} handlers={handlers} onTheWaySignals={onTheWaySignals} mobileHidden={board.ready.length === 0} />
      </div>
      <HomeToday entries={board.home} resolve={resolve} paymentOf={paymentOf} isToday={isToday} handlers={handlers} />
      <MobileEmptyLaneSummary
        lanes={[
          board.withUs.length === 0 ? { key: "withUs", title: "With us" } : null,
          board.ready.length === 0 ? { key: "ready", title: "Ready to go" } : null,
          board.home.length === 0 ? { key: "home", title: isToday ? "Home today" : "Home on this date" } : null,
        ].filter(Boolean)}
      />
    </section>
  );
}
