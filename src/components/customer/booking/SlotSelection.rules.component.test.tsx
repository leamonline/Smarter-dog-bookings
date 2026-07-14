import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// Empty occupancy + no blocked seats + no immediate slots: the whole grid is
// on offer for a future date, so the per-human rules are the only filter.
vi.mock("../../../supabase/customerClient.js", () => ({
  customerSupabase: {
    rpc: () => Promise.resolve({ data: [], error: null }),
  },
}));

const rules = vi.hoisted(() => ({
  value: null as null | {
    preferredSlots: string[];
    blockedSlots: string[];
    depositRequired: boolean;
  },
}));

vi.mock("../../../supabase/repositories/humansRepo", () => ({
  getBookingRules: () => Promise.resolve(rules.value),
}));

import { SlotSelection } from "./SlotSelection";

const noop = () => {};
const oneSmallDog = [{ dogId: "d1", name: "Alfie", size: "small" as const }];

function futureDateStr(): string {
  const future = new Date();
  future.setDate(future.getDate() + 7);
  return `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, "0")}-${String(
    future.getDate(),
  ).padStart(2, "0")}`;
}

describe("SlotSelection — per-human booking rules", () => {
  it("hides blocked slots and stars preferred ones first", async () => {
    rules.value = {
      preferredSlots: ["09:00"],
      blockedSlots: ["10:00"],
      depositRequired: false,
    };
    render(
      <SlotSelection
        selectedDogs={oneSmallDog}
        selectedDate={futureDateStr()}
        slotAllocation={null}
        onSelect={noop}
        onNext={noop}
        onBack={noop}
        humanId="h1"
      />,
    );

    expect(await screen.findByText(/your usual time/i)).toBeInTheDocument();
    expect(screen.getByText("9:00am")).toBeInTheDocument();
    // 10:00 is blocked for this customer — not offered at all.
    expect(screen.queryByText("10:00am")).toBeNull();
    // The rest of the grid still renders normally.
    expect(screen.getByText("8:30am")).toBeInTheDocument();
  });

  it("renders the plain grid when the human has no rules", async () => {
    rules.value = null;
    render(
      <SlotSelection
        selectedDogs={oneSmallDog}
        selectedDate={futureDateStr()}
        slotAllocation={null}
        onSelect={noop}
        onNext={noop}
        onBack={noop}
        humanId="h1"
      />,
    );

    expect(await screen.findByText("8:30am")).toBeInTheDocument();
    expect(screen.getByText("10:00am")).toBeInTheDocument();
    expect(screen.queryByText(/your usual time/i)).toBeNull();
  });
});
