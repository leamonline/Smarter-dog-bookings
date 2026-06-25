import { describe, expect, it } from "vitest";

// Parity guard: the WhatsApp Flow runs in Deno and can't import the frontend
// engine, so supabase/functions/_shared/capacity.ts is a hand-mirror of
// src/engine/capacity.ts. This test feeds both findGroupedSlots the same
// inputs and asserts identical allocations (ignoring the random groupId) so
// the mirror can't silently drift from the source of truth.
import { findGroupedSlots as findEngine } from "../../engine/capacity";
import { findGroupedSlots as findShared } from "../../../supabase/functions/_shared/capacity.ts";
import { SALON_SLOTS } from "../../constants/salon";

type MiniDog = { id: string; size: "small" | "medium" | "large" };
type MiniBooking = { slot: string; size: "small" | "medium" | "large" };

// Drop the random groupId; compare drop-off + per-dog assignment signatures.
function norm(allocs: Array<{ dropOffTime: string; assignments: Array<{ dogId: string; slot: string }> }>) {
  return allocs
    .map((a) => ({
      dropOffTime: a.dropOffTime,
      sig: a.assignments.map((x) => `${x.dogId}:${x.slot}`).sort().join("|"),
    }))
    .sort((x, y) => x.dropOffTime.localeCompare(y.dropOffTime) || x.sig.localeCompare(y.sig));
}

function bothAgree(dogs: MiniDog[], bookings: MiniBooking[]) {
  const engine = findEngine(dogs as never, bookings as never, SALON_SLOTS as never);
  const shared = findShared(dogs as never, bookings as never, [...SALON_SLOTS]);
  return { engine: norm(engine), shared: norm(shared) };
}

describe("capacity engine mirror parity (findGroupedSlots)", () => {
  it("two small dogs on an empty day", () => {
    const { engine, shared } = bothAgree(
      [{ id: "s1", size: "small" }, { id: "s2", size: "small" }],
      [],
    );
    expect(shared).toEqual(engine);
    expect(shared.length).toBeGreaterThan(0);
  });

  it("one small dog when a large dog holds 12:00 (early close on 13:00)", () => {
    const { engine, shared } = bothAgree(
      [{ id: "s1", size: "small" }],
      [{ slot: "12:00", size: "large" }],
    );
    expect(shared).toEqual(engine);
  });

  it("three small dogs on a partially-booked day", () => {
    const { engine, shared } = bothAgree(
      [{ id: "a", size: "small" }, { id: "b", size: "small" }, { id: "c", size: "small" }],
      [{ slot: "09:00", size: "small" }, { slot: "10:30", size: "medium" }],
    );
    expect(shared).toEqual(engine);
  });

  it("a single large dog", () => {
    const { engine, shared } = bothAgree([{ id: "L", size: "large" }], []);
    expect(shared).toEqual(engine);
  });

  it("a mixed group of a large and a small dog", () => {
    const { engine, shared } = bothAgree(
      [{ id: "L", size: "large" }, { id: "s", size: "small" }],
      [],
    );
    expect(shared).toEqual(engine);
  });

  it("a full day (14 existing) offers nothing to a new dog — both engines agree", () => {
    // 14 small dogs already in, spread legally across the grid: any further
    // dog would breach the daily cap, so both engines must return [].
    const existing = [
      { slot: "08:30", size: "small" }, { slot: "08:30", size: "small" },
      { slot: "09:30", size: "small" }, { slot: "09:30", size: "small" },
      { slot: "10:30", size: "small" }, { slot: "10:30", size: "small" },
      { slot: "11:30", size: "small" }, { slot: "11:30", size: "small" },
      { slot: "12:30", size: "small" }, { slot: "12:30", size: "small" },
      { slot: "13:00", size: "small" }, { slot: "13:00", size: "small" },
      { slot: "09:00", size: "small" }, { slot: "11:00", size: "small" },
    ] as MiniBooking[];
    const { engine, shared } = bothAgree([{ id: "x", size: "small" }], existing);
    expect(shared).toEqual(engine);
    expect(shared.length).toBe(0);
  });

  it("the cap is atomic — a 2-dog group is rejected when only 1 seat-day remains", () => {
    // 13 existing → one more dog fits, but a 2-dog group (13+2=15>14) must not.
    // The day-cap guard fires before any per-slot allocation, so this seed's
    // slot spread is irrelevant — don't "fix" it into a per-slot-legal layout.
    const existing = Array.from({ length: 13 }, (_, i) => ({
      slot: ["08:30", "09:30", "10:30", "11:30", "12:30"][i % 5],
      size: "small",
    })) as MiniBooking[];
    const { engine, shared } = bothAgree(
      [{ id: "a", size: "small" }, { id: "b", size: "small" }],
      existing,
    );
    expect(shared).toEqual(engine);
    expect(shared.length).toBe(0);
  });
});
