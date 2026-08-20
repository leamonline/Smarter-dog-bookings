import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// findGroupedSlots deliberately returns every "all dogs in one slot" allocation
// before the ones that split the group across adjacent slots. That ranking is
// real, but nothing on screen conveys it — so a two-dog booking on a genuinely
// busy day rendered "12:30pm" above "12:00pm" under the "Afternoon drop-offs"
// heading, which reads as a fault rather than a preference.
//
// The engine's order is not ours to change: it is duplicated in the Deno edge
// functions and mirrored by the capacity trigger. So the fix sorts for display
// only, and this test pins that by handing the component a deliberately
// out-of-order result — no reliance on which real occupancy happens to produce
// a split allocation.

vi.mock("../../../supabase/customerClient", () => ({
  customerSupabase: { rpc: () => Promise.resolve({ data: [], error: null }) },
}));

vi.mock("../../../supabase/repositories/humansRepo", () => ({
  getBookingRules: () =>
    Promise.resolve({ preferredSlots: ["09:30", "08:30"], blockedSlots: [], depositRequired: false }),
}));

const allocation = (dropOffTime: string) => ({
  dropOffTime,
  groupId: `g-${dropOffTime}`,
  assignments: [{ dogId: "d1", slot: dropOffTime }],
});

// Same-slot options first, then the split ones — the engine's real shape.
vi.mock("../../../engine/capacity", () => ({
  findGroupedSlots: vi.fn(() => [
    allocation("11:30"),
    allocation("12:30"),
    allocation("12:00"),
    allocation("09:30"),
    allocation("08:30"),
  ]),
}));

import { SlotSelection } from "./SlotSelection";

const noop = () => {};
const twoSmallDogs = [
  { dogId: "d1", name: "Alfie", size: "small" as const },
  { dogId: "d2", name: "Tipi", size: "small" as const },
];

function futureDateStr(): string {
  const future = new Date();
  future.setDate(future.getDate() + 7);
  return `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, "0")}-${String(
    future.getDate(),
  ).padStart(2, "0")}`;
}

function minutesOf(label: string): number {
  const [, h, m, suffix] = label.match(/(\d{1,2}):(\d{2})(am|pm)/)!;
  const hour = suffix === "pm" && h !== "12" ? Number(h) + 12 : Number(h);
  return hour * 60 + Number(m);
}

describe("SlotSelection — drop-off times read in time order", () => {
  it("sorts each group chronologically, whatever order the engine returned", async () => {
    render(
      <SlotSelection
        selectedDogs={twoSmallDogs}
        selectedDate={futureDateStr()}
        slotAllocation={null}
        onSelect={noop}
        onNext={noop}
        onBack={noop}
        humanId="h1"
      />,
    );

    // Wait for a slot to appear before reading the order.
    expect(await screen.findByText("12:00pm")).toBeInTheDocument();

    const rendered = screen
      .getAllByRole("button")
      .map((b) => b.textContent?.match(/\d{1,2}:\d{2}(?:am|pm)/)?.[0])
      .filter((t): t is string => Boolean(t));

    // Two preferred (starred, shown first), then morning, then afternoon —
    // each group ascending, and 12:00pm now above 12:30pm.
    expect(rendered).toEqual(["8:30am", "9:30am", "11:30am", "12:00pm", "12:30pm"]);

    const afternoon = rendered.filter((t) => minutesOf(t) >= 12 * 60);
    expect(afternoon).toEqual([...afternoon].sort((a, b) => minutesOf(a) - minutesOf(b)));
  });
});
