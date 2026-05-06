import { describe, expect, it } from "vitest";
import { escapeIcsText, generateVEvent } from "../../supabase/functions/_shared/ics-generator";

describe("ICS text escaping", () => {
  it("normalises CRLF, CR, and LF into escaped ICS newlines", () => {
    const escaped = escapeIcsText("Bella\r\nSUMMARY:Injected\rDESCRIPTION:Bad\nTail");

    expect(escaped).toBe("Bella\\nSUMMARY:Injected\\nDESCRIPTION:Bad\\nTail");
    expect(escaped).not.toMatch(/[\r\n]/);
  });

  it("strips unsafe controls while preserving standard ICS escapes", () => {
    const escaped = escapeIcsText("A\\B;C,D\u0000\u0007");

    expect(escaped).toBe("A\\\\B\\;C\\,D");
  });

  it("keeps injected calendar properties inside the SUMMARY value", () => {
    const event = generateVEvent(
      {
        bookingId: "booking-1",
        bookingDate: "2026-05-06",
        slot: "09:00",
        dogName: "Bella\rSUMMARY:Injected",
        humanName: "Lee\nDESCRIPTION:Injected",
        service: "full-groom",
        status: "Booked",
        pickupOffsetMins: 120,
        updatedAt: "2026-05-06T08:00:00.000Z",
      },
      "Europe/London",
    );

    const lines = event.split("\r\n");
    const summary = lines.find((line) => line.startsWith("SUMMARY:"));

    expect(lines).not.toContain("SUMMARY:Injected");
    expect(lines).not.toContain("DESCRIPTION:Injected");
    expect(summary).toContain("Bella\\nSUMMARY:Injected");
    expect(summary).toContain("Lee\\nDESCRIPTION:Injected");
  });
});
