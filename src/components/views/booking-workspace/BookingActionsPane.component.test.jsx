import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { BookingActionsPane } from "./BookingActionsPane.jsx";

const DOGS = [
  { id: "d1", name: "Alfie", breed: "Cockapoo", size: "small" },
  { id: "d2", name: "Bella", breed: "Cocker", size: "medium" },
];

const DATES = [
  { dateStr: "2026-08-17", dateObj: new Date(2026, 7, 17) },
  { dateStr: "2026-08-18", dateObj: new Date(2026, 7, 18) },
  { dateStr: "2026-08-19", dateObj: new Date(2026, 7, 19) },
  { dateStr: "2026-08-20", dateObj: new Date(2026, 7, 20) },
  { dateStr: "2026-08-21", dateObj: new Date(2026, 7, 21) },
];

const DAY_SETTINGS = {
  "2026-08-17": { open: true, extraSlots: [], overrides: {} },
};

function renderPane(props = {}) {
  const onInsertIntoReply = vi.fn();
  render(
    <BookingActionsPane
      conversationId="c1"
      customerName="Steve Lillis"
      dogs={DOGS}
      lastServiceByDogId={{}}
      dates={DATES}
      currentDateStr="2026-08-17"
      daySettings={DAY_SETTINGS}
      bookingsByDate={{}}
      dailyDogCap={14}
      onPickDate={vi.fn()}
      onInsertIntoReply={onInsertIntoReply}
      {...props}
    />,
  );
  return { onInsertIntoReply };
}

async function startOfferFlow(user) {
  await user.click(screen.getByRole("button", { name: /Available appointments\?/ }));
}

describe("BookingActionsPane", () => {
  it("labels Inbox booking as unavailable before staff can interact with it", async () => {
    const user = userEvent.setup();
    renderPane();
    expect(
      screen.getByRole("button", { name: /Available appointments\?/ }),
    ).toBeInTheDocument();
    const booking = screen.getByRole("button", { name: /Book from Inbox.*not available/i });
    expect(booking).toBeDisabled();
    expect(booking).toHaveAttribute("aria-describedby");
    expect(screen.getByText(/Booking straight from the inbox is not available yet/i)).toBeInTheDocument();

    await user.click(booking);
    expect(screen.queryByText(/Booking is not switched on yet/i)).not.toBeInTheDocument();
  });

  it("does not gate the actions behind a detected booking request", () => {
    renderPane({ bookingSuggested: false });
    expect(screen.queryByText(/Choose a request first/i)).not.toBeInTheDocument();
  });

  it("moves into the offer flow and shows the dog picker", async () => {
    const user = userEvent.setup();
    renderPane();
    await startOfferFlow(user);
    expect(screen.getByRole("group", { name: /Choose dogs/i })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Alfie/ })).toBeInTheDocument();
  });

  it("keeps the diary empty until a dog is chosen", async () => {
    const user = userEvent.setup();
    renderPane();
    await startOfferFlow(user);
    expect(screen.getByText(/Choose a dog to see availability/i)).toBeInTheDocument();
  });

  it("disables the reply action until a dog and a slot are chosen", async () => {
    const user = userEvent.setup();
    renderPane();
    await startOfferFlow(user);
    expect(screen.getByRole("button", { name: /Add to reply/i })).toBeDisabled();
  });

  it("inserts the composed offer into the reply", async () => {
    const user = userEvent.setup();
    const { onInsertIntoReply } = renderPane();
    await startOfferFlow(user);
    await user.click(screen.getByRole("checkbox", { name: /Alfie/ }));

    const slotButtons = screen.getAllByRole("button", { name: /Offer this time|09:00|10:00/ });
    const bookable = slotButtons.find((button) => !button.disabled);
    expect(bookable).toBeDefined();
    await user.click(bookable);

    const addToReply = screen.getByRole("button", { name: /Add to reply/i });
    expect(addToReply).toBeEnabled();
    await user.click(addToReply);

    expect(onInsertIntoReply).toHaveBeenCalledTimes(1);
    const text = onInsertIntoReply.mock.calls[0][0];
    expect(text).toContain("Hi Steve");
    expect(text).toContain("Alfie");
    expect(text).toContain("Let us know which works best.");
  });

  it("lets staff back out of a flow without losing the customer", async () => {
    const user = userEvent.setup();
    renderPane();
    await startOfferFlow(user);
    await user.click(screen.getByRole("button", { name: /Cancel/i }));
    expect(
      screen.getByRole("button", { name: /Available appointments\?/ }),
    ).toBeInTheDocument();
  });

  it("announces the selection count in a live region", async () => {
    const user = userEvent.setup();
    renderPane();
    await startOfferFlow(user);
    await user.click(screen.getByRole("checkbox", { name: /Alfie/ }));
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows the booking suggestion as advisory only", () => {
    renderPane({ bookingSuggested: true });
    // Still both actions, still no gate.
    expect(
      screen.getByRole("button", { name: /Available appointments\?/ }),
    ).toBeEnabled();
    expect(screen.getByRole("button", { name: /Book from Inbox.*not available/i })).toBeDisabled();
  });
});
