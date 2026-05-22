import { describe, it, expect } from "vitest";
import { resolveInboxTone } from "./inbox";

const NOW = new Date("2026-05-22T12:00:00Z");

describe("resolveInboxTone", () => {
  it("returns calm when nothing is waiting", () => {
    const r = resolveInboxTone({
      awaitingReply: 0,
      oldestUnansweredAt: null,
      now: NOW,
    });
    expect(r.tone).toBe("calm");
    expect(r.primaryLine).toBe("Inbox clear");
    expect(r.primaryNumber).toBeNull();
    expect(r.pillLabel).toBeNull();
    expect(r.ariaSummary).toBe("WhatsApp inbox, clear");
  });

  it("treats a null count as calm", () => {
    const r = resolveInboxTone({
      awaitingReply: 0,
      oldestUnansweredAt: "2026-05-22T11:00:00Z",
      now: NOW,
    });
    expect(r.tone).toBe("calm");
  });

  it("is active when the oldest message is younger than 2h", () => {
    const r = resolveInboxTone({
      awaitingReply: 3,
      oldestUnansweredAt: "2026-05-22T10:31:00Z",
      now: NOW,
    });
    expect(r.tone).toBe("active");
    expect(r.primaryNumber).toBe(3);
    expect(r.pillLabel).toBe("Open");
    expect(r.subtitle).toBe("messages waiting");
  });

  it("singularises 'message waiting' when count is 1", () => {
    const r = resolveInboxTone({
      awaitingReply: 1,
      oldestUnansweredAt: "2026-05-22T11:30:00Z",
      now: NOW,
    });
    expect(r.subtitle).toBe("message waiting");
    expect(r.ariaSummary).toBe("WhatsApp inbox, 1 message waiting");
  });

  it("escalates to attention at exactly the 2h boundary", () => {
    const r = resolveInboxTone({
      awaitingReply: 2,
      oldestUnansweredAt: "2026-05-22T10:00:00Z",
      now: NOW,
    });
    expect(r.tone).toBe("attention");
    expect(r.pillLabel).toBe("Needs reply");
    expect(r.subtitle).toBe("oldest 2 hours ago");
  });

  it("is attention with hour-style age when oldest is multiple hours old", () => {
    const r = resolveInboxTone({
      awaitingReply: 5,
      oldestUnansweredAt: "2026-05-22T08:00:00Z",
      now: NOW,
    });
    expect(r.tone).toBe("attention");
    expect(r.subtitle).toBe("oldest 4 hours ago");
    expect(r.ariaSummary).toBe(
      "WhatsApp inbox, 5 messages need reply, oldest 4 hours ago",
    );
    expect(r.urgency).toBeGreaterThan(3);
  });

  it("falls back to active when oldestUnansweredAt is missing", () => {
    const r = resolveInboxTone({
      awaitingReply: 4,
      oldestUnansweredAt: null,
      now: NOW,
    });
    expect(r.tone).toBe("active");
    expect(r.subtitle).toBe("messages waiting");
  });
});
