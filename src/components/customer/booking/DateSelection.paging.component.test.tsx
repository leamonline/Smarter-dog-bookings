import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const availability = vi.hoisted(() => ({
  getOpenDays: vi.fn(),
  listRangeForCapacity: vi.fn(),
  listBlockedSeats: vi.fn(),
  listImmediateSlots: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("../../../supabase/customerClient.js", () => ({ customerSupabase: {} }));
vi.mock("../../../supabase/rpc", () => ({ getOpenDays: availability.getOpenDays }));
vi.mock("../../../supabase/repositories/bookingsRepo", () => ({
  listRangeForCapacity: availability.listRangeForCapacity,
  listBlockedSeats: availability.listBlockedSeats,
  listImmediateSlots: availability.listImmediateSlots,
}));
vi.mock("../../../lib/logger", () => ({
  logger: { error: availability.logError, warn: vi.fn(), info: vi.fn() },
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

function firstMondayBetween(startOffset: number, endOffset: number): Date {
  for (let offset = startOffset; offset <= endOffset; offset += 1) {
    const date = customerDate(offset);
    if (date.getDay() === 1) return date;
  }
  throw new Error("The range must contain a Monday");
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
    availability.logError.mockReset();
    vi.useRealTimers();
  });

  function arrangeAvailability() {
    availability.getOpenDays.mockResolvedValue({ data: [], error: null });
    availability.listRangeForCapacity.mockResolvedValue({ byDate: {}, error: null });
    availability.listBlockedSeats.mockResolvedValue({ byDate: {}, error: null });
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

    const range = await screen.findByText(/days 169–180.*six months ahead/i);
    expect(range).not.toHaveTextContent(/of 180|180 days/i);
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
    expect(availability.listBlockedSeats).toHaveBeenCalledTimes(5);
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

  it("uses the exact page range for open-day and occupancy reads and chunks blocked seats to at most 14 dates", async () => {
    arrangeAvailability();
    const user = userEvent.setup();
    renderDateSelection();
    await screen.findByRole("button", { name: "Next dates" });

    await user.click(screen.getByRole("button", { name: "Next dates" }));
    await waitFor(() => expect(availability.getOpenDays).toHaveBeenCalledTimes(2));

    const openRanges = availability.getOpenDays.mock.calls.map(([, params]) => params);
    expect(openRanges).toEqual([
      { startDate: toDateStr(customerDate(0)), endDate: toDateStr(customerDate(28)) },
      { startDate: toDateStr(customerDate(29)), endDate: toDateStr(customerDate(56)) },
    ]);
    expect(availability.listRangeForCapacity.mock.calls.map(([, start, end]) => ({ start, end }))).toEqual([
      { start: toDateStr(customerDate(0)), end: toDateStr(customerDate(28)) },
      { start: toDateStr(customerDate(29)), end: toDateStr(customerDate(56)) },
    ]);
    expect(availability.listBlockedSeats.mock.calls.map(([, start, end]) => ({ start, end }))).toEqual([
      { start: toDateStr(customerDate(0)), end: toDateStr(customerDate(13)) },
      { start: toDateStr(customerDate(14)), end: toDateStr(customerDate(27)) },
      { start: toDateStr(customerDate(28)), end: toDateStr(customerDate(28)) },
      { start: toDateStr(customerDate(29)), end: toDateStr(customerDate(42)) },
      { start: toDateStr(customerDate(43)), end: toDateStr(customerDate(56)) },
    ]);
  });

  it("merges blocked-seat chunks before evaluating dates", async () => {
    const blockedSlots = Object.fromEntries(
      ["08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00"]
        .map((slot) => [slot, { 0: "blocked", 1: "blocked" }]),
    );
    const dates = [customerDate(1), customerDate(15), customerDate(28)];
    availability.getOpenDays.mockResolvedValue({
      data: dates.map((date) => ({ setting_date: toDateStr(date), is_open: true })),
      error: null,
    });
    availability.listRangeForCapacity.mockResolvedValue({ byDate: {}, error: null });
    availability.listBlockedSeats.mockImplementation(
      async (_client: unknown, start: string, end: string) => ({
        byDate: Object.fromEntries(
          dates
            .filter((date) => toDateStr(date) >= start && toDateStr(date) <= end)
            .map((date) => [toDateStr(date), blockedSlots]),
        ),
        error: null,
      }),
    );
    availability.listImmediateSlots.mockResolvedValue({ date: null, slots: [] });

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

    for (const date of dates) {
      expect(await screen.findByRole("button", { name: `${ariaDate(date)}, fully booked` })).toBeDisabled();
    }
  });

  it("does not cache a page when one blocked-seat chunk fails and retries it on revisit", async () => {
    arrangeAvailability();
    const failedStart = toDateStr(customerDate(14));
    let failChunk = true;
    availability.listBlockedSeats.mockImplementation(
      async (_client: unknown, start: string) => {
        if (start === failedStart && failChunk) {
          failChunk = false;
          return { byDate: {}, error: new Error("blocked seats unavailable") };
        }
        return { byDate: {}, error: null };
      },
    );
    const user = userEvent.setup();
    renderDateSelection();

    expect(await screen.findByRole("status")).toHaveTextContent(/preview.*incomplete.*next step/i);
    await user.click(screen.getByRole("button", { name: "Next dates" }));
    await waitFor(() => expect(availability.getOpenDays).toHaveBeenCalledTimes(2));
    await user.click(screen.getByRole("button", { name: "Previous dates" }));

    await waitFor(() => expect(availability.getOpenDays).toHaveBeenCalledTimes(3));
    expect(
      availability.listBlockedSeats.mock.calls.filter(([, start]) => start === failedStart),
    ).toHaveLength(2);
    expect(availability.logError).toHaveBeenCalledWith(
      "Failed to fetch blocked seats",
      expect.any(Error),
      { tags: { component: "DateSelection", op: "get_blocked_seats" } },
    );
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
    availability.listBlockedSeats.mockResolvedValue({ byDate: {}, error: null });
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

  it.each([
    {
      source: "open-day",
      arrangeFailure: () => availability.getOpenDays.mockResolvedValue({ data: null, error: new Error("open-day failure") }),
    },
    {
      source: "occupancy",
      arrangeFailure: () => availability.listRangeForCapacity.mockResolvedValue({ byDate: {}, error: new Error("occupancy failure") }),
    },
    {
      source: "blocked-seat",
      arrangeFailure: () => availability.listBlockedSeats.mockResolvedValue({ byDate: {}, error: new Error("blocked-seat failure") }),
    },
  ])("labels the preview incomplete when the $source read fails", async ({ arrangeFailure }) => {
    arrangeAvailability();
    arrangeFailure();
    renderDateSelection();

    expect(await screen.findByRole("status")).toHaveTextContent(/preview.*incomplete.*next step/i);
    expect(screen.queryByText(/closed and fully-booked days are dimmed/i)).toBeNull();
  });

  it("never renders stale page data while a new page request is pending or after it rejects", async () => {
    arrangeAvailability();
    const stalePageTwoDate = firstMondayBetween(29, 56);
    let rejectPageTwo: ((error: Error) => void) | undefined;
    availability.getOpenDays
      .mockResolvedValueOnce({
        data: [{ setting_date: toDateStr(stalePageTwoDate), is_open: false }],
        error: null,
      })
      .mockImplementationOnce(() => new Promise((_resolve, reject) => {
        rejectPageTwo = reject;
      }));
    const user = userEvent.setup();
    renderDateSelection();
    await waitFor(() => expect(screen.queryByText("Loading availability…")).toBeNull());

    await user.click(screen.getByRole("button", { name: "Next dates" }));
    expect(screen.getByText("Loading availability…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: `${ariaDate(stalePageTwoDate)}, closed` })).toBeNull();

    await act(async () => {
      rejectPageTwo?.(new Error("page request rejected"));
      await Promise.resolve();
    });

    expect(await screen.findByRole("status")).toHaveTextContent(/preview.*incomplete.*next step/i);
    expect(screen.queryByText("Loading availability…")).toBeNull();
    expect(screen.getByRole("button", { name: ariaDate(stalePageTwoDate) })).not.toBeDisabled();
    expect(availability.logError).toHaveBeenCalledWith(
      "Failed to fetch availability page",
      expect.any(Error),
      { tags: { component: "DateSelection", op: "get_page_availability" } },
    );
  });

  it("clamps the current page when the booking horizon shrinks", async () => {
    arrangeAvailability();
    const user = userEvent.setup();
    const view = renderDateSelection();
    await goToLastPage(user);
    expect(await screen.findByText(/days 169–180.*six months ahead/i)).toBeInTheDocument();

    view.rerender(
      <DateSelection
        bookingHorizonDays={28}
        selectedDate={null}
        onSelect={() => {}}
        onNext={() => {}}
        onBack={() => {}}
      />,
    );

    const shortenedRange = await screen.findByText(/days 1–28 of 28/i);
    expect(shortenedRange).not.toHaveTextContent(/six months/i);
    expect(screen.getByRole("button", { name: "Previous dates" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next dates" })).toBeDisabled();
  });

  it.each([
    { label: "spring clock change", now: new Date(2026, 2, 28, 12, 0), expected: ["2026-03-29", "2026-03-30", "2026-03-31"] },
    { label: "autumn clock change", now: new Date(2026, 9, 24, 12, 0), expected: ["2026-10-25", "2026-10-26", "2026-10-27"] },
  ])("keeps consecutive local calendar dates across the UK $label period", async ({ now, expected }) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    arrangeAvailability();

    render(
      <DateSelection
        bookingHorizonDays={3}
        selectedDate={null}
        onSelect={() => {}}
        onNext={() => {}}
        onBack={() => {}}
      />,
    );

    await waitFor(() => expect(availability.getOpenDays).toHaveBeenCalled());
    const [, range] = availability.getOpenDays.mock.calls[0];
    expect(range).toEqual({ startDate: toDateStr(now), endDate: expected[2] });
    for (const date of expected) {
      const label = ariaDate(new Date(`${date}T12:00:00`));
      expect(screen.getByRole("button", { name: new RegExp(`^${label}(?:, closed)?$`) })).toBeInTheDocument();
    }
  });
});
