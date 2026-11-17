import { STATUS_TONES, type StatusToneKey } from "./statusPalette";
export const SALON_SLOTS = [
  "08:30", "09:00", "09:30", "10:00", "10:30",
  "11:00", "11:30", "12:00", "12:30", "13:00",
];

/** Maximum dogs that can be groomed in a single slot (the 2-2-1 rule = 5 seats). */
export const MAX_DOGS_PER_SLOT = 5;

/** Maximum dogs the salon will groom in one day (a throughput cap, separate
 *  from per-slot seats). Mirrored in supabase/functions/_shared/salonConstants.ts
 *  (Deno) and in salon_config.daily_dog_cap (DB, authoritative). Change all
 *  three together — the capacityParity test guards the TS pair. */
export const DAILY_DOG_CAP = 14;

/** How close to a slot's start a customer can still make a same-day
 *  ("last minute") booking, in minutes. Mirrored in
 *  supabase/functions/_shared/salonConstants.ts (Deno) and hard-enforced in
 *  the DB (validate_booking_calendar + the availability RPCs, migration
 *  20260702130000) — this constant only gates the staff-calendar toggle.
 *  Change all three together; the capacityParity test guards the TS pair. */
export const IMMEDIATE_CUTOFF_MINUTES = 30;

/** Grace period (in minutes) after a slot's start before a still-"Booked" dog
 *  is surfaced as a late arrival on the Today view. Operational nudge only —
 *  the booking data is never mutated. One-line configurable. */
export const LATE_ARRIVAL_GRACE_MINUTES = 5;

export const SERVICES = [
  { id: "full-groom", name: "Full Groom" },
  { id: "bath-and-brush", name: "Bath & Brush" },
  { id: "bath-and-deshed", name: "Bath & De-shed" },
  { id: "puppy-groom", name: "Puppy Groom" },
];

export const ALL_DAYS = [
  { key: "mon", label: "Mon", full: "Monday", defaultOpen: true },
  { key: "tue", label: "Tue", full: "Tuesday", defaultOpen: true },
  { key: "wed", label: "Wed", full: "Wednesday", defaultOpen: true },
  { key: "thu", label: "Thu", full: "Thursday", defaultOpen: false },
  { key: "fri", label: "Fri", full: "Friday", defaultOpen: false },
  { key: "sat", label: "Sat", full: "Saturday", defaultOpen: false },
  { key: "sun", label: "Sun", full: "Sunday", defaultOpen: false },
];

// Large dog slot rules:
// - 08:30, 09:00: Start-of-day exception — large dog takes 1 seat, can share with small/medium
// - 12:00: Can share with small/medium (1 seat), BUT triggers early close on 13:00
// - 12:30, 13:00: Full takeover — large dog fills both seats, no sharing
// - Back-to-back large dogs (2-seat each) only permitted at 12:30 + 13:00
export const LARGE_DOG_SLOTS = {
  "08:30": { seats: 1, canShare: true, needsApproval: false },
  "09:00": { seats: 1, canShare: true, needsApproval: false, conditional: true },
  "12:00": { seats: 1, canShare: true, needsApproval: false },
  "12:30": { seats: 2, canShare: false, needsApproval: false },
  "13:00": { seats: 2, canShare: false, needsApproval: false },
};

// Fallback guide prices in INTEGER PENCE (null = service not offered for
// that size). This is the LAST resort in the price precedence \u2014 a booking's
// price_override, then the dog's custom_price, then salon_config.pricing
// (Settings) all beat it. See resolveServicePricePence in engine/bookingRules.
// Display via getServicePriceLabel / formatGBP \u2014 never build "\u00A3\u2026" by hand.
export const PRICING = {
  "full-groom": { small: 4200, medium: 4600, large: 6000 },
  "bath-and-brush": { small: 3800, medium: 4200, large: 5500 },
  "bath-and-deshed": { small: 3800, medium: 4200, large: 5500 },
  "puppy-groom": { small: 3800, medium: 3800, large: null },
} as const;

// Services quoted as "from \u00A3X" (rendered with a trailing "+"): the final
// price depends on coat condition. Puppy groom is a fixed price.
export const FROM_PRICED_SERVICES = new Set([
  "full-groom",
  "bath-and-brush",
  "bath-and-deshed",
]);

// Canonical dog-size identifiers. The DogSize type in types/index.ts is
// derived from this tuple so the runtime set and the compile-time set
// can't drift.
export const DOG_SIZES = ["small", "medium", "large"] as const;
export type DogSize = (typeof DOG_SIZES)[number];

