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

export const PRICING = {
  "full-groom": { small: "\u00A342+", medium: "\u00A346+", large: "\u00A360+" },
  "bath-and-brush": { small: "\u00A338+", medium: "\u00A342+", large: "\u00A355+" },
  "bath-and-deshed": { small: "\u00A338+", medium: "\u00A342+", large: "\u00A355+" },
  "puppy-groom": { small: "\u00A338", medium: "\u00A338", large: "N/A" },
};

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

// Canonical status IDs. Importers compare and assign against these
// constants rather than bare string literals, so the set is grep-
// friendly and (in TS) compile-checked.
export const BOOKING_STATUS = {
  BOOKED: "Booked",
  CHECKED_IN: "Checked in",
  IN_BATH: "In bath",
  READY_FOR_PICKUP: "Ready for pick-up",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
} as const;

export type BookingStatus = (typeof BOOKING_STATUS)[keyof typeof BOOKING_STATUS];

// The five-step status progression for a booking. The card's
// inline segmented control walks staff through these in order; the
// detail modal still allows arbitrary jumps for edge cases.
//   Booked → Checked in → In bath → Ready for pick-up → Completed
// "Cancelled" is a terminal status reached via the detail modal —
// it never appears in the inline progression.
export const BOOKING_STATUSES = [
  { id: BOOKING_STATUS.BOOKED, label: "Booked", color: "#475569", bg: "#F1F5F9" },
  { id: BOOKING_STATUS.CHECKED_IN, label: "Checked in", color: "#16A34A", bg: "#DCFCE7" },
  { id: BOOKING_STATUS.IN_BATH, label: "In bath", color: "#0E7490", bg: "#CFFAFE" },
  { id: BOOKING_STATUS.READY_FOR_PICKUP, label: "Ready", color: "#7C3AED", bg: "#EDE9FE" },
  { id: BOOKING_STATUS.COMPLETED, label: "Completed", color: "var(--color-brand-purple)", bg: "#E2D9F0" },
];

export interface StatusDisplay {
  /** Pale fill — the card pill background and the soft modal-header tint. */
  bg: string;
  /** Readable text on `bg`. */
  color: string;
  /** Saturated mid-tone — the accent bar and the solid primary button fill. */
  border: string;
  /** Readable text on a `border`-filled button. */
  onAccent: string;
  /** Short UI label. */
  label: string;
}

/**
 * Status palette — the single source of truth for the colour each booking
 * status shows in the UI. Used by the dashboard card pill (BookingCardNew)
 * AND the detail modal's header accent bar, active stepper step and primary
 * button, so the card and its pop-up can never drift apart. Mustard for
 * "still to come", teal/cyan for "in the salon now", emerald for "ready to
 * collect", slate for "all done" (fades out of the day), coral for cancelled.
 */
export const STATUS_DISPLAY: Record<string, StatusDisplay> = {
  "Booked":            { bg: "#FFF6CC", color: "var(--color-brand-purple)",    border: "var(--color-brand-yellow)", onAccent: "var(--color-brand-purple)", label: "Booked" },
  "Checked in":        { bg: "#E0F0EC", color: "var(--color-brand-teal-dark)", border: "#2A6F6B",                   onAccent: "#FFFFFF",                   label: "Checked in" },
  "In bath":           { bg: "#CFFAFE", color: "#0E7490",                      border: "#22D3EE",                   onAccent: "var(--color-brand-purple)", label: "In bath" },
  "Ready for pick-up": { bg: "#D1FAE5", color: "#047857",                      border: "#10B981",                   onAccent: "#FFFFFF",                   label: "Ready" },
  "Completed":         { bg: "#F1F5F9", color: "#475569",                      border: "#94A3B8",                   onAccent: "#FFFFFF",                   label: "Completed" },
  "Cancelled":         { bg: "#FFE5EC", color: "var(--color-brand-coral-dark)", border: "var(--color-brand-coral)", onAccent: "#FFFFFF",                   label: "Cancelled" },
};

export function getStatusDisplay(statusId: string): StatusDisplay {
  return STATUS_DISPLAY[statusId] || STATUS_DISPLAY["Booked"];
}

export const ALERT_OPTIONS = [
  { label: "Bites / Nips", color: "var(--color-brand-coral)" },
  { label: "Reactive to dogs", color: "var(--color-brand-coral)" },
  { label: "Kennel aggressive", color: "var(--color-brand-coral)" },
  { label: "Nervous / Anxious", color: "#D97706" },
  { label: "Fear of dryer", color: "#D97706" },
  { label: "Sensitive paws", color: "#D97706" },
  { label: "Senior (Needs breaks)", color: "#0099BD" },
];
