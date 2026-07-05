import { describe, it, expect } from "vitest";
import { detectOnTheWay, latestOnTheWaySignal, type InboundMessage } from "./onTheWay";

describe("detectOnTheWay", () => {
  it("flags clear on-the-way phrases", () => {
    ["On my way! 🐶", "omw", "we're nearly there", "just leaving now", "5 minutes away", "heading over to collect", "round the corner", "coming now"].forEach((t) => {
      expect(detectOnTheWay(t)).toBe(true);
    });
  });

  it("still flags 'late but on my way'", () => {
    expect(detectOnTheWay("Running 10 mins late but on my way")).toBe(true);
  });

  it("does not flag negations or unrelated messages", () => {
    ["Sorry, can't make it today — can we reschedule?", "Not on my way yet, give me an hour", "Thanks, see you at 12", "Is Bella ready?", ""].forEach((t) => {
      expect(detectOnTheWay(t)).toBe(false);
    });
  });
});

describe("latestOnTheWaySignal", () => {
  const NOW = new Date("2026-07-02T12:00:00Z");
  const msg = (direction: "inbound" | "outbound", body: string, minsAgo: number): InboundMessage => ({
    direction,
    body,
    created_at: new Date(NOW.getTime() - minsAgo * 60000).toISOString(),
  });

  it("returns the most recent inbound on-the-way message within the window", () => {
    const sig = latestOnTheWaySignal(
      [
        msg("inbound", "hello", 40),
        msg("inbound", "on my way now", 12),
        msg("outbound", "great, see you soon", 10),
      ],
      NOW,
    );
    expect(sig).not.toBeNull();
    expect(sig!.text).toBe("on my way now");
    expect(sig!.minutesAgo).toBe(12);
  });

  it("ignores outbound (salon) messages", () => {
    const sig = latestOnTheWaySignal([msg("outbound", "on my way to open up", 5)], NOW);
    expect(sig).toBeNull();
  });

  it("ignores signals older than the window", () => {
    const sig = latestOnTheWaySignal([msg("inbound", "omw", 200)], NOW, 120);
    expect(sig).toBeNull();
  });

  it("is null with no matching message", () => {
    expect(latestOnTheWaySignal([msg("inbound", "is she ready?", 5)], NOW)).toBeNull();
    expect(latestOnTheWaySignal([], NOW)).toBeNull();
  });
});
