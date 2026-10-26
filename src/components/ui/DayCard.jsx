// src/components/ui/DayCard.jsx
//
// One dog on the day's list: a fixed-height header and a drawer for the rest.
// Presentational only. It takes resolved data and callbacks, and imports no
// data hook, no engine and no Supabase, so the design system can render it in
// every state it must survive. `StackCard` (views/today/stack) owns the hooks,
// asks the engine what actions are legal, and renders this with the drawer
// contents as `children`.
//
// The header's rules are the screen's job, and none of them is colour alone:
//
//   • the safety note   — its own row, ALWAYS visible, with the actual words.
//   • the balance       — bold tabular figures and the word "due".
//   • urgency           — weight on the left rule AND the wording of the timing
//                         line. Never a new hue.
//   • an undeliverable WhatsApp message shares the safety row, because the
//     header's height is fixed and a new row would move every card below it.
//
// Where the card sits in the stack (absolute position, transform, dimming) is
// the stack's concern: it arrives through `stackStyle` and the
// `wallet-appointment` class, which dayStack.css positions.
import { AlertTriangle, Car, Clock, PhoneOff } from "lucide-react";
import { BookingStatusBadge } from "./BookingStatusBadge";
import "./dayCard.css";

/** Left-rule weight, in pixels. The only thing urgency changes about colour. */
const RULE_CALM = 7;
const RULE_URGENT = 10;
const RULE_OVERDUE = 14;

/**
 * @typedef {{ kind: "due" | "paid" | "unknown", text?: string } | null} DayCardBalance
 *   `text` is the amount, already formatted ("£38.00"), for kind "due".
 */

/**
 * @param {{
 *   id: string;
 *   tone: { key: string; label: string; tint: string; edge: string; ink: string; meta: string };
 *   status: string;
 *   cancelReason?: string | null;
 *   time?: string;
 *   spokenTime?: string;
 *   dogName: string;
 *   ownerName?: string;
 *   subtitle?: string;
 *   timing?: string;
 *   urgent?: boolean;
 *   readyOverdue?: boolean;
 *   onTheWay?: boolean;
 *   balance?: DayCardBalance;
 *   safetyFacts?: string[];
 *   undelivered?: { chip: string; detail: string } | null;
 *   focused?: boolean;
 *   dimmed?: boolean;
 *   expanded: boolean;
 *   stackStyle?: import("react").CSSProperties;
 *   onToggle: () => void;
 *   onHeadFocus?: () => void;
 *   children?: import("react").ReactNode;
 * }} props
 */
