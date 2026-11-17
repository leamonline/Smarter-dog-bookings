// src/components/ui/DayCard.jsx
//
// One dog on the day's list, drawn as a wallet card: a 72px strip that always
// shows, a short read-only face, and the full view that opens when the card is
// lifted out of the stack. Presentational only. It takes resolved data and
// callbacks, and imports no data hook, no engine and no Supabase, so the design
// system can render it in every state it must survive. `StackCard`
// (views/today/stack) owns the hooks, asks the engine what actions are legal,
// and supplies the full view's contents as `children`.
//
// The strip is the only tap target, and everything essential lives in it:
//
//   line 1   time · dog name ······· balance · status pill
//   line 2   safety · delivery problem · breed · service · surname ··· timing
//
// None of it is colour alone. The status is a word in a pill; a state that
// needs chasing inverts its pill. The safety note leads line 2 in words, so the
// overlap can never hide it. Urgency is weight — a thicker left rule and a bold
// timing line — never a new hue. Line 2 truncates with an ellipsis from the
// end, so the surname gives way before the safety note does.
//
// Where the card sits (transform, clip, which card is lifted) is the stack's
// concern: it arrives through `stackStyle` and `clip`, and dayStack.css moves
// it. A card in the pile behind a lifted card is `inert` as a whole: the pile
// has its own single button (StackPile).
import { AlertTriangle, Car, Clock, PhoneOff, X } from "lucide-react";
import { BookingStatusBadge } from "./BookingStatusBadge";
import "./dayCard.css";

/** Left-rule weight, in pixels. The only thing urgency changes about colour. */
const RULE_CALM = 7;
const RULE_URGENT = 10;
const RULE_OVERDUE = 14;

/**
 * @typedef {{ kind: "due" | "paid" | "unknown", text?: string } | null} DayCardBalance
 *   `text` is the amount, already formatted ("£38"), for kind "due".
 */

function balanceWords(balance) {
  if (balance?.kind === "due") return `${balance.text} due`;
  if (balance?.kind === "paid") return "Paid";
  if (balance?.kind === "unknown") return "Payment not known";
  return null;
}

/**
 * @param {{
 *   id: string;
 *   tone: { key: string; label: string; tint: string; edge: string; ink: string; meta: string; needsAttention?: boolean };
 *   status: string;
 *   cancelReason?: string | null;
 *   confirmation?: "unconfirmed" | "confirmed" | null;
 *   time?: string;
 *   spokenTime?: string;
 *   dogName: string;
 *   ownerName?: string;
 *   ownerSurname?: string;
 *   subtitle?: string;
 *   timing?: string | null;
 *   countdown?: boolean;
 *   urgent?: boolean;
 *   readyOverdue?: boolean;
 *   onTheWay?: boolean;
 *   balance?: DayCardBalance;
 *   safetyFacts?: string[];
 *   undelivered?: { chip: string; detail: string } | null;
 *   face?: string | null;
 *   dimmed?: boolean;
 *   lifted?: boolean;
 *   inPile?: boolean;
 *   clip?: number | null;
 *   stackStyle?: import("react").CSSProperties;
 *   onToggle: () => void;
 *   onClose?: () => void;
 *   headRef?: import("react").Ref<HTMLButtonElement>;
 *   detailsRef?: import("react").Ref<HTMLElement>;
 *   children?: import("react").ReactNode;
 * }} props
 */
