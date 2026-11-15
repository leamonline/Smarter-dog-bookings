import { describe, expect, it } from "vitest";
import { generateVEvent, type VEventInput } from "../../supabase/functions/_shared/ics-generator";

const booking: VEventInput = {
  bookingId: "sample-booking",
  bookingDate: "2026-11-16",
  slot: "08:30",
  dogName: "Milo",
  dogBreed: "Shih Tzu",
  humanName: "Alex Sample",
  feedType: "staff",
  service: "full-groom",
  status: "Booked",
  pickupOffsetMins: 120,
  updatedAt: "2026-11-15T12:00:00.000Z",
};

function eventFor(overrides: Partial<VEventInput> = {}): string[] {
  return generateVEvent({ ...booking, ...overrides }, "Europe/London")
    .replace(/\r\n /g, "")
    .split("\r\n");
}

describe("staff calendar presentation", () => {
  it("includes breed, service and owner in the title, with location and website fields", () => {
    const lines = eventFor();

    expect(lines).toContain("SUMMARY:Milo | Shih Tzu | Full Groom - Alex Sample");
    expect(lines).toContain("DESCRIPTION:Owner: Alex Sample\\nhttps://smarterdog.co.uk");
    expect(lines).toContain("LOCATION:Smarter Dog Grooming Salon\\n183 Kings Road\\, Ashton-under-Lyne\\, OL6 8HD\\, England");
    expect(lines).toContain("GEO:53.5004583;-2.0793345");
    expect(lines).toContain("URL:https://smarterdog.co.uk");
  });

  it.each([null, "", "   "])("omits missing breed (%s) without empty title segments", (dogBreed) => {
    expect(eventFor({ dogBreed })).toContain("SUMMARY:Milo | Full Groom - Alex Sample");
  });

  it("keeps the staff format and salon details when the owner is unavailable", () => {
    const lines = eventFor({ humanName: undefined });

    expect(lines).toContain("SUMMARY:Milo | Shih Tzu | Full Groom");
    expect(lines).toContain("DESCRIPTION:https://smarterdog.co.uk");
    expect(lines).toContain("URL:https://smarterdog.co.uk");
    expect(lines.join("\n")).not.toMatch(/undefined|null|Owner:/);
  });

  it("preserves event identity, appointment times and cancellation status", () => {
    const lines = eventFor({ status: "Cancelled" });

    expect(lines).toContain("UID:sample-booking@smarterdog.grooming");
    expect(lines).toContain("DTSTART;TZID=Europe/London:20261116T083000");
    expect(lines).toContain("DTEND;TZID=Europe/London:20261116T103000");
    expect(lines).toContain("LAST-MODIFIED:20261115T120000Z");
    expect(lines).toContain("STATUS:CANCELLED");
  });

  it("escapes breed and fallback service labels so they cannot inject calendar fields", () => {
    const lines = eventFor({
      dogBreed: "Cross;breed, mix\r\nURL:https://invalid.example",
      service: "Custom\nLOCATION:Injected",
    });

    expect(lines).toContain("SUMMARY:Milo | Cross\\;breed\\, mix\\nURL:https://invalid.example | Custom\\nLOCATION:Injected - Alex Sample");
    expect(lines).not.toContain("URL:https://invalid.example");
    expect(lines).not.toContain("LOCATION:Injected");
  });
});

describe("customer calendar presentation", () => {
  it.each([undefined, "customer"] as const)("keeps customer events private with feedType %s", (feedType) => {
    // Even if the caller supplies staff-only data, customer output omits it.
    const lines = eventFor({ feedType });

    expect(lines).toContain("SUMMARY:Dog Grooming - Milo (Full Groom)");
    expect(lines).toContain("DESCRIPTION:Full Groom for Milo at Smarter Dog Grooming. Drop off at 08:30.");
    expect(lines.join("\n")).not.toMatch(/Alex Sample|Shih Tzu|Owner:|LOCATION:|GEO:|URL:/);
  });
});
