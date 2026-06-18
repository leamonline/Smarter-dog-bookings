// The at-a-glance "Bookings" lifetime count must reflect only this human's
// own grooms. It used to match by dog name / owner name, so another owner's
// same-named dog inflated the count — these pin the id-based matching.
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AtAGlanceStrip } from "./AtAGlanceStrip.jsx";

const HUMAN = { id: "h1", fullName: "Hazel Wagschal" };

function renderStrip(overrides = {}) {
  const props = {
    human: HUMAN,
    dogs: {},
    dogsByHumanId: { h1: [{ id: "daisy-1", name: "Daisy" }] },
    bookingsByDate: {},
    ...overrides,
  };
  return render(<AtAGlanceStrip {...props} />);
}

describe("AtAGlanceStrip lifetime bookings count", () => {
  it("counts only the human's own grooms, not a same-named other dog", () => {
    renderStrip({
      bookingsByDate: {
        "2026-05-01": [
          // Hers — matched by dog id (daisy-1 is in dogsByHumanId).
          { id: "mine", dogName: "Daisy", status: "Booked", _dogId: "daisy-1" },
          // Someone else's Daisy — must be ignored.
          { id: "theirs", dogName: "Daisy", status: "Booked", _dogId: "daisy-2", _ownerId: "other", owner: "Someone Else" },
        ],
      },
    });

    expect(screen.getByLabelText("See all bookings (1 lifetime)")).toBeTruthy();
  });

  it("also matches a booking by owner id", () => {
    renderStrip({
      dogsByHumanId: {},
      bookingsByDate: {
        "2026-05-02": [
          { id: "byowner", dogName: "Daisy", status: "Booked", _ownerId: "h1" },
        ],
      },
    });

    expect(screen.getByLabelText("See all bookings (1 lifetime)")).toBeTruthy();
  });
});
