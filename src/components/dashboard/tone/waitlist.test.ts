import { describe, it, expect } from "vitest";
import { resolveWaitlistTone } from "./waitlist";

// Anchor: today is 2026-05-22 local.
const NOW = new Date(2026, 4, 22, 14, 0, 0);

describe("resolveWaitlistTone", () => {
  it("is calm when the waitlist is empty", () => {
    const r = resolveWaitlistTone({ entries: [], now: NOW });
    expect(r.tone).toBe("calm");
    expect(r.primaryLine).toBe("Waitlist empty");
    expect(r.ariaSummary).toBe("Waitlist, empty");
  });

  it("is active when entries exist but none are within 2 days", () => {
    const r = resolveWaitlistTone({
      entries: [{ target_date: "2026-06-10" }, { target_date: "2026-06-15" }],
      now: NOW,
    });
    expect(r.tone).toBe("active");
    expect(r.primaryNumber).toBe(2);
    expect(r.subtitle).toBe("dogs waiting");
  });

  it("singularises 'dog waiting' when count is 1", () => {
    const r = resolveWaitlistTone({
      entries: [{ target_date: "2026-06-10" }],
      now: NOW,
    });
    expect(r.subtitle).toBe("dog waiting");
    expect(r.ariaSummary).toBe("Waitlist, 1 dog waiting");
  });

  it("escalates to attention when any entry is for today", () => {
    const r = resolveWaitlistTone({
      entries: [
        { target_date: "2026-05-22" },
        { target_date: "2026-06-10" },
      ],
      now: NOW,
    });
    expect(r.tone).toBe("attention");
    expect(r.pillLabel).toBe("Action");
    expect(r.primaryNumber).toBe(1);
    expect(r.subtitle).toBe("could be slotted in (of 2 total)");
  });

  it("escalates to attention when any entry is for tomorrow", () => {
    const r = resolveWaitlistTone({
      entries: [{ target_date: "2026-05-23" }],
      now: NOW,
    });
    expect(r.tone).toBe("attention");
    expect(r.primaryNumber).toBe(1);
    expect(r.urgency).toBe(1);
  });

  it("counts every imminent entry as urgency", () => {
    const r = resolveWaitlistTone({
      entries: [
        { target_date: "2026-05-22" },
        { target_date: "2026-05-23" },
        { target_date: "2026-05-23" },
        { target_date: "2026-07-01" },
      ],
      now: NOW,
    });
    expect(r.primaryNumber).toBe(3);
    expect(r.urgency).toBe(3);
  });
});