// Named accessors for the size strings; use these for comparisons and
// writes so the literal "large" doesn't leak into engine code.
export const DOG_SIZE = {
  SMALL: "small",
  MEDIUM: "medium",
  LARGE: "large",
} as const satisfies Record<string, DogSize>;

/** Recorded payment methods for a settled (Paid in Full) booking — the picker
 *  staff choose from at mark-paid (improvement #3). */
export const PAYMENT_METHODS = [
  { id: "cash", label: "Cash" },
  { id: "card", label: "Card" },
  { id: "bank_transfer", label: "Bank transfer" },
] as const;

export function paymentMethodLabel(id: string | null | undefined): string {
  return PAYMENT_METHODS.find((m) => m.id === id)?.label || "";
}

/**
 * Flat deposit held per dog, in pence, for owners flagged `deposit_required`.
 *
 * This is the ONLY place the figure lives on the client. `salon_config.settings`
 * carries `depositBank` and `depositReleaseHours` but no amount, and production
 * `bookings.deposit_amount` is null on every existing deposit row — so this
 * constant is what customers are actually told, both before they commit and on
 * the success screen. It is **per dog**: a two-dog visit holds twice this.
 */
export const DEPOSIT_PER_DOG_PENCE = 1000;

/** Deposit held for a whole visit, in pence. Flat per dog, any size or service. */
export function depositForDogsPence(dogCount: number): number {
  return Math.max(0, Math.trunc(dogCount)) * DEPOSIT_PER_DOG_PENCE;
}

export const AVAILABLE_ADDONS = ["Flea Bath", "Sensitive Shampoo", "Anal Glands"] as const;

export const ADDON_PRICES: Record<string, number> = {
  "Flea Bath": 10,
};

export function getAddonPrice(addon: string): number {
  return ADDON_PRICES[addon] || 0;
}

export function getAddonsTotal(addons: string[] | null | undefined): number {
  if (!addons?.length) return 0;
  return addons.reduce((sum, addon) => sum + getAddonPrice(addon), 0);
}

// ── Booking lifecycle ────────────────────────────────────────────────
//
// The seven canonical statuses. Everything that compares, writes, ranks,
// filters or colours a booking status derives from THIS block; nothing else
// in the codebase should contain a status string literal.
//
// The normal progression:
//   Booked → Reconfirmed → Arrived → Ready for collection → Completed
// with two terminal exits, Cancelled and No-show, reachable from any active
// status. Staff are not trapped by the progression — the detail modal still
// allows arbitrary corrections — but the UI makes the normal path obvious.
export const BOOKING_STATUS = {
  BOOKED: "Booked",
  RECONFIRMED: "Reconfirmed",
  ARRIVED: "Arrived",
  READY_FOR_COLLECTION: "Ready for collection",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_SHOW: "No-show",
} as const;

export type BookingStatus = (typeof BOOKING_STATUS)[keyof typeof BOOKING_STATUS];

/** Every canonical value, in lifecycle order. Mirrors the DB CHECK constraint. */
export const ALL_BOOKING_STATUSES: readonly BookingStatus[] = Object.freeze([
  BOOKING_STATUS.BOOKED,
  BOOKING_STATUS.RECONFIRMED,
  BOOKING_STATUS.ARRIVED,
  BOOKING_STATUS.READY_FOR_COLLECTION,
  BOOKING_STATUS.COMPLETED,
  BOOKING_STATUS.CANCELLED,
  BOOKING_STATUS.NO_SHOW,
]);

/**
 * Position along the linear progression. Terminal statuses have no position:
 * they are exits, not steps, and ranking them would imply Cancelled is
 * "further along" than Arrived.
 *
 * Mirrored exactly by `set_booking_lifecycle_timestamps()` in the database
 * (migration 20260919090000). If the two ever disagree, the trigger wins —
 * this is an offline mirror, not a second authority.
 */
export const STATUS_RANK: Readonly<Record<string, number>> = Object.freeze({
  [BOOKING_STATUS.BOOKED]: 0,
  [BOOKING_STATUS.RECONFIRMED]: 1,
  [BOOKING_STATUS.ARRIVED]: 2,
  [BOOKING_STATUS.READY_FOR_COLLECTION]: 3,
  [BOOKING_STATUS.COMPLETED]: 4,
});

