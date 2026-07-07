import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { WeekOverviewCard } from "./WeekOverviewCard.jsx";
import { BOOKING_STATUS } from "../../constants/salon";

// jsdom has no scrollIntoView; the card auto-scrolls the active tab.
window.HTMLElement.prototype.scrollIntoView = vi.fn();

const MON = "2026-07-06"; // a Monday — open by default
const dates = [{ dateStr: MON, dateObj: new Date(2026, 6, 6) }];

describe("WeekOverviewCard — day pill dog count", () => {
  it("does not count cancelled bookings", () => {
    render(
      <WeekOverviewCard
        dates={dates}
        selectedDay={0}
        onSelectDay={vi.fn()}
        bookingsByDate={{
          [MON]: [
            { status: BOOKING_STATUS.BOOKED },
            { status: BOOKING_STATUS.CANCELLED },
          ],
        }}
        dayOpenState={{ [MON]: true }}
      />,
    );
    expect(screen.getByRole("tab", { name: /1 dogs/ })).toBeInTheDocument();
  });
});
