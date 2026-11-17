// src/constants/statusPalette.ts
//
// THE booking-status palette. One set of colours for every surface that shows a
// booking's status: the /today day stack, the calendar's booking cards, the
// booking detail modal and the Needs attention page. Until November 2026 the
// calendar and the modal had their own palette (STATUS_DISPLAY: mustard
// Booked, green Ready), so the same booking was a different colour depending on
// which screen you looked at it on. Both now read this file.
//
// Pure data, no imports, so constants and components can both depend on it
// without a cycle. `BookingStatusBadge` (components/ui) resolves a booking to
// one of these tones; `STATUS_DISPLAY` (constants/salon.ts) adapts them for the
// older screens. Every ink/tint pair is checked against WCAG AA in
// BookingStatusBadge.component.test.tsx.

export type StatusToneKey =
  | "expected"
  | "unconfirmed"
  | "confirmed"
  | "reconfirmed"
  | "arrived"
  | "ready"
  | "noShow"
  | "cancelled"
  | "collected";

export interface StatusTone {
  /** The word shown to staff. Always rendered; never replaced by colour. */
  label: string;
  /** Pale surface fill — the badge background and the card's tint. */
  tint: string;
  /** Dark ink readable on `tint`. Every pairing clears WCAG AA. */
  ink: string;
  /** Secondary ink for the card's supporting lines (breed, service, timing). */
  meta: string;
  /** Saturated mid-tone for the card's left edge rule and accent bars. Never text. */
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
 *   Arrived      brand teal.
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
export const STATUS_TONES: Record<StatusToneKey, StatusTone> = {
  // Expected now means "nothing to wait for yet": no reminder is due, or
  // staff booked it with confirmation off. It should recede.
  expected: {
    label: "Expected",
    tint: "#E8ECF0",
    ink: "#2C353F",
    meta: "#4C5863",
    edge: "#97A6B5",
    inStack: true,
  },
  // Unconfirmed: we asked and have no answer, or the reminder never reached
  // the owner. It needs chasing, so it must not read as grey or disabled.
  // Apricot rather than gold or red: gold is Ready and red is No-show, and
  // both sit in the same list. The inverted pill carries the urgency; the
  // word carries the meaning.
  unconfirmed: {
    label: "Unconfirmed",
    tint: "#FFD9BF",
    ink: "#5A2100",
    meta: "#7A3000",
    edge: "#C2500A",
    inStack: true,
  },
  // Confirmed: the owner answered the reminder. The same informational blue
  // as Reconfirmed, because it is the same news: they are coming.
  confirmed: {
    label: "Confirmed",
    tint: "#DBEAFE",
    ink: "#12315E",
    meta: "#1D4A8F",
    edge: "#3B82F6",
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
  // Arrived keeps the teal that "Arrived" had: the dog is here, and the
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
 * A status nothing recognises. Shown with its raw string rather than guessed
 * at, in a tone unlike the quiet collected slate so it is noticed.
 */
export const UNKNOWN_STATUS_TONE: Omit<StatusTone, "label"> = {
  tint: "#FFF7DC",
  ink: "#5C4600",
  meta: "#5C4600",
  edge: "#835D00",
  inStack: false,
};