/** The rank at or beyond which a dog has arrived. */
export const RANK_ARRIVED = STATUS_RANK[BOOKING_STATUS.ARRIVED];
/** The rank at or beyond which a dog is ready to go home. */
export const RANK_READY = STATUS_RANK[BOOKING_STATUS.READY_FOR_COLLECTION];
/** The terminal rank of a successful visit. */
export const RANK_COMPLETED = STATUS_RANK[BOOKING_STATUS.COMPLETED];

/**
 * The two ways a booking ends without being completed.
 *
 * CRITICAL: both are NON-OCCUPYING. A no-show frees its seat exactly as a
 * cancellation does, which is how the salon has always behaved — before
 * No-show became a status of its own it WAS a Cancelled row, so every
 * capacity, occupancy and uniqueness rule already treated it as free. Any
 * predicate that used to read `status !== 'Cancelled'` must now use
 * `isActiveBooking`, or no-shows will silently start consuming capacity and
 * block real bookings.
 */
export const TERMINAL_STATUSES: readonly BookingStatus[] = Object.freeze([
  BOOKING_STATUS.CANCELLED,
  BOOKING_STATUS.NO_SHOW,
]);

/** True when a booking did not end early — i.e. it still occupies its seat. */
export function isActiveBooking(status: string | null | undefined): boolean {
  return !TERMINAL_STATUSES.includes(status as BookingStatus);
}

/**
 * PostgREST `or` filter that keeps a NULL status and excludes `excluded`.
 *
 * Call `.or(keepingNullStatusOr(excluded))`. SQL `NOT IN` and `<>` are not
 * true for NULL, so `.not("status", "in", ...)` and `.neq("status", ...)`
 * drop a booking whose status was never set. `booking_occupies_seat()` treats
 * that NULL as Booked. Quoted values stop a comma in the list from splitting
 * the or-clause. The Deno copy in `_shared/salonConstants.ts` must match.
 */
export function keepingNullStatusOr(excluded: readonly string[]): string {
  const list = excluded.map((status) => `"${status}"`).join(",");
  return `status.is.null,status.not.in.(${list})`;
}

/**
 * PostgREST `or` filter for rows that still occupy a seat.
 *
 * Call `.or(occupyingStatusOr())`. A missing status counts: `booking_occupies_seat()`
 * treats NULL as Booked. `.not("status", "in", ...)` drops those rows, because
 * SQL `NOT IN` is not true for NULL.
 */
export function occupyingStatusOr(): string {
  return keepingNullStatusOr(TERMINAL_STATUSES);
}

/**
 * PostgREST `or` filter for status Booked, plus a NULL status.
 *
 * Call `.or(bookedOrNullStatusOr())` where the query currently matches only
 * Booked. NULL is treated as Booked. Every other status stays out — a not-in
 * of the known non-Booked statuses would start matching a status added later.
 */
export function bookedOrNullStatusOr(): string {
  return `status.eq."${BOOKING_STATUS.BOOKED}",status.is.null`;
}

/** True for the two ended-early states. The inverse of `isActiveBooking`. */
export function isTerminalStatus(status: string | null | undefined): boolean {
  return TERMINAL_STATUSES.includes(status as BookingStatus);
}

/**
 * The statuses the Today stack shows: work still in front of you.
 *
 * Completed dogs move to the collected summary; Cancelled and No-show leave
 * the day entirely rather than cluttering the list with things nobody can act
 * on.
 */
export const ACTIVE_STACK_STATUSES: readonly BookingStatus[] = Object.freeze([
  BOOKING_STATUS.BOOKED,
  BOOKING_STATUS.RECONFIRMED,
  BOOKING_STATUS.ARRIVED,
  BOOKING_STATUS.READY_FOR_COLLECTION,
]);

/** True when this booking belongs in the active time-ordered stack. */
export function isStackVisibleStatus(status: string | null | undefined): boolean {
  return ACTIVE_STACK_STATUSES.includes(status as BookingStatus);
}

/**
 * The next step along the normal progression, or null at the end of it.
 * Terminal statuses have no next step.
 */
export function nextStatus(status: string | null | undefined): BookingStatus | null {
  const rank = STATUS_RANK[status as BookingStatus];
  if (rank == null) return null;
  const next = ALL_BOOKING_STATUSES.find((s) => STATUS_RANK[s] === rank + 1);
  return next ?? null;
}

// ── No-show ──────────────────────────────────────────────────────────
//
// A no-show is now a first-class status. It used to be a Cancelled row
// carrying cancel_reason = 'No-show', and migration 20260919090000 converted
// those rows. The reason text is PRESERVED on migrated rows as history, but
// nothing reads it to decide whether a booking was a no-show any more — use
// `status === BOOKING_STATUS.NO_SHOW`.
//
// NO_SHOW_REASON is kept because staff still write a free-text cancel_reason
// and "No-show" remains a sensible default label for the action.
export const NO_SHOW_REASON = "No-show";
export const NO_SHOW_REASON_NORMALISED = "no-show";

