import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

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

vi.mock("../../../supabase/repositories/humansRepo", () => ({
  getBookingRules: vi.fn().mockResolvedValue(null),
}));

import { BookingWizard } from "./BookingWizard";

function customerDate(offset: number): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return date;
}

function toDateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function ariaDate(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long",
  });
}

function arrangeRpc() {
  const laterDate = customerDate(29);
  mocks.rpc.mockImplementation((name: string) => Promise.resolve({
    data:
      name === "current_customer_booking_rules"
        ? { bookingHorizonDays: 180 }
        : name === "get_open_days"
          ? [{ setting_date: toDateStr(laterDate), is_open: true }]
          : [],
    error: null,
  }));
  mocks.listForHuman.mockResolvedValue({ dogs: [], error: null });
}

describe("BookingWizard customer booking horizon", () => {
  afterEach(() => {
    mocks.rpc.mockReset();
    mocks.listForHuman.mockReset();
  });

  it("passes the production 180-day rules response to the calendar with one RPC", async () => {
    arrangeRpc();

    render(
      <MemoryRouter initialEntries={["/customer/book"]}>
        <BookingWizard
          humanRecord={{ id: "human-1", name: "Alex", surname: "Taylor" }}
          onComplete={() => {}}
          onCancel={() => {}}
        />
      </MemoryRouter>,
    );

    const range = await screen.findByText(/days 1–28.*six months ahead/i);
    expect(range).not.toHaveTextContent(/of 180|180 days/i);
    expect(mocks.rpc.mock.calls.filter(([name]) => name === "current_customer_booking_rules")).toHaveLength(1);
  });

  it("restores a later page and selected date after Continue and Back without refetching the page", async () => {
    arrangeRpc();
    const user = userEvent.setup();
    const laterDate = customerDate(29);

    render(
      <MemoryRouter initialEntries={["/customer/book"]}>
        <BookingWizard
          humanRecord={{ id: "human-1", name: "Alex", surname: "Taylor" }}
          onComplete={() => {}}
          onCancel={() => {}}
        />
      </MemoryRouter>,
    );

    await screen.findByText(/days 1–28.*six months ahead/i);
    await user.click(screen.getByRole("button", { name: "Next dates" }));
    const laterDateButton = await screen.findByRole("button", { name: ariaDate(laterDate) });
    await user.click(laterDateButton);
    await user.click(screen.getByRole("button", { name: /continue/i }));
    await screen.findByText("Choose a drop-off time.");
    await user.click(screen.getByRole("button", { name: "Back" }));

    expect(await screen.findByText(/days 29–56.*six months ahead/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: ariaDate(laterDate) })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => {
      expect(mocks.rpc.mock.calls.filter(([name]) => name === "get_open_days")).toHaveLength(2);
      expect(mocks.rpc.mock.calls.filter(([name]) => name === "get_occupancy_range")).toHaveLength(2);
    });
  });
});
