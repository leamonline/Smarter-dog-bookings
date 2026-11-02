import { describe, expect, it } from "vitest";
import {
  decideMessengerWindow,
  MESSENGER_HUMAN_AGENT_WINDOW_MS,
  MESSENGER_MAX_TEXT_LENGTH,
  MESSENGER_STANDARD_WINDOW_MS,
} from "./messengerWindow";

const NOW = Date.parse("2026-11-02T12:00:00.000Z");

describe("decideMessengerWindow", () => {
  it("counts down the 24-hour standard reply window", () => {
    const decision = decideMessengerWindow({
      lastInboundAt: new Date(NOW - 60 * 60 * 1000).toISOString(),
      nowMs: NOW,
      humanAgentEnabled: false,
      sender: "staff",
    });
    expect(decision.mode).toBe("standard");
    expect(decision.label).toBe("Reply window closes in 23h 0m");
  });

  it("locks the box once 24 hours have passed while the human-agent flag is off", () => {
    const decision = decideMessengerWindow({
      lastInboundAt: new Date(NOW - MESSENGER_STANDARD_WINDOW_MS - 1000).toISOString(),
      nowMs: NOW,
      humanAgentEnabled: false,
      sender: "staff",
    });
    expect(decision.mode).toBe("closed");
    expect(decision.label).toBeNull();
  });

  it("does not give the AI the 7-day human-agent window", () => {
    const decision = decideMessengerWindow({
      lastInboundAt: new Date(NOW - MESSENGER_STANDARD_WINDOW_MS - 1000).toISOString(),
      nowMs: NOW,
      humanAgentEnabled: true,
      sender: "ai",
    });
    expect(decision.mode).toBe("closed");
  });

  it("offers the 7-day window only to a person when the flag is on", () => {
    const open = decideMessengerWindow({
      lastInboundAt: new Date(NOW - MESSENGER_STANDARD_WINDOW_MS - 1000).toISOString(),
      nowMs: NOW,
      humanAgentEnabled: true,
      sender: "staff",
    });
    expect(open.mode).toBe("human_agent");
    const closed = decideMessengerWindow({
      lastInboundAt: new Date(NOW - MESSENGER_HUMAN_AGENT_WINDOW_MS - 1000).toISOString(),
      nowMs: NOW,
      humanAgentEnabled: true,
      sender: "staff",
    });
    expect(closed.mode).toBe("closed");
  });

  it("keeps the 2000 character ceiling next to the window rules", () => {
    expect(MESSENGER_MAX_TEXT_LENGTH).toBe(2000);
  });
});
