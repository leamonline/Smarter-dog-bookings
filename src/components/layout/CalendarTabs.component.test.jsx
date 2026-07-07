import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CalendarTabs } from "./CalendarTabs.jsx";
import { BOOKING_STATUS } from "../../constants/salon";

// jsdom has no scrollIntoView; the tablist auto-scrolls the active tab.
window.HTMLElement.prototype.scrollIntoView = vi.fn();

const MON = "2026-07-06"; // a Monday — open by default
const dates = [{ dateStr: MON, dateObj: new Date(2026, 6, 6) }];

function renderTabs(bookings) {
  return render(
    <CalendarTabs
      dates={dates}
      selectedDay={0}
      onSelectDay={vi.fn()}
      bookingsByDate={{ [MON]: bookings }}
      dayOpenState={{ [MON]: true }}
      calendarMode="day"
    />,
  );
}

describe("CalendarTabs — day pill dog count", () => {
  it("does not count cancelled bookings", () => {
    renderTabs([
      { status: BOOKING_STATUS.BOOKED },
      { status: BOOKING_STATUS.COMPLETED },
      { status: BOOKING_STATUS.CANCELLED },
    ]);
    expect(screen.getByRole("tab", { name: /2 dogs/ })).toBeInTheDocument();
  });

  it("shows the empty marker when every booking on the day is cancelled", () => {
    renderTabs([{ status: BOOKING_STATUS.CANCELLED }]);
    expect(screen.getByRole("tab", { name: /0 dogs/ })).toBeInTheDocument();
  });
});
