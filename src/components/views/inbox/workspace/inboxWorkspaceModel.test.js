import { describe, expect, it } from "vitest";
import {
  appendSlotOffer,
  buildDiaryDates,
  formatSlotOffer,
  getConversationRowStatus,
} from "./inboxWorkspaceModel.js";

describe("getConversationRowStatus", () => {
  it("chooses the highest-priority existing signal", () => {
    expect(getConversationRowStatus({
      has_failed_message: true,
      needs_human_review: true,
      has_pending_draft: true,
      has_pending_booking_action: true,
      unread_count: 4,
      state: "human_takeover",
    })?.key).toBe("failed");
  });

  it("keeps the existing combined handoff and high-risk reason", () => {
    const status = getConversationRowStatus({
      needs_human_review: true,
      whatsapp_drafts: [{ state: "pending", handoff_required: true, risk_level: "high" }],
    });
    expect(status).toMatchObject({
      label: "Action needed",
      title: "Needs review: AI flagged a handoff AND the draft is high-risk. Open to see the reason.",
      ariaLabel: "Needs review: AI flagged a handoff AND the draft is high-risk. Open to see the reason.",
    });
  });

  it("returns null when no source status exists", () => {
    expect(getConversationRowStatus({ unread_count: 0, state: "ai_handling" })).toBeNull();
  });
});

describe("formatSlotOffer", () => {
  it("groups specific times by UK display date", () => {
    expect(formatSlotOffer([
      { dateStr: "2025-08-06", slot: "09:00" },
      { dateStr: "2025-08-06", slot: "10:30" },
    ])).toBe("Weds 6 Aug — 9:00am / 10:30am");
  });

  it("appends after one blank line", () => {
    expect(appendSlotOffer("Hello Sarah", [
      { dateStr: "2025-08-06", slot: "09:00" },
    ])).toBe("Hello Sarah\n\nWeds 6 Aug — 9:00am");
  });
});

it("builds five local calendar dates without UTC drift", () => {
  expect(buildDiaryDates("2026-08-02", 5).map((item) => item.dateStr)).toEqual([
    "2026-08-02", "2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06",
  ]);
});
