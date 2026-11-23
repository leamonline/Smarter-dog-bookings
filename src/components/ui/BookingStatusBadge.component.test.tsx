import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { BookingStatusBadge, resolveDayStatus, type DayStatusKey } from "./BookingStatusBadge";
import {
  BOOKING_STATUS,
  BOOKING_STATUSES,
  NO_SHOW_REASON,
  STATUS_DISPLAY,
  STATUS_TONES,
} from "../../constants/index";

// ---- Contrast -----------------------------------------------------------------
//
// The palette's central promise is "dark ink on light tints, never white on the
// gold". That is checkable, so it is checked rather than trusted: every tone's
// ink/tint pair is measured against the WCAG AA threshold for normal text. A
// future colour tweak that looks fine on a designer's monitor but fails on a
// salon till fails here first.

function channel(component: number): number {
  const c = component / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const [light, dark] = a > b ? [a, b] : [b, a];
  return (light + 0.05) / (dark + 0.05);
}

const EVERY_STATUS = [
  BOOKING_STATUS.BOOKED,
  BOOKING_STATUS.ARRIVED,
  BOOKING_STATUS.ARRIVED,
  BOOKING_STATUS.READY_FOR_COLLECTION,
  BOOKING_STATUS.COMPLETED,
  BOOKING_STATUS.CANCELLED,
];

describe("resolveDayStatus", () => {
  it.each([
    [BOOKING_STATUS.BOOKED, "expected", "Expected", true],
    [BOOKING_STATUS.RECONFIRMED, "reconfirmed", "Reconfirmed", true],
    [BOOKING_STATUS.ARRIVED, "arrived", "Arrived", true],
    [BOOKING_STATUS.READY_FOR_COLLECTION, "ready", "Ready", true],
    [BOOKING_STATUS.COMPLETED, "collected", "Collected", false],
    [BOOKING_STATUS.NO_SHOW, "noShow", "No-show", false],
    [BOOKING_STATUS.CANCELLED, "cancelled", "Cancelled", false],
  ] as Array<[string, DayStatusKey, string, boolean]>)(
    "%s maps to %s",
    (status, key, label, inStack) => {
      const tone = resolveDayStatus(status);
      expect(tone.key).toBe(key);
      expect(tone.label).toBe(label);
      expect(tone.inStack).toBe(inStack);
    },
  );

  it("splits a no-show out of an ordinary cancellation by its reason", () => {
    expect(resolveDayStatus(BOOKING_STATUS.CANCELLED, NO_SHOW_REASON).key).toBe("noShow");
    expect(resolveDayStatus(BOOKING_STATUS.CANCELLED, NO_SHOW_REASON).label).toBe("No-show");
    expect(resolveDayStatus(BOOKING_STATUS.CANCELLED, "Rescheduled via WhatsApp").key)
      .toBe("cancelled");
    expect(resolveDayStatus(BOOKING_STATUS.CANCELLED, null).key).toBe("cancelled");
  });

  it("matches a no-show reason regardless of case and padding", () => {
    expect(resolveDayStatus(BOOKING_STATUS.CANCELLED, "  no-show  ").key).toBe("noShow");
  });

  it("keeps an unrecognised status visible rather than guessing at it", () => {
    const tone = resolveDayStatus("Awaiting deposit");
    expect(tone.key).toBe("unknown");
    expect(tone.label).toBe("Unknown: Awaiting deposit");
    expect(tone.tint).not.toBe(resolveDayStatus(BOOKING_STATUS.COMPLETED).tint);
    expect(contrastRatio(tone.ink, tone.tint)).toBeGreaterThanOrEqual(4.5);
    expect(tone.inStack).toBe(false);
  });

  it("never leaves a null status unlabelled", () => {
    expect(resolveDayStatus(null).label).toBe("Unknown: Not set");
    expect(resolveDayStatus("   ").label).toBe("Unknown: Not set");
  });

  it("only keeps the four live states in the stack", () => {
    const inStack = EVERY_STATUS.filter((status) => resolveDayStatus(status).inStack);
    expect(inStack).toEqual([
      BOOKING_STATUS.BOOKED,
      BOOKING_STATUS.ARRIVED,
      BOOKING_STATUS.ARRIVED,
      BOOKING_STATUS.READY_FOR_COLLECTION,
    ]);
  });
});

