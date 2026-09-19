import { describe, it, expect } from "vitest";
import {
  slotsCoveredBy,
  isSlotClosed,
  closureForSlot,
  validateClosure,
  applyClosure,
  releaseClosure,
  buildCalendarRows,
  closureLabel,
  closureRangeLabel,
  bookingsInClosure,
  sanitiseClosures,
  endTimeOptions,
  MAX_REASON_LENGTH,
} from "./closures";
import type { DayClosure } from "../types/index";

const SLOTS = [
  "08:30", "09:00", "09:30", "10:00", "10:30",
  "11:00", "11:30", "12:00", "12:30", "13:00",
];

const closure = (over: Partial<DayClosure> = {}): DayClosure => ({
  id: "c1",
  from: "09:00",
  to: "10:30",
  reason: "doctor's appointment",
  ...over,
});

describe("slotsCoveredBy", () => {
  it("covers from inclusive to exclusive", () => {
    expect(slotsCoveredBy(closure(), SLOTS)).toEqual(["09:00", "09:30", "10:00"]);
  });

  it("covers two slots for a one-hour closure", () => {
    expect(slotsCoveredBy(closure({ from: "08:30", to: "09:30" }), SLOTS))
      .toEqual(["08:30", "09:00"]);
  });

  it("covers eight slots for a four-hour closure", () => {
    expect(slotsCoveredBy(closure({ from: "09:00", to: "13:00" }), SLOTS))
      .toHaveLength(8);
  });

  it("covers extra slots after 13:00", () => {
    const grid = [...SLOTS, "13:30", "14:00"];
    expect(slotsCoveredBy(closure({ from: "13:00", to: "14:30" }), grid))
      .toEqual(["13:00", "13:30", "14:00"]);
  });

  it("returns nothing when the range misses the grid", () => {
    expect(slotsCoveredBy(closure({ from: "05:00", to: "06:00" }), SLOTS)).toEqual([]);
  });
});

describe("isSlotClosed / closureForSlot", () => {
  it("reports a covered slot closed and an uncovered one open", () => {
    expect(isSlotClosed("09:30", [closure()], SLOTS)).toBe(true);
    expect(isSlotClosed("10:30", [closure()], SLOTS)).toBe(false);
  });

  it("returns the owning closure", () => {
    expect(closureForSlot("09:30", [closure()], SLOTS)?.id).toBe("c1");
    expect(closureForSlot("11:00", [closure()], SLOTS)).toBeNull();
  });
});

describe("validateClosure", () => {
  it("accepts a well-formed closure", () => {
    expect(validateClosure({ from: "09:00", to: "10:30", reason: "late start" }, [], SLOTS))
      .toEqual({ ok: true });
  });

  it("rejects an end at or before the start", () => {
    expect(validateClosure({ from: "10:00", to: "10:00", reason: "x" }, [], SLOTS).ok).toBe(false);
    expect(validateClosure({ from: "10:00", to: "09:30", reason: "x" }, [], SLOTS).ok).toBe(false);
  });

  it("rejects a start that is not an active slot", () => {
    expect(validateClosure({ from: "07:00", to: "09:00", reason: "x" }, [], SLOTS).ok).toBe(false);
  });

  it("rejects times off the half-hour grid", () => {
    expect(validateClosure({ from: "09:15", to: "10:00", reason: "x" }, [], SLOTS).ok).toBe(false);
    expect(validateClosure({ from: "09:00", to: "10:15", reason: "x" }, [], SLOTS).ok).toBe(false);
  });

  it("rejects an end past the last slot plus thirty minutes", () => {
    expect(validateClosure({ from: "12:30", to: "14:00", reason: "x" }, [], SLOTS).ok).toBe(false);
    expect(validateClosure({ from: "12:30", to: "13:30", reason: "x" }, [], SLOTS).ok).toBe(true);
  });

  it("rejects an empty or overlong reason", () => {
    expect(validateClosure({ from: "09:00", to: "10:00", reason: "   " }, [], SLOTS).ok).toBe(false);
    expect(validateClosure(
      { from: "09:00", to: "10:00", reason: "x".repeat(MAX_REASON_LENGTH + 1) }, [], SLOTS,
    ).ok).toBe(false);
  });

  it("rejects an overlap with an existing closure", () => {
    const existing = [closure()]; // 09:00–10:30
    expect(validateClosure({ from: "10:00", to: "11:00", reason: "x" }, existing, SLOTS).ok).toBe(false);
    expect(validateClosure({ from: "08:30", to: "09:30", reason: "x" }, existing, SLOTS).ok).toBe(false);
    expect(validateClosure({ from: "10:30", to: "11:00", reason: "x" }, existing, SLOTS).ok).toBe(true);
  });

  it("ignores the closure being edited", () => {
    const existing = [closure()];
    expect(validateClosure(
      { from: "09:00", to: "10:30", reason: "new reason" }, existing, SLOTS, "c1",
    )).toEqual({ ok: true });
  });
});

