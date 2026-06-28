import { describe, it, expect } from "vitest";
import { CHANNELS, uniqueChannelName } from "./realtimeChannels";

describe("uniqueChannelName", () => {
  it("prefixes with the base and is unique across calls", () => {
    const a = uniqueChannelName(CHANNELS.dogsRealtime);
    const b = uniqueChannelName(CHANNELS.dogsRealtime);
    expect(a.startsWith("dogs-realtime-")).toBe(true);
    expect(b.startsWith("dogs-realtime-")).toBe(true);
    expect(a).not.toBe(b);
  });

  it("preserves a composed base (params kept for debuggability)", () => {
    const n = uniqueChannelName(`${CHANNELS.monthBookings}-2026-6`);
    expect(n.startsWith("month-bookings-2026-6-")).toBe(true);
  });
});

describe("CHANNELS registry", () => {
  it("has no duplicate topic strings", () => {
    const vals = Object.values(CHANNELS);
    expect(new Set(vals).size).toBe(vals.length);
  });
});
