import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// Mock the customer Supabase client so the date step loads:
//  - every day in the 28-day window OPEN, and
//  - 14 dogs (the daily cap) on "tomorrow", so a 15th can't fit there.
// The factory is hoisted, so it computes the window itself rather than
// capturing outer scope.
vi.mock("../../../supabase/customerClient.js", () => {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  const tom = new Date(t);
  tom.setDate(t.getDate() + 1);
  const toStr = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;
  const days: Date[] = [];
  for (let i = 0; i < 28; i++) {
    const d = new Date(tom);
    d.setDate(tom.getDate() + i);
    days.push(d);
  }
  const fullDate = toStr(tom);
  return {
    customerSupabase: {
      rpc: (name: string) => {
        if (name === "get_open_days") {
          return Promise.resolve({
            data: days.map((d) => ({ setting_date: toStr(d), is_open: true })),
            error: null,
          });
        }
        if (name === "get_occupancy_range") {
          // 14 non-cancelled dogs on `tomorrow` → the daily cap (14) is hit,
          // so findGroupedSlots returns no options and the day is "full".
          return Promise.resolve({
            data: Array.from({ length: 14 }, () => ({
              booking_date: fullDate,
              slot: "08:30",
              size: "small",
            })),
            error: null,
          });
        }
        return Promise.resolve({ data: [], error: null });
      },
    },
  };
});

import { DateSelection } from "./DateSelection";

describe("DateSelection dims fully-booked days", () => {
  const noop = () => {};
  const oneSmallDog = [{ dogId: "d1", name: "Alfie", size: "small" as const }];

  it("makes a day at the daily cap unselectable, leaving others open", async () => {
    render(
      <DateSelection
        selectedDogs={oneSmallDog}
        selectedDate={null}
        onSelect={noop}
        onNext={noop}
        onBack={noop}
      />,
    );

    // Once occupancy loads, the full day is labelled and disabled — the
    // customer can't pick it and dead-end at "Confirm".
    const fullBtn = await screen.findByLabelText(/fully booked/i);
    expect(fullBtn).toBeDisabled();

    // Exactly one full day in this fixture.
    expect(screen.getAllByLabelText(/fully booked/i)).toHaveLength(1);

    // Other open days remain selectable.
    const openSelectable = screen
      .getAllByRole("button")
      .filter(
        (b) =>
          b.classList.contains("wizard-day") &&
          !(b as HTMLButtonElement).disabled,
      );
    expect(openSelectable.length).toBeGreaterThan(0);
  });
});
