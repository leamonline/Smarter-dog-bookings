import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SlotRowMenu } from "./SlotRowMenu.jsx";

const FREE_SEATS = [
  { type: "available", seatIndex: 0 },
  { type: "available", seatIndex: 1 },
];

function openMenu(props = {}) {
  render(
    <SlotRowMenu
      slot="09:00"
      seatStates={FREE_SEATS}
      onBlockSeat={vi.fn()}
      disabled={false}
      hasBooking={false}
      onOpenBooking={vi.fn()}
      {...props}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /open slot actions/i }));
}

describe("SlotRowMenu — Open for immediate booking", () => {
  it("offers the option when the parent passes onToggleImmediate", () => {
    openMenu({ isImmediate: false, onToggleImmediate: vi.fn() });
    expect(screen.getByText("Open for immediate booking")).toBeInTheDocument();
  });

  it("hides the option when the parent withholds the callback (other days / past cutoff)", () => {
    openMenu();
    expect(screen.queryByText("Open for immediate booking")).toBeNull();
    expect(screen.queryByText("Remove immediate booking")).toBeNull();
  });

  it("flips to Remove immediate booking on a flagged slot", () => {
    openMenu({ isImmediate: true, onToggleImmediate: vi.fn() });
    expect(screen.getByText("Remove immediate booking")).toBeInTheDocument();
    expect(screen.queryByText("Open for immediate booking")).toBeNull();
  });

  it("fires the toggle and closes the menu on click", () => {
    const onToggleImmediate = vi.fn();
    openMenu({ isImmediate: false, onToggleImmediate });
    fireEvent.click(screen.getByText("Open for immediate booking"));
    expect(onToggleImmediate).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Open for immediate booking")).toBeNull();
  });

  it("still offers un-flagging when the slot has filled (no free seats)", () => {
    const booked = [
      { type: "booking", seatIndex: 0, booking: { id: "b1" } },
      { type: "booking", seatIndex: 1, booking: { id: "b2" } },
    ];
    render(
      <SlotRowMenu
        slot="09:00"
        seatStates={booked}
        onBlockSeat={vi.fn()}
        disabled={false}
        hasBooking={true}
        onOpenBooking={vi.fn()}
        isImmediate={true}
        onToggleImmediate={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /open slot actions/i }));
    expect(screen.getByText("Remove immediate booking")).toBeInTheDocument();
  });

  it("keeps the existing block options alongside the new item", () => {
    openMenu({ isImmediate: false, onToggleImmediate: vi.fn() });
    expect(screen.getByText("Block this timeslot")).toBeInTheDocument();
    expect(screen.getByText("Block seat 1 only")).toBeInTheDocument();
    expect(screen.getByText("Block seat 2 only")).toBeInTheDocument();
  });
});
