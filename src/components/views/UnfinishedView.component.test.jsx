import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UnfinishedView } from "./UnfinishedView.jsx";

// The hook owns the Supabase read; the view is tested against the queue shape
// it produces, so these cases stay about what staff see and can do.
const mockHook = vi.fn();
vi.mock("../../supabase/hooks/useUnfinishedBookings.ts", () => ({
  useUnfinishedBookings: (...args) => mockHook(...args),
}));

const toastShow = vi.fn();
vi.mock("../../contexts/ToastContext.jsx", () => ({
  useToast: () => ({ show: toastShow }),
}));

function bookingFixture(over = {}) {
  return {
    id: "b1",
    dogName: "Rufus",
    breed: "Poodle",
    owner: "Sam Carter",
    size: "small",
    service: "full-groom",
    slot: "09:00",
    status: "Ready for pick-up",
    addons: [],
    _bookingDate: "2026-06-02",
    paidAt: null,
    ...over,
  };
}

function queueWith(groups, over = {}) {
  return {
    groups,
    counts: { mid_groom: 0, awaiting_collection: 0, never_started: 0, unpaid: 0 },
    total: groups.reduce((n, g) => n + g.items.length, 0),
    oldestAgeDays: 79,
    ...over,
  };
}

const EMPTY = {
  groups: [],
  counts: { mid_groom: 0, awaiting_collection: 0, never_started: 0, unpaid: 0 },
  total: 0,
  oldestAgeDays: 0,
};

function setup({ queue = EMPTY, loading = false, error = null, completeBooking = vi.fn().mockResolvedValue(null), pendingIds = new Set() } = {}) {
  const refetch = vi.fn();
  mockHook.mockReturnValue({ queue, loading, error, refetch, completeBooking, pendingIds });
  return { refetch, completeBooking };
}

