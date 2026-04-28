// ============================================================
// src/lib/ai/agentRisk.test.ts
//
// Pure-function tests for the AI receptionist's deterministic layer.
// The helpers under test live in supabase/functions/_shared/agentRisk.ts
// — that path is reached transitively from this file, so tsc and
// vitest both pick it up without any config change.
//
// What this covers (mapping to the brief's 10 required behaviours):
//   1. AI must not auto-send high-risk      → risk + canAutoSend
//   2. Walk-in services don't book          → isWalkInService
//   3. Missing booking details detected     → extractMissingFields
//   4. Days outside Mon-Wed rejected        → validateOpeningDay
//   5. Times outside 08:30-13:00 rejected   → validateAppointmentTime
//   6. (booking pending_ai)                 → covered by RPC contract,
//                                             not unit-testable here
//   7. Price responses cite "guide price"   → fallbackReplyForIntent
//   8. Health/medical → handoff             → classifyRisk + requiresHandoff
//   9. Complaints → handoff                 → classifyRisk + requiresHandoff
//  10. Thanks / on-my-way → low + auto-send → classifyRisk + canAutoSend
//
// Plus state-shape and intent-alias coverage to lock the contract
// down for future channels.
// ============================================================

import { describe, it, expect } from "vitest";

import {
  AUTO_SENDABLE_INTENTS,
  COMPLAINT_KEYWORDS,
  INTENT_ALIAS,
  INTENT_BASE_RISK,
  MEDICAL_KEYWORDS,
  RISK_LEVELS,
  WALKIN_KEYWORDS,
  canAutoSend,
  classifyRisk,
  extractMissingFields,
  fallbackReplyForIntent,
  guessIntentFromText,
  isWalkInService,
  mergeAgentState,
  requiresHandoff,
  validateAppointmentTime,
  validateOpeningDay,
} from "../../../supabase/functions/_shared/agentRisk";

// ── classifyRisk ──────────────────────────────────────────────

describe("classifyRisk", () => {
  it("escalates to high on medical keywords regardless of intent", () => {
    expect(classifyRisk("greeting", "Milo has a wound on his paw", 0.95)).toBe("high");
    expect(classifyRisk("smalltalk", "She's been on medication for fits", 0.95)).toBe("high");
    expect(classifyRisk("faq", "He has a skin infection", 0.95)).toBe("high");
  });

  it("escalates to high on complaint keywords", () => {
    expect(classifyRisk("greeting", "I want a refund", 0.95)).toBe("high");
    expect(classifyRisk("smalltalk", "I'm leaving a 1 star review", 0.95)).toBe("high");
    expect(classifyRisk("faq", "This is unacceptable", 0.95)).toBe("high");
  });

  it("returns high when intent is escalate", () => {
    expect(classifyRisk("escalate", "anything", 0.99)).toBe("high");
  });

  it("uses base intent risk when no keywords match", () => {
    expect(classifyRisk("greeting", "Hey there!", 0.95)).toBe("low");
    expect(classifyRisk("smalltalk", "Thanks ❤️", 0.95)).toBe("low");
    expect(classifyRisk("booking_propose", "Can I book for Monday?", 0.95)).toBe("medium");
    expect(classifyRisk("booking_cancel", "I need to cancel", 0.95)).toBe("medium");
  });

  it("upgrades a low base risk to medium when confidence is below 0.6", () => {
    expect(classifyRisk("greeting", "??", 0.3)).toBe("medium");
    expect(classifyRisk("smalltalk", "ok", 0.55)).toBe("medium");
  });

  it("does not upgrade a medium base risk on low confidence", () => {
    // medium is already cautious enough; only LOW gets bumped to medium
    expect(classifyRisk("booking_propose", "uh", 0.2)).toBe("medium");
  });
});

// ── requiresHandoff ───────────────────────────────────────────

