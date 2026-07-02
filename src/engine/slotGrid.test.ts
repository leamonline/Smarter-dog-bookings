import { describe, expect, it } from "vitest";

import { buildSlotGrid, SLOT_SHAPE } from "./slotGrid";
import { SALON_SLOTS } from "../constants/salon";

describe("buildSlotGrid", () => {
  it("returns the canonical grid when there are no extras", () => {
    expect(buildSlotGrid()).toEqual([...SALON_SLOTS]);
    expect(buildSlotGrid([])).toEqual([...SALON_SLOTS]);
  });

  it("appends extras in chronological order", () => {
    // Deliberately unsorted input — index-based neighbour lookups in the
    // capacity engines need the grid ordered.
    expect(buildSlotGrid(["14:00", "13:30"]).slice(-2)).toEqual(["13:30", "14:00"]);
  });

  it("drops malformed values and duplicates", () => {
    // "25:00" is what the old unbounded add-slot button could generate.
    const grid = buildSlotGrid(["25:00", "13:30", "13:30", "9:30", "13:00"]);
    expect(grid).toEqual([...SALON_SLOTS, "13:30"]);
  });
});

describe("SLOT_SHAPE", () => {
  it("accepts strict HH:MM and rejects the rest", () => {
    expect(SLOT_SHAPE.test("08:30")).toBe(true);
    expect(SLOT_SHAPE.test("23:30")).toBe(true);
    expect(SLOT_SHAPE.test("24:00")).toBe(false);
    expect(SLOT_SHAPE.test("9:30")).toBe(false);
    expect(SLOT_SHAPE.test("13:5")).toBe(false);
    expect(SLOT_SHAPE.test("2026-04-06")).toBe(false);
  });
});
