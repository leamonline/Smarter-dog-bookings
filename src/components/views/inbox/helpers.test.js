import { describe, it, expect } from "vitest";
import { isConversationSnoozed } from "./helpers.js";

describe("isConversationSnoozed", () => {
  const future = "2999-01-01T00:00:00.000Z";
  const past = "2000-01-01T00:00:00.000Z";

  it("is true for a snoozed row whose timer is still in the future", () => {
    expect(
      isConversationSnoozed({ state: "snoozed", snoozed_until: future, unread_count: 0 }),
    ).toBe(true);
  });

  it("is false once the snooze timer has elapsed", () => {
    expect(
      isConversationSnoozed({ state: "snoozed", snoozed_until: past, unread_count: 0 }),
    ).toBe(false);
  });

  it("is false for non-snoozed states", () => {
    expect(isConversationSnoozed({ state: "human_takeover", unread_count: 0 })).toBe(false);
    expect(isConversationSnoozed({ state: "ai_handling", unread_count: 0 })).toBe(false);
  });

  it("is false for a closed conversation even if state is snoozed", () => {
    expect(
      isConversationSnoozed({ state: "snoozed", snoozed_until: future, closed_at: past }),
    ).toBe(false);
  });

  // Regression: a snoozed conversation must resurface the moment a new
  // customer message arrives, even before the DB trigger wakes it — an
  // unread inbound overrides the snooze so the salon can't miss it.
  it("is false when there is an unread inbound, overriding an active snooze", () => {
    expect(
      isConversationSnoozed({ state: "snoozed", snoozed_until: future, unread_count: 2 }),
    ).toBe(false);
  });
});
