/**
 * slotCapacityPreview — unit tests for the pure helpers behind the
 * inbox BookingCapacityPreview. We don't mount the hook here;
 * classifyProposedBooking does the full classification path so we
 * exercise the engine end-to-end via the wrapper.
 *
 * Run: npx vitest run src/components/views/inbox/hooks/slotCapacityPreview.test.js
 */

import { describe, it, expect } from "vitest";
import {
  classifyProposedBooking,
  summariseExistingBookings,
} from "./slotCapacityPreview.js";

function makeBooking({ id = "b1", slot, size, dogId = "d1" }) {
  // Minimal Booking shape — the capacity engine only reads slot,
  // size, and _dogId so we keep the fixtures tight.
  return {
    id,
    slot,
    size,
    dogName: "TestDog",
    breed: "",
    service: "full-groom",
    owner: "",
    status: "Booked",
    addons: [],
    pickupBy: "",
    payment: "",
    confirmed: true,
    _dogId: dogId,
    _ownerId: null,
    _pickupById: null,
    _bookingDate: "2026-05-12",
    _groupId: null,
  };
}

describe("summariseExistingBookings", () => {
  it("returns 'Empty slot' for no bookings", () => {
    expect(summariseExistingBookings([], "09:00")).toBe("Empty slot");
  });

  it("summarises a single small dog", () => {
    const bookings = [makeBooking({ slot: "09:00", size: "small" })];
    expect(summariseExistingBookings(bookings, "09:00")).toBe(
      "1 small dog already in",
    );
  });

  it("summarises mixed sizes with the '+'-separator format", () => {
    const bookings = [
      makeBooking({ id: "b1", slot: "09:00", size: "small" }),
      makeBooking({ id: "b2", slot: "09:00", size: "medium" }),
    ];
    expect(summariseExistingBookings(bookings, "09:00")).toBe(
      "1 small + 1 medium already in",
    );
  });

  it("ignores bookings at other slots", () => {
    const bookings = [
      makeBooking({ id: "b1", slot: "09:00", size: "small" }),
      makeBooking({ id: "b2", slot: "10:00", size: "large" }),
    ];
    expect(summariseExistingBookings(bookings, "09:00")).toBe(
      "1 small dog already in",
    );
  });
});

describe("classifyProposedBooking", () => {
  it("asks for input when slot or size is missing", () => {
    const r1 = classifyProposedBooking({ bookings: [], slot: "", size: "small" });
    expect(r1.fits).toBe(false);
    expect(r1.summary).toContain("Pick a date");

    const r2 = classifyProposedBooking({ bookings: [], slot: "09:00", size: "" });
    expect(r2.fits).toBe(false);
    expect(r2.summary).toContain("Pick a date");
  });

  it("says 'fits — first booking of the day' for an empty slot", () => {
    const r = classifyProposedBooking({ bookings: [], slot: "09:30", size: "small" });
    expect(r.fits).toBe(true);
    expect(r.summary).toContain("Empty slot");
    expect(r.summary).toContain("Fits");
  });

  it("says 'fits the 2-2-1 rule' when adding to existing bookings", () => {
    const bookings = [makeBooking({ slot: "09:30", size: "small" })];
    const r = classifyProposedBooking({ bookings, slot: "09:30", size: "medium" });
    expect(r.fits).toBe(true);
    expect(r.summary).toContain("Adds to 1 small dog already in");
    expect(r.summary).toContain("Fits");
  });

  it("rejects when slot is full and surfaces the engine reason", () => {
    const bookings = [
      makeBooking({ id: "b1", slot: "09:30", size: "small" }),
      makeBooking({ id: "b2", slot: "09:30", size: "medium" }),
    ];
    const r = classifyProposedBooking({ bookings, slot: "09:30", size: "small" });
    expect(r.fits).toBe(false);
    expect(r.reason).toBeTruthy();
    expect(r.summary).toContain("1 small + 1 medium already in");
  });

  it("rejects large dog in a mid-morning no-rule slot with the engine's reason", () => {
    // 10:30 has no entry in LARGE_DOG_SLOTS so large dogs need approval there.
    const r = classifyProposedBooking({ bookings: [], slot: "10:30", size: "large" });
    expect(r.fits).toBe(false);
    expect(r.reason).toContain("approval");
    expect(r.needsApproval).toBe(true);
  });

  it("rejects a small dog when a large dog has taken over the slot", () => {
    // 12:30 is full-takeover for large dogs (canShare: false).
    const bookings = [makeBooking({ slot: "12:30", size: "large" })];
    const r = classifyProposedBooking({ bookings, slot: "12:30", size: "small" });
    expect(r.fits).toBe(false);
  });

  it("normalises non-array bookings input", () => {
    const r = classifyProposedBooking({ bookings: null, slot: "09:30", size: "small" });
    expect(r.fits).toBe(true);
    expect(r.existing).toEqual([]);
  });
});