export function DayCard({
  id,
  tone,
  status,
  cancelReason,
  time,
  spokenTime = time,
  dogName,
  ownerName = "",
  subtitle,
  timing,
  urgent = false,
  readyOverdue = false,
  onTheWay = false,
  balance = null,
  safetyFacts = [],
  undelivered = null,
  focused = false,
  dimmed = false,
  expanded,
  stackStyle,
  onToggle,
  onHeadFocus,
  children,
}) {
  const ruleWidth = readyOverdue ? RULE_OVERDUE : urgent ? RULE_URGENT : RULE_CALM;
  const drawerId = `stack-drawer-${id}`;

  // One sentence gives the disclosure its complete accessible name. The
  // separate safety button also names every warning for direct navigation.
  const spoken = [
    spokenTime,
    dogName,
    subtitle,
    tone.label,
    timing,
    balance?.kind === "due"
      ? `${balance.text} due`
      : balance?.kind === "paid"
        ? "Paid"
        : balance?.kind === "unknown"
          ? "Payment not known"
          : null,
    onTheWay ? "Owner on the way" : null,
    ownerName ? `owner ${ownerName}` : null,
    safetyFacts.length ? `Safety note: ${safetyFacts.join(". ")}` : null,
    undelivered ? undelivered.chip : null,
  ]
    .filter(Boolean)
    .join(". ");

  return (
    <li
      data-stack-card
      data-focused={focused ? "true" : "false"}
      data-booking-id={id}
      data-status-key={tone.key}
      data-urgent={urgent ? "true" : "false"}
      className={`wallet-appointment overflow-hidden rounded-xl ${
        dimmed ? "opacity-50" : "opacity-100"
      }`}
      style={{
        ...stackStyle,
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
      <div
        className="wallet-header"
        data-stack-header
        onClick={(event) => {
          // Blank reserved space and metadata are part of the card's tap target;
          // sibling buttons keep their own explicit keyboard/click behaviour.
          if (!event.target.closest("button")) onToggle();
        }}
      >
        <button
          type="button"
          data-stack-head
          aria-label={spoken}
          aria-expanded={expanded}
          aria-controls={drawerId}
          onClick={onToggle}
          onFocus={onHeadFocus}
          className="wallet-heading w-full text-left outline-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-[3px]"
          style={{ outlineColor: tone.ink }}
        >
          <span className="wallet-time text-[19px] font-bold tabular-nums tracking-[-0.01em]">
            {time || "--:--"}
          </span>

          <span className="wallet-name block truncate text-[17px] font-medium">{dogName}</span>
          <span className="wallet-status text-right text-xs leading-[1.3]">
            <BookingStatusBadge
              status={status}
              cancelReason={cancelReason}
              variant="onTint"
              className="block font-medium"
            />
            {balance?.kind === "due" ? (
              <span className="block font-bold tabular-nums">{balance.text} due</span>
            ) : balance?.kind === "paid" ? (
              <span className="block" style={{ color: "var(--card-meta)" }}>Paid</span>
            ) : balance?.kind === "unknown" ? (
              <span className="block" style={{ color: "var(--card-meta)" }}>Payment not known</span>
            ) : null}
          </span>
        </button>
        <span className="wallet-metadata text-xs" style={{ color: "var(--card-meta)" }}>
          <span className="block truncate">{subtitle}</span>
          <span className={`flex flex-wrap items-center gap-x-3 ${urgent ? "font-bold" : ""}`}>
            {timing && <span>{readyOverdue && <Clock size={12} aria-hidden="true" className="mr-1 inline" />}{timing}</span>}
            {onTheWay && <span><Car size={12} aria-hidden="true" className="mr-1 inline" />On the way</span>}
          </span>
        </span>
        <div className="wallet-safety flex items-center gap-2">
          {safetyFacts.length > 0 && (
            <button
              type="button"
              aria-label={`Safety alert: ${safetyFacts.join(", ")}`}
              aria-expanded={expanded}
              aria-controls={drawerId}
              onClick={() => { if (!expanded) onToggle(); }}
              className="flex h-11 min-w-0 max-w-full items-center gap-1 text-left text-caption font-semibold text-brand-coral-text"
            >
              <AlertTriangle size={14} className="shrink-0" aria-hidden="true" />
              <span className="truncate rounded bg-brand-coral-light px-1.5 py-1">
                {safetyFacts[0]}{safetyFacts.length > 1 ? ` +${safetyFacts.length - 1}` : ""}
              </span>
            </button>
          )}
          {undelivered && (
            <button
              type="button"
              data-undelivered
              aria-label={`${undelivered.chip}. ${undelivered.detail}`}
              aria-expanded={expanded}
              aria-controls={drawerId}
              onClick={() => { if (!expanded) onToggle(); }}
              className="flex h-11 min-w-0 items-center gap-1 text-left text-caption font-semibold"
              style={{ color: "var(--card-ink)" }}
            >
              <PhoneOff size={14} className="shrink-0" aria-hidden="true" />
              <span className="truncate rounded border border-current bg-white/60 px-1.5 py-1">
                {undelivered.chip}
              </span>
            </button>
          )}
        </div>
      </div>

      {/*
        The drawer animates to its natural content size. The stack measures
        its inner content independently to position upcoming cards. Reduced
        motion removes the disclosure transition as well as card movement.
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
          its price editor and its "Collected" button to a keyboard user who
          could not see which dog they belonged to (#878).
        */}
        <div className="overflow-hidden" inert={!expanded}>
          <div data-stack-details className="border-t border-black/[0.09] px-3.5 pb-3.5">
            {children}
          </div>
        </div>
      </div>
    </li>
  );
}
