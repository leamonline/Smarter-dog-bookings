import { describe, it, expect } from "vitest";
import { parseBookingHintsFromMessage } from "./parseBookingHintsFromMessage.js";

describe("parseBookingHintsFromMessage", () => {
  const referenceDate = new Date("2026-05-17T10:00:00"); // Sun 17 May 2026

  it("parses an explicit day-of-month and time", () => {
    const hints = parseBookingHintsFromMessage(
      "book him in on the 11th at 09:30am",
      { referenceDate },
    );
    expect(hints.dateStr).toBe("2026-05-11");
    expect(hints.slot).toBe("09:30");
  });

  it("parses a UK-formatted date like 18/05", () => {
    const hints = parseBookingHintsFromMessage("can we do 18/05 at 8.30?", { referenceDate });
    expect(hints.dateStr).toBe("2026-05-18");
    expect(hints.slot).toBe("08:30");
  });

  it("parses 'tomorrow at 2pm' relative to the reference date", () => {
    const hints = parseBookingHintsFromMessage("tomorrow at 2pm", { referenceDate });
    expect(hints.dateStr).toBe("2026-05-18");
    expect(hints.slot).toBe("14:00");
  });

  it("returns no date when nothing parses", () => {
    const hints = parseBookingHintsFromMessage("hi! is alfie due for a groom?", { referenceDate });
    expect(hints.dateStr).toBeNull();
    expect(hints.slot).toBeNull();
  });

  it("normalises 9:30am into the 09:30 SALON_SLOTS format", () => {
    const hints = parseBookingHintsFromMessage("9:30am on monday", { referenceDate });
    expect(hints.slot).toBe("09:30");
  });
});
