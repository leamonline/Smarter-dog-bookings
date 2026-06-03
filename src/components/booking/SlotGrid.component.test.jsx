import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ToastProvider } from "../../contexts/ToastContext.jsx";
import { SlotGrid } from "./SlotGrid.jsx";

const SLOTS = ["08:30", "09:00", "09:30"];

function renderGrid(currentDateStr) {
  return render(
    <ToastProvider>
      <SlotGrid
        bookings={[]}
        loading={false}
        activeSlots={SLOTS}
        onOpenNewBooking={vi.fn()}
        currentDateStr={currentDateStr}
        overrides={{}}
      />
    </ToastProvider>,
  );
}

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
