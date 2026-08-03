import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BOOKING_STATUS, DOG_SIZE } from "../../../constants/salon";
import { BookingPane } from "./BookingPane.jsx";

const DATE_STR = "2026-08-10";

const dates = Array.from({ length: 5 }, (_, index) => {
  const day = 10 + index;
  return {
    dateStr: `2026-08-${String(day).padStart(2, "0")}`,
    dateObj: new Date(2026, 7, day),
  };
});

const daySettings = Object.fromEntries(
  dates.map((date) => [date.dateStr, { isOpen: true, extraSlots: [], overrides: {} }]),
);

// 09:30 is filled to both seats, so the capacity engine must reject it.
const bookingsByDate = {
  [DATE_STR]: [
    {
      id: "b1",
      dogName: "Rex",
      breed: "Collie",
      size: DOG_SIZE.SMALL,
      status: BOOKING_STATUS.CONFIRMED,
      slot: "09:30",
    },
    {
      id: "b2",
      dogName: "Sam",
      breed: "Poodle",
      size: DOG_SIZE.SMALL,
      status: BOOKING_STATUS.CONFIRMED,
      slot: "09:30",
    },
  ],
};

const request = {
  id: "req-1",
  customerName: "Amy Adams",
  dogName: "Bella",
  size: DOG_SIZE.SMALL,
  dog: { id: "dog-1" },
  serviceLabel: "Full Groom",
  status: "Needs reply",
  conversation: { id: "req-1", human_id: "human-1", phone_e164: "+447700900111" },
};

function renderPane(overrides = {}) {
  const props = {
    request,
    dates,
    currentDateStr: DATE_STR,
    daySettings,
    bookingsByDate,
    dailyDogCap: 14,
    choices: [],
    onToggleChoice: vi.fn(),
    onPickDate: vi.fn(),
    atLimit: false,
    ...overrides,
  };
  const result = render(<BookingPane {...props} />);
  return { ...result, props };
}

function slotButton(slot) {
  return screen.getByRole("button", { name: new RegExp(slot) });
}

describe("BookingPane", () => {
  it("enables a slot the capacity engine accepts", () => {
    renderPane();
    expect(slotButton("08:30")).toBeEnabled();
  });

  it("disables a capacity-rejected slot and keeps the engine's reason", () => {
    renderPane();
    const full = slotButton("09:30");
    expect(full).toBeDisabled();
    expect(full).toHaveAttribute("title", "Slot is full");
  });

  it("blocks a fourth choice once three are selected", () => {
    renderPane({
      choices: [
        { dateStr: DATE_STR, slot: "08:30" },
        { dateStr: DATE_STR, slot: "09:00" },
        { dateStr: DATE_STR, slot: "10:00" },
      ],
      atLimit: true,
    });

    // An otherwise-bookable slot is refused while three drafts are held.
    expect(slotButton("10:30")).toBeDisabled();
    // A selected slot stays operable so staff can drop one.
    expect(slotButton("08:30")).toBeEnabled();
    expect(
      screen.getByText(/Three draft times are already selected/i),
    ).toBeInTheDocument();
  });

  it("offers the insert action only when it is enabled and choices exist", () => {
    const insertName = /Insert into reply/i;

    const withoutFlag = renderPane({
      choices: [{ dateStr: DATE_STR, slot: "08:30" }],
      onClear: vi.fn(),
      onInsertIntoReply: vi.fn(),
      showInsertAction: false,
    });
    expect(screen.queryByRole("button", { name: insertName })).not.toBeInTheDocument();
    withoutFlag.unmount();

    const withoutChoices = renderPane({
      choices: [],
      onClear: vi.fn(),
      onInsertIntoReply: vi.fn(),
      showInsertAction: true,
    });
    expect(screen.queryByRole("button", { name: insertName })).not.toBeInTheDocument();
    withoutChoices.unmount();

    const onInsertIntoReply = vi.fn();
    renderPane({
      choices: [{ dateStr: DATE_STR, slot: "08:30" }],
      onClear: vi.fn(),
      onInsertIntoReply,
      showInsertAction: true,
    });
    const insert = screen.getByRole("button", { name: insertName });
    expect(insert).toBeInTheDocument();
    insert.click();
    expect(onInsertIntoReply).toHaveBeenCalledTimes(1);
  });

  it("omits the draft offer footer when the pane is not given a clear handler", () => {
    renderPane({ choices: [{ dateStr: DATE_STR, slot: "08:30" }] });
    expect(screen.queryByText(/Draft offer/i)).not.toBeInTheDocument();
  });
});
