import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// Empty occupancy + no blocked seats; get_immediate_slots controllable per
// test. The factory is hoisted, so shared state must be hoisted too.
const immediateRows = vi.hoisted(() => ({
  rows: [] as Array<{ setting_date: string; slot: string }>,
}));

vi.mock("../../../supabase/customerClient.js", () => ({
  customerSupabase: {
    rpc: (name: string) => {
      if (name === "get_immediate_slots") {
        return Promise.resolve({ data: immediateRows.rows, error: null });
      }
      return Promise.resolve({ data: [], error: null });
    },
  },
}));

import { SlotSelection } from "./SlotSelection";

const noop = () => {};
const oneSmallDog = [{ dogId: "d1", name: "Alfie", size: "small" as const }];

function localTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

describe("SlotSelection — same-day (last minute) filtering", () => {
  it("shows only the flagged slots when the selected date is today", async () => {
    immediateRows.rows = [{ setting_date: localTodayStr(), slot: "10:00" }];
    render(
      <SlotSelection
        selectedDogs={oneSmallDog}
        selectedDate={localTodayStr()}
        slotAllocation={null}
        onSelect={noop}
        onNext={noop}
        onBack={noop}
      />,
    );

    expect(await screen.findByText("10:00am")).toBeInTheDocument();
    // An empty day would normally offer the whole grid — today it must not.
    expect(screen.queryByText("8:30am")).toBeNull();
    expect(screen.queryByText("9:00am")).toBeNull();
    expect(
      screen.getByText(/today's last-minute times — bookable up to 30 minutes/i),
    ).toBeInTheDocument();
  });

  it("fails closed with the last-minute empty state when nothing is flagged today", async () => {
    immediateRows.rows = [];
    render(
      <SlotSelection
        selectedDogs={oneSmallDog}
        selectedDate={localTodayStr()}
        slotAllocation={null}
        onSelect={noop}
        onNext={noop}
        onBack={noop}
      />,
    );

    expect(
      await screen.findByText(/today's last-minute times have gone/i),
    ).toBeInTheDocument();
    // No waitlist nudge for a lapsed last-minute day.
    expect(screen.queryByText(/join the waitlist/i)).toBeNull();
  });

  it("leaves future dates unfiltered", async () => {
    immediateRows.rows = [{ setting_date: localTodayStr(), slot: "10:00" }];
    const future = new Date();
    future.setDate(future.getDate() + 7);
    const futureStr = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, "0")}-${String(
      future.getDate(),
    ).padStart(2, "0")}`;
    render(
      <SlotSelection
        selectedDogs={oneSmallDog}
        selectedDate={futureStr}
        slotAllocation={null}
        onSelect={noop}
        onNext={noop}
        onBack={noop}
      />,
    );

    // The whole (empty) grid is on offer, morning and afternoon alike.
    expect(await screen.findByText("8:30am")).toBeInTheDocument();
    expect(screen.getByText("12:30pm")).toBeInTheDocument();
  });
});