beforeEach(() => {
  mockHook.mockReset();
  toastShow.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("UnfinishedView", () => {
  it("says so plainly when there is nothing outstanding", () => {
    setup();
    render(<UnfinishedView dogs={{}} humans={{}} dogsById={{}} humansById={{}} />);
    expect(screen.getByText(/every past appointment is closed out and paid/i)).toBeTruthy();
  });

  it("shows a loading state rather than an empty one while fetching", () => {
    setup({ loading: true });
    render(<UnfinishedView dogs={{}} humans={{}} dogsById={{}} humansById={{}} />);
    expect(screen.getByText(/looking for unfinished appointments/i)).toBeTruthy();
    expect(screen.queryByText(/every past appointment is closed out/i)).toBeNull();
  });

  it("surfaces a load failure as an alert", () => {
    setup({ error: "Could not load unfinished bookings. Try again in a moment." });
    render(<UnfinishedView dogs={{}} humans={{}} dogsById={{}} humansById={{}} />);
    expect(screen.getByRole("alert").textContent).toMatch(/could not load/i);
  });

  it("lists a group with its action and how long the booking has waited", () => {
    setup({
      queue: queueWith([
        {
          kind: "awaiting_collection",
          label: "Never marked collected",
          action: "Mark completed once you know the dog went home.",
          items: [{ booking: bookingFixture(), kind: "awaiting_collection", ageDays: 79 }],
        },
      ]),
    });
    render(<UnfinishedView dogs={{}} humans={{}} dogsById={{}} humansById={{}} />);

    expect(screen.getByText("Never marked collected")).toBeTruthy();
    expect(screen.getByText(/mark completed once you know/i)).toBeTruthy();
    expect(screen.getByText("Rufus")).toBeTruthy();
    // 79 days reads as months, not a raw day count staff have to convert.
    // Scoped to the row's own chip — the summary line says it too.
    const chip = screen.getByTitle("Booked for 2 Jun 2026");
    expect(chip.textContent).toBe("3 months ago");
    expect(screen.getByText(/2 Jun 2026 at 09:00/)).toBeTruthy();
  });

  it("completes a booking and confirms it", async () => {
    const { completeBooking } = setup({
      queue: queueWith([
        {
          kind: "awaiting_collection",
          label: "Never marked collected",
          action: "Mark completed once you know the dog went home.",
          items: [{ booking: bookingFixture(), kind: "awaiting_collection", ageDays: 79 }],
        },
      ]),
    });
    render(<UnfinishedView dogs={{}} humans={{}} dogsById={{}} humansById={{}} />);

    fireEvent.click(screen.getByRole("button", { name: /mark completed/i }));
    await waitFor(() => expect(completeBooking).toHaveBeenCalledWith("b1"));
    await waitFor(() => expect(toastShow).toHaveBeenCalledWith("Marked completed.", "success"));
  });

  it("reports a failed completion instead of pretending it worked", async () => {
    setup({
      completeBooking: vi.fn().mockResolvedValue("Could not mark that booking completed. Try again in a moment."),
      queue: queueWith([
        {
          kind: "awaiting_collection",
          label: "Never marked collected",
          action: "Mark completed once you know the dog went home.",
          items: [{ booking: bookingFixture(), kind: "awaiting_collection", ageDays: 79 }],
        },
      ]),
    });
    render(<UnfinishedView dogs={{}} humans={{}} dogsById={{}} humansById={{}} />);

    fireEvent.click(screen.getByRole("button", { name: /mark completed/i }));
    await waitFor(() =>
      expect(toastShow).toHaveBeenCalledWith(
        "Could not mark that booking completed. Try again in a moment.",
        "error",
      ),
    );
  });

  it("disables the button for a row already being saved", () => {
    setup({
      pendingIds: new Set(["b1"]),
      queue: queueWith([
        {
          kind: "awaiting_collection",
          label: "Never marked collected",
          action: "Mark completed once you know the dog went home.",
          items: [{ booking: bookingFixture(), kind: "awaiting_collection", ageDays: 79 }],
        },
      ]),
    });
    render(<UnfinishedView dogs={{}} humans={{}} dogsById={{}} humansById={{}} />);
    expect(screen.getByRole("button", { name: /saving/i }).disabled).toBe(true);
  });

  it("offers payment rather than completion for an unpaid booking", () => {
    setup({
      queue: queueWith([
        {
          kind: "unpaid",
          label: "No payment recorded",
          action: "Add the payment, or note that it was settled elsewhere.",
          items: [
            {
              booking: bookingFixture({ id: "b2", status: "Completed" }),
              kind: "unpaid",
              ageDays: 12,
            },
          ],
        },
      ]),
    });
    render(<UnfinishedView dogs={{}} humans={{}} dogsById={{}} humansById={{}} />);

    // A completed groom is already closed out — offering "Mark completed"
    // again would be meaningless, and clicking it would do nothing.
    expect(screen.queryByRole("button", { name: /mark completed/i })).toBeNull();
    expect(screen.getByRole("button", { name: /add payment/i })).toBeTruthy();
  });

  it("opens the booking when asked", () => {
    const onOpenBooking = vi.fn();
    setup({
      queue: queueWith([
        {
          kind: "unpaid",
          label: "No payment recorded",
          action: "Add the payment.",
          items: [
            { booking: bookingFixture({ id: "b2", status: "Completed" }), kind: "unpaid", ageDays: 12 },
          ],
        },
      ]),
    });
    render(
      <UnfinishedView dogs={{}} humans={{}} dogsById={{}} humansById={{}} onOpenBooking={onOpenBooking} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /add payment/i }));
    expect(onOpenBooking).toHaveBeenCalledWith("b2", expect.objectContaining({ id: "b2" }));
  });

  it("collapses a long group behind a control that says how many are hidden", () => {
    const items = Array.from({ length: 36 }, (_, i) => ({
      booking: bookingFixture({ id: `b${i}` }),
      kind: "awaiting_collection",
      ageDays: 79 - i,
    }));
    setup({
      queue: queueWith([
        {
          kind: "awaiting_collection",
          label: "Never marked collected",
          action: "Mark completed once you know the dog went home.",
          items,
        },
      ]),
    });
    render(<UnfinishedView dogs={{}} humans={{}} dogsById={{}} humansById={{}} />);

    expect(screen.getAllByRole("button", { name: /mark completed/i })).toHaveLength(10);
    const more = screen.getByRole("button", { name: /show the remaining 26/i });
    fireEvent.click(more);
    expect(screen.getAllByRole("button", { name: /mark completed/i })).toHaveLength(36);
  });

  it("summarises the backlog so the scale is visible without counting rows", () => {
    setup({
      queue: queueWith(
        [
          {
            kind: "awaiting_collection",
            label: "Never marked collected",
            action: "a",
            items: [{ booking: bookingFixture(), kind: "awaiting_collection", ageDays: 79 }],
          },
        ],
        { counts: { mid_groom: 6, awaiting_collection: 36, never_started: 18, unpaid: 215 }, total: 275 },
      ),
    });
    render(<UnfinishedView dogs={{}} humans={{}} dogsById={{}} humansById={{}} />);
    const summary = screen.getByText(/to deal with/i).textContent;
    expect(summary).toMatch(/275/);
    expect(summary).toMatch(/60 never closed out/);
    expect(summary).toMatch(/215 with no payment recorded/);
  });
});
