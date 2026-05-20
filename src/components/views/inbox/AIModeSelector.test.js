import { describe, it, expect } from "vitest";
import { deriveAIMode } from "./AIModeSelector.jsx";

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

  it("returns ai_drafts for ai_handling + !auto_send_enabled", () => {
    expect(
      deriveAIMode({
        state: "ai_handling",
        auto_send_enabled: false,
        autonomous_booking_enabled: false,
      }),
    ).toBe("ai_drafts");
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

  it("defaults to ai_auto when conversation is null/undefined (initial render before fetch resolves)", () => {
    expect(deriveAIMode(null)).toBe("ai_auto");
    expect(deriveAIMode(undefined)).toBe("ai_auto");
  });
});
