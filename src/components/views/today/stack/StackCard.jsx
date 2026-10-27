// One dog on the day list. This is the half that knows things: it reads the
// delivery-failure hooks, asks the engine (`tokenActions`) which moves are
// legal, and holds the check-out chain's open state. It hands plain data to
// <DayCard> (ui/DayCard.jsx), which draws the fixed header and the drawer, and
// supplies the drawer's contents as children.
//
// The rules the header must keep (safety note always visible as words, balance
// from Ready onward, urgency as weight and wording, the undeliverable-message
// chip sharing the safety row) are recorded in DayCard, where they are drawn.
import { useMemo, useState } from "react";
import { money } from "../../../../engine/dayStack";
import { tokenActions } from "../../../../engine/salonBoard";
import { orderSafetyFacts } from "../../../../engine/safetyOrder";
import { DayCard, resolveDayStatus } from "../../../ui";
import { firstName, telephoneHref } from "../parts.jsx";
import { titleCase } from "../../../../utils/text";
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

function DetailRow({ label, children }) {
  return (
    <div className="flex justify-between gap-3 py-[5px]">
      <span style={{ color: "var(--card-meta)" }}>{label}</span>
      <div className="text-right">{children}</div>
    </div>
  );
}

export function StackCard({
  row,
  display,
  welfare,
  payment,
  lastVisit,
  onTheWay = false,
  dimmed = false,
  expanded,
  stackStyle,
  focused = false,
  onHeadFocus,
  onToggle,
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
  const tone = resolveDayStatus(booking.status, booking.cancelReason);
  const dogName = titleCase(display.dogMissing ? "Unnamed booking" : display.dogName);
  const ownerName = display.ownerMissing ? "" : titleCase(display.owner);

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
  const actions = useMemo(
    () => allActions.filter((action) => !CHAINED.has(action.id)),
    [allActions],
  );

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
      dogName={dogName}
      ownerName={ownerName}
      subtitle={row.subtitle}
      timing={timing}
      urgent={urgent}
      readyOverdue={readyOverdue}
      onTheWay={onTheWay}
      balance={balance}
      safetyFacts={safetyFacts}
      undelivered={undelivered}
      focused={focused}
      dimmed={dimmed}
      expanded={expanded}
      stackStyle={stackStyle}
      onToggle={onToggle}
      onHeadFocus={onHeadFocus}
    >
      {safetyFacts.length > 0 && (
        <p className="mt-3 rounded bg-brand-coral-light p-3 text-body text-brand-coral-text">
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
      <div className="my-3 text-sm">
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

      {booking.notes ? (
        <p
          className="m-0 rounded bg-white/40 px-3 py-2.5 text-[13.5px] leading-[1.5]"
          style={{ color: "var(--card-ink)" }}
        >
          {booking.notes}
        </p>
      ) : null}

      {welfare?.groomNotes ? (
        <p
          className="m-0 whitespace-pre-wrap rounded bg-white/40 px-3 py-2.5 text-[13.5px] leading-[1.5]"
          style={{ color: "var(--card-ink)" }}
        >
          <span className="mr-1.5 font-semibold">Usual groom:</span>
          {welfare.groomNotes}
        </p>
      ) : null}

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
      ) : null}

      <StackActions
        actions={actions}
        onSelect={(action) => {
          if (action.href) return;
          onAction?.(token, action);
        }}
        tone={tone}
        dogName={dogName}
        busy={busy}
      />

      {/*
        The inline chain covers the common case. The moment there is an
        add-on to add, a split to record or a discount to give, staff need
        the real thing — and the old board, which was the other way to
        reach it, is gone.
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
    </DayCard>
  );
}