// The flyer visual language (22 November 2026, decision 6) is the reference for
// these. Pinning them means a later "tidy-up" that drifts a status back towards
// the brand blue or the action yellow fails here rather than on a till.
describe("palette matches the approved flyer palette", () => {
  it.each([
    ["expected", BOOKING_STATUS.BOOKED, null, "#F1E9DC", "#B8A68A"],
    ["reconfirmed", BOOKING_STATUS.RECONFIRMED, null, "#E4E4FB", "#7C80DC"],
    ["arrived", BOOKING_STATUS.ARRIVED, null, "#D5EFE5", "#2E9D78"],
    ["ready", BOOKING_STATUS.READY_FOR_COLLECTION, null, "#FCEAB0", "#D49A00"],
    ["no-show (status)", BOOKING_STATUS.NO_SHOW, null, "#F7D9D2", "#C4442D"],
    // The pre-migration shape still resolves to the no-show tone, so a row
    // that escaped conversion is not mislabelled a plain cancellation.
    ["no-show (legacy shape)", BOOKING_STATUS.CANCELLED, NO_SHOW_REASON, "#F7D9D2", "#C4442D"],
  ] as Array<[string, string, string | null, string, string]>)(
    "%s",
    (_name, status, reason, tint, edge) => {
      const tone = resolveDayStatus(status, reason);
      expect(tone.tint).toBe(tint);
      expect(tone.edge).toBe(edge);
    },
  );

  it("keeps Confirmed off the brand blue that marks a selected item", () => {
    const { tint, edge } = resolveDayStatus(BOOKING_STATUS.RECONFIRMED);
    for (const brandBlue of ["#2A62A8", "#5595DC", "#1F4E8C", "#EAF4FF"]) {
      expect(tint).not.toBe(brandBlue);
      expect(edge).not.toBe(brandBlue);
    }
  });

  it("gives Expected a neutral ink, not a blue one — it is the resting state", () => {
    const { ink } = resolveDayStatus(BOOKING_STATUS.BOOKED);
    const r = parseInt(ink.slice(1, 3), 16);
    const b = parseInt(ink.slice(5, 7), 16);
    // A blue ink would put blue well ahead of red. Near-neutral keeps them close.
    expect(b - r).toBeLessThanOrEqual(24);
  });
});

