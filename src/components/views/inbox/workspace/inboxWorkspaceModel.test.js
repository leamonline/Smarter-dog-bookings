import { describe, expect, it } from "vitest";
import {
  appendSlotOffer,
  buildDiaryDates,
  formatSlotOffer,
  getConversationPresentation,
  getConversationRowStatus,
} from "./inboxWorkspaceModel.js";

describe("getConversationPresentation", () => {
  it("keeps workflow, unread, a failed send and a booking proposal separate", () => {
    const presentation = getConversationPresentation({
      has_failed_message: true,
      latest_failed_message: { id: "msg-9", error_message: "Meta rejected it" },
      needs_human_review: true,
      has_pending_draft: true,
      has_pending_booking_action: true,
      unread_count: 4,
      state: "human_takeover",
    });
    expect(presentation.workflow?.key).toBe("review");
    expect(presentation.unread?.label).toBe("Unread");
    expect(presentation.unread?.ariaLabel).toBe("4 unread messages");
    expect(presentation.failed).toMatchObject({
      label: "Failed send",
      messageId: "msg-9",
      title: "Latest failed send: Meta rejected it",
    });
    expect(presentation.booking?.label).toBe("Booking to review");
  });

  it("does not repeat a booking proposal that is already the workflow", () => {
    const presentation = getConversationPresentation({
      has_pending_booking_action: true,
      unread_count: 0,
    });
    expect(presentation.workflow?.label).toBe("Booking to review");
    expect(presentation.booking).toBeNull();
    expect(presentation.unread).toBeNull();
    expect(presentation.failed).toBeNull();
  });
});

describe("getConversationRowStatus", () => {
  it("uses the workflow state and leaves delivery and unread to the presentation", () => {
    expect(getConversationRowStatus({
      has_failed_message: true,
      needs_human_review: true,
      has_pending_draft: true,
      has_pending_booking_action: true,
      unread_count: 4,
      state: "human_takeover",
    })?.key).toBe("review");
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
