// One dog on the day list. This is the half that knows things: it reads the
// delivery-failure hooks, asks the engine (`tokenActions`) which moves are
// legal, and holds the check-out chain's open state. It hands plain data to
// <DayCard> (ui/DayCard.jsx), which draws the strip, the face and the lifted
// view, and supplies the lifted view's contents as children.
//
// The lifted view, top to bottom: what staff must know before handling the
// dog (safety, delivery problems), the notes, the photo, the owner's contact
// details, then three actions —
//
//   Call / WhatsApp the owner
//   Check in → Mark ready → Check out   (one slot that moves with the dog)
//   Take payment                         (the existing invoice)
//
// — and a quiet "More" row for everything else the engine allows. There is no
// Confirm button: confirmation comes from the owner answering the reminder.
import { useMemo, useState } from "react";
import { money, ownerSurname, stackConfirmation } from "../../../../engine/dayStack";
import { bookedLine } from "../../../../engine/bookingCreator";
import { tokenActions } from "../../../../engine/salonBoard";
import { orderSafetyFacts } from "../../../../engine/safetyOrder";
import { DayCard, resolveDayStatus } from "../../../ui";
import { firstName, telephoneHref } from "../parts.jsx";
import { titleCase } from "../../../../utils/text";
import { StaffDogPhoto } from "../../../shared/StaffDogPhoto.jsx";
import { StackActions } from "./StackActions.jsx";
import { CheckoutChain } from "./CheckoutChain.jsx";
import { PriceField } from "./PriceField.jsx";
import {
  useBookingDeliveryFailure,
  useUnreachableHumans,
} from "../../../../supabase/hooks/useDeliveryFailures";
import { undeliveredNotice } from "./undeliveredNotice";

/** The two engine actions the check-out chain speaks for. */
const CHAINED = new Set(["payment", "collected"]);
/**
 * Not offered on the card. Confirmation happens automatically from reminder
 * replies (a tap on Confirm, or a typed "yes"), so staff are not asked to
 * record it by hand. The engine still knows these actions; the card does not
 * present them.
 */
const NOT_ON_CARD = new Set(["reconfirm", "confirm", "unconfirm"]);
const CONTACT = new Set(["call", "message"]);
const PROGRESS = new Set(["checkIn", "ready", "undoNoShow"]);

// Baseline, not the default stretch: the price is a 44px tap target with its
// text centred, and under stretch the label sat at the top of that box while
// the figure sat in the middle — the price looked dropped below its label.
function DetailRow({ label, children }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-[5px]">
      <span style={{ color: "var(--card-meta)" }}>{label}</span>
      <div className="text-right">{children}</div>
    </div>
  );
}

function GroupLabel({ children }) {
  return (
    <p className="m-0 mt-4 text-caption font-semibold uppercase tracking-[0.04em]" style={{ color: "var(--card-meta)" }}>
      {children}
    </p>
  );
}

