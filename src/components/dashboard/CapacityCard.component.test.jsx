import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CapacityCard } from "./CapacityCard.jsx";
import { BOOKING_STATUS } from "../../constants/salon";

const MON = "2026-07-06"; // a Monday — open by default

describe("CapacityCard — day utilisation", () => {
  it("does not count cancelled bookings towards the day percentage", () => {
    // 7 live + 7 cancelled of a 14-dog cap: the day is half full, not 100%.
    const bookings = [
      ...Array.from({ length: 7 }, (_, i) => ({
        slot: "08:30",
        size: "small",
        status: BOOKING_STATUS.BOOKED,
        id: `live-${i}`,
      })),
      ...Array.from({ length: 7 }, (_, i) => ({
        slot: "09:00",
        size: "small",
        status: BOOKING_STATUS.CANCELLED,
        id: `gone-${i}`,
      })),
    ];
    render(
      <CapacityCard
        currentDateObj={new Date(2026, 6, 6)}
        dates={[]}
        bookingsByDate={{ [MON]: bookings }}
        dayOpenState={{ [MON]: true }}
        daySettings={{}}
        onSelectDate={vi.fn()}
      />,
    );
    expect(screen.getByText("50%")).toBeInTheDocument();
  });
});
