// The collapsed history caps at five rows but must offer a way to see
// the rest — the old "Showing 5 of N" span was inert. These pin the
// expansion contract and the desktop New-booking CTA wiring.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HumanBookingHistory } from "./HumanBookingHistory.jsx";

const HUMAN = { id: "h1", fullName: "Sarah Thompson" };

function bookingsFixture(count) {
  const bookingsByDate = {};
  for (let i = 0; i < count; i++) {
    const date = `2026-05-${String(i + 1).padStart(2, "0")}`;
    bookingsByDate[date] = [
      {
        id: `b${i}`,
        dogName: "Biscuit",
        service: "full_groom",
        status: "Completed",
        owner: "Sarah Thompson",
        _ownerId: "h1",
      },
    ];
  }
  return bookingsByDate;
}

function renderHistory(overrides = {}) {
  const props = {
    human: HUMAN,
    dogs: {},
    dogsByHumanId: {},
    bookingsByDate: bookingsFixture(7),
    onOpenBooking: vi.fn(),
    ...overrides,
  };
  return { ...render(<HumanBookingHistory {...props} />), props };
}

describe("HumanBookingHistory expansion", () => {
  it("collapses to five rows and expands to the full history", () => {
    renderHistory();
    expect(screen.getAllByLabelText(/^Open booking/)).toHaveLength(5);

    fireEvent.click(screen.getByRole("button", { name: "Show all 7 →" }));
    expect(screen.getAllByLabelText(/^Open booking/)).toHaveLength(7);

    fireEvent.click(screen.getByRole("button", { name: "Show fewer" }));
    expect(screen.getAllByLabelText(/^Open booking/)).toHaveLength(5);
  });

  it("offers no expansion when five or fewer bookings exist", () => {
    renderHistory({ bookingsByDate: bookingsFixture(4) });
    expect(screen.getAllByLabelText(/^Open booking/)).toHaveLength(4);
    expect(screen.queryByRole("button", { name: /Show all/ })).toBeNull();
  });

  it("wires the New booking pill to onNewBookingForHuman", () => {
    const onNewBookingForHuman = vi.fn();
    renderHistory({ onNewBookingForHuman });
    fireEvent.click(screen.getByRole("button", { name: /New booking/ }));
    expect(onNewBookingForHuman).toHaveBeenCalledWith("h1");
  });

  it("renders no CTA when onNewBookingForHuman is not provided", () => {
    renderHistory();
    expect(screen.queryByRole("button", { name: /New booking/ })).toBeNull();
  });

  // Regression: two owners can each have a dog called "Biscuit". The other
  // owner's groom must NOT leak onto this human's card just because the dog
  // names collide — matching is by dog id / owner id, never by name.
  it("excludes a same-named dog's bookings owned by someone else", () => {
    const bookingsByDate = {
      "2026-05-01": [
        { id: "mine", dogName: "Biscuit", service: "full_groom", status: "Completed", _ownerId: "h1" },
        { id: "theirs", dogName: "Biscuit", service: "full_groom", status: "Completed", _ownerId: "other", _dogId: "other-dog", owner: "Someone Else" },
      ],
    };
    renderHistory({ bookingsByDate });

    expect(screen.getByLabelText(/^Open booking on 2026-05-01/)).toBeTruthy();
    expect(screen.getAllByLabelText(/^Open booking/)).toHaveLength(1);
    expect(screen.getByText("· 1")).toBeTruthy();
  });

  // The human's dog can sit past the paginated `dogs` window, so the match
  // must read the dog id out of `dogsByHumanId` (the pagination-proof source).
  it("matches a booking by dog id via dogsByHumanId even with no owner id", () => {
    const bookingsByDate = {
      "2026-05-02": [
        { id: "byid", dogName: "Biscuit", service: "full_groom", status: "Completed", _dogId: "dog-1" },
      ],
    };
    renderHistory({
      bookingsByDate,
      dogsByHumanId: { h1: [{ id: "dog-1", name: "Biscuit" }] },
    });

    expect(screen.getAllByLabelText(/^Open booking/)).toHaveLength(1);
  });
});
