import { describe, it, expect, vi, afterEach } from "vitest";
import { formatDayToken, formatTime, findOpenWindowConversation } from "./helpers.js";

describe("formatDayToken", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("labels today, yesterday, recent weekdays, and older dates", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-10T12:00:00Z"));

    expect(formatDayToken("2026-06-10T08:00:00Z")).toBe("Today");
    expect(formatDayToken("2026-06-09T08:00:00Z")).toBe("Yesterday");

    // 3 days ago → weekday name (compare against the same locale call so
    // the assertion is timezone/locale-agnostic and only checks the branch).
    const recent = "2026-06-07T08:00:00Z";
    expect(formatDayToken(recent)).toBe(
      new Date(recent).toLocaleDateString("en-GB", { weekday: "long" }),
    );

    // Older than a week → day + month.
    const older = "2026-05-20T08:00:00Z";
    expect(formatDayToken(older)).toBe(
      new Date(older).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
    );

    expect(formatDayToken(null)).toBe("");
  });
});

describe("formatTime", () => {
  it("formats 24-hour HH:MM and tolerates null", () => {
    expect(formatTime("2026-06-10T05:09:00Z")).toMatch(/^\d{2}:\d{2}$/);
    expect(formatTime(null)).toBe("");
  });
});

describe("findOpenWindowConversation", () => {
  const NOW = new Date("2026-06-10T12:00:00Z").getTime();
  const recent = "2026-06-10T06:00:00Z"; // 6h ago → window OPEN
  const old = "2026-06-08T06:00:00Z"; // ~54h ago → window CLOSED

  const human = { id: "h1", phone: "+447700900123" };

  it("returns the open conversation matched by human_id", () => {
    const convs = [
      { id: "c1", human_id: "h1", phone_e164: "+447700900123", last_inbound_at: recent, channel: "whatsapp" },
    ];
    expect(findOpenWindowConversation(convs, human, NOW)?.id).toBe("c1");
  });

  it("matches by phone when human_id is absent", () => {
    const convs = [
      { id: "c1", human_id: null, phone_e164: "+447700900123", last_inbound_at: recent, channel: "whatsapp" },
    ];
    expect(findOpenWindowConversation(convs, human, NOW)?.id).toBe("c1");
  });

  it("returns null when the window is closed", () => {
    const convs = [
      { id: "c1", human_id: "h1", phone_e164: "+447700900123", last_inbound_at: old, channel: "whatsapp" },
    ];
    expect(findOpenWindowConversation(convs, human, NOW)).toBeNull();
  });

  it("returns null when no conversation matches the customer", () => {
    const convs = [
      { id: "c1", human_id: "other", phone_e164: "+440000000000", last_inbound_at: recent, channel: "whatsapp" },
    ];
    expect(findOpenWindowConversation(convs, human, NOW)).toBeNull();
  });

  it("ignores non-whatsapp channels", () => {
    const convs = [
      { id: "c1", human_id: "h1", phone_e164: "+447700900123", last_inbound_at: recent, channel: "sms" },
    ];
    expect(findOpenWindowConversation(convs, human, NOW)).toBeNull();
  });

  it("picks the most recently active open conversation", () => {
    const convs = [
      { id: "older", human_id: "h1", phone_e164: "+447700900123", last_inbound_at: "2026-06-10T01:00:00Z", channel: "whatsapp" },
      { id: "newer", human_id: "h1", phone_e164: "+447700900123", last_inbound_at: recent, channel: "whatsapp" },
    ];
    expect(findOpenWindowConversation(convs, human, NOW)?.id).toBe("newer");
  });

  it("tolerates null/empty inputs", () => {
    expect(findOpenWindowConversation(null, human, NOW)).toBeNull();
    expect(findOpenWindowConversation([], human, NOW)).toBeNull();
    expect(findOpenWindowConversation([{ id: "c1", human_id: "h1", last_inbound_at: recent }], null, NOW)).toBeNull();
  });
});