describe("applyClosure / releaseClosure", () => {
  it("blocks both seats on every covered slot", () => {
    const next = applyClosure({}, closure(), SLOTS);
    expect(next).toEqual({
      "09:00": { 0: "blocked", 1: "blocked" },
      "09:30": { 0: "blocked", 1: "blocked" },
      "10:00": { 0: "blocked", 1: "blocked" },
    });
  });

  it("leaves untouched slots alone", () => {
    const next = applyClosure({ "12:00": { 0: "blocked" } }, closure(), SLOTS);
    expect(next["12:00"]).toEqual({ 0: "blocked" });
  });

  it("round-trips back to the original overrides", () => {
    const before = { "12:00": { 0: "blocked" as const } };
    const after = releaseClosure(applyClosure(before, closure(), SLOTS), closure(), SLOTS);
    expect(after).toEqual(before);
  });

  it("does not mutate its input", () => {
    const before = {};
    applyClosure(before, closure(), SLOTS);
    expect(before).toEqual({});
  });
});

describe("buildCalendarRows", () => {
  it("collapses covered slots into one closure row", () => {
    const rows = buildCalendarRows(SLOTS, [closure()]);
    expect(rows).toHaveLength(8); // 10 slots − 3 covered + 1 closure row
    expect(rows[1]).toMatchObject({ type: "closure", slots: ["09:00", "09:30", "10:00"] });
    expect(rows[0]).toMatchObject({ type: "slot", slot: "08:30" });
    expect(rows[2]).toMatchObject({ type: "slot", slot: "10:30" });
  });

  it("keeps the original slot index on plain rows so row tinting is stable", () => {
    const rows = buildCalendarRows(SLOTS, [closure()]);
    expect(rows[2]).toMatchObject({ slot: "10:30", index: 4 });
  });

  it("returns plain rows when there are no closures", () => {
    expect(buildCalendarRows(SLOTS, [])).toHaveLength(SLOTS.length);
  });

  it("handles two closures in one day", () => {
    const rows = buildCalendarRows(SLOTS, [
      closure({ id: "a", from: "08:30", to: "09:30", reason: "late start" }),
      closure({ id: "b", from: "12:30", to: "13:30", reason: "early finish" }),
    ]);
    expect(rows.filter((r) => r.type === "closure")).toHaveLength(2);
  });
});

describe("labels", () => {
  it("prefixes the reason verbatim", () => {
    expect(closureLabel(closure())).toBe("Closed for doctor's appointment");
    expect(closureLabel(closure({ reason: "late start" }))).toBe("Closed for late start");
  });

  it("formats the range without leading zeros", () => {
    expect(closureRangeLabel(closure())).toBe("9:00 – 10:30");
  });
});

describe("bookingsInClosure", () => {
  it("returns only bookings inside the range", () => {
    const bookings = [{ slot: "09:30", id: "in" }, { slot: "11:00", id: "out" }];
    expect(bookingsInClosure(bookings, closure(), SLOTS).map((b) => b.id)).toEqual(["in"]);
  });
});

