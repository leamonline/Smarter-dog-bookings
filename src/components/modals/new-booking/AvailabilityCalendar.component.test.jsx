// Calendar accessibility + touch targets (audit friction C-5/C-7). The month
// prev/next controls were unlabelled 30px buttons (below the 44px touch minimum
// and silent to screen readers), and day buttons announced only a bare number
// with no open/closed/full/past context. This pins the accessible names.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AvailabilityCalendar } from "./AvailabilityCalendar.jsx";

const theme = { gradient: ["#0AA", "#077"], headerText: "#fff", light: "#EAF" };

function renderCal(overrides = {}) {
  render(
    <AvailabilityCalendar
      bookingsByDate={{}}
      dayOpenState={{}}
      daySettings={{}}
      onSelectDate={vi.fn()}
      selectedDateStr=""
      sizeTheme={theme}
      {...overrides}
    />,
  );
}

describe("AvailabilityCalendar — a11y", () => {
  it("labels the previous/next month controls", () => {
    renderCal();
    expect(screen.getByRole("button", { name: /previous month/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /next month/i })).toBeInTheDocument();
  });

  it("gives each day an accessible date label, not just a number", () => {
    renderCal();
    // Day 15 is always in the viewed month; its name should read like a date.
    expect(screen.getByRole("button", { name: /15 \w+ \d{4}/ })).toBeInTheDocument();
  });

  it("shows a legend mapping the day colours (closed vs fully booked were identical)", () => {
    renderCal();
    expect(screen.getByText("Available")).toBeInTheDocument();
    expect(screen.getByText("Fully booked")).toBeInTheDocument();
    expect(screen.getByText("Closed")).toBeInTheDocument();
  });
});
