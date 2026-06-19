import { describe, expect, it } from "vitest";

// The booking-entry fast path in whatsapp-agent fires ONLY when
// guessIntentFromText(text) === "booking_propose" (a NEW booking). This test
// pins that gate so a future tweak to the heuristic can't silently start
// auto-sending the entry message on cancels, reschedules, or FAQs.
import { guessIntentFromText } from "../../../supabase/functions/_shared/agentRisk.ts";

describe("booking-entry intent gate", () => {
  it("fires on new-booking phrasing", () => {
    for (const t of ["can I book Max in", "I'd like to book an appointment", "any slots available?"]) {
      expect(guessIntentFromText(t)).toBe("booking_propose");
    }
  });

  it("does NOT fire on cancel / reschedule (handled elsewhere)", () => {
    expect(guessIntentFromText("please cancel my booking")).toBe("booking_cancel");
    expect(guessIntentFromText("can I reschedule to Wednesday")).toBe("booking_change");
    expect(guessIntentFromText("can we move Bella's appointment")).toBe("booking_change");
  });

  it("does NOT fire on non-booking chatter", () => {
    for (const t of ["hello there", "thanks so much", "what are your prices"]) {
      expect(guessIntentFromText(t)).not.toBe("booking_propose");
    }
  });
});
