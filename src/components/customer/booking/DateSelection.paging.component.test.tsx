import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const availability = vi.hoisted(() => ({
  getOpenDays: vi.fn(),
  listRangeForCapacity: vi.fn(),
  listBlockedSeats: vi.fn(),
  listImmediateSlots: vi.fn(),
}));

vi.mock("../../../supabase/customerClient.js", () => ({ customerSupabase: {} }));
vi.mock("../../../supabase/rpc", () => ({ getOpenDays: availability.getOpenDays }));
vi.mock("../../../supabase/repositories/bookingsRepo", () => ({
  listRangeForCapacity: availability.listRangeForCapacity,
  listBlockedSeats: availability.listBlockedSeats,
  listImmediateSlots: availability.listImmediateSlots,
}));

import { DateSelection } from "./DateSelection";

function toDateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function customerDate(offset: number): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return date;
}

function ariaDate(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long",
  });
}

function nextMonday(): Date {
  for (let offset = 1; offset <= 7; offset += 1) {
    const date = customerDate(offset);
    if (date.getDay() === 1) return date;
  }
  throw new Error("A week must contain Monday");
}

function renderDateSelection(onSelect = vi.fn()) {
  return render(
    <DateSelection
      bookingHorizonDays={180}
      selectedDate={null}
      onSelect={onSelect}
      onNext={() => {}}
      onBack={() => {}}
    />,
  );
}

async function goToLastPage(user: ReturnType<typeof userEvent.setup>) {
  for (let page = 0; page < 6; page += 1) {
    await user.click(screen.getByRole("button", { name: "Next dates" }));
  }
}