export function DayCard({
  id,
  tone,
  status,
  cancelReason,
  confirmation = null,
  time,
  spokenTime = time,
  dogName,
  ownerName = "",
  ownerSurname = "",
  subtitle,
  timing,
  countdown = false,
  urgent = false,
  readyOverdue = false,
  onTheWay = false,
  balance = null,
  safetyFacts = [],
  undelivered = null,
  face = null,
  dimmed = false,
  lifted = false,
  inPile = false,
  clip = null,
  stackStyle,
  onToggle,
  onClose,
  headRef,
  detailsRef,
  children,
}) {
  const ruleWidth = readyOverdue ? RULE_OVERDUE : urgent ? RULE_URGENT : RULE_CALM;
  const drawerId = `stack-drawer-${id}`;
  const money = balanceWords(balance);
  const moreSafety = safetyFacts.length > 1 ? ` +${safetyFacts.length - 1}` : "";
  const meta = [subtitle, ownerSurname].filter(Boolean).join(" · ");

  // Speak the strip's visible words first, exactly and in the order they
  // appear, so a voice-control user who says what they see matches the button
  // (WCAG 2.5.3, label in name). Nothing may be inserted among them: axe
  // checks that the visible text appears as one run inside the name, and a
  // "Safety note:" prefix in front of the warning broke that run. Extra spoken
  // context follows: every safety note in full, the appointment time when it is
  // shown otherwise, and the owner's whole name.
  const spoken = [
    time || "--:--",
    dogName,
    money,
    tone.label,
    safetyFacts.length ? `${safetyFacts[0]}${moreSafety}` : null,
    undelivered ? undelivered.chip : null,
    meta,
    timing,
    onTheWay ? "On the way" : null,
    safetyFacts.length ? `Safety note: ${safetyFacts.join(". ")}` : null,
    spokenTime && spokenTime !== time ? `Appointment time ${spokenTime}` : null,
    ownerName && ownerName !== ownerSurname ? `owner ${ownerName}` : null,
  ]
    .filter(Boolean)
    .join(". ");

  return (
    <li
      data-stack-card
      data-booking-id={id}
      data-status-key={tone.key}
      data-urgent={urgent ? "true" : "false"}
      data-lifted={lifted ? "true" : "false"}
      data-in-pile={inPile ? "true" : "false"}
      inert={inPile}
      className={`wallet-appointment overflow-hidden rounded-card ${
        dimmed && !lifted ? "opacity-50" : "opacity-100"
      }`}
      style={{
        ...stackStyle,
        clipPath: clip == null ? undefined : `inset(0 0 calc(100% - ${clip}px) 0)`,
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
        ref={headRef}
        type="button"
        data-stack-head
        aria-label={spoken}
        aria-expanded={lifted}
        aria-controls={drawerId}
        onClick={onToggle}
        className="wallet-strip w-full text-left outline-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-[3px]"
        style={{ outlineColor: tone.ink }}
      >
        <span className="wallet-line wallet-line-1">
          <span className="wallet-time text-[19px] font-bold tabular-nums tracking-[-0.01em]">
            {time || "--:--"}
          </span>{" "}
          <span className="wallet-name min-w-0 truncate text-[17px] font-medium">{dogName}</span>{" "}
          {money ? (
            <span
              data-stack-balance
              className={`shrink-0 text-xs tabular-nums ${balance?.kind === "due" ? "font-bold" : ""}`}
              style={balance?.kind === "due" ? undefined : { color: "var(--card-meta)" }}
            >
              {money}
            </span>
          ) : null}{" "}
          <BookingStatusBadge
            status={status}
            cancelReason={cancelReason}
            confirmation={confirmation}
            variant="pill"
            className="shrink-0"
          />
        </span>{" "}
        <span className="wallet-line wallet-line-2 text-xs" style={{ color: "var(--card-meta)" }}>
          <span data-stack-meta className="min-w-0 flex-1 truncate">
            {[
              safetyFacts.length ? (
                <span key="safety" data-stack-safety className="font-bold" style={{ color: "var(--card-ink)" }}>
                  <AlertTriangle size={12} aria-hidden="true" className="mr-1 inline align-[-1px]" />
                  {safetyFacts[0]}{moreSafety}
                </span>
              ) : null,
              undelivered ? (
                <span key="undelivered" data-undelivered className="font-semibold" style={{ color: "var(--card-ink)" }}>
                  <PhoneOff size={12} aria-hidden="true" className="mr-1 inline align-[-1px]" />
                  {undelivered.chip}
                </span>
              ) : null,
              meta ? <span key="meta" data-stack-subtitle>{meta}</span> : null,
            ]
              .filter(Boolean)
              .flatMap((piece, index) => (index === 0 ? [piece] : [" · ", piece]))}
          </span>{" "}
          {timing || onTheWay ? (
            <span
              data-stack-timing
              data-countdown={countdown ? "true" : undefined}
              className={`shrink-0 tabular-nums ${urgent || countdown ? "font-bold" : ""}`}
              style={urgent || countdown ? { color: "var(--card-ink)" } : undefined}
            >
              {readyOverdue && <Clock size={12} aria-hidden="true" className="mr-1 inline align-[-1px]" />}
              {timing}
              {timing && onTheWay ? " · " : ""}
              {onTheWay && (
                <span data-stack-on-the-way>
                  <Car size={12} aria-hidden="true" className="mr-1 inline align-[-1px]" />On the way
                </span>
              )}
            </span>
          ) : null}
        </span>
      </button>

      {/*
        The face: what the last card in the stack shows below its strip, and
        what every other card's face would show if the next card did not cover
        it. Read-only and repeated in full in the lifted view, so it is hidden
        from assistive technology rather than announced twice.
      */}
      {lifted ? null : (
        <div data-stack-face aria-hidden="true" className="wallet-face text-body leading-[1.45]" style={{ color: "var(--card-meta)" }}>
          {face ? <p className="m-0 line-clamp-2">{face}</p> : null}
        </div>
      )}

      {/*
        The full view. It animates its rows from 0fr to 1fr so it fits its own
        content without anybody measuring it; the stack measures it separately
        to place the pile. `inert` as well as the zero row, because 0fr plus
        overflow-hidden only makes it invisible — it stays in the tab order and
        is still announced (#878). Nothing in it is reachable until the card is
        lifted out.
      */}
      <div
        id={drawerId}
        className="wallet-drawer grid"
        style={{ gridTemplateRows: lifted ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden" inert={!lifted}>
          <section
            ref={detailsRef}
            data-stack-details
            aria-label={`${dogName} — details`}
            tabIndex={-1}
            className="border-t border-black/[0.09] px-3.5 pb-3.5 outline-none"
          >
            <div className="flex justify-end pt-1.5">
              <button
                type="button"
                data-stack-close
                aria-label={`Close ${dogName}`}
                onClick={onClose}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 text-[13.5px] font-semibold outline-none focus-visible:outline focus-visible:outline-2"
                style={{ color: "var(--card-ink)", outlineColor: tone.ink }}
              >
                <X size={16} aria-hidden="true" />
                Close
              </button>
            </div>
            {children}
          </section>
        </div>
      </div>
    </li>
  );
}
