// The shared booking-status badge, and the resolver from a booking to its tone.
//
// The colours themselves live in constants/statusPalette.ts, the one palette
// every status surface reads (the calendar's STATUS_DISPLAY adapts the same
// tones), so a status can never be shown in two different colours.
//
// Two rules are load-bearing and deliberately not configurable:
//
//   1. The status word is ALWAYS rendered. Colour is a second channel, never
//      the only one. A member of staff reading this across a wet salon on a
//      low-brightness screen gets the noun regardless of what the tint does.
//   2. Every tone is dark ink on a light tint. Nothing renders white text,
//      least of all on the gold — white on gold is the specific failure this
//      palette was chosen to avoid, and it is also the one that fails WCAG
//      contrast first.
//
import { BOOKING_STATUS, isNoShowReason, STATUS_TONES, UNKNOWN_STATUS_TONE } from "../../constants/index";
import type { StatusToneKey } from "../../constants/index";

/** The distinct visual states a booking can present in the day stack. */
export type DayStatusKey =
  | "expected"
  | "unconfirmed"
  | "confirmed"
  | "reconfirmed"
  | "arrived"
  | "ready"
  | "noShow"
  | "cancelled"
  | "collected"
  | "unknown";

export interface DayStatusTone {
  /** Stable identifier — used for test hooks and `data-` attributes. */
  key: DayStatusKey;
  /** The word shown to staff. Always rendered; never replaced by colour. */
  label: string;
  /** Pale surface fill — the badge background and the card's tint. */
  tint: string;
  /** Dark ink readable on `tint`. Every pairing clears WCAG AA. */
  ink: string;
  /** Secondary ink for the card's supporting lines (breed, service, timing). */
  meta: string;
  /** Saturated mid-tone for the card's left edge rule. */
  edge: string;
  /** False when a booking in this state has left the day stack. */
  inStack: boolean;
  /**
   * This state needs chasing. The pill inverts (ink fill, tint text) so it
   * reads as a call to act rather than another calm label. Only Unconfirmed.
   */
  needsAttention: boolean;
}

/**
 * Where a Booked dog stands on confirmation (engine/dayStack.ts
 * `stackConfirmation`). Only ever changes the tone of a Booked booking.
 */
export type DayConfirmation = "unconfirmed" | "confirmed" | null | undefined;


/**
 * Resolve a booking's status (and cancellation reason) to its day-stack tone.
 *
 * Two pieces of real logic. A Booked booking takes its tone from where it
 * stands on confirmation (`confirmation`): Unconfirmed, Confirmed or, with
 * nothing to wait for yet, Expected. And a Cancelled booking carrying
 * `cancel_reason = 'No-show'` — the shape before No-show became a status of
 * its own — still reads as a no-show. `isNoShowReason` does the trimming and
 * case-folding so a free-text reason ("Rescheduled via WhatsApp") can never be
 * mistaken for one.
 *
 * An unrecognised status resolves to a neutral tone carrying the RAW string
 * rather than a guess. A status this component has not been taught about is a
 * data problem worth seeing, not one worth papering over with "Expected".
 */
function tone(key: StatusToneKey): DayStatusTone {
  return { key, ...STATUS_TONES[key], needsAttention: key === "unconfirmed" };
}

export function resolveDayStatus(
  status: string | null | undefined,
  cancelReason?: string | null,
  confirmation?: DayConfirmation,
): DayStatusTone {
  switch (status) {
    case BOOKING_STATUS.BOOKED:
      if (confirmation === "unconfirmed") return tone("unconfirmed");
      if (confirmation === "confirmed") return tone("confirmed");
      return tone("expected");
    case BOOKING_STATUS.RECONFIRMED:
      return tone("reconfirmed");
    case BOOKING_STATUS.ARRIVED:
      return tone("arrived");
    case BOOKING_STATUS.READY_FOR_COLLECTION:
      return tone("ready");
    case BOOKING_STATUS.COMPLETED:
      return tone("collected");
    case BOOKING_STATUS.NO_SHOW:
      return tone("noShow");
    case BOOKING_STATUS.CANCELLED:
      // A Cancelled row carrying cancel_reason = 'No-show' is the
      // PRE-MIGRATION shape. Migration 20260919090000 converted the rows that
      // existed, and nothing writes this shape any more; the check survives so
      // that a row which escaped conversion still reads as what it is rather
      // than being mislabelled a plain cancellation.
      return isNoShowReason(cancelReason) ? tone("noShow") : tone("cancelled");
    default:
      return {
        key: "unknown",
        label: `Unknown: ${(status || "").trim() || "Not set"}`,
        ...UNKNOWN_STATUS_TONE,
        needsAttention: false,
      };
  }
}

const SIZES = {
  sm: "text-caption px-2 py-0.5",
  md: "text-xs px-2.5 py-1",
} as const;

const BARE_SIZES = {
  sm: "text-xs",
  md: "text-body",
} as const;

export interface BookingStatusBadgeProps {
  status: string | null | undefined;
  /** Needed only to tell a no-show apart from an ordinary cancellation. */
  cancelReason?: string | null;
  size?: keyof typeof SIZES;
  /**
   * `solid` fills the badge with the status tint — for a neutral surface such
   * as the collected summary.
   *
   * `onTint` drops the fill and keeps only the ink — for a card that is ALREADY
   * carrying the status tint, where a filled pill of the same colour would be
   * invisible. Both render the same word in the same ink, so the two surfaces
   * cannot disagree about what a status is called or what colour it is.
   *
   * `pill` is for the day stack's strip: a white pill edged in the status
   * colour, legible on any tint. A state that needs chasing inverts it — ink
   * fill, tint text — the same pair, so the same contrast.
   */
  variant?: "solid" | "onTint" | "pill";
  /** A Booked dog's confirmation state; changes only a Booked booking's tone. */
  confirmation?: DayConfirmation;
  className?: string;
}

/**
 * The status, as a word. Decorative in the accessibility tree: the badge
 * repeats a fact the card's accessible name already states in full, so
 * announcing it twice would just slow a screen-reader user down.
 */
function badgeStyle(variant: NonNullable<BookingStatusBadgeProps["variant"]>, tone: DayStatusTone) {
  if (variant === "onTint") return { color: tone.ink };
  if (variant === "pill") {
    return tone.needsAttention
      ? { backgroundColor: tone.ink, color: tone.tint, borderColor: tone.ink }
      : { color: tone.ink, borderColor: tone.edge };
  }
  return { backgroundColor: tone.tint, color: tone.ink };
}

export function BookingStatusBadge({
  status,
  cancelReason = null,
  size = "sm",
  variant = "solid",
  confirmation = null,
  className = "",
}: BookingStatusBadgeProps) {
  const tone = resolveDayStatus(status, cancelReason, confirmation);
  const bare = variant === "onTint";
  const pill = variant === "pill";
  return (
    <span
      aria-hidden="true"
      data-status-key={tone.key}
      data-status-variant={variant}
      data-needs-attention={tone.needsAttention ? "true" : undefined}
      className={`inline-flex items-center font-bold leading-none whitespace-nowrap ${
        bare
          ? BARE_SIZES[size]
          : pill
            ? `rounded-full border px-2 py-1 text-xs ${tone.needsAttention ? "" : "bg-white"}`
            : `rounded-full ${SIZES[size]}`
      } ${className}`}
      style={badgeStyle(variant, tone)}
    >
      {tone.label}
    </span>
  );
}
