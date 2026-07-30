import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// Mock the customer client: every day open, no occupancy, and
// get_immediate_slots controllable per test via the shared holder below.
// The factory is hoisted, so state it can read must be hoisted too.
const immediateRows = vi.hoisted(() => ({
  rows: [] as Array<{ setting_date: string; slot: string }>,
}));

vi.mock("../../../supabase/customerClient", () => {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  const toStr = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;
  const days: Date[] = [];
  for (let i = 0; i < 29; i++) {
    const d = new Date(t);
    d.setDate(t.getDate() + i);
    days.push(d);
  }
  return {
    customerSupabase: {
      rpc: (name: string) => {
        if (name === "get_open_days") {
          return Promise.resolve({
            data: days.map((d) => ({ setting_date: toStr(d), is_open: true })),
            error: null,
          });
        }
        if (name === "get_immediate_slots") {
          return Promise.resolve({ data: immediateRows.rows, error: null });
        }
        return Promise.resolve({ data: [], error: null });
      },
    },
  };
});

import { DateSelection } from "./DateSelection";

const noop = () => {};
const oneSmallDog = [{ dogId: "d1", name: "Alfie", size: "small" as const }];

function localTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

describe("DateSelection — Today (last minute) option", () => {
  it("offers Today when the server has flagged bookable slots", async () => {
    immediateRows.rows = [{ setting_date: localTodayStr(), slot: "10:00" }];
    const onSelect = vi.fn();
    render(
      <DateSelection
        selectedDogs={oneSmallDog}
        selectedDate={null}
        onSelect={onSelect}
        onNext={noop}
        onBack={noop}
      />,
    );

    const todayBtn = await screen.findByText("Today — last minute");
    todayBtn.closest("button")!.click();
    expect(onSelect).toHaveBeenCalledWith(localTodayStr());
  });

  it("shows no Today option when nothing is flagged", async () => {
    immediateRows.rows = [];
    render(
      <DateSelection
        selectedDogs={oneSmallDog}
        selectedDate={null}
        onSelect={noop}
        onNext={noop}
        onBack={noop}
      />,
    );

    // Wait for the calendar to finish loading, then assert absence.
    await screen.findByText(/pick a date/i);
    expect(await screen.findAllByRole("button")).not.toHaveLength(0);
    expect(screen.queryByText("Today — last minute")).toBeNull();
  });
});
