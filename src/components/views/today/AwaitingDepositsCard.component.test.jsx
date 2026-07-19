import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { AwaitingDepositsCard } from "./AwaitingDepositsCard.jsx";

const awaiting = {
  id: "b1",
  dogName: "Rex",
  status: "Booked",
  payment: "Due at Pick-up",
  depositRequired: true,
  depositReference: "SDG-7K3M",
  depositDueBy: "2026-07-14T18:00:00Z",
  depositReceivedAt: null,
  slot: "09:00",
};

describe("AwaitingDepositsCard", () => {
  it("lists awaiting bookings with time left", () => {
    render(
      <AwaitingDepositsCard
        bookings={[awaiting]}
        now={new Date("2026-07-14T16:00:00Z")}
        onOpenBooking={() => {}}
      />,
    );
    expect(screen.getByText(/awaiting deposit/i)).toBeInTheDocument();
    expect(screen.getByText(/Rex/)).toBeInTheDocument();
    expect(screen.getByText(/2h left/i)).toBeInTheDocument();
  });

  it("flags overdue rows ahead of the sweep", () => {
    render(
      <AwaitingDepositsCard
        bookings={[awaiting]}
        now={new Date("2026-07-14T19:00:00Z")}
        onOpenBooking={() => {}}
      />,
    );
    expect(screen.getByText(/overdue/i)).toBeInTheDocument();
  });

  it("renders nothing when none are awaiting", () => {
    const { container } = render(
      <AwaitingDepositsCard bookings={[]} now={new Date()} onOpenBooking={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
