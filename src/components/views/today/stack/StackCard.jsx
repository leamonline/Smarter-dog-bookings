// One dog, one row, expanding in place.
//
// The collapsed row is the whole screen's job: time, who, what, where in the
// day, and how long it has been there. Everything else is behind the
// disclosure, because a member of staff scanning the list at arm's length
// wants six rows they can read, not one row they can read everything about.
//
// Three facts from the old board's token had to survive the move and each has
// its own channel here, none of them colour alone:
//
//   • the safety note   — its own full-width row, ALWAYS visible, with the
//                         actual words. The board showed a coral triangle and
//                         put the text in a tooltip, which reaches neither a
//                         touch user nor a screen reader. For welfare
//                         information that is not a detail.
//   • the balance       — in the header from Ready onward, where it blocks the
//                         handover. Bold tabular figures and the word "due".
//   • urgency           — weight on the left rule AND the wording of the timing
//                         line, which also changes weight. Never a new hue.
//
// The safety chip is a real button, so it cannot live inside the disclosure
// button. It sits beside it instead, which also means the two are independently
// tappable at full size.
import { useMemo, useState } from "react";
import { Car, Clock } from "lucide-react";
import { money } from "../../../../engine/dayStack";
import { tokenActions } from "../../../../engine/salonBoard";
import { BookingStatusBadge, resolveDayStatus } from "../../../ui";
import { SafetyAlertChip } from "../../../ui/SafetyAlertChip.jsx";
import { firstName, telephoneHref } from "../parts.jsx";
import { titleCase } from "../../../../utils/text";
import { StackActions } from "./StackActions.jsx";
import { CheckoutChain } from "./CheckoutChain.jsx";
import { PriceField } from "./PriceField.jsx";

/** The two engine actions the check-out chain speaks for. */
const CHAINED = new Set(["payment", "collected"]);