describe("requiresHandoff", () => {
  it("requires handoff for high risk", () => {
    expect(requiresHandoff("greeting", "high", 0.99)).toBe(true);
    expect(requiresHandoff("faq", "high", 0.99)).toBe(true);
  });

  it("requires handoff for escalate intent", () => {
    expect(requiresHandoff("escalate", "low", 0.99)).toBe(true);
  });

  it("requires handoff when confidence is very low", () => {
    expect(requiresHandoff("booking_propose", "medium", 0.4)).toBe(true);
  });

  it("does not require handoff for routine medium-risk drafts", () => {
    expect(requiresHandoff("booking_propose", "medium", 0.85)).toBe(false);
    expect(requiresHandoff("booking_cancel", "medium", 0.7)).toBe(false);
  });

  it("does not require handoff for routine low-risk drafts", () => {
    expect(requiresHandoff("smalltalk", "low", 0.95)).toBe(false);
    expect(requiresHandoff("greeting", "low", 0.9)).toBe(false);
  });
});

// ── canAutoSend ───────────────────────────────────────────────

describe("canAutoSend", () => {
  const allOptionsOn = { envFlagEnabled: true, conversationOptedIn: true };

  it("returns false when env flag is off", () => {
    expect(canAutoSend("greeting", "low", false, { envFlagEnabled: false, conversationOptedIn: true }))
      .toBe(false);
  });

  it("returns false when conversation has not opted in", () => {
    expect(canAutoSend("greeting", "low", false, { envFlagEnabled: true, conversationOptedIn: false }))
      .toBe(false);
  });

  it("returns false for medium or high risk", () => {
    expect(canAutoSend("booking_propose", "medium", false, allOptionsOn)).toBe(false);
    expect(canAutoSend("greeting", "high", false, allOptionsOn)).toBe(false);
  });

  it("returns false when handoff is required", () => {
    expect(canAutoSend("greeting", "low", true, allOptionsOn)).toBe(false);
  });

  it("returns false for booking-touching intents even when low and gates open", () => {
    // Belt-and-braces: bookings always go through staff approval.
    expect(canAutoSend("booking_propose", "low", false, allOptionsOn)).toBe(false);
    expect(canAutoSend("booking_change", "low", false, allOptionsOn)).toBe(false);
    expect(canAutoSend("booking_cancel", "low", false, allOptionsOn)).toBe(false);
  });

  it("returns true only when all gates open and intent is in allowlist", () => {
    expect(canAutoSend("greeting", "low", false, allOptionsOn)).toBe(true);
    expect(canAutoSend("smalltalk", "low", false, allOptionsOn)).toBe(true);
    expect(canAutoSend("faq", "low", false, allOptionsOn)).toBe(true);
    expect(canAutoSend("confirm_time", "low", false, allOptionsOn)).toBe(true);
  });

  it("Thanks / on-my-way / brief acknowledgement → low risk + auto-send eligible", () => {
    // Behaviour 10 from the brief
    const text = "Thanks, on my way!";
    const intent = guessIntentFromText(text);
    expect(intent).toBe("smalltalk");
    const risk = classifyRisk(intent, text, 0.95);
    expect(risk).toBe("low");
    const handoff = requiresHandoff(intent, risk, 0.95);
    expect(handoff).toBe(false);
    expect(canAutoSend(intent, risk, handoff, allOptionsOn)).toBe(true);
  });
});

// ── isWalkInService ───────────────────────────────────────────

describe("isWalkInService", () => {
  it("matches nail clip mentions", () => {
    expect(isWalkInService("Can I get Bobby's nails clipped?")).toBe(true);
    expect(isWalkInService("just a claw trim please")).toBe(true);
  });

  it("matches gland and ear-clean mentions", () => {
    expect(isWalkInService("Anal glands need doing")).toBe(true);
    expect(isWalkInService("Ear clean please")).toBe(true);
  });

  it("matches pop-in / walk-in phrasing", () => {
    expect(isWalkInService("Can I just pop in?")).toBe(true);
    expect(isWalkInService("walk-in available?")).toBe(true);
  });

  it("does not match a full-groom enquiry", () => {
    expect(isWalkInService("Can I book Milo in for a full groom?")).toBe(false);
  });

  it("handles null and empty", () => {
    expect(isWalkInService(null)).toBe(false);
    expect(isWalkInService("")).toBe(false);
    expect(isWalkInService(undefined)).toBe(false);
  });
});

// ── extractMissingFields ──────────────────────────────────────

