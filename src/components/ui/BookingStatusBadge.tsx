// The shared booking-status badge.
//
// Until now every surface that wanted to show a booking's status reached for
// STATUS_DISPLAY in constants/salon.ts and applied it through an inline
// `style` attribute — roughly thirty call sites, each free to drift. This is
// the one component that renders a booking status, so the palette lives in
// exactly one place and a status can never be shown in two different colours.
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
// The `/today` day stack is the only consumer for now. The other STATUS_DISPLAY
// call sites are left exactly as they are; migrating them is its own change.
import { BOOKING_STATUS, isNoShowReason } from "../../constants/index";

/** The distinct visual states a booking can present in the day stack. */
export type DayStatusKey =
  | "expected"
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
}

/**
 * Status → tone, taken from the salon-day-view prototype.
 *
 * The five live hues are deliberate and were corrected against that file rather
 * than derived here:
 *
 *   Expected     near-neutral grey-blue with NEUTRAL ink, not blue ink. This is
 *                the resting state and it should recede.
 *   Checked in   brand teal.
 *   In the bath  OLIVE green, not mint. Mint sits too close to the teal beside
 *                it; the olive separates the two states that are adjacent in
 *                the progression and therefore adjacent on the screen.
 *   Ready        brand GOLD, not yellow. It is the brand colour and the only
 *                warm thing on the page, so it has to be the right warm.
 *   No-show      red, not pink.
 *
 * The two states that have left the stack fall back to slate so a finished day
 * settles down rather than staying loud.
 *
 * Light values only. The prototype also carries a dark theme; the app has no
 * dark mode and adding one is a separate project, so those values are not
 * ported here.
 */
const TONES: Record<Exclude<DayStatusKey, "unknown">, Omit<DayStatusTone, "key">> = {
  expected: {
    label: "Expected",
    tint: "#E8ECF0",
    ink: "#2C353F",
    meta: "#4C5863",
    edge: "#97A6B5",
    inStack: true,
  },
  // Reconfirmed: informational blue. It is news, not activity — the dog is
  // still at home. Distinct from the neutral of an unconfirmed booking and
  // from the green of one that has actually walked through the door.
  reconfirmed: {
    label: "Reconfirmed",
    tint: "#DBEAFE",
    ink: "#12315E",
    meta: "#1D4A8F",
    edge: "#3B82F6",
    inStack: true,
  },
  // Arrived keeps the teal that "Checked in" had: the dog is here, and the
  // one in-salon state now covers the whole of its visit. The olive that used
  // to separate it from "In the bath" is retired with that status.
  arrived: {
    label: "Arrived",
    tint: "#D3EAE4",
    ink: "#123C33",
    meta: "#1D5F51",
    edge: "#2E8B76",
    inStack: true,
  },
  ready: {
    // Dark brown-gold ink on a pale gold tint. This is the pairing the brief
    // singles out: the gold is a background and an edge colour only, never a
    // text colour, and never a fill behind white.
    label: "Ready",
    tint: "#F7E6BE",
    ink: "#4A3403",
    meta: "#6B4C06",
    edge: "#B8860B",
    inStack: true,
  },
  noShow: {
    label: "No-show",
    tint: "#F2D9D9",
    ink: "#4A1414",
    meta: "#7A2222",
    edge: "#B33A3A",
    inStack: false,
  },
  cancelled: {
    // An ordinary cancellation borrows the no-show family. It is the same
    // fact to the eye — this dog is not coming — and a sixth hue for it would
    // buy nothing the word does not already say.
    label: "Cancelled",
    tint: "#F2D9D9",
    ink: "#4A1414",
    meta: "#7A2222",
    edge: "#B33A3A",
    inStack: false,
  },
  collected: {
    label: "Collected",
    tint: "#F1F5F9",
    ink: "#40506B",
    meta: "#5A666F",
    edge: "#94A3B8",
    inStack: false,
  },
};

/**
 * Resolve a booking's status (and cancellation reason) to its day-stack tone.
 *
 * The one piece of real logic here is the no-show split. There is no no-show
 * status in this system and there never has been: a no-show is a Cancelled
 * booking carrying `cancel_reason = 'No-show'`. `isNoShowReason` does the
 * trimming and case-folding so a free-text reason ("Rescheduled via WhatsApp")
 * can never be mistaken for one.
 *
 * An unrecognised status resolves to a neutral tone carrying the RAW string
 * rather than a guess. A status this component has not been taught about is a
 * data problem worth seeing, not one worth papering over with "Expected".
 */
export function resolveDayStatus(
  status: string | null | undefined,
  cancelReason?: string | null,
): DayStatusTone {
  switch (status) {
    case BOOKING_STATUS.BOOKED:
      return { key: "expected", ...TONES.expected };
    case BOOKING_STATUS.RECONFIRMED:
      return { key: "reconfirmed", ...TONES.reconfirmed };
    case BOOKING_STATUS.ARRIVED:
      return { key: "arrived", ...TONES.arrived };
    case BOOKING_STATUS.READY_FOR_COLLECTION:
      return { key: "ready", ...TONES.ready };
    case BOOKING_STATUS.COMPLETED:
      return { key: "collected", ...TONES.collected };
    case BOOKING_STATUS.NO_SHOW:
      return { key: "noShow", ...TONES.noShow };
    case BOOKING_STATUS.CANCELLED:
      // A Cancelled row carrying cancel_reason = 'No-show' is the
      // PRE-MIGRATION shape. Migration 20260919090000 converted the rows that
      // existed, and nothing writes this shape any more; the check survives so
      // that a row which escaped conversion still reads as what it is rather
      // than being mislabelled a plain cancellation.
      return isNoShowReason(cancelReason)
        ? { key: "noShow", ...TONES.noShow }
        : { key: "cancelled", ...TONES.cancelled };
    default:
      return {
        key: "unknown",
        label: (status || "Unknown").trim() || "Unknown",
        tint: "#F1F5F9",
        ink: "#40506B",
        meta: "#5A666F",
        edge: "#94A3B8",
        inStack: false,
      };
  }
}

const SIZES = {
  sm: "text-[11px] px-2 py-0.5",
  md: "text-[12px] px-2.5 py-1",
} as const;

const BARE_SIZES = {
  sm: "text-[12px]",
  md: "text-[13px]",
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
   */
  variant?: "solid" | "onTint";
  className?: string;
}

/**
 * The status, as a word. Decorative in the accessibility tree: the badge
 * repeats a fact the card's accessible name already states in full, so
 * announcing it twice would just slow a screen-reader user down.
 */
export function BookingStatusBadge({
  status,
  cancelReason = null,
  size = "sm",
  variant = "solid",
  className = "",
}: BookingStatusBadgeProps) {
  const tone = resolveDayStatus(status, cancelReason);
  const bare = variant === "onTint";
  return (
    <span
      aria-hidden="true"
      data-status-key={tone.key}
      data-status-variant={variant}
      className={`inline-flex items-center font-bold leading-none whitespace-nowrap ${
        bare ? BARE_SIZES[size] : `rounded-full ${SIZES[size]}`
      } ${className}`}
      style={bare
        ? { color: tone.ink }
        : { backgroundColor: tone.tint, color: tone.ink }}
    >
      {tone.label}
    </span>
  );
}