/** Left-rule weight, in pixels. The only thing urgency changes about colour. */
const RULE_CALM = 7;
const RULE_URGENT = 10;
const RULE_OVERDUE = 14;


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
  const tone = resolveDayStatus(booking.status, booking.cancelReason);
  const dogName = titleCase(display.dogMissing ? "Unnamed booking" : display.dogName);
  const ownerName = display.ownerMissing ? "" : titleCase(display.owner);

  const safetyFacts = [
    welfare?.pregnant ? "Pregnant" : null,
    ...(welfare?.alerts || []),
  ].filter(Boolean);

  // Money only matters once the dog is ready to leave. Before that it is a
  // number nobody can act on.
  const showBalance = tone.key === "ready";
  const amountDue = payment?.amountDue ?? null;
  const hasBalance = showBalance && amountDue != null && amountDue > 0;
  // `paymentState` returns amountDue: null for its "other" kind — a payment
  // string it does not recognise. That is the absence of an answer, not a
  // zero balance, and reading it as one labelled the card "Paid" on a booking
  // nobody had checked (#878). Say what is true: we do not know.
  const unknownBalance = showBalance && amountDue == null;
  const settled = showBalance && !hasBalance && !unknownBalance;

  const ruleWidth = readyOverdue ? RULE_OVERDUE : urgent ? RULE_URGENT : RULE_CALM;
  const drawerId = `stack-drawer-${row.id}`;

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

  // One sentence, in the order a person would say it. The badge and the chip
  // are both aria-hidden precisely so this is the single spoken version.
  const spoken = [
    booking.slot,
    dogName,
    row.subtitle,
    tone.label,
    timing,
    hasBalance
      ? `${money(amountDue)} due`
      : settled
        ? "Paid"
        : unknownBalance
          ? "Payment not known"
          : null,
    onTheWay ? "Owner on the way" : null,
    ownerName ? `owner ${ownerName}` : null,
    safetyFacts.length ? `Safety note: ${safetyFacts.join(". ")}` : null,
  ]
    .filter(Boolean)
    .join(". ");

  return (
    <li
      data-stack-card
      data-booking-id={row.id}
      data-status-key={tone.key}
      data-urgent={urgent ? "true" : "false"}
      className={`overflow-hidden rounded-lg motion-safe:transition-opacity ${
        dimmed ? "opacity-50" : "opacity-100"
      }`}
      style={{
        backgroundColor: tone.tint,
        borderLeftStyle: "solid",
        borderLeftColor: tone.edge,
        borderLeftWidth: `${ruleWidth}px`,
        // Consumed by the rows below so the ink stays with the tint.
        "--card-ink": tone.ink,
        "--card-meta": tone.meta,
        color: tone.ink,
      }}
    >
      <button
        type="button"
        data-stack-head
        aria-label={spoken}
        aria-expanded={expanded}
        aria-controls={drawerId}
        onClick={onToggle}
        className="grid w-full min-h-16 grid-cols-[auto_1fr_auto] items-center gap-3 px-3.5 py-3 text-left
          outline-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-[3px]"
        style={{ outlineColor: tone.ink }}
      >
        <span className="text-[19px] font-bold tabular-nums tracking-[-0.01em]">
          {row.time || "--:--"}
        </span>

        <span className="min-w-0">
          <span className="block truncate text-[17px] font-medium">{dogName}</span>
          {row.subtitle ? (
            <span className="block truncate text-[13px]" style={{ color: "var(--card-meta)" }}>
              {row.subtitle}
            </span>
          ) : null}
        </span>

        <span className="text-right text-[12.5px] leading-[1.35] whitespace-nowrap">
          <BookingStatusBadge
            status={booking.status}
            cancelReason={booking.cancelReason}
            variant="onTint"
            className="block font-medium"
          />
          {hasBalance ? (
            <span className="block font-bold tabular-nums">{money(amountDue)} due</span>
          ) : settled ? (
            <span className="block" style={{ color: "var(--card-meta)" }}>Paid</span>
          ) : unknownBalance ? (
            <span className="block" style={{ color: "var(--card-meta)" }}>Payment not known</span>
          ) : null}
          {onTheWay ? (
            <span className="flex items-center justify-end gap-1 font-medium">
              <Car size={12} strokeWidth={2.4} aria-hidden="true" />
              On the way
            </span>
          ) : null}
          {timing ? (
            <span
              className={`block tabular-nums ${urgent ? "font-bold" : ""}`}
              style={{ color: urgent ? "var(--card-ink)" : "var(--card-meta)" }}
            >
              {readyOverdue ? (
                <Clock size={12} strokeWidth={2.4} aria-hidden="true" className="mr-[3px] inline align-[-1px]" />
              ) : null}
              {timing}
            </span>
          ) : null}
        </span>
      </button>

      {safetyFacts.length > 0 ? (
        <div className="px-3.5 pb-2.5">
          <SafetyAlertChip items={safetyFacts} />
        </div>
      ) : null}

      {/*
        0fr → 1fr rather than a height, so the drawer animates to its real
        content size without anybody measuring it. The reduced-motion query is
        global (index.css) but restated here because this transition is the one
        most likely to be noticed.
      */}
      <div
        id={drawerId}
        className="grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none"
        style={{ gridTemplateRows: expanded ? "1fr" : "0fr" }}
      >
        {/*
          `inert` as well as the zero row, because 0fr plus overflow-hidden only
          makes the drawer invisible — it stays in the tab order and is still
          announced. Every closed card was therefore offering its phone link,
          its price editor and, worst of all, its "Collected" button to a
          keyboard user who could not see which dog they belonged to (#878).
          aria-expanded said "false" while the contents said otherwise.
        */}
        <div className="overflow-hidden" inert={expanded ? undefined : ""}>
          <div className="border-t border-black/[0.09] px-3.5 pb-3.5">
            <div className="my-3 text-[14px]">
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
              {payment?.subtotal != null ? (
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
              reach it, is going behind a flag.
            */}
            {onOpenInvoice && payment?.kind !== "other" ? (
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
        </div>
      </div>
    </li>
  );
}
