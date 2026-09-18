import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { BookingStatusBadge, resolveDayStatus, type DayStatusKey } from "./BookingStatusBadge";
import { BOOKING_STATUS, NO_SHOW_REASON } from "../../constants/index";

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
  BOOKING_STATUS.CHECKED_IN,
  BOOKING_STATUS.IN_BATH,
  BOOKING_STATUS.READY_FOR_PICKUP,
  BOOKING_STATUS.COMPLETED,
  BOOKING_STATUS.CANCELLED,
];

describe("resolveDayStatus", () => {
  it.each([
    [BOOKING_STATUS.BOOKED, "expected", "Expected", true],
    [BOOKING_STATUS.CHECKED_IN, "checkedIn", "Checked in", true],
    [BOOKING_STATUS.IN_BATH, "inBath", "In the bath", true],
    [BOOKING_STATUS.READY_FOR_PICKUP, "ready", "Ready", true],
    [BOOKING_STATUS.COMPLETED, "collected", "Collected", false],
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
    expect(tone.label).toBe("Awaiting deposit");
    expect(tone.inStack).toBe(false);
  });

  it("never leaves a null status unlabelled", () => {
    expect(resolveDayStatus(null).label).toBe("Unknown");
    expect(resolveDayStatus("   ").label).toBe("Unknown");
  });

  it("only keeps the four live states in the stack", () => {
    const inStack = EVERY_STATUS.filter((status) => resolveDayStatus(status).inStack);
    expect(inStack).toEqual([
      BOOKING_STATUS.BOOKED,
      BOOKING_STATUS.CHECKED_IN,
      BOOKING_STATUS.IN_BATH,
      BOOKING_STATUS.READY_FOR_PICKUP,
    ]);
  });
});

// The prototype (salon-day-view.html) is the reference for these five. Pinning
// them means a later "tidy-up" that nudges the olive back towards mint, or the
// gold back towards yellow, fails here rather than on a till.
describe("palette matches the prototype", () => {
  it.each([
    ["expected", BOOKING_STATUS.BOOKED, null, "#E8ECF0", "#97A6B5"],
    ["checked in", BOOKING_STATUS.CHECKED_IN, null, "#D3EAE4", "#2E8B76"],
    ["in the bath", BOOKING_STATUS.IN_BATH, null, "#D9EAC6", "#5C9A33"],
    ["ready", BOOKING_STATUS.READY_FOR_PICKUP, null, "#F7E6BE", "#B8860B"],
    ["no-show", BOOKING_STATUS.CANCELLED, NO_SHOW_REASON, "#F2D9D9", "#B33A3A"],
  ] as Array<[string, string, string | null, string, string]>)(
    "%s",
    (_name, status, reason, tint, edge) => {
      const tone = resolveDayStatus(status, reason);
      expect(tone.tint).toBe(tint);
      expect(tone.edge).toBe(edge);
    },
  );

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
    render(<BookingStatusBadge status={BOOKING_STATUS.READY_FOR_PICKUP} />);
    expect(screen.getByText("Ready")).toBeTruthy();
  });

  it("is decorative — the card's accessible name already states the status", () => {
    const { container } = render(<BookingStatusBadge status={BOOKING_STATUS.IN_BATH} />);
    expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
  });

  it("carries its tone key for styling hooks and tests", () => {
    const { container } = render(
      <BookingStatusBadge status={BOOKING_STATUS.CANCELLED} cancelReason={NO_SHOW_REASON} />,
    );
    expect(container.firstElementChild?.getAttribute("data-status-key")).toBe("noShow");
  });
});
