import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  listForHuman: vi.fn(),
}));

vi.mock("../../../supabase/customerClient.js", () => ({
  customerSupabase: { rpc: mocks.rpc },
}));

vi.mock("../../../hooks/useDraftPersistence.js", () => ({
  useDraftPersistence: () => ({
    restored: {
      step: 3,
      selectedDogs: [{ dogId: "dog-1", name: "Alfie", size: "small" }],
      services: { "dog-1": "full-groom" },
      selectedDate: null,
      slotAllocation: null,
    },
    save: vi.fn(),
    clear: vi.fn(),
  }),
}));

vi.mock("../../../supabase/repositories/dogsRepo", () => ({
  listForHuman: mocks.listForHuman,
}));

import { BookingWizard } from "./BookingWizard";

describe("BookingWizard customer booking horizon", () => {
  it("passes the production 180-day rules response to the calendar with one RPC", async () => {
    mocks.rpc.mockImplementation((name: string) => Promise.resolve({
      data: name === "current_customer_booking_rules" ? { bookingHorizonDays: 180 } : [],
      error: null,
    }));
    mocks.listForHuman.mockResolvedValue({ dogs: [], error: null });

    render(
      <MemoryRouter initialEntries={["/customer/book"]}>
        <BookingWizard
          humanRecord={{ id: "human-1", name: "Alex", surname: "Taylor" }}
          onComplete={() => {}}
          onCancel={() => {}}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/days 1–28 of 180/i)).toBeInTheDocument();
    expect(mocks.rpc.mock.calls.filter(([name]) => name === "current_customer_booking_rules")).toHaveLength(1);
  });
});