describe("extractMissingFields", () => {
  it("returns the four required keys for an empty state", () => {
    expect(extractMissingFields(null).sort()).toEqual([
      "breed",
      "dogName",
      "preferredDay",
      "preferredTime",
    ]);
  });

  it("returns only the missing keys when some are filled", () => {
    expect(
      extractMissingFields({ dogName: "Milo", breed: "Cockapoo" }).sort(),
    ).toEqual(["preferredDay", "preferredTime"]);
  });

  it("treats empty strings as missing", () => {
    expect(
      extractMissingFields({ dogName: "  ", breed: "Cockapoo" }).sort(),
    ).toEqual(["dogName", "preferredDay", "preferredTime"]);
  });

  it("returns nothing when all four required are present", () => {
    expect(
      extractMissingFields({
        dogName: "Milo",
        breed: "Cockapoo",
        preferredDay: "Monday",
        preferredTime: "10:30",
      }),
    ).toEqual([]);
  });
});

// ── validateOpeningDay ────────────────────────────────────────

describe("validateOpeningDay", () => {
  // Anchor: 2026-04-27 is a Monday, 28 Tue, 29 Wed, 30 Thu.
  it("accepts Monday/Tuesday/Wednesday", () => {
    expect(validateOpeningDay("2026-04-27")).toBe(true); // Mon
    expect(validateOpeningDay("2026-04-28")).toBe(true); // Tue
    expect(validateOpeningDay("2026-04-29")).toBe(true); // Wed
  });

  it("rejects Thursday through Sunday", () => {
    expect(validateOpeningDay("2026-04-30")).toBe(false); // Thu
    expect(validateOpeningDay("2026-05-01")).toBe(false); // Fri
    expect(validateOpeningDay("2026-05-02")).toBe(false); // Sat
    expect(validateOpeningDay("2026-05-03")).toBe(false); // Sun
  });

  it("rejects malformed input", () => {
    expect(validateOpeningDay("monday")).toBe(false);
    expect(validateOpeningDay("2026/04/27")).toBe(false);
    expect(validateOpeningDay("")).toBe(false);
  });
});

// ── validateAppointmentTime ───────────────────────────────────

describe("validateAppointmentTime", () => {
  it("accepts the documented half-hour slots", () => {
    expect(validateAppointmentTime("08:30")).toBe(true);
    expect(validateAppointmentTime("09:00")).toBe(true);
    expect(validateAppointmentTime("12:30")).toBe(true);
    expect(validateAppointmentTime("13:00")).toBe(true);
  });

  it("rejects times before 08:30 or after 13:00", () => {
    expect(validateAppointmentTime("08:00")).toBe(false);
    expect(validateAppointmentTime("13:30")).toBe(false);
    expect(validateAppointmentTime("14:00")).toBe(false);
    expect(validateAppointmentTime("15:00")).toBe(false);
  });

  it("rejects non-half-hour slots", () => {
    expect(validateAppointmentTime("09:15")).toBe(false);
    expect(validateAppointmentTime("10:45")).toBe(false);
  });

  it("rejects malformed input", () => {
    expect(validateAppointmentTime("9:00")).toBe(false);
    expect(validateAppointmentTime("noon")).toBe(false);
    expect(validateAppointmentTime("")).toBe(false);
  });
});

// ── mergeAgentState ───────────────────────────────────────────

describe("mergeAgentState", () => {
  it("merges new keys without dropping known ones", () => {
    const result = mergeAgentState({ dogName: "Milo" }, { breed: "Cockapoo" });
    expect(result).toEqual({ dogName: "Milo", breed: "Cockapoo" });
  });

  it("does not overwrite known values with null in the patch", () => {
    const result = mergeAgentState({ dogName: "Milo", breed: "Cockapoo" }, { breed: null });
    expect(result.breed).toBe("Cockapoo");
  });

  it("does not overwrite known values with undefined in the patch", () => {
    const result = mergeAgentState(
      { dogName: "Milo", breed: "Cockapoo" },
      { breed: undefined },
    );
    expect(result.breed).toBe("Cockapoo");
  });

  it("ignores unknown keys in the patch", () => {
    const result = mergeAgentState(
      { dogName: "Milo" },
      { breed: "Cockapoo", random: "junk" } as unknown as Partial<{
        dogName: string;
        breed: string;
      }>,
    );
    expect(result).toEqual({ dogName: "Milo", breed: "Cockapoo" });
    expect((result as Record<string, unknown>).random).toBeUndefined();
  });

  it("replaces missingFields atomically when present", () => {
    const result = mergeAgentState(
      { dogName: "Milo", missingFields: ["breed", "preferredDay"] },
      { breed: "Cockapoo", missingFields: ["preferredDay"] },
    );
    expect(result.missingFields).toEqual(["preferredDay"]);
  });

  it("returns a fresh object (no shared reference)", () => {
    const prev = { dogName: "Milo" };
    const result = mergeAgentState(prev, { breed: "Cockapoo" });
    expect(result).not.toBe(prev);
  });

  it("handles null prev", () => {
    expect(mergeAgentState(null, { dogName: "Milo" })).toEqual({ dogName: "Milo" });
  });

  it("handles null patch", () => {
    expect(mergeAgentState({ dogName: "Milo" }, null)).toEqual({ dogName: "Milo" });
  });
});

