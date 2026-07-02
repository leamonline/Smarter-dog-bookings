import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ToastProvider } from "../../contexts/ToastContext.jsx";
import { SalonProvider } from "../../contexts/SalonContext.tsx";
import { BOOKING_STATUS } from "../../constants/index";
import { SlotGrid } from "./SlotGrid.jsx";

const SLOTS = ["08:30", "09:00", "09:30"];

function renderGrid(currentDateStr, bookings = [], gridProps = {}) {
  return render(
    <ToastProvider>
      <SalonProvider
        dogs={{}}
        humans={{}}
        bookingsByDate={{}}
        daySettings={{}}
        dayOpenState={true}
        currentDateStr={currentDateStr}
        currentDateObj={new Date(currentDateStr)}
        onAdd={vi.fn()}
        onUpdate={vi.fn()}
        onRemove={vi.fn()}
        onUpdateDog={vi.fn()}
        onUpdateHuman={vi.fn()}
        onOpenHuman={vi.fn()}
        onOpenDog={vi.fn()}
      >
        <SlotGrid
          bookings={bookings}
          loading={false}
          activeSlots={SLOTS}
          onOpenNewBooking={vi.fn()}
          currentDateStr={currentDateStr}
          overrides={{}}
          {...gridProps}
        />
      </SalonProvider>
    </ToastProvider>,
  );
}

const sampleBooking = (overrides) => ({
  id: "b1",
  slot: "08:30",
  size: "small",
  service: "full-groom",
  status: BOOKING_STATUS.BOOKED,
  dogName: "Booked Dog",
  breed: "Cockapoo",
  owner: "Owner One",
  addons: [],
  pickupBy: "Owner One",
  payment: "Due at Pick-up",
  _dogId: "d1",
  ...overrides,
});

describe("SlotGrid — today-only Now indicator", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("marks the in-progress slot when viewing today during salon hours", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 5, 2, 9, 15)); // Tue 2 Jun 2026, 09:15 local
    renderGrid("2026-06-02");
    expect(screen.getByText("Now")).toBeInTheDocument();
  });

  it("does not mark any row when viewing a different date", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 5, 2, 9, 15));
    renderGrid("2026-06-03");
    expect(screen.queryByText("Now")).toBeNull();
  });

  it("does not mark a row outside salon hours, even on today", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 5, 2, 7, 0)); // before the first slot
    renderGrid("2026-06-02");
    expect(screen.queryByText("Now")).toBeNull();
  });
});

describe("SlotGrid — last-minute (immediate) slots", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the Last minute chip on a flagged slot when viewing today", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 5, 2, 8, 0)); // Tue 2 Jun 2026, 08:00 local
    renderGrid("2026-06-02", [], {
      immediateSlots: ["09:00"],
      onToggleImmediate: vi.fn(),
    });
    expect(screen.getByText("Last minute")).toBeInTheDocument();
  });

  it("shows no chip for the same flags when viewing another date", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 5, 2, 8, 0));
    renderGrid("2026-06-03", [], {
      immediateSlots: ["09:00"],
      onToggleImmediate: vi.fn(),
    });
    expect(screen.queryByText("Last minute")).toBeNull();
  });
});

describe("SlotGrid — cancelled bookings", () => {
  it("renders active bookings but not cancelled ones in the same slot", () => {
    renderGrid("2026-06-03", [
      sampleBooking({ id: "active", dogName: "Active Pup" }),
      sampleBooking({
        id: "cancelled",
        dogName: "Cancelled Pup",
        status: BOOKING_STATUS.CANCELLED,
      }),
    ]);
    expect(screen.getByText("Active Pup")).toBeInTheDocument();
    expect(screen.queryByText("Cancelled Pup")).toBeNull();
  });

  it("frees the seat — a slot holding only a cancelled booking shows no card", () => {
    renderGrid("2026-06-03", [
      sampleBooking({ id: "cancelled", dogName: "Cancelled Pup", status: BOOKING_STATUS.CANCELLED }),
    ]);
    expect(screen.queryByText("Cancelled Pup")).toBeNull();
  });
});