describe("sanitiseClosures", () => {
  it("drops malformed entries and keeps good ones", () => {
    const raw = [
      { id: "ok", from: "09:00", to: "10:00", reason: "late start" },
      { id: "no-times", reason: "x" },
      { from: "09:00", to: "10:00", reason: "no id" },
      { id: "bad-order", from: "10:00", to: "09:00", reason: "x" },
      "nonsense",
      null,
    ];
    expect(sanitiseClosures(raw).map((c) => c.id)).toEqual(["ok"]);
  });

  it("returns an empty list for a non-array", () => {
    expect(sanitiseClosures({ a: 1 })).toEqual([]);
    expect(sanitiseClosures(null)).toEqual([]);
  });

  it("trims and truncates the reason", () => {
    const [only] = sanitiseClosures([
      { id: "a", from: "09:00", to: "10:00", reason: `  ${"x".repeat(80)}  ` },
    ]);
    expect(only.reason).toHaveLength(MAX_REASON_LENGTH);
  });
});

describe("endTimeOptions", () => {
  it("offers every half hour after the start up to last slot plus thirty", () => {
    expect(endTimeOptions("12:00", SLOTS)).toEqual(["12:30", "13:00", "13:30"]);
  });

  it("returns nothing for a start that is not on the grid", () => {
    expect(endTimeOptions("07:00", SLOTS)).toEqual([]);
  });
});

// The engine is fed straight from JSONB, so every entry point has to survive a
// missing or malformed record rather than taking the grid down with it. These
// cases exercise those defensive paths.
describe("defensive inputs", () => {
  it("covers nothing when the times are not real times", () => {
    expect(slotsCoveredBy({ id: "x", from: "half nine", to: "10:00", reason: "x" }, SLOTS))
      .toEqual([]);
    expect(slotsCoveredBy({ id: "x", from: "09:00", to: "not a time", reason: "x" }, SLOTS))
      .toEqual([]);
    expect(slotsCoveredBy({ id: "x", from: "10:00", to: "09:00", reason: "x" }, SLOTS))
      .toEqual([]);
  });

  it("treats a missing closure list as no closures", () => {
    expect(closureForSlot("09:00", undefined as unknown as DayClosure[], SLOTS)).toBeNull();
  });

  it("skips a malformed existing closure when checking overlaps", () => {
    const existing = [{ id: "broken", from: "oops", to: "10:00", reason: "x" }];
    expect(validateClosure({ from: "09:00", to: "10:00", reason: "x" }, existing, SLOTS))
      .toEqual({ ok: true });
  });

  it("refuses a closure when the day has no active slots", () => {
    expect(validateClosure({ from: "09:00", to: "10:00", reason: "x" }, [], []).ok).toBe(false);
    expect(endTimeOptions("09:00", [])).toEqual([]);
  });

  it("treats missing overrides and bookings as empty", () => {
    expect(applyClosure(undefined as unknown as Record<string, never>, closure(), SLOTS))
      .toEqual({
        "09:00": { 0: "blocked", 1: "blocked" },
        "09:30": { 0: "blocked", 1: "blocked" },
        "10:00": { 0: "blocked", 1: "blocked" },
      });
    expect(releaseClosure(undefined as unknown as Record<string, never>, closure(), SLOTS))
      .toEqual({});
    expect(bookingsInClosure(undefined as unknown as { slot: string }[], closure(), SLOTS))
      .toEqual([]);
  });

  it("keeps a seat state the closure did not set when releasing", () => {
    const overrides = { "09:00": { 0: "blocked" as const, 2: "open" as const } };
    expect(releaseClosure(overrides, closure(), SLOTS)).toEqual({ "09:00": { 2: "open" } });
  });

  it("labels a closure with no reason without crashing", () => {
    expect(closureLabel({ id: "x", from: "09:00", to: "10:00" } as DayClosure))
      .toBe("Closed for ");
  });

  it("drops a closure that covers no slot on the grid when given one", () => {
    const raw = [{ id: "stale", from: "16:00", to: "17:00", reason: "old extra slot" }];
    expect(sanitiseClosures(raw).map((c) => c.id)).toEqual(["stale"]);
    expect(sanitiseClosures(raw, SLOTS)).toEqual([]);
  });
});
