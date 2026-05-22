import { describe, it, expect } from "vitest";
import { resolveRemindersTone } from "./reminders";

// Anchor: Thu 21 May 2026 16:00 local. targetDate = "2026-05-25" (next Mon).
const THU_AFTERNOON = new Date(2026, 4, 21, 16, 0, 0);
// Sun 24 May 2026 18:30 local — inside the 6h window before Mon midnight.
const SUN_EVE = new Date(2026, 4, 24, 18, 30, 0);
// Sun 24 May 2026 17:00 local — outside the 6h window.
const SUN_LATE_AFTERNOON = new Date(2026, 4, 24, 17, 0, 0);

describe("resolveRemindersTone", () => {
  it("is calm with 'no bookings' when totalCount is 0", () => {
    const r = resolveRemindersTone({
      targetDate: "2026-05-25",
      sentCount: 0,
      totalCount: 0,
      now: THU_AFTERNOON,
    });
    expect(r.tone).toBe("calm");
    expect(r.primaryLine).toMatch(/No bookings/);
    expect(r.primaryLine).toMatch(/25 May/);
  });

  it("is calm with 'all reminders sent' when every booking is ticked", () => {
    const r = resolveRemindersTone({
      targetDate: "2026-05-25",
      sentCount: 6,
      totalCount: 6,
      now: THU_AFTERNOON,
    });
    expect(r.tone).toBe("calm");
    expect(r.primaryLine).toBe("All reminders sent · 6 of 6");
    expect(r.ariaSummary).toBe("Reminders for Mon 25 May, all 6 sent");
  });

  it("is active when sent < total and target is days away", () => {
    const r = resolveRemindersTone({
      targetDate: "2026-05-25",
      sentCount: 2,
      totalCount: 8,
      now: THU_AFTERNOON,
    });
    expect(r.tone).toBe("active");
    expect(r.pillLabel).toBe("Pending");
    expect(r.primaryNumber).toBe(6);
    expect(r.subtitle).toContain("of 8 bookings");
    expect(r.progress).toEqual({ current: 2, total: 8 });
  });

  it("is still active on the day-before-target before 6pm", () => {
    const r = resolveRemindersTone({
      targetDate: "2026-05-25",
      sentCount: 1,
      totalCount: 5,
      now: SUN_LATE_AFTERNOON,
    });
    expect(r.tone).toBe("active");
  });

  it("escalates to attention once inside the 6h window before target midnight", () => {
    const r = resolveRemindersTone({
      targetDate: "2026-05-25",
      sentCount: 1,
      totalCount: 5,
      now: SUN_EVE,
    });
    expect(r.tone).toBe("attention");
    expect(r.pillLabel).toBe("Send now");
    expect(r.primaryNumber).toBe(4);
    expect(r.urgency).toBe(4);
  });

  it("handles a null targetDate by defaulting to active", () => {
    const r = resolveRemindersTone({
      targetDate: null,
      sentCount: 0,
      totalCount: 3,
      now: THU_AFTERNOON,
    });
    expect(r.tone).toBe("active");
  });
});
