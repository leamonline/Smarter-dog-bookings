// Partial-day closures on the staff calendar.
//
// The grid collapses every slot a closure covers into ONE coral card. A
// booking that was already in the diary when those times were closed stays
// visible inside that card, hazard-framed, because nothing is moved or
// cancelled automatically — staff decide.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ToastProvider } from "../../contexts/ToastContext.jsx";
import { SalonProvider } from "../../contexts/SalonContext.tsx";
import { BOOKING_STATUS } from "../../constants/index";
import { SlotGrid } from "./SlotGrid.jsx";

const SLOTS = ["08:30", "09:00", "09:30", "10:00", "10:30"];
const DATE = "2026-09-21";

const closure = {
  id: "c1",
  from: "09:00",
  to: "10:30",
  reason: "doctor's appointment",
};

const booking = (over = {}) => ({
  id: "b1",
  slot: "09:30",
  dogName: "Bella",
  breed: "Cockapoo",
  owner: "Sam",
  size: "small",
  service: "Full Groom",
  status: BOOKING_STATUS.CONFIRMED,
  ...over,
});

function renderGrid(gridProps = {}) {
  return render(
    <ToastProvider>
      <SalonProvider
        dogs={{}}
        humans={{}}
        bookingsByDate={{}}
        daySettings={{}}
        dayOpenState={true}
        currentDateStr={DATE}
        currentDateObj={new Date(DATE)}
        onAdd={vi.fn()}
        onUpdate={vi.fn()}
        onRemove={vi.fn()}
        onUpdateDog={vi.fn()}
        onUpdateHuman={vi.fn()}
        onOpenHuman={vi.fn()}
        onOpenDog={vi.fn()}
      >
        <SlotGrid
          bookings={[]}
          loading={false}
          activeSlots={SLOTS}
          onOpenNewBooking={vi.fn()}
          currentDateStr={DATE}
          overrides={{}}
          immediateSlots={[]}
          closures={[closure]}
          {...gridProps}
        />
      </SalonProvider>
    </ToastProvider>,
  );
}

describe("SlotGrid — closure rows", () => {
  it("collapses the covered slots into exactly one coral card", () => {
    renderGrid();
    expect(screen.getAllByText("Closed for doctor's appointment")).toHaveLength(1);
  });

  it("shows the range and how many slots it covers", () => {
    renderGrid();
    expect(screen.getByText(/9:00 – 10:30/)).toBeInTheDocument();
    expect(screen.getByText(/3 slots/)).toBeInTheDocument();
  });

  it("keeps the covered times visible down the gutter", () => {
    renderGrid();
    for (const label of ["9:00", "9:30", "10:00"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it("still renders the slots outside the closure", () => {
    renderGrid();
    expect(screen.getByText("8:30")).toBeInTheDocument();
    expect(screen.getByText("10:30")).toBeInTheDocument();
  });

  it("does not offer a slot-actions menu for a covered time", () => {
    renderGrid();
    expect(screen.queryByRole("button", { name: /9:30 — open slot actions/ })).toBeNull();
    expect(
      screen.getByRole("button", { name: /10:30 — open slot actions/ }),
    ).toBeInTheDocument();
  });
});

describe("SlotGrid — bookings caught inside a closure", () => {
  it("flags a booking sitting in the closed range", () => {
    renderGrid({ bookings: [booking()] });
    expect(screen.getByText("NEEDS ATTENTION")).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Needs attention: booked during a closure" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Bella")).toBeInTheDocument();
  });

  it("flags every booking in the range, not just the first", () => {
    renderGrid({
      bookings: [booking(), booking({ id: "b2", slot: "10:00", dogName: "Milo" })],
    });
    expect(screen.getAllByText("NEEDS ATTENTION")).toHaveLength(2);
  });

  it("leaves a booking outside the range alone", () => {
    renderGrid({ bookings: [booking({ slot: "10:30" })] });
    expect(screen.queryByText("NEEDS ATTENTION")).toBeNull();
    expect(screen.getByText("Bella")).toBeInTheDocument();
  });

  it("ignores a cancelled booking inside the range", () => {
    renderGrid({ bookings: [booking({ status: BOOKING_STATUS.CANCELLED })] });
    expect(screen.queryByText("NEEDS ATTENTION")).toBeNull();
  });
});

describe("SlotGrid — without closures", () => {
  it("renders the plain grid, unchanged", () => {
    renderGrid({ closures: [] });
    expect(screen.queryByText(/Closed for/)).toBeNull();
    expect(screen.getByText("9:00")).toBeInTheDocument();
    expect(screen.getByText("9:30")).toBeInTheDocument();
  });

  it("renders the plain grid when the prop is omitted entirely", () => {
    renderGrid({ closures: undefined });
    expect(screen.queryByText(/Closed for/)).toBeNull();
    expect(
      screen.getByRole("button", { name: /9:00 — open slot actions/ }),
    ).toBeInTheDocument();
  });
});
