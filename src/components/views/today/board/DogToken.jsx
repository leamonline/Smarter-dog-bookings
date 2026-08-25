// One dog, as a movable piece on the board.
//
// The token is the primary object in this interface: everything a member of
// staff wants to do, they do by finding a dog and pressing it. So it carries
// the minimum that makes it findable — face, name, one number — and nothing
// that the zone it sits in already says. There is no "READY" badge on a token
// in the Ready zone.
//
// Three exceptions earn extra ink, because each of them is a fact that costs
// money or welfare if it is missed:
//   • a safety note      — always visible, never behind a tap (see below)
//   • an actionable balance — only from Ready onward, where it blocks handover
//   • urgency            — carried by the ring AND the meta text's colour AND
//                          the accessible name, so never by colour alone
import { AlertTriangle, Car } from "lucide-react";
import { DogTokenAvatar } from "./DogTokenAvatar.jsx";

/**
 * Tier → ring + meta text. Colour is always doubled by something else: the
 * meta text changes weight as well as hue, and the token's accessible name
 * spells the state out in words.
 */
const TIER_RING = {
  urgent: "ring-2 ring-brand-coral",
  watch: "ring-[1.5px] ring-amber-400",
  calm: "ring-1 ring-brand-paper-line",
};

const TIER_META = {
  urgent: "text-brand-coral-text font-bold",
  watch: "text-amber-800 font-bold",
  calm: "text-slate-500 font-semibold",
};

/**
 * Avatar diameter by density. The board gets roomier as the screen does —
 * a wet thumb on an iPad wants more than a mouse pointer does.
 */
const AVATAR_SIZE = { compact: 52, regular: 64, roomy: 72 };

function moneyLabel(amount) {
  return `£${Math.round(amount)}`;
}

/**
 * The dog's safety facts, joined for the accessible name and the tooltip.
 * Pregnancy and alerts come from the dog record; notes are this booking's
 * handover text.
 */
export function welfareFacts({ alerts = [], pregnant = false, notes = "" } = {}) {
  const facts = [];
  if (pregnant) facts.push("Pregnant");
  for (const alert of alerts) if (alert) facts.push(String(alert));
  if (notes && notes.trim()) facts.push(notes.trim());
  return facts;
}

export function DogToken({
  token,
  dogName,
  ownerName,
  welfare,
  amountDue = null,
  showBalance = false,
  onTheWay = false,
  density = "regular",
  selected = false,
  dimmed = false,
  highlighted = false,
  busy = false,
  dragging = false,
  landed = false,
  draggable = false,
  onActivate,
  onPointerDown,
  registerRef,
}) {
  const bookingId = String(token.booking.id);
  const facts = welfareFacts(welfare);
  const size = AVATAR_SIZE[density] || AVATAR_SIZE.regular;
  const hasBalance = showBalance && amountDue != null && amountDue > 0;

  // One sentence, in the order a person would say it: who, where, how long,
  // what it costs, what to be careful of.
  const spoken = [
    dogName,
    token.statusText,
    hasBalance ? `${moneyLabel(amountDue)} due` : null,
    onTheWay ? "Owner on the way" : null,
    ownerName ? `owner ${ownerName}` : null,
    facts.length ? `Safety note: ${facts.join(". ")}` : null,
  ]
    .filter(Boolean)
    .join(". ");

  return (
    <li
      data-token-cell
      data-booking-id={bookingId}
      data-tier={token.tier}
      data-zone={token.zone}
      data-needs-attention={token.needsAttention ? "true" : "false"}
      ref={registerRef ? (node) => registerRef(bookingId, node) : undefined}
      className={`relative flex min-w-0 flex-col items-center ${
        dragging ? "pointer-events-none opacity-40" : ""
      } ${landed ? "motion-safe:animate-token-land" : ""}`}
    >
      <button
        type="button"
        data-dog-token
        aria-label={spoken}
        aria-haspopup="menu"
        aria-expanded={selected}
        aria-busy={busy || undefined}
        onClick={() => onActivate?.(bookingId)}
        onPointerDown={draggable ? onPointerDown : undefined}
        className={`group flex w-full min-w-0 flex-col items-center gap-1.5 rounded-2xl px-1 pb-1.5 pt-1 outline-none transition-[opacity,transform,background-color] duration-200 ease-out
          focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2
          ${draggable ? "touch-manipulation" : ""}
          ${dimmed ? "opacity-35" : "opacity-100"}
          ${busy ? "cursor-progress" : "cursor-pointer"}
          hover:bg-brand-purple/[0.04] motion-safe:active:scale-[0.97]`}
      >
        <span className="relative inline-flex">
          <DogTokenAvatar
            name={dogName}
            seed={token.booking._dogId || bookingId}
            size={size}
            className={`bg-clip-padding shadow-[0_1px_2px_rgba(45,0,75,0.08)] ring-offset-2 ring-offset-brand-paper transition-shadow ${TIER_RING[token.tier]} ${
              // Selection and highlighting sit OUTSIDE the tier ring rather
              // than replacing it: turning attention mode on must not erase
              // the very urgency distinction it exists to serve.
              selected || highlighted
                ? "outline outline-2 outline-offset-[5px] outline-brand-purple/60"
                : ""
            } ${busy ? "opacity-60" : ""}`}
          />
          {facts.length > 0 ? (
            <span
              data-token-safety
              title={facts.join(" · ")}
              aria-hidden="true"
              className="absolute -left-0.5 -top-0.5 inline-flex size-5 items-center justify-center rounded-full border border-white bg-brand-coral text-white"
            >
              <AlertTriangle size={11} strokeWidth={2.75} />
            </span>
          ) : null}
          {onTheWay ? (
            <span
              data-token-on-the-way
              aria-hidden="true"
              title="Owner said they are on their way"
              className="absolute -right-0.5 -top-0.5 inline-flex size-5 items-center justify-center rounded-full border border-white bg-brand-teal text-white"
            >
              <Car size={11} strokeWidth={2.75} />
            </span>
          ) : null}
          {hasBalance ? (
            <span
              data-token-balance
              aria-hidden="true"
              className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-white bg-brand-coral px-1.5 text-[10px] font-bold leading-[16px] text-white tabular-nums"
            >
              {moneyLabel(amountDue)}
            </span>
          ) : null}
        </span>
        <span className="flex w-full min-w-0 flex-col items-center gap-px pt-0.5">
          <span className="w-full truncate text-center font-display text-[13px] font-bold leading-tight text-brand-purple">
            {dogName}
          </span>
          {token.meta ? (
            <span
              data-token-meta
              className={`w-full truncate text-center text-[11px] leading-tight tabular-nums ${TIER_META[token.tier]}`}
            >
              {token.meta}
            </span>
          ) : null}
        </span>
      </button>
      {facts.length > 0 ? (
        // Safety text stays ON the board at every width. The existing Daily
        // Brief rule is that a welfare fact is never hidden behind a tap or a
        // breakpoint; a board of small tokens does not get to relax that, so
        // the first fact prints here (truncated, full text in the title and
        // in the action panel) rather than living only in the popover.
        <span
          data-token-safety-text
          title={facts.join(" · ")}
          className="mt-0.5 w-full truncate rounded-md bg-brand-coral-light px-1 text-center text-micro font-semibold text-brand-coral-text"
        >
          {facts[0]}
          {facts.length > 1 ? ` +${facts.length - 1}` : ""}
        </span>
      ) : null}
    </li>
  );
}
