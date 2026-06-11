import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BookingGridControls } from "./BookingGridControls.jsx";

function renderControls(props = {}) {
  return render(
    <BookingGridControls
      bookingCount={8}
      isOpen
      onOpenDaySettings={vi.fn()}
      {...props}
    />,
  );
}

describe("BookingGridControls — wordless capacity signal", () => {
  it("shows a count/cap figure for an open day", () => {
    renderControls({ bookingCount: 8 });
    expect(screen.getByText("8/14")).toBeInTheDocument();
  });

  it("signals an over-booked day numerically, never with the word 'over'", () => {
    renderControls({ bookingCount: 16 });
    expect(screen.getByText("16/14")).toBeInTheDocument();
    // The capacity story is carried by colour + number, not a shouty label.
    expect(screen.queryByText(/\bover\b/i)).toBeNull();
  });
});
