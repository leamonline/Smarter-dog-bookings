import { describe, it, expect } from "vitest";
import { deriveAIMode } from "./AIModeSelector.jsx";

// Post-Phase-G: two modes only. The middle 'AI drafts' option is
// retired — staff use the on-demand Generate reply button instead.

describe("deriveAIMode", () => {
  it("returns ai_auto for ai_handling + auto_send_enabled", () => {
    expect(
      deriveAIMode({
        state: "ai_handling",
        auto_send_enabled: true,
        autonomous_booking_enabled: false,
      }),
    ).toBe("ai_auto");
  });

  it("returns ai_auto regardless of autonomous_booking_enabled (it's a sub-toggle)", () => {
    expect(
      deriveAIMode({
        state: "ai_handling",
        auto_send_enabled: true,
        autonomous_booking_enabled: true,
      }),
    ).toBe("ai_auto");
  });

  it("returns human_only for ai_handling + !auto_send_enabled (the retired AI-drafts shape)", () => {
    // This combination existed before Phase G as 'AI drafts'. The
    // migration converts these rows to human_takeover, but if any
    // slip through (e.g. an external script flips state without
    // touching auto_send_enabled) we should treat them as human_only —
    // never auto-send if staff hasn't opted in.
    expect(
      deriveAIMode({
        state: "ai_handling",
        auto_send_enabled: false,
        autonomous_booking_enabled: false,
      }),
    ).toBe("human_only");
  });

  it("returns human_only for human_takeover regardless of other flags", () => {
    expect(
      deriveAIMode({
        state: "human_takeover",
        auto_send_enabled: true,
        autonomous_booking_enabled: true,
      }),
    ).toBe("human_only");
    expect(
      deriveAIMode({
        state: "human_takeover",
        auto_send_enabled: false,
        autonomous_booking_enabled: false,
      }),
    ).toBe("human_only");
  });

  it("defaults to human_only when conversation is null/undefined (matches new DB default)", () => {
    expect(deriveAIMode(null)).toBe("human_only");
    expect(deriveAIMode(undefined)).toBe("human_only");
  });
});
