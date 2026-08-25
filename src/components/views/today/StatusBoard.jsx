// The Daily Brief status board — shell-less lanes, one BookingCard for every
// lane, and exactly one filled-yellow primary on the page (the live focus).
// Urgency is painted by the engine: entryOpStatus → the card's accent rail,
// so the board can never disagree with the ranking that drives it.
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { BOOKING_STATUS, SERVICES } from "../../../constants/index";
import { groupFeedBySlot, entryOpStatus } from "../../../engine/today";
import { ArrivingSlotGroup } from "./ArrivingSlotGroup.jsx";
import { EmptyLaneSummary } from "./EmptyLaneSummary.jsx";
import {
  MoreMenu,
  OnTheWayChip,
  RAIL_TONE_CLASS,
  WAIT_TONE_CLASS,
  WelfareChips,
  formatLondonTime,
  formatMoney,
  waitTone,
} from "./parts.jsx";

const LANE_META = {
  due: { title: "Arriving", purpose: "Dogs expected to arrive." },
  withUs: { title: "With us", purpose: "Dogs physically in the salon." },
  ready: { title: "Ready to go", purpose: "Finished dogs waiting for collection." },
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

// Button tiers. Gold is a law, not a colour: at most ONE gold primary exists
// per board — the live focus card's — so yellow always means "do this next".
// Every other primary is the outlined tier; contextual contact actions are
// quiet text.
export const goldPrimaryClass =
  "pointer-events-auto inline-flex min-h-11 items-center justify-center rounded-control bg-brand-yellow px-3.5 text-[13px] font-bold text-brand-purple outline-none transition-colors hover:bg-brand-yellow-dark focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
export const outlinedPrimaryClass =
  "pointer-events-auto inline-flex min-h-11 items-center justify-center rounded-control border border-brand-purple/30 bg-white px-3.5 text-[13px] font-bold text-brand-purple outline-none transition-colors hover:bg-brand-purple/5 focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
export const contactClass =
  "pointer-events-auto inline-flex min-h-11 items-center justify-center gap-1.5 rounded-control px-2 text-[12px] font-semibold text-brand-purple outline-none transition-colors hover:bg-brand-purple/5 focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2";

export function ConfirmationException({ needsConfirmation }) {
  if (!needsConfirmation) return null;
  return (
    <span
      data-action-reason="confirmation"
      className="inline-flex items-center text-[12px] font-bold text-amber-800"
    >
      Needs confirmation
    </span>
  );
}

/**
 * The owner answered the reminder by typing a reply in the inbox rather than
 * tapping the Confirm button, so `reminder_confirmed_at` was never stamped
 * (see engine/replyConfirmation.ts). Shown INSTEAD of "Needs confirmation" —
 * and kept visually distinct from the green ConfirmedMark tick, which still
 * means only the real button tap. The owner's own words are in the tooltip so
 * staff can check the reading at a glance.
 */
export function ChatConfirmedChip({ signal }) {
  if (!signal) return null;
  const time = formatLondonTime(signal.at);
  return (
    <span
      data-chat-confirmed="true"
      title={`“${signal.text}”`}
      className="inline-flex items-center whitespace-nowrap text-[12px] font-bold text-emerald-700"
    >
      Confirmed in chat{time ? ` · ${time}` : ""}
    </span>
  );
}

export function ConfirmedMark({ confirmedAt, confirmedBy = "customer" }) {
  const time = formatLondonTime(confirmedAt);
  if (!time) return null;
  // The customer's own confirmation (WhatsApp) and a staff-recorded one carry
  // the same operational weight — same tick — but the label says which, so a
  // staff confirm is never mistaken for the owner's word. A later real
  // customer confirmation overwrites a staff one server-side.
  const isStaff = confirmedBy === "staff";
  const label = isStaff
    ? `Confirmed by staff at ${time}`
    : `Customer confirmed at ${time}`;
  return (
    <span
      role="img"
      data-confirmed-by={isStaff ? "staff" : "customer"}
      aria-label={label}
      title={isStaff ? label : `Confirmed via WhatsApp at ${time}`}
      className="inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700"
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 6 9 17l-5-5" />
      </svg>
    </span>
  );
}

/**
 * Payment only reads as urgent once the action engine actually considers it
 * actionable (`actionReason` — true from Ready onward once a dog owes money,
 * always false while still Arriving or mid-groom). Otherwise it's neutral
 * secondary information: a dog who will pay at pick-up isn't yet a problem,
 * so it must not look like one.
 */
export function PaymentState({ payment, actionReason = false }) {
  if (!payment) return null;
  if (payment.kind === "paid") {
    return (
      <span className="inline-flex items-center whitespace-nowrap text-[12px] font-bold text-emerald-700">
        Paid
      </span>
    );
  }
  if (payment.amountDue != null) {
    return (
      <span
        data-action-reason={actionReason ? "payment" : undefined}
        className={`inline-flex items-center whitespace-nowrap tabular-nums ${
          actionReason ? "text-[13px] font-bold text-brand-coral-text" : "text-[12px] font-semibold text-slate-500"
        }`}
      >
        {formatMoney(payment.amountDue)} due
      </span>
    );
  }
  return (
    <span
      data-action-reason={actionReason ? "payment" : undefined}
      className="inline-flex items-center whitespace-nowrap text-[12px] font-semibold text-slate-500"
    >
      {payment.label}
    </span>
  );
}

/** entryOpStatus tone → the card's rail. In-progress and upcoming cards stay
 * railless: absence of colour is the calm state, and a ready dog's WAIT
 * duration (not its rail) says how long via the threshold tones. */
function railToneFor(entry) {
  const kind = entryOpStatus(entry).kind;
  if (kind === "overdue" || kind === "paymentDue") return "coral";
  if (kind === "unconfirmed") return "amber";
  if (kind === "ready" || kind === "readyWaiting") return "emerald";
  return null;
}

function CardActions({ entry, lane, display, payment, handlers, isGold, busy }) {
  const booking = entry.booking;
  const name = display.dogName;
  const contactName = firstName(display.owner);
  const primaryClass = isGold ? goldPrimaryClass : outlinedPrimaryClass;
  const journey = (id) => handlers.onJourneyAction?.(booking, { id, completed: false, next: true });

  const isUnconfirmed = entry.actionReasons?.includes("confirmation");
  const showCallQuiet = lane === "due" && entry.isLate && !!telephoneHref(display.ownerPhone);
  const showMessageQuiet = lane === "due" && (entry.isLate || isUnconfirmed);

  const moreItems = [
    !showMessageQuiet && {
      label: `Message ${contactName}`,
      onClick: () => handlers.onMessageOwner?.(booking),
    },
    { label: "Open booking", onClick: () => handlers.onOpenBooking?.(booking.id) },
    { label: `Open ${name}'s dog file`, onClick: () => handlers.onOpenDog?.(booking._dogId) },
    { label: `Open ${display.owner}'s human file`, onClick: () => handlers.onOpenHuman?.(booking._ownerId) },
    ...(lane === "due"
      ? [
        { label: "Didn't show", onClick: () => handlers.onDidntShow?.(booking) },
        { label: "Cancel booking", onClick: () => handlers.onOpenBooking?.(booking.id) },
        { label: "Reschedule booking", onClick: () => handlers.onOpenBooking?.(booking.id) },
      ]
      : []),
    // Escape hatch for a mis-tapped staff Confirm, past the toast's Undo
    // window. Staff-sourced only: a customer's own confirmation is their
    // word and is never removable here.
    lane === "due" && booking.reminderConfirmedBy === "staff" && {
      label: "Unconfirm booking",
      onClick: () => handlers.onUnconfirmArrival?.(booking),
    },
  ].filter(Boolean);

  let primary;
  let secondary = null;
  if (lane === "due") {
    primary = (
      <button data-primary-action="true" type="button" aria-label={`Check in ${name}`} aria-busy={busy || undefined} disabled={busy} onClick={() => journey("checkIn")} className={primaryClass}>
        Check in
      </button>
    );
  } else if (lane === "withUs") {
    const checkedIn = booking.status === BOOKING_STATUS.CHECKED_IN;
    primary = (
      <button
        data-primary-action="true"
        type="button"
        aria-label={checkedIn ? `Start ${name}'s groom` : `Mark ${name} ready for collection`}
        aria-busy={busy || undefined}
        disabled={busy}
        onClick={() => journey(checkedIn ? "startGroom" : "ready")}
        className={primaryClass}
      >
        {checkedIn ? "Start groom" : "Ready for collection"}
      </button>
    );
  } else {
    // Ready to go: money still due promotes "Take £N payment" to primary and
    // keeps "Mark collected" a visible outlined step — never hidden in More —
    // so the existing unpaid-collection safeguard (onRequestCollected still
    // re-checks the balance) stays one tap away, not zero.
    const amountDue = payment?.amountDue;
    const hasBalance = amountDue != null && amountDue > 0;
    if (hasBalance) {
      primary = (
        <button
          data-primary-action="true"
          type="button"
          aria-label={`Take ${formatMoney(amountDue)} payment from ${name}`}
          aria-busy={busy || undefined}
          disabled={busy}
          onClick={() => handlers.onOpenInvoice?.(booking)}
          className={primaryClass}
        >
          Take {formatMoney(amountDue)} payment
        </button>
      );
      secondary = (
        <button
          type="button"
          aria-label={`Mark ${name} collected`}
          aria-busy={busy || undefined}
          disabled={busy}
          onClick={() => handlers.onRequestCollected?.(booking)}
          className={outlinedPrimaryClass}
        >
          Mark collected
        </button>
      );
    } else {
      primary = (
        <button
          data-primary-action="true"
          type="button"
          aria-label={`Mark ${name} collected`}
          aria-busy={busy || undefined}
          disabled={busy}
          onClick={() => handlers.onRequestCollected?.(booking)}
          className={primaryClass}
        >
          Mark collected
        </button>
      );
    }
  }

  return (
    <div className="mt-1.5 flex w-full flex-wrap items-center gap-x-1 gap-y-1.5">
      {showCallQuiet ? (
        <a href={telephoneHref(display.ownerPhone)} aria-label={`Call ${contactName} about ${name}`} className={contactClass}>
          Call
        </a>
      ) : null}
      {showMessageQuiet ? (
        <button type="button" aria-label={`Message ${contactName} about ${name}`} onClick={() => handlers.onMessageOwner?.(booking)} className={contactClass}>
          Message
        </button>
      ) : null}
      {isUnconfirmed && lane === "due" ? (
        // Staff reached the owner off-channel (phone, in person) — record the
        // confirmation here so the amber flag clears. If the customer later
        // answers the WhatsApp reminder themselves, their confirmation
        // overwrites this one (mark_reminder_confirmed).
        <button
          type="button"
          aria-label={`Confirm ${name}'s booking`}
          aria-busy={busy || undefined}
          disabled={busy}
          onClick={() => handlers.onConfirmArrival?.(booking)}
          className={contactClass}
        >
          Confirm
        </button>
      ) : null}
      <span className="pointer-events-auto ml-auto inline-flex items-center gap-1.5">
        <MoreMenu menuLabel={`More actions for ${name}`} items={moreItems} />
        {secondary}
        {primary}
      </span>
    </div>
  );
}

/**
 * The one booking card, for every lane. The whole card body opens the booking
 * (a stretched button behind the content — text clicks fall through to it,
 * real controls sit above), so the dog and owner names are calm text rather
 * than two more sub-24px tap targets. Dog/human files stay one tap away in
 * the More menu and inside the booking detail.
 */
export function BookingCard({
  entry,
  lane,
  laneTitle,
  resolve,
  getWelfare,
  paymentOf,
  handlers,
  onTheWaySignals,
  isGold = false,
  busy = false,
  flash = false,
}) {
  const booking = entry.booking;
  const display = resolve(booking);
  const payment = paymentOf(booking);
  const welfare = getWelfare?.(booking) || { alerts: [], pregnant: false, notes: "" };
  const confirmedAt = booking.reminderConfirmedAt;
  const actionReasons = entry.actionReasons || [];
  const isConfirmationAction = actionReasons.includes("confirmation");
  const isPaymentAction = actionReasons.includes("payment") && (lane === "ready" || lane === "home");
  const isCollectionAction = actionReasons.includes("collection");
  const railTone = railToneFor(entry);
  // Arriving cards sit under their slot-group's h3, so their name is an h4;
  // the other lanes' cards sit directly under the lane's h2, so an h3.
  const NameHeading = lane === "due" ? "h4" : "h3";

  // Lateness lives on the slot heading in the Arriving lane (never repeated
  // on the card); the other lanes carry their own elapsed time.
  const displayTiming = lane === "due"
    ? null
    : entry.timingLabel || (lane === "ready" && isCollectionAction ? "Waiting" : null);
  const timingClass = lane === "ready"
    ? WAIT_TONE_CLASS[waitTone(entry.waitMinutes)]
    : "text-slate-500";
  const timingActionReason = lane === "ready" && isCollectionAction && displayTiming ? "collection" : undefined;

  return (
    <article
      id={`today-card-${booking.id}`}
      data-booking-id={booking.id}
      data-needs-action={entry.needsAction ? "true" : "false"}
      tabIndex={-1}
      aria-label={`${display.dogName}, ${booking.slot || "Time missing"}, ${laneTitle}`}
      className={`relative min-w-0 scroll-mt-28 rounded-xl border border-brand-paper-line bg-white px-3.5 py-3 transition-colors hover:border-slate-300 ${flash ? "animate-card-flash" : ""}`}
    >
      <button
        type="button"
        aria-label={`Open ${display.dogName}'s ${booking.slot || "unscheduled"} booking`}
        onClick={() => handlers.onOpenBooking?.(booking.id)}
        className="absolute inset-0 cursor-pointer rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2"
      />
      {railTone ? (
        <span data-rail={railTone} aria-hidden="true" className={`pointer-events-none absolute inset-y-0 left-0 w-[3px] rounded-l-xl ${RAIL_TONE_CLASS[railTone]}`} />
      ) : null}
      <div className="pointer-events-none relative min-w-0">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden="true"
            className={`inline-flex h-7 min-w-[3rem] shrink-0 items-center justify-center rounded-lg px-1.5 text-[12px] font-bold tabular-nums ${
              entry.isLate ? "bg-brand-coral text-white" : "bg-brand-purple/[0.07] text-brand-purple"
            }`}
          >
            {booking.slot || "—"}
          </span>
          <NameHeading className="min-w-0 truncate font-display text-[17px] font-bold leading-tight text-brand-purple">
            {display.dogName}
          </NameHeading>
          {entry.isLate ? (
            <span data-action-reason="late" className="sr-only">Late arrival</span>
          ) : null}
          <ConfirmedMark confirmedAt={confirmedAt} confirmedBy={booking.reminderConfirmedBy} />
          {displayTiming ? (
            <strong
              data-action-reason={timingActionReason}
              className={`ml-auto shrink-0 whitespace-nowrap text-[12px] font-bold tabular-nums ${timingClass}`}
            >
              {displayTiming}
            </strong>
          ) : null}
        </div>
        <div className="mt-1 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[13px] leading-tight text-slate-500">
          <span className="min-w-0 truncate">
            {serviceLabel(booking.service)}
            <span aria-hidden="true"> · </span>
            {display.owner}
          </span>
          <span className="ml-auto shrink-0">
            <PaymentState payment={payment} actionReason={isPaymentAction} />
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
        <CardActions
          entry={entry}
          lane={lane}
          display={display}
          payment={payment}
          handlers={handlers}
          isGold={isGold}
          busy={busy}
        />
      </div>
    </article>
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
  // "With us" carries no money warning: a dog mid-groom that will pay at
  // pick-up is routine, and each card's own "£N due" already states the fact.
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

function StatusLane({
  lane,
  entries,
  resolve,
  getWelfare,
  paymentOf,
  liveFocusId,
  isToday,
  handlers,
  onTheWaySignals,
  busyIds,
  flashId,
  className = "",
  bodyClassName = "",
}) {
  const meta = LANE_META[lane];
  const count = entries.length;
  const warning = laneWarning(lane, entries);
  const isGoldFor = (entry) => isToday && entry.booking.id === liveFocusId;

  return (
    <section
      aria-label={`${meta.title}, ${dogCountLabel(count)}`}
      data-lane-populated={count > 0 ? "true" : "false"}
      className={`min-w-0 ${className}`}
    >
      <header className="mb-2 flex min-w-0 items-baseline gap-2 px-0.5">
        <h2 className="text-label text-slate-500">{meta.title}</h2>
        <span className="text-[12px] font-bold tabular-nums text-brand-purple">{count}</span>
        {warning ? (
          <span className="truncate text-[11px] font-bold text-brand-coral-text">{warning}</span>
        ) : null}
        <p className="sr-only">{meta.purpose}</p>
      </header>
      <div data-testid={`${lane}-lane-body`} className={`space-y-2.5 ${bodyClassName}`}>
        {lane === "due" ? (
          groupFeedBySlot(entries).map((group) => (
            <ArrivingSlotGroup
              key={group.slot ?? "unscheduled"}
              group={group}
              resolve={resolve}
              getWelfare={getWelfare}
              paymentOf={paymentOf}
              handlers={handlers}
              onTheWaySignals={onTheWaySignals}
              isGoldFor={isGoldFor}
              busyIds={busyIds}
              flashId={flashId}
            />
          ))
        ) : entries.map((entry) => (
          <BookingCard
            key={entry.booking.id}
            entry={entry}
            lane={lane}
            laneTitle={meta.title}
            resolve={resolve}
            getWelfare={getWelfare}
            paymentOf={paymentOf}
            handlers={handlers}
            onTheWaySignals={onTheWaySignals}
            isGold={isGoldFor(entry)}
            busy={busyIds?.has(entry.booking.id)}
            flash={flashId === entry.booking.id}
          />
        ))}
      </div>
    </section>
  );
}

/**
 * The end-of-day strip: cumulative progress, the till, expected value and the
 * daily cap on one quiet hairline-separated line, with the sent-home list
 * behind a native disclosure. Replaces the boxed "Home today" card and the
 * "Daily progress" panel — their Ready/Collected stats were byte-identical to
 * the lane counts above.
 */
export function EndOfDay({
  summary,
  takings,
  capacityTotal,
  homeEntries,
  isToday,
  resolve,
  paymentOf,
  handlers,
}) {
  const [expanded, setExpanded] = useState(false);
  const homeTitle = isToday ? "Home today" : "Home on this date";
  const warning = laneWarning("home", homeEntries);
  const overCap = summary.dogsBooked > capacityTotal;

  return (
    <section aria-label="End of day" className="border-t border-brand-paper-line pt-3">
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 px-0.5 text-[12px] text-slate-500">
        {summary.arrived > 0 ? (
          <span className="whitespace-nowrap">
            <strong className="font-bold text-slate-700 tabular-nums">{summary.arrived}</strong> arrived so far
          </span>
        ) : (
          <span className="whitespace-nowrap">No dogs have arrived yet</span>
        )}
        {takings && takings.total > 0 ? (
          <span className="min-w-0">
            Taken <strong className="font-bold text-slate-700 tabular-nums">{formatMoney(takings.total)}</strong>
            {takings.byMethod.map((m) => (
              <span key={m.method} className="whitespace-nowrap">
                {" · "}{m.label} <span className="tabular-nums">{formatMoney(m.amount)}</span>
              </span>
            ))}
          </span>
        ) : null}
        <span className="whitespace-nowrap">
          Expected <strong className="font-bold text-slate-700 tabular-nums">{formatMoney(summary.expectedRevenue)}</strong>
        </span>
        <span className={`whitespace-nowrap ${overCap ? "font-bold text-brand-coral-text" : ""}`}>
          Capacity <strong className={`font-bold tabular-nums ${overCap ? "text-brand-coral-text" : "text-slate-700"}`}>
            {summary.dogsBooked}/{capacityTotal}
          </strong>
          {overCap ? " — over the daily cap" : ""}
        </span>
      </div>

      {homeEntries.length > 0 ? (
        <div className="mt-2" role="group" aria-label={`${homeTitle}, ${dogCountLabel(homeEntries.length)}${warning ? `, ${warning}` : ""}`}>
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={`${expanded ? "Hide" : "Show"} ${dogCountLabel(homeEntries.length)} sent home`}
            onClick={() => setExpanded((value) => !value)}
            className="inline-flex min-h-11 items-center gap-2 rounded-control px-0.5 text-[13px] font-bold text-brand-purple outline-none transition-colors hover:bg-brand-purple/[0.04] focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2"
          >
            {homeTitle}
            <span className="text-[12px] font-bold tabular-nums text-slate-500">{dogCountLabel(homeEntries.length)}</span>
            {warning ? <span className="text-[11px] font-bold text-brand-coral-text">{warning}</span> : null}
            <ChevronDown size={15} aria-hidden="true" className={`text-slate-400 motion-safe:transition-transform ${expanded ? "rotate-180" : ""}`} />
          </button>
          {expanded ? (
            <ul className="divide-y divide-slate-100 border-t border-slate-100">
              {homeEntries.map((entry) => {
                const booking = entry.booking;
                const display = resolve(booking);
                const payment = paymentOf(booking);
                return (
                  <li
                    key={booking.id}
                    data-needs-action={entry.needsAction ? "true" : "false"}
                    className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 py-1.5 text-[13px]"
                  >
                    <span className="font-display text-[15px] font-bold text-brand-purple">{display.dogName}</span>
                    <span className="text-slate-500">{entry.timingLabel || "Collected"}</span>
                    <span className="ml-auto"><PaymentState payment={payment} actionReason={entry.actionReasons?.includes("payment")} /></span>
                    <button
                      type="button"
                      onClick={() => handlers.onOpenBooking?.(booking.id)}
                      className="min-h-11 rounded-control px-2 text-[12px] font-bold text-brand-purple underline decoration-brand-purple/30 underline-offset-2 outline-none hover:decoration-brand-purple focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2"
                    >
                      Open booking
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
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
      className="rounded-xl border border-brand-coral/30 bg-brand-coral/[0.06] px-3.5 py-3 text-brand-coral-text"
    >
      <h2 className="text-[13px] font-extrabold">
        {bookings.length === 1
          ? "1 booking needs its status fixed"
          : `${bookings.length} bookings need their status fixed`}
      </h2>
      <p className="mt-0.5 text-[12px] font-medium">
        Set each booking&apos;s status so it shows in the right place.
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
                className="inline-flex min-h-11 shrink-0 items-center rounded-control bg-brand-purple px-3 text-[12px] font-bold text-white outline-none hover:bg-brand-purple-light focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2"
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

// Content-weighted grid templates: the busiest lane (Arriving) earns extra
// width, empty lanes surrender their track entirely, and a lone lane is
// capped so cards never stretch past legibility. One page scroll — no lane
// ever scrolls inside itself.
const GRID_BY_POPULATED = {
  3: "md:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]",
  2: "md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]",
  1: "md:grid-cols-[minmax(0,42rem)]",
};

export function StatusBoard({
  board,
  resolve,
  getWelfare,
  paymentOf,
  liveFocusId = null,
  isToday = false,
  handlers = {},
  onTheWaySignals = {},
  busyIds = null,
  flashId = null,
  summary = null,
  takings = null,
  capacityTotal = 14,
}) {
  const laneOrder = ["due", "withUs", "ready"];
  const populated = laneOrder.filter((lane) => board[lane].length > 0);
  const emptyLanes = laneOrder.filter((lane) => board[lane].length === 0);
  const readySpans = populated.length === 3;

  const laneProps = {
    resolve,
    getWelfare,
    paymentOf,
    liveFocusId,
    isToday,
    handlers,
    onTheWaySignals,
    busyIds,
    flashId,
  };

  return (
    <section
      aria-label="Daily booking status board"
      data-status-board-root
      tabIndex={-1}
      className="flex flex-col gap-5 outline-none focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2"
    >
      <UnknownStatusRecovery
        bookings={board.excludedBookings || []}
        resolve={resolve}
        onOpenBooking={handlers.onOpenBooking}
      />
      {populated.length > 0 ? (
        <div className={`grid min-w-0 grid-cols-1 items-start gap-6 ${GRID_BY_POPULATED[populated.length]}`}>
          {populated.map((lane) => (
            <StatusLane
              key={lane}
              lane={lane}
              entries={board[lane]}
              className={lane === "ready" && readySpans ? "md:col-span-2 xl:col-span-1" : ""}
              bodyClassName={
                lane === "ready" && readySpans
                  ? "md:grid md:grid-cols-2 md:gap-2.5 md:space-y-0 xl:block xl:space-y-2.5"
                  : ""
              }
              {...laneProps}
            />
          ))}
        </div>
      ) : null}
      <EmptyLaneSummary
        lanes={emptyLanes.map((lane) => ({ key: lane, title: LANE_META[lane].title }))}
      />
      {summary ? (
        <EndOfDay
          summary={summary}
          takings={takings}
          capacityTotal={capacityTotal}
          homeEntries={board.home}
          isToday={isToday}
          resolve={resolve}
          paymentOf={paymentOf}
          handlers={handlers}
        />
      ) : null}
    </section>
  );
}
