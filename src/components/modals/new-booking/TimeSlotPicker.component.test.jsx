// Pins the fix for the "blocked seat shown as available" bug: a seat staff
// blocked in day_settings.overrides must make the New Booking wizard render
// that slot as over-capacity (amber, overridable) rather than freely bookable.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TimeSlotPicker } from "./TimeSlotPicker.jsx";

const theme = { gradient: ["#0AA", "#077"], headerText: "#fff", light: "#EAF" };
const DATE = "2026-06-30";

// 10:30 holds one small dog; the second seat is the variable under test.
const bookingsByDate = {
  [DATE]: [{ slot: "10:30", size: "small", id: "b1", _dogId: "other" }],
};
const selectedDogs = [{ id: "dogA", size: "small", name: "Betsy" }];

function renderPicker(daySettings) {
  render(
    <TimeSlotPicker
      dateStr={DATE}
      bookingsByDate={bookingsByDate}
      daySettings={daySettings}
      selectedDogs={selectedDogs}
      onSelectSlot={vi.fn()}
      selectedSlot=""
      sizeTheme={theme}
    />,
  );
}

describe("TimeSlotPicker — staff-blocked seat", () => {
  it("renders 10:30 as bookable when the second seat is free", () => {
    renderPicker({ [DATE]: { overrides: {}, extraSlots: [] } });
    expect(screen.getByRole("button", { name: "10:30am" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /10:30am — over capacity/i }),
    ).not.toBeInTheDocument();
  });

  it("renders 10:30 as over-capacity (overridable) when the second seat is blocked", () => {
    renderPicker({ [DATE]: { overrides: { "10:30": { 1: "blocked" } }, extraSlots: [] } });
    expect(
      screen.getByRole("button", { name: /10:30am — over capacity, click to override/i }),
    ).toBeInTheDocument();
    // A free slot is unaffected — still a plain bookable button.
    expect(screen.getByRole("button", { name: "11:00am" })).toBeInTheDocument();
  });
});