// ── INTENT_ALIAS ──────────────────────────────────────────────

describe("INTENT_ALIAS", () => {
  it("maps the brief's UPPERCASE taxonomy to the internal lowercase set", () => {
    expect(INTENT_ALIAS.NEW_ENQUIRY).toBe("greeting");
    expect(INTENT_ALIAS.BOOKING_REQUEST).toBe("booking_propose");
    expect(INTENT_ALIAS.BOOKING_CONFIRMATION).toBe("booking_confirm");
    expect(INTENT_ALIAS.RESCHEDULE_REQUEST).toBe("booking_change");
    expect(INTENT_ALIAS.CANCELLATION_REQUEST).toBe("booking_cancel");
    expect(INTENT_ALIAS.PRICE_CHECK).toBe("faq");
    expect(INTENT_ALIAS.WALK_IN_SERVICE).toBe("faq");
    expect(INTENT_ALIAS.COLLECTION_READY_OR_ON_WAY).toBe("smalltalk");
    expect(INTENT_ALIAS.THANKS_OR_ACKNOWLEDGEMENT).toBe("smalltalk");
    expect(INTENT_ALIAS.COMPLAINT_OR_SENSITIVE).toBe("escalate");
    expect(INTENT_ALIAS.HEALTH_OR_MEDICAL).toBe("escalate");
    expect(INTENT_ALIAS.UNKNOWN).toBe("other");
  });

  it("supports the user's tone-doc shorter aliases", () => {
    expect(INTENT_ALIAS.CONFIRMATION).toBe("booking_confirm");
    expect(INTENT_ALIAS.RESCHEDULE).toBe("booking_change");
    expect(INTENT_ALIAS.CANCEL).toBe("booking_cancel");
    expect(INTENT_ALIAS.COLLECTION).toBe("smalltalk");
  });
});

// ── fallbackReplyForIntent ────────────────────────────────────

const ALLOWED_EMOJI_SET = new Set(["🐶", "❤️", "🎓", "🐾", "😊"]);
const EMOJI_RE = /\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu;

function emojisIn(s: string): string[] {
  return Array.from(s.matchAll(EMOJI_RE)).map((m) => m[0]);
}

