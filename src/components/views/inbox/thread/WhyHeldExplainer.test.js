import { describe, it, expect } from "vitest";
import { whyHeld } from "./whyHeld.js";

// Active AI-auto conversation used as the base for "the conversation
// is NOT what's blocking this draft" cases.
const aiAutoConversation = {
  state: "ai_handling",
  auto_send_enabled: true,
  autonomous_booking_enabled: false,
};

function draft(overrides = {}) {
  return {
    intent: "faq",
    confidence: 0.9,
    risk_level: "low",
    handoff_required: false,
    auto_send_eligible: true,
    ...overrides,
  };
}

describe("whyHeld", () => {
  it("returns null when there's no draft", () => {
    expect(whyHeld(null, aiAutoConversation)).toBeNull();
    expect(whyHeld(undefined, aiAutoConversation)).toBeNull();
  });

  it("flags handoff_required as the most-specific high-tone reason", () => {
    const r = whyHeld(draft({ handoff_required: true, risk_level: "high" }), aiAutoConversation);
    expect(r.tone).toBe("high");
    expect(r.text).toMatch(/handoff|human review|your eyes/i);
  });

  it("falls through to high risk when handoff is false", () => {
    const r = whyHeld(draft({ handoff_required: false, risk_level: "high" }), aiAutoConversation);
    expect(r.tone).toBe("high");
    expect(r.text).toMatch(/high-risk/);
  });

  it("uses medium tone for medium risk", () => {
    const r = whyHeld(draft({ risk_level: "medium" }), aiAutoConversation);
    expect(r.tone).toBe("medium");
    expect(r.text).toMatch(/some risk|review the wording/i);
  });

  it("explains 'Human only' AI mode when the conversation is in human_takeover", () => {
    const r = whyHeld(draft(), { ...aiAutoConversation, state: "human_takeover" });
    expect(r.tone).toBe("info");
    expect(r.text).toMatch(/human only/i);
  });

  it("explains 'AI drafts' mode when auto_send_enabled is false", () => {
    const r = whyHeld(draft(), { ...aiAutoConversation, auto_send_enabled: false });
    expect(r.tone).toBe("info");
    expect(r.text).toMatch(/ai drafts/i);
  });

  it("explains intent not on allowlist when auto_send_eligible is false on an otherwise-OK draft", () => {
    const r = whyHeld(
      draft({ auto_send_eligible: false, intent: "booking_propose" }),
      aiAutoConversation,
    );
    expect(r.tone).toBe("info");
    expect(r.text).toMatch(/booking_propose/);
    expect(r.text).toMatch(/allowlist/);
  });

  it("explains 'global setting off' when nothing draft-side blocks it", () => {
    const r = whyHeld(draft(), aiAutoConversation);
    expect(r.tone).toBe("info");
    expect(r.text).toMatch(/global auto-send setting/i);
  });

  it("orders signals from most specific to least: handoff > high risk > medium risk > conv mode > intent > global", () => {
    // handoff dominates high risk
    expect(
      whyHeld(draft({ handoff_required: true, risk_level: "high" }), aiAutoConversation).text,
    ).toMatch(/human review|your eyes/i);
    // high risk dominates conv mode
    expect(
      whyHeld(draft({ risk_level: "high" }), { ...aiAutoConversation, auto_send_enabled: false })
        .text,
    ).toMatch(/high-risk/);
    // conv mode dominates intent-allowlist
    expect(
      whyHeld(
        draft({ auto_send_eligible: false, intent: "booking_propose" }),
        { ...aiAutoConversation, auto_send_enabled: false },
      ).text,
    ).toMatch(/ai drafts/i);
  });
});
