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
  | "checkedIn"
  | "inBath"
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
  /** Saturated mid-tone for the card's left edge rule. */
  edge: string;
  /** False when a booking in this state has left the day stack. */
  inStack: boolean;
}

/**
 * Status → tone. Five live states plus the two that have left the stack.
 *
 * The hues are named in the brief rather than derived: cool grey-blue for a dog
 * that has not arrived, teal once it is with us, green mid-groom, gold when it
 * is waiting to go home, soft red for a no-show. They read as a progression
 * left to right, and the two "gone" states fall back to slate so a finished day
 * settles down rather than staying loud.
 */
const TONES: Record<Exclude<DayStatusKey, "unknown">, Omit<DayStatusTone, "key">> = {
  expected: {
    label: "Expected",
    tint: "#ECF1F7",
    ink: "#33506E",
    edge: "#94AECB",
    inStack: true,
  },
  checkedIn: {
    label: "Checked in",
    tint: "#E0F0EC",
    ink: "#245F53",
    edge: "#2D8B7A",
    inStack: true,
  },
  inBath: {
    label: "In the bath",
    tint: "#CFF8DE",
    ink: "#0B5C26",
    edge: "#0A7D30",
    inStack: true,
  },
  ready: {
    // Dark brown-gold ink on a pale gold tint. This is the pairing the brief
    // singles out: the saturated brand yellow is a background and an edge
    // colour only, never a text colour, and never a fill behind white.
    label: "Ready",
    tint: "#FFF3CC",
    ink: "#6B4E00",
    edge: "#D4A500",
    inStack: true,
  },
  noShow: {
    label: "No-show",
    tint: "#FFE5EC",
    ink: "#A32F44",
    edge: "#C93D63",
    inStack: false,
  },
  cancelled: {
    label: "Cancelled",
    tint: "#FFE5EC",
    ink: "#A32F44",
    edge: "#C93D63",
    inStack: false,
  },
  collected: {
    label: "Collected",
    tint: "#F1F5F9",
    ink: "#40506B",
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
    case BOOKING_STATUS.CHECKED_IN:
      return { key: "checkedIn", ...TONES.checkedIn };
    case BOOKING_STATUS.IN_BATH:
      return { key: "inBath", ...TONES.inBath };
    case BOOKING_STATUS.READY_FOR_PICKUP:
      return { key: "ready", ...TONES.ready };
    case BOOKING_STATUS.COMPLETED:
      return { key: "collected", ...TONES.collected };
    case BOOKING_STATUS.CANCELLED:
      return isNoShowReason(cancelReason)
        ? { key: "noShow", ...TONES.noShow }
        : { key: "cancelled", ...TONES.cancelled };
    default:
      return {
        key: "unknown",
        label: (status || "Unknown").trim() || "Unknown",
        tint: "#F1F5F9",
        ink: "#40506B",
        edge: "#94A3B8",
        inStack: false,
      };
  }
}

const SIZES = {
  sm: "text-[11px] px-2 py-0.5",
  md: "text-[12px] px-2.5 py-1",
} as const;

export interface BookingStatusBadgeProps {
  status: string | null | undefined;
  /** Needed only to tell a no-show apart from an ordinary cancellation. */
  cancelReason?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}

/**
 * The status, as a word, on its tint. Decorative in the accessibility tree:
 * the badge repeats a fact the card's accessible name already states in full,
 * so announcing it twice would just slow a screen-reader user down.
 */
export function BookingStatusBadge({
  status,
  cancelReason = null,
  size = "sm",
  className = "",
}: BookingStatusBadgeProps) {
  const tone = resolveDayStatus(status, cancelReason);
  return (
    <span
      aria-hidden="true"
      data-status-key={tone.key}
      className={`inline-flex items-center rounded-full font-bold leading-none whitespace-nowrap ${SIZES[size]} ${className}`}
      style={{ backgroundColor: tone.tint, color: tone.ink }}
    >
      {tone.label}
    </span>
  );
}