describe("palette contrast", () => {
  it.each(EVERY_STATUS)("%s ink clears WCAG AA on its own tint", (status) => {
    const tone = resolveDayStatus(status, NO_SHOW_REASON);
    expect(contrastRatio(tone.ink, tone.tint)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(EVERY_STATUS)("%s secondary ink clears WCAG AA on its own tint", (status) => {
    const tone = resolveDayStatus(status, NO_SHOW_REASON);
    expect(contrastRatio(tone.meta, tone.tint)).toBeGreaterThanOrEqual(4.5);
  });

  it("renders no white ink anywhere, on the gold least of all", () => {
    for (const status of EVERY_STATUS) {
      const tone = resolveDayStatus(status);
      expect(tone.ink.toUpperCase()).not.toBe("#FFFFFF");
      // Dark ink means the ink is always the darker half of the pair.
      expect(relativeLuminance(tone.ink)).toBeLessThan(relativeLuminance(tone.tint));
    }
  });
});

describe("BookingStatusBadge", () => {
  it("always renders the status as a word, not colour alone", () => {
    render(<BookingStatusBadge status={BOOKING_STATUS.READY_FOR_COLLECTION} />);
    expect(screen.getByText("Ready")).toBeTruthy();
  });

  it("is decorative — the card's accessible name already states the status", () => {
    const { container } = render(<BookingStatusBadge status={BOOKING_STATUS.ARRIVED} />);
    expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
  });

  it("carries its tone key for styling hooks and tests", () => {
    const { container } = render(
      <BookingStatusBadge status={BOOKING_STATUS.CANCELLED} cancelReason={NO_SHOW_REASON} />,
    );
    expect(container.firstElementChild?.getAttribute("data-status-key")).toBe("noShow");
  });
});

// ---- Confirmation states (the wallet stack, November 2026) -------------------
//
// A Booked dog reads as one of three things. "Unconfirmed" is the one that
// needs chasing, and staff asked for it to read as needing attention, not as
// grey or disabled: so it has its own hue, an inverted pill, and it must stay
// visibly apart from Ready's gold and No-show's red, which share the list.

describe("a Booked dog's confirmation state", () => {
  it.each([
    [null, "expected", "Expected"],
    ["unconfirmed", "unconfirmed", "Unconfirmed"],
    ["confirmed", "confirmed", "Confirmed"],
  ] as const)("%s reads as %s", (confirmation, key, label) => {
    const tone = resolveDayStatus(BOOKING_STATUS.BOOKED, null, confirmation);
    expect(tone.key).toBe(key);
    expect(tone.label).toBe(label);
    expect(tone.inStack).toBe(true);
  });

  it("changes nothing past Booked — the status already says it", () => {
    for (const status of [BOOKING_STATUS.RECONFIRMED, BOOKING_STATUS.ARRIVED, BOOKING_STATUS.READY_FOR_COLLECTION]) {
      expect(resolveDayStatus(status, null, "unconfirmed").key).toBe(resolveDayStatus(status).key);
    }
  });

  it("marks only Unconfirmed as needing attention", () => {
    const flagged = [
      resolveDayStatus(BOOKING_STATUS.BOOKED, null, "unconfirmed"),
      resolveDayStatus(BOOKING_STATUS.BOOKED, null, "confirmed"),
      ...EVERY_STATUS.map((status) => resolveDayStatus(status, NO_SHOW_REASON)),
    ].filter((tone) => tone.needsAttention).map((tone) => tone.key);
    expect(flagged).toEqual(["unconfirmed"]);
  });

  it("is not grey: Unconfirmed is a different hue from Expected, Ready and No-show", () => {
    const unconfirmed = resolveDayStatus(BOOKING_STATUS.BOOKED, null, "unconfirmed");
    for (const other of [
      resolveDayStatus(BOOKING_STATUS.BOOKED),
      resolveDayStatus(BOOKING_STATUS.READY_FOR_COLLECTION),
      resolveDayStatus(BOOKING_STATUS.NO_SHOW),
    ]) {
      expect(unconfirmed.tint).not.toBe(other.tint);
      expect(unconfirmed.edge).not.toBe(other.edge);
    }
    // A grey has its three channels close together; this one does not.
    const tint = unconfirmed.tint;
    const [r, , b] = [1, 3, 5].map((i) => parseInt(tint.slice(i, i + 2), 16));
    expect(r - b).toBeGreaterThan(48);
  });
});

describe("every day-stack pairing clears WCAG AA", () => {
  const TONES_IN_USE = [
    resolveDayStatus(BOOKING_STATUS.BOOKED),
    resolveDayStatus(BOOKING_STATUS.BOOKED, null, "unconfirmed"),
    resolveDayStatus(BOOKING_STATUS.BOOKED, null, "confirmed"),
    ...EVERY_STATUS.map((status) => resolveDayStatus(status, NO_SHOW_REASON)),
    resolveDayStatus(BOOKING_STATUS.RECONFIRMED),
    resolveDayStatus(BOOKING_STATUS.NO_SHOW),
  ];

  it.each(TONES_IN_USE.map((tone) => [tone.key, tone] as const))("%s: ink and secondary ink on the tint", (_key, tone) => {
    expect(contrastRatio(tone.ink, tone.tint)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(tone.meta, tone.tint)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(TONES_IN_USE.map((tone) => [tone.key, tone] as const))("%s: the strip's pill", (_key, tone) => {
    // A calm pill is ink on white; an inverted one is tint on ink.
    const [text, fill] = tone.needsAttention ? [tone.tint, tone.ink] : [tone.ink, "#FFFFFF"];
    expect(contrastRatio(text, fill)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(TONES_IN_USE.map((tone) => [tone.key, tone] as const))("%s: the left rule stays visible against the tint", (_key, tone) => {
    // The rule is a second cue, not the signal (the word is), so WCAG 1.4.11's
    // 3:1 does not bind it. This only guards that it never fades into the tint.
    expect(contrastRatio(tone.edge, tone.tint)).toBeGreaterThanOrEqual(1.8);
  });
});

describe("the strip's status pill", () => {
  it("inverts for a state that needs chasing", () => {
    const { container } = render(
      <BookingStatusBadge status={BOOKING_STATUS.BOOKED} confirmation="unconfirmed" variant="pill" />,
    );
    const pill = container.firstElementChild as HTMLElement;
    expect(pill.textContent).toBe("Unconfirmed");
    expect(pill.dataset.needsAttention).toBe("true");
    expect(pill.style.backgroundColor).not.toBe("");
  });

  it("stays a white pill edged in the status colour otherwise", () => {
    const { container } = render(<BookingStatusBadge status={BOOKING_STATUS.ARRIVED} variant="pill" />);
    const pill = container.firstElementChild as HTMLElement;
    expect(pill.className).toContain("bg-white");
    expect(pill.dataset.needsAttention).toBeUndefined();
  });
});

// ---- One palette everywhere (November 2026) ----------------------------------
//
// The calendar card, the booking detail modal and the Needs attention page read
// STATUS_DISPLAY; /today reads resolveDayStatus. They used to be two palettes
// (mustard Booked, green Ready on one; grey and gold on the other), so a booking
// changed colour between screens. Both now come from constants/statusPalette.ts.
describe("the booking screens use the same palette as /today", () => {
  it.each(Object.values(BOOKING_STATUS))("%s is the same colours on every screen", (status) => {
    const display = STATUS_DISPLAY[status];
    const tone = resolveDayStatus(status);
    expect(display.bg).toBe(tone.tint);
    expect(display.color).toBe(tone.ink);
    expect(display.border).toBe(tone.edge);
  });

  it.each(Object.values(BOOKING_STATUS))("%s: text clears WCAG AA on the pill and on a selected control", (status) => {
    const display = STATUS_DISPLAY[status];
    expect(contrastRatio(display.color, display.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(display.onSolid, display.solid)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps no second set of status colours anywhere else", () => {
    for (const step of BOOKING_STATUSES) {
      expect(Object.keys(step).sort()).toEqual(["id", "label"]);
    }
    expect(Object.values(STATUS_TONES).map((tone) => tone.tint)).toContain(STATUS_DISPLAY[BOOKING_STATUS.BOOKED].bg);
  });
});