export function StackCard({
  row,
  display,
  welfare,
  payment,
  lastVisit,
  /** The dog's customer-added photo (dogs.photo_path), or null. */
  photoPath = null,
  onTheWay = false,
  dimmed = false,
  lifted = false,
  inPile = false,
  clip = null,
  stackStyle,
  headRef,
  detailsRef,
  onToggle,
  onClose,
  /**
   * The board token for this booking, or null for a row the board has no
   * token for (a no-show). Actions are derived from it, never invented here.
   */
  token = null,
  onAction,
  busy = false,
  onCollectWithPayment,
  onSetPrice,
  onOpenInvoice,
}) {
  const { booking, timing, urgent, readyOverdue } = row;
  const deliveryFailures = useBookingDeliveryFailure(booking.id);
  const unreachableHumans = useUnreachableHumans();
  const undelivered = undeliveredNotice(
    deliveryFailures,
    booking._ownerId,
    (humanId) => Boolean(humanId) && unreachableHumans.has(humanId),
  );
  // The token's entry has typed replies and failed reminders folded in, so
  // the card's colour and the attention strip's "to confirm" count agree.
  const confirmation = stackConfirmation(token?.entry ?? null);
  const tone = resolveDayStatus(booking.status, booking.cancelReason, confirmation);
  const dogName = titleCase(display.dogMissing ? "Unnamed booking" : display.dogName);
  const ownerName = display.ownerMissing ? "" : titleCase(display.owner);
  const booked = bookedLine(booking);

  const safetyFacts = orderSafetyFacts(
    [welfare?.pregnant ? "Pregnant" : null, ...(welfare?.alerts || [])].filter(Boolean),
  );

  // Money only matters once the dog is ready to leave. Before that it is a
  // number nobody can act on.
  const showBalance = tone.key === "ready";
  // A no-show is a terminal appointment: no price to edit, no invoice to take
  // money on. "They turned up" brings the controls back with the booking.
  const noShow = tone.key === "noShow";
  const amountDue = payment?.amountDue ?? null;
  const hasBalance = showBalance && amountDue != null && amountDue > 0;
  // `paymentState` returns amountDue: null for its "other" kind — a payment
  // string it does not recognise. That is the absence of an answer, not a
  // zero balance, and reading it as one labelled the card "Paid" on a booking
  // nobody had checked (#878). Say what is true: we do not know.
  const unknownBalance = showBalance && amountDue == null;
  const settled = showBalance && !hasBalance && !unknownBalance;

  // Legality lives in the engine. This card asks what is allowed and renders
  // the answer; it never decides, and it never adds a transition of its own.
  const [chainOpen, setChainOpen] = useState(false);

  const allActions = useMemo(() => {
    if (!token) return [];
    return tokenActions(token, {
      amountDue,
      paid: payment?.kind === "paid",
      telHref: telephoneHref(display.ownerPhone),
      contactName: firstName(display.owner),
      dogName,
      ownerName: ownerName || "the owner",
      hasOwner: !!booking._ownerId,
      hasDog: !!booking._dogId,
    });
  }, [token, amountDue, payment, display.ownerPhone, display.owner, dogName, ownerName, booking]);

  // The chain PRESENTS two of the engine's actions rather than replacing them:
  // it appears exactly when `collected` is legal, and the payment and collect
  // entries drop out of the list because the chain is now how you reach them.
  // Everything else the engine offers still renders underneath.
  const showChain = allActions.some((action) => action.id === "collected");
  const owes = amountDue != null && amountDue > 0;
  const groups = useMemo(() => {
    const shown = allActions.filter((action) => !NOT_ON_CARD.has(action.id));
    return {
      // Call first, then WhatsApp: the order staff asked for.
      contact: ["call", "message"]
        .map((id) => shown.find((action) => action.id === id))
        .filter(Boolean),
      progress: shown.filter((action) => PROGRESS.has(action.id)),
      // "Take £42 payment" before Ready; "View payment" whenever nothing is
      // owed, Ready included. Only money still to take goes through the chain.
      payment: shown.filter((action) => action.id === "payment" && !(showChain && owes)),
      more: shown.filter((action) => !CONTACT.has(action.id)
        && !PROGRESS.has(action.id)
        && !CHAINED.has(action.id)),
    };
  }, [allActions, showChain, owes]);

  const balance = hasBalance
    ? { kind: "due", text: money(amountDue) }
    : settled
      ? { kind: "paid" }
      : unknownBalance
        ? { kind: "unknown" }
        : null;

  return (
    <DayCard
      id={row.id}
      tone={tone}
      status={booking.status}
      cancelReason={booking.cancelReason}
      time={row.time}
      spokenTime={booking.slot}
      confirmation={confirmation}
      dogName={dogName}
      ownerName={ownerName}
      ownerSurname={ownerSurname(ownerName)}
      subtitle={row.subtitle}
      timing={timing}
      countdown={!!row.countdown}
      urgent={urgent}
      readyOverdue={readyOverdue}
      onTheWay={onTheWay}
      balance={balance}
      safetyFacts={safetyFacts}
      undelivered={undelivered}
      face={booking.notes || welfare?.groomNotes || null}
      dimmed={dimmed}
      lifted={lifted}
      inPile={inPile}
      clip={clip}
      stackStyle={stackStyle}
      onToggle={onToggle}
      onClose={onClose}
      headRef={headRef}
      detailsRef={detailsRef}
    >
      {safetyFacts.length > 0 && (
        <p className="mt-1 rounded bg-brand-coral-light p-3 text-body text-brand-coral-text">
          <strong>Safety note: </strong>{safetyFacts.join(", ")}
        </p>
      )}
      {undelivered && (
        <p
          data-undelivered-detail
          className="mt-3 rounded border border-current bg-white/60 p-3 text-body"
          style={{ color: "var(--card-ink)" }}
        >
          <strong>{undelivered.chip}: </strong>
          {undelivered.detail}
          {undelivered.callOwner && display.ownerPhone ? (
            <>
              {" "}
              <a
                href={`tel:${display.ownerPhone.replace(/\s/g, "")}`}
                className="font-semibold underline underline-offset-2"
                onClick={(e) => e.stopPropagation()}
              >
                Call {display.ownerPhone}
              </a>
            </>
          ) : null}
        </p>
      )}

      {booking.notes ? (
        <p
          data-stack-notes
          className="m-0 mt-3 rounded bg-white/40 px-3 py-2.5 text-[13.5px] leading-[1.5]"
          style={{ color: "var(--card-ink)" }}
        >
          {booking.notes}
        </p>
      ) : null}

      {welfare?.groomNotes ? (
        <p
          className="m-0 mt-2 whitespace-pre-wrap rounded bg-white/40 px-3 py-2.5 text-[13.5px] leading-[1.5]"
          style={{ color: "var(--card-ink)" }}
        >
          <span className="mr-1.5 font-semibold">Usual groom:</span>
          {welfare.groomNotes}
        </p>
      ) : null}

      {/* In the full view, never the strip: the strip holds only what must
          show while the card is in the stack. Mount only while this card is
          lifted: DayCard keeps its children in the DOM behind 0fr + inert, and
          the signing hook must not run for every collapsed card on first paint. */}
      {lifted && photoPath ? (
        <StaffDogPhoto path={photoPath} dogName={dogName} size={96} rounded="rounded-lg" className="mt-3" />
      ) : null}

      <div data-stack-contact className="my-3 text-sm">
        {ownerName ? <DetailRow label="Owner">{ownerName}</DetailRow> : null}
        {display.ownerPhone ? (
          <DetailRow label="Phone">
            <a
              href={`tel:${display.ownerPhone.replace(/\s/g, "")}`}
              className="underline underline-offset-2"
              onClick={(e) => e.stopPropagation()}
            >
              {display.ownerPhone}
            </a>
          </DetailRow>
        ) : null}
        {lastVisit ? <DetailRow label="Last visit">{lastVisit}</DetailRow> : null}
        {booked ? (
          <DetailRow label="Booked">
            <span data-stack-booked>{booked}</span>
          </DetailRow>
        ) : null}
        {payment?.subtotal != null && !noShow ? (
          <DetailRow label="Price">
            <PriceField
              basePrice={payment.basePrice}
              addonsTotal={payment.addonsTotal}
              subtotal={payment.subtotal}
              tone={tone}
              dogName={dogName}
              // "Editable before payment" — once the chain has started,
              // the figure on the buttons is the figure being handed over
              // and must not move underneath it.
              editable={!!onSetPrice && !chainOpen && payment.kind !== "paid"}
              onSave={(pounds) => onSetPrice?.(booking, pounds)}
            />
          </DetailRow>
        ) : null}
      </div>

      <StackActions
        group="contact"
        actions={groups.contact}
        onSelect={(action) => {
          if (action.href) return;
          onAction?.(token, action);
        }}
        tone={tone}
        dogName={dogName}
        busy={busy}
      />

      {showChain ? (
        <CheckoutChain
          amountDue={amountDue}
          tone={tone}
          dogName={dogName}
          busy={busy}
          onStepChange={(step) => setChainOpen(step !== null)}
          onCollect={({ method, amountDue: taken }) => {
            setChainOpen(false);
            onCollectWithPayment?.(booking, { method, amountTaken: taken });
          }}
        />
      ) : (
        <StackActions
          group="progress"
          actions={groups.progress}
          onSelect={(action) => onAction?.(token, action)}
          tone={tone}
          dogName={dogName}
          busy={busy}
        />
      )}

      <StackActions
        group="payment"
        actions={groups.payment}
        onSelect={(action) => onAction?.(token, action)}
        tone={tone}
        dogName={dogName}
        busy={busy}
      />

      {groups.more.length > 0 || (onOpenInvoice && payment?.kind !== "other" && !noShow) ? (
        <div data-stack-more>
          <GroupLabel>More</GroupLabel>
          <StackActions
            group="more"
            actions={groups.more}
            onSelect={(action) => onAction?.(token, action)}
            tone={tone}
            dogName={dogName}
            busy={busy}
          />
          {/*
            The chain and the payment button cover the common cases. The
            moment there is an add-on to add, a split to record or a discount
            to give, staff need the real invoice.
          */}
          {onOpenInvoice && payment?.kind !== "other" && !noShow ? (
            <button
              type="button"
              data-open-invoice
              aria-label={`Open full invoice — ${dogName}`}
              onClick={(e) => {
                e.stopPropagation();
                onOpenInvoice(booking);
              }}
              className="mt-2.5 min-h-11 text-left text-[13.5px] underline underline-offset-2"
              style={{ color: "var(--card-meta)" }}
            >
              Open full invoice
            </button>
          ) : null}
        </div>
      ) : null}
    </DayCard>
  );
}
