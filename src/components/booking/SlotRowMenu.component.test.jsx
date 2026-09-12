import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
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

// "Block this timeslot" used to fire onBlockSeat(0) then onBlockSeat(1) as two
// separate mutations. Each one upserts the WHOLE day_settings row, so the two
// raced on the same primary key and the stale first payload (seat 0 only) could
// land last and reopen seat 1 — the slot came back half-blocked. Both seats must
// travel as ONE call so they become one write.
describe("SlotRowMenu — blocking a whole timeslot is one call", () => {
  it("asks for both seats in a single onBlockSeat call", () => {
    const onBlockSeat = vi.fn();
    openMenu({ onBlockSeat });
    fireEvent.click(screen.getByText("Block this timeslot"));
    expect(onBlockSeat).toHaveBeenCalledTimes(1);
    expect(onBlockSeat).toHaveBeenCalledWith([0, 1]);
  });

  it("still blocks a single seat with a bare index", () => {
    const onBlockSeat = vi.fn();
    openMenu({ onBlockSeat });
    fireEvent.click(screen.getByText("Block seat 2 only"));
    expect(onBlockSeat).toHaveBeenCalledTimes(1);
    expect(onBlockSeat).toHaveBeenCalledWith(1);
  });
});

// jsdom can't measure real layout (getBoundingClientRect/offsetHeight are 0),
// so these assert the placement WIRING + on-screen invariant, not pixels.
describe("SlotRowMenu — placement stays on-screen", () => {
  const MARGIN = 8;
  const rectAt = (top) => ({
    top,
    bottom: top + 20,
    left: 20,
    right: 84,
    width: 64,
    height: 20,
    x: 20,
    y: top,
    toJSON: () => {},
  });

  it("clamps a bottom-of-viewport slot so the menu isn't cut off", () => {
    const nearBottom = window.innerHeight - 8; // trigger almost at the fold
    const spy = vi
      .spyOn(Element.prototype, "getBoundingClientRect")
      .mockReturnValue(rectAt(nearBottom));
    try {
      openMenu({ isImmediate: false, onToggleImmediate: vi.fn() });
      const top = parseFloat(screen.getByRole("menu").style.top);
      expect(Number.isFinite(top)).toBe(true);
      expect(top).toBeGreaterThanOrEqual(MARGIN);
      expect(top).toBeLessThanOrEqual(window.innerHeight - MARGIN);
    } finally {
      spy.mockRestore();
    }
  });

  it("recomputes placement when the page scrolls while open", () => {
    let rect = rectAt(100);
    const spy = vi
      .spyOn(Element.prototype, "getBoundingClientRect")
      .mockImplementation(() => rect);
    try {
      openMenu({ isImmediate: false, onToggleImmediate: vi.fn() });
      const menu = screen.getByRole("menu");
      const before = menu.style.top;
      // Trigger moves down the page → the glued menu should follow.
      rect = rectAt(300);
      act(() => {
        window.dispatchEvent(new Event("scroll"));
      });
      expect(menu.style.top).not.toBe(before);
    } finally {
      spy.mockRestore();
    }
  });
});