/**
 * True if `cancelReason` records a no-show in the PRE-MIGRATION shape.
 *
 * @deprecated Migration-compatibility only. Live business logic must test
 * `status === BOOKING_STATUS.NO_SHOW`. Kept so that any row written before
 * 20260919090000 that escaped conversion still reads sensibly, and so the
 * migration's own test can assert the old shape.
 */
export function isNoShowReason(cancelReason: string | null | undefined): boolean {
  return (cancelReason || "").trim().toLowerCase() === NO_SHOW_REASON_NORMALISED;
}

// The inline segmented control walks staff through the progression in order;
// the detail modal still allows arbitrary jumps for corrections. The two
// terminal statuses never appear in the inline progression — they are reached
// deliberately, not stepped into.
/** The status stepper's progression, in order. Colours come from STATUS_DISPLAY. */
export const BOOKING_STATUSES = [
  { id: BOOKING_STATUS.BOOKED, label: "Booked" },
  { id: BOOKING_STATUS.RECONFIRMED, label: "Reconfirmed" },
  { id: BOOKING_STATUS.ARRIVED, label: "Arrived" },
  { id: BOOKING_STATUS.READY_FOR_COLLECTION, label: "Ready" },
  { id: BOOKING_STATUS.COMPLETED, label: "Completed" },
];

export interface StatusDisplay {
  /** Pale fill — the card pill background and the soft modal-header tint. */
  bg: string;
  /** Readable text on `bg`. */
  color: string;
  /** Saturated mid-tone — accent bars and pill borders. Never a text colour. */
  border: string;
  /** Fill for a selected or primary control: the status ink. */
  solid: string;
  /** Readable text on `solid`: the status tint. Same pair as color/bg, so the same contrast. */
  onSolid: string;
  /** Short UI label: the stored status, as the booking screens name it. */
  label: string;
}

function statusDisplay(key: StatusToneKey, label: string): StatusDisplay {
  const tone = STATUS_TONES[key];
  return { bg: tone.tint, color: tone.ink, border: tone.edge, solid: tone.ink, onSolid: tone.tint, label };
}

/**
 * The booking screens' view of the one status palette (constants/statusPalette.ts).
 * Used by the calendar's booking card, the booking detail modal's header,
 * accent bar and status stepper, and the Needs attention page — the same
 * colours the /today day stack shows, so a booking is one colour everywhere.
 *
 * The labels name the stored status ("Booked", "Completed"), because these
 * screens set it. /today speaks of the day instead ("Expected", "Collected")
 * and layers the confirmation state on a Booked dog; the colours underneath
 * are the same tones.
 */
export const STATUS_DISPLAY: Record<string, StatusDisplay> = {
  [BOOKING_STATUS.BOOKED]: statusDisplay("expected", "Booked"),
  [BOOKING_STATUS.RECONFIRMED]: statusDisplay("reconfirmed", "Reconfirmed"),
  [BOOKING_STATUS.ARRIVED]: statusDisplay("arrived", "Arrived"),
  [BOOKING_STATUS.READY_FOR_COLLECTION]: statusDisplay("ready", "Ready"),
  [BOOKING_STATUS.COMPLETED]: statusDisplay("collected", "Completed"),
  [BOOKING_STATUS.CANCELLED]: statusDisplay("cancelled", "Cancelled"),
  [BOOKING_STATUS.NO_SHOW]: statusDisplay("noShow", "No-show"),
};

export function getStatusDisplay(statusId: string): StatusDisplay {
  return STATUS_DISPLAY[statusId] || STATUS_DISPLAY["Booked"];
}

export const ALERT_OPTIONS = [
  { label: "Bites / Nips", color: "var(--color-brand-coral)", tone: "behaviour" },
  { label: "Reactive to dogs", color: "var(--color-brand-coral)", tone: "behaviour" },
  { label: "Kennel aggressive", color: "var(--color-brand-coral)", tone: "behaviour" },
  { label: "Nervous / Anxious", color: "#D97706", tone: "caution" },
  { label: "Fear of dryer", color: "#D97706", tone: "caution" },
  { label: "Sensitive paws", color: "#D97706", tone: "caution" },
  { label: "Senior (Needs breaks)", color: "#0099BD", tone: "information" },
];
