import { describe, it, expect } from "vitest";
import {
  applyChatConfirmations,
  detectReplyConfirmation,
  latestReplyConfirmation,
  type InboundMessage,
} from "./replyConfirmation";
import type { NeedActionReason } from "./today";

const REMINDER_SENT = "2026-08-05T17:00:00Z";

const inbound = (body: string, at = "2026-08-05T17:05:00Z"): InboundMessage => ({
  direction: "inbound",
  body,
  created_at: at,
});

describe("detectReplyConfirmation", () => {
  it.each([
    "Yes",
    "yes please",
    "👍",
    "👍🏽",
    "✅",
    "Yep 👍",
    "yeah thats fine",
    "Ok",
    "👍",
    "Confirmed",
    "Confirming, thank you",
    "See you Tuesday!",
    "We'll be there at 9",
    "That's perfect thank you",
    "Yes that's right, Bella will be there at 9 as usual",
    "still coming yes",
  ])("reads %j as a confirmation", (text) => {
    expect(detectReplyConfirmation(text)).toBe(true);
  });

  it.each([
    "",
    "   ",
    "No",
    "No sorry we can't make it",
    "Can we reschedule?",
    "Need to cancel I'm afraid",
    "Yes but can we move it to another day",
    "Yes sorry can we do 10 instead",
    "How much is a full groom?",
    "Thanks!",
    "Ok so she's been poorly all week, is that a problem",
    "Ok, but I might have to change the time — she has a vet appointment and I'm not sure it will finish in time",
  ])("does not read %j as a confirmation", (text) => {
    expect(detectReplyConfirmation(text)).toBe(false);
  });

  it("only trusts a bare affirmative in a short message", () => {
    expect(detectReplyConfirmation("Ok")).toBe(true);
    expect(
      detectReplyConfirmation(
        "Ok well she has been rolling in the mud again so she really needs a good scrub this time",
      ),
    ).toBe(false);
  });
});

describe("latestReplyConfirmation", () => {
  it("returns the confirming reply that arrived after the reminder", () => {
    const signal = latestReplyConfirmation(
      [inbound("Yes see you then", "2026-08-05T17:04:00Z")],
      REMINDER_SENT,
    );
    expect(signal).toEqual({ at: "2026-08-05T17:04:00Z", text: "Yes see you then" });
  });

  it("ignores replies sent before the reminder went out", () => {
    expect(
      latestReplyConfirmation([inbound("Yes", "2026-08-05T16:00:00Z")], REMINDER_SENT),
    ).toBeNull();
  });

  it("ignores outbound salon messages", () => {
    expect(
      latestReplyConfirmation(
        [{ direction: "outbound", body: "Confirmed for tomorrow", created_at: "2026-08-05T17:05:00Z" }],
        REMINDER_SENT,
      ),
    ).toBeNull();
  });

  it("takes the most recent confirmation when there are several", () => {
    const signal = latestReplyConfirmation(
      [
        inbound("Yes", "2026-08-05T17:05:00Z"),
        inbound("Confirmed, see you then", "2026-08-05T18:30:00Z"),
      ],
      REMINDER_SENT,
    );
    expect(signal?.text).toBe("Confirmed, see you then");
  });

  it("is suppressed entirely when the owner later raises a change", () => {
    expect(
      latestReplyConfirmation(
        [
          inbound("Yes see you then", "2026-08-05T17:05:00Z"),
          inbound("Actually can we reschedule?", "2026-08-05T19:00:00Z"),
        ],
        REMINDER_SENT,
      ),
    ).toBeNull();
  });

  it("returns null without a reminder send time (never asked = never chased)", () => {
    expect(latestReplyConfirmation([inbound("Yes")], null)).toBeNull();
    expect(latestReplyConfirmation([inbound("Yes")], "not-a-date")).toBeNull();
  });
});

describe("applyChatConfirmations", () => {
  const entry = (id: string, overrides = {}) => ({
    booking: { id },
    isUnconfirmed: true,
    needsAction: true,
    actionReasons: ["confirmation"] as NeedActionReason[],
    ...overrides,
  });

  const signal = { at: "2026-08-05T17:05:00Z", text: "Yes see you then" };

  it("clears the confirmation flag for a booking confirmed in chat", () => {
    const [result] = applyChatConfirmations([entry("b1")], { b1: signal });
    expect(result.isUnconfirmed).toBe(false);
    expect(result.actionReasons).toEqual([]);
    expect(result.needsAction).toBe(false);
    expect(result.chatConfirmation).toEqual(signal);
  });

  it("keeps other action reasons and stays actionable", () => {
    const [result] = applyChatConfirmations(
      [entry("b1", { actionReasons: ["confirmation", "late"] })],
      { b1: signal },
    );
    expect(result.actionReasons).toEqual(["late"]);
    expect(result.needsAction).toBe(true);
  });

  it("leaves bookings without a signal untouched", () => {
    const [result] = applyChatConfirmations([entry("b1")], {});
    expect(result.isUnconfirmed).toBe(true);
    expect(result.actionReasons).toEqual(["confirmation"]);
    expect(result.chatConfirmation).toBeNull();
  });
});