describe("fallbackReplyForIntent", () => {
  it("every template ends with X", () => {
    const inputs = [
      "new_enquiry",
      "missing_info",
      "walk_in",
      "price_check",
      "handoff",
      "unknown",
      "greeting",
      "booking_propose",
      "escalate",
      "smalltalk",
      "other",
    ] as const;
    for (const intent of inputs) {
      const reply = fallbackReplyForIntent(intent);
      expect(reply.trim().endsWith(" X")).toBe(true);
    }
  });

  it("uses only emojis from the brand-allowed set", () => {
    const inputs = ["new_enquiry", "missing_info", "walk_in", "price_check", "handoff", "unknown"] as const;
    for (const kind of inputs) {
      const reply = fallbackReplyForIntent(kind);
      const emojis = emojisIn(reply);
      for (const e of emojis) {
        // Strip any combining variation selectors
        const normalised = e.replace(/️/g, "");
        const match = Array.from(ALLOWED_EMOJI_SET).some((a) => a.replace(/️/g, "") === normalised);
        expect(match, `Unexpected emoji ${e} in template "${reply}"`).toBe(true);
      }
    }
  });

  it("price_check template mentions guide pricing AND that final price is confirmed after the groom", () => {
    // Behaviour 7 from the brief
    const reply = fallbackReplyForIntent("price_check");
    expect(reply.toLowerCase()).toContain("guide");
    expect(reply.toLowerCase()).toContain("after the groom");
  });

  it("handoff template signals delegation to a human", () => {
    // Behaviour 8/9 from the brief
    const reply = fallbackReplyForIntent("escalate");
    expect(reply.toLowerCase()).toMatch(/team|human|one of/);
  });

  it("walk_in template mentions the open hours and 'walk-in only'", () => {
    // Behaviour 2 from the brief
    const reply = fallbackReplyForIntent("walk_in");
    expect(reply).toMatch(/walk-?in/i);
    expect(reply).toMatch(/08:30/);
    expect(reply).toMatch(/13:00/);
  });

  it("interpolates the customer's first name on greeting templates", () => {
    const reply = fallbackReplyForIntent("new_enquiry", { customerName: "Bleep" });
    expect(reply).toContain("Hey Bleep,");
  });

  it("does not interpolate name into intent-specific answers", () => {
    const reply = fallbackReplyForIntent("price_check", { customerName: "Bleep" });
    expect(reply).not.toContain("Bleep");
  });
});

// ── guessIntentFromText (parser fallback) ─────────────────────

describe("guessIntentFromText", () => {
  it("medical/complaint keywords route to escalate", () => {
    expect(guessIntentFromText("She has a wound that won't stop bleeding")).toBe("escalate");
    expect(guessIntentFromText("I want a refund")).toBe("escalate");
  });

  it("walk-in mentions route to faq", () => {
    expect(guessIntentFromText("Can I get nails clipped?")).toBe("faq");
  });

  it("price phrasing routes to faq", () => {
    expect(guessIntentFromText("How much for a small dog?")).toBe("faq");
    expect(guessIntentFromText("What's the cost?")).toBe("faq");
  });

  it("booking phrasing routes to booking_propose", () => {
    expect(guessIntentFromText("Can I book Milo in for next Monday?")).toBe("booking_propose");
  });

  it("reschedule and cancel route appropriately", () => {
    expect(guessIntentFromText("Can we reschedule please?")).toBe("booking_change");
    expect(guessIntentFromText("Need to cancel today's appointment")).toBe("booking_cancel");
  });

  it("greeting and smalltalk", () => {
    expect(guessIntentFromText("Hey there")).toBe("greeting");
    expect(guessIntentFromText("Thanks!")).toBe("smalltalk");
    expect(guessIntentFromText("on my way")).toBe("smalltalk");
  });

  it("falls back to other on empty or unparseable input", () => {
    expect(guessIntentFromText("")).toBe("other");
    expect(guessIntentFromText(null)).toBe("other");
    expect(guessIntentFromText("xyzzy")).toBe("other");
  });
});

// ── Sanity invariants ─────────────────────────────────────────

describe("invariants", () => {
  it("RISK_LEVELS contains exactly the documented three", () => {
    expect(RISK_LEVELS).toEqual(["low", "medium", "high"]);
  });

  it("INTENT_BASE_RISK covers every intent in the system prompt union", () => {
    const intents: (keyof typeof INTENT_BASE_RISK)[] = [
      "faq",
      "greeting",
      "booking_query",
      "booking_propose",
      "booking_confirm",
      "booking_change",
      "booking_cancel",
      "confirm_time",
      "smalltalk",
      "escalate",
      "other",
    ];
    for (const i of intents) {
      expect(["low", "medium", "high"]).toContain(INTENT_BASE_RISK[i]);
    }
  });

  it("AUTO_SENDABLE_INTENTS contains no booking-touching intents", () => {
    for (const i of AUTO_SENDABLE_INTENTS) {
      expect(i.startsWith("booking_")).toBe(false);
    }
  });

  it("MEDICAL_KEYWORDS / COMPLAINT_KEYWORDS / WALKIN_KEYWORDS are non-empty", () => {
    expect(MEDICAL_KEYWORDS.length).toBeGreaterThan(0);
    expect(COMPLAINT_KEYWORDS.length).toBeGreaterThan(0);
    expect(WALKIN_KEYWORDS.length).toBeGreaterThan(0);
  });
});