describe("DateSelection horizon paging", () => {
  afterEach(() => {
    availability.getOpenDays.mockReset();
    availability.listRangeForCapacity.mockReset();
    availability.listBlockedSeats.mockReset();
    availability.listImmediateSlots.mockReset();
  });

  function arrangeAvailability() {
    availability.getOpenDays.mockResolvedValue({ data: [], error: null });
    availability.listRangeForCapacity.mockResolvedValue({ byDate: {}, error: null });
    availability.listBlockedSeats.mockResolvedValue({ byDate: {} });
    availability.listImmediateSlots.mockResolvedValue({ date: null, slots: [] });
  }

  it("renders and selects day 180 but never offers day 181", async () => {
    arrangeAvailability();
    const onSelect = vi.fn();
    const user = userEvent.setup();
    renderDateSelection(onSelect);

    await goToLastPage(user);
    const finalDay = customerDate(180);
    const dayAfterHorizon = customerDate(181);
    await screen.findByRole("button", { name: ariaDate(finalDay) });

    await user.click(screen.getByRole("button", { name: ariaDate(finalDay) }));
    expect(onSelect).toHaveBeenCalledWith(toDateStr(finalDay));
    expect(screen.queryByRole("button", { name: ariaDate(dayAfterHorizon) })).toBeNull();
  });

  it("shows the partial last page and disables Next", async () => {
    arrangeAvailability();
    const user = userEvent.setup();
    renderDateSelection();

    await goToLastPage(user);

    expect(await screen.findByText(/days 169–180 of 180/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next dates" })).toBeDisabled();
  });

  it("restores a visited page without refetching its availability", async () => {
    arrangeAvailability();
    const user = userEvent.setup();
    renderDateSelection();
    await screen.findByRole("button", { name: "Next dates" });

    await user.click(screen.getByRole("button", { name: "Next dates" }));
    await user.click(screen.getByRole("button", { name: "Previous dates" }));
    await user.click(screen.getByRole("button", { name: "Next dates" }));

    expect(availability.getOpenDays).toHaveBeenCalledTimes(2);
    expect(availability.listRangeForCapacity).toHaveBeenCalledTimes(2);
    expect(availability.listBlockedSeats).toHaveBeenCalledTimes(2);
    expect(availability.listImmediateSlots).toHaveBeenCalledTimes(1);
  });

  it("retries a previously degraded page when the customer returns to it", async () => {
    arrangeAvailability();
    availability.getOpenDays
      .mockResolvedValueOnce({ data: null, error: new Error("temporarily unavailable") })
      .mockResolvedValue({ data: [], error: null });
    const user = userEvent.setup();
    renderDateSelection();

    await waitFor(() => expect(screen.queryByText("Loading availability…")).toBeNull());
    await user.click(screen.getByRole("button", { name: "Next dates" }));
    await waitFor(() => expect(availability.getOpenDays).toHaveBeenCalledTimes(2));
    await user.click(screen.getByRole("button", { name: "Previous dates" }));

    await waitFor(() => expect(availability.getOpenDays).toHaveBeenCalledTimes(3));
  });

  it("keeps each page query within its customer-facing range", async () => {
    arrangeAvailability();
    const user = userEvent.setup();
    renderDateSelection();
    await screen.findByRole("button", { name: "Next dates" });

    await user.click(screen.getByRole("button", { name: "Next dates" }));
    await waitFor(() => expect(availability.getOpenDays).toHaveBeenCalledTimes(2));

    const ranges = availability.getOpenDays.mock.calls.map(([, params]) => params);
    expect(ranges).toEqual([
      { startDate: toDateStr(customerDate(0)), endDate: toDateStr(customerDate(28)) },
      { startDate: toDateStr(customerDate(29)), endDate: toDateStr(customerDate(56)) },
    ]);
  });

  it("keeps the selected date when the customer pages away and back", async () => {
    arrangeAvailability();
    const user = userEvent.setup();
    const selected = nextMonday();
    render(
      <DateSelection
        bookingHorizonDays={180}
        selectedDate={toDateStr(selected)}
        onSelect={() => {}}
        onNext={() => {}}
        onBack={() => {}}
      />,
    );
    await screen.findByRole("button", { name: ariaDate(selected) });

    await user.click(screen.getByRole("button", { name: "Next dates" }));
    await user.click(screen.getByRole("button", { name: "Previous dates" }));

    expect(await screen.findByRole("button", { name: ariaDate(selected) })).toHaveAttribute("aria-pressed", "true");
  });

  it("only offers Today — last minute on the first page", async () => {
    arrangeAvailability();
    availability.listImmediateSlots.mockResolvedValue({
      date: toDateStr(customerDate(0)),
      slots: ["10:00"],
    });
    const user = userEvent.setup();
    renderDateSelection();

    expect(await screen.findByText("Today — last minute")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next dates" }));

    await waitFor(() => expect(screen.queryByText("Today — last minute")).toBeNull());
  });

  it("uses closure, full-day and open-override data on a later page", async () => {
    const closed = customerDate(29);
    const full = customerDate(30);
    const explicitlyOpen = customerDate(31);
    availability.getOpenDays.mockResolvedValue({
      data: [
        { setting_date: toDateStr(closed), is_open: false },
        { setting_date: toDateStr(full), is_open: true },
        { setting_date: toDateStr(explicitlyOpen), is_open: true },
      ],
      error: null,
    });
    availability.listRangeForCapacity.mockResolvedValue({
      byDate: {
        [toDateStr(full)]: Array.from({ length: 14 }, () => ({ slot: "08:30", size: "small" })),
      },
      error: null,
    });
    availability.listBlockedSeats.mockResolvedValue({ byDate: {} });
    availability.listImmediateSlots.mockResolvedValue({ date: null, slots: [] });
    const user = userEvent.setup();
    render(
      <DateSelection
        bookingHorizonDays={180}
        selectedDogs={[{ dogId: "dog-1", name: "Alfie", size: "small" }]}
        selectedDate={null}
        onSelect={() => {}}
        onNext={() => {}}
        onBack={() => {}}
      />,
    );
    await screen.findByRole("button", { name: "Next dates" });

    await user.click(screen.getByRole("button", { name: "Next dates" }));

    expect(await screen.findByRole("button", { name: `${ariaDate(closed)}, closed` })).toBeDisabled();
    expect(screen.getByRole("button", { name: `${ariaDate(full)}, fully booked` })).toBeDisabled();
    expect(screen.getByRole("button", { name: ariaDate(explicitlyOpen) })).not.toBeDisabled();
  });
});
