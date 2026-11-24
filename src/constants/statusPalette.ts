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
  | "reminderFailed"
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
 * Status → tone. Re-tuned on 22 November 2026 to the flyer visual language
 * (docs/plans/active/2026-11-22-flyer-visual-language.md, decision 6): one hue
 * per status in the flyer's flatter, warmer print style, so the tones sit on
 * cream like the mascot circles. Every pairing was measured before the swap.
 *
 *   Expected     warm cream with neutral ink. The resting state recedes.
 *   Unconfirmed  coral-orange; its pill inverts so it reads as a job to chase.
 *   Confirmed    periwinkle, deliberately off the brand blue, which now marks
 *                a selected item: a confirmed booking must never read as
 *                "selected". Reconfirmed shares it; the word tells them apart.
 *   Arrived      a fresher teal-green, clear of the Large-dog navy.
 *   Ready        sunny gold, softer than the action yellow and never a control.
 *   No-show      brick red; Cancelled shares it.
 *   Collected    cool grey, so a finished day settles down.
 *
 * Light values only; the app has no dark mode.
 */
export const STATUS_TONES: Record<StatusToneKey, StatusTone> = {
  // Expected now means "nothing to wait for yet": no reminder is due, or
  // staff booked it with confirmation off. It should recede.
  expected: {
    label: "Expected",
    tint: "#F1E9DC",
    ink: "#3B3226",
    meta: "#5E5242",
    edge: "#B8A68A",
    inStack: true,
  },
  // Unconfirmed: we asked and have no answer, or the reminder never reached
  // the owner. It needs chasing, so it must not read as grey or disabled.
  // Apricot rather than gold or red: gold is Ready and red is No-show, and
  // both sit in the same list. The inverted pill carries the urgency; the
  // word carries the meaning.
  unconfirmed: {
    label: "Unconfirmed",
    tint: "#FFDDC9",
    ink: "#5C2408",
    meta: "#7A3410",
    edge: "#E0662B",
    inStack: true,
  },
  // Reminder failed: the reminder never reached the owner, so they have not
  // been told about the appointment. Same apricot as Unconfirmed, because the
  // action is the same (chase them), but the word says why (owner decision,
  // 24 November 2026).
  reminderFailed: {
    label: "Reminder failed",
    tint: "#FFDDC9",
    ink: "#5C2408",
    meta: "#7A3410",
    edge: "#E0662B",
    inStack: true,
  },
  // Confirmed: the owner answered the reminder. The same informational blue
  // as Reconfirmed, because it is the same news: they are coming.
  confirmed: {
    label: "Confirmed",
    tint: "#E4E4FB",
    ink: "#26266A",
    meta: "#3D3D8F",
    edge: "#7C80DC",
    inStack: true,
  },
  // Reconfirmed: informational blue. It is news, not activity — the dog is
  // still at home. Distinct from the neutral of an unconfirmed booking and
  // from the green of one that has actually walked through the door.
  reconfirmed: {
    label: "Reconfirmed",
    tint: "#E4E4FB",
    ink: "#26266A",
    meta: "#3D3D8F",
    edge: "#7C80DC",
    inStack: true,
  },
  // Arrived keeps the teal that "Arrived" had: the dog is here, and the
  // one in-salon state now covers the whole of its visit. The olive that used
  // to separate it from "In the bath" is retired with that status.
  arrived: {
    label: "Arrived",
    tint: "#D5EFE5",
    ink: "#0F3F2E",
    meta: "#1C5E46",
    edge: "#2E9D78",
    inStack: true,
  },
  ready: {
    // Dark brown-gold ink on a sunny gold tint. The gold is a background and an
    // edge colour only, never a text colour, and never a fill behind white.
    label: "Ready",
    tint: "#FCEAB0",
    ink: "#4A3500",
    meta: "#6B4D00",
    edge: "#D49A00",
    inStack: true,
  },
  noShow: {
    label: "No-show",
    tint: "#F7D9D2",
    ink: "#5C1A10",
    meta: "#80281A",
    edge: "#C4442D",
    inStack: false,
  },
  cancelled: {
    // An ordinary cancellation borrows the no-show family. It is the same
    // fact to the eye — this dog is not coming — and a sixth hue for it would
    // buy nothing the word does not already say.
    label: "Cancelled",
    tint: "#F7D9D2",
    ink: "#5C1A10",
    meta: "#80281A",
    edge: "#C4442D",
    inStack: false,
  },
  collected: {
    label: "Collected",
    tint: "#ECEDEF",
    ink: "#34383E",
    meta: "#575C63",
    edge: "#8E939A",
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
