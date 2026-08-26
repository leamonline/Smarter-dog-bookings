// Integration tests for the salon board page: the header, the tokens the
// board composes, the action panel each token opens, and every write the page
// can make — including the ones that must NOT happen when a save fails.
//
// Ranking and action legality are unit-tested in src/engine/salonBoard.test.ts;
// the board's own rendering and keyboard contract in
// board/salonBoard.component.test.jsx. This file is about the page: that the
// right handler runs with the right payload, and that the safeguards hold.
import { act, render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";
import { ToastProvider } from "../../../contexts/ToastContext.jsx";
import { TodayHeader } from "./TodayHeader.jsx";
import { AvailabilityModal } from "./AvailabilityModal.jsx";
import { TodayView } from "../TodayView.jsx";

const noop = () => {};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const selectedBooking = {
  id: "b-selected",
  dogName: "Jack",
  breed: "Cockapoo",
  service: "full-groom",
  size: "small",
  slot: "09:00",
  status: "Booked",
  payment: "Due at Pick-up",
  addons: [],
  priceOverride: null,
  _dogId: "d1",
  _ownerId: "h1",
  owner: "David Law",
  _bookingDate: "2026-07-16",
};

const selectedViewProps = {
  selectedDateObj: new Date(2026, 6, 16),
  selectedDateStr: "2026-07-16",
  onOpenDatePicker: noop,
  onOpenDog: noop,
  onOpenHuman: noop,
  bookingsByDate: { "2026-07-16": [selectedBooking] },
  bookingsLoading: false,
  bookingsError: null,
  dogs: { d1: { id: "d1", name: "Jack", size: "small", _humanId: "h1" } },
  humans: { h1: { id: "h1", name: "David Law" } },
  daySettings: { "2026-07-16": { extraSlots: [], immediateSlots: [] } },
  dayOpenState: { "2026-07-16": false },
  isOnline: true,
  onUpdateBooking: noop,
  onOpenBooking: noop,
  onNewBooking: noop,
  onSendCollection: noop,
  toggleImmediateSlot: noop,
  onRefresh: noop,
};

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="Current route">{`${location.pathname}${location.search}`}</output>;
}

function renderToday(props = {}) {
  return render(
    <MemoryRouter initialEntries={["/today?date=2026-07-16"]}>
      <ToastProvider>
        <TodayView {...selectedViewProps} {...props} />
        <LocationProbe />
      </ToastProvider>
    </MemoryRouter>,
  );
}

/** The one gesture the whole page rests on: find the dog, press the dog. */
function token(dogName) {
  return screen.getByRole("button", { name: new RegExp(`^${dogName}\\.`) });
}

function openDog(dogName) {
  fireEvent.click(token(dogName));
  return screen.getByRole("dialog");
}

/** An action row inside the open panel. */
function action(name) {
  return screen.getByRole("button", { name });
}

describe("the board page — selected-date operations", () => {
  it("uses the selected closed date for the heading, the empty state and new bookings", () => {
    const onNewBooking = vi.fn();
    renderToday({ bookingsByDate: { "2026-07-16": [] }, onNewBooking });

    expect(screen.getByRole("button", { name: "Thursday 16 July — choose a different date" })).toBeInTheDocument();
    expect(screen.getByText("Salon closed")).toBeInTheDocument();
    expect(screen.getByText("No bookings on this date")).toBeInTheDocument();
  });

  it("offers only the next care outcome, and keeps payment independent of it", () => {
    const confirm = vi.spyOn(window, "confirm");
    renderToday({
      bookingsByDate: { "2026-07-16": [{ ...selectedBooking, status: "Ready for pick-up" }] },
    });

    openDog("Jack");
    expect(screen.queryByRole("button", { name: /Start groom/ })).not.toBeInTheDocument();
    expect(action("Mark collected — Jack")).toBeInTheDocument();

    fireEvent.click(action("Take £42 payment — Jack"));
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Invoice · Jack" })).toBeInTheDocument();
  });

  it("opens collection messaging only after Ready actually saves", async () => {
    let resolveSave;
    const onUpdateBooking = vi.fn(() => new Promise((resolve) => { resolveSave = resolve; }));
    const onSendCollection = vi.fn();
    const confirm = vi.spyOn(window, "confirm");
    renderToday({
      bookingsByDate: { "2026-07-16": [{ ...selectedBooking, status: "In bath" }] },
      onUpdateBooking,
      onSendCollection,
    });

    openDog("Jack");
    fireEvent.click(action("Ready for collection — Jack"));

    await waitFor(() => expect(onUpdateBooking).toHaveBeenCalledTimes(1));
    expect(onSendCollection).not.toHaveBeenCalled();
    expect(onUpdateBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "b-selected",
        status: "Ready for pick-up",
        _skipCollectionPrompt: true,
      }),
      "2026-07-16",
      "2026-07-16",
    );

    await act(async () => resolveSave({ id: "b-selected", status: "Ready for pick-up" }));
    expect(onSendCollection).toHaveBeenCalledWith(
      expect.objectContaining({ id: "b-selected", status: "Ready for pick-up" }),
    );
    expect(confirm).not.toHaveBeenCalled();
  });

  it("does not open collection messaging when Ready fails to save", async () => {
    const onUpdateBooking = vi.fn().mockResolvedValue(null);
    const onSendCollection = vi.fn();
    renderToday({
      bookingsByDate: { "2026-07-16": [{ ...selectedBooking, status: "In bath" }] },
      onUpdateBooking,
      onSendCollection,
    });

    openDog("Jack");
    fireEvent.click(action("Ready for collection — Jack"));

    await waitFor(() => expect(onUpdateBooking).toHaveBeenCalledTimes(1));
    expect(onSendCollection).not.toHaveBeenCalled();
  });

  it("leaves the dog where it was and offers an action-specific retry when a write fails", async () => {
    const onUpdateBooking = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(selectedBooking);
    renderToday({ onUpdateBooking });

    openDog("Jack");
    fireEvent.click(action("Check in — Jack"));

    expect(await screen.findByRole("alert")).toHaveTextContent("Check-in could not be saved.");
    // Still in Arriving: a dog never appears to move when the save did not land.
    expect(
      within(screen.getByRole("region", { name: "Arriving, 1 dog" })).getByText("Jack"),
    ).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "With us, 0 dogs" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(onUpdateBooking).toHaveBeenCalledTimes(2));
  });

  it("marks the dog busy while its write is in flight", async () => {
    let resolveSave;
    const onUpdateBooking = vi.fn(() => new Promise((resolve) => { resolveSave = resolve; }));
    renderToday({
      bookingsByDate: { "2026-07-16": [{ ...selectedBooking, status: "In bath" }] },
      onUpdateBooking,
    });

    openDog("Jack");
    fireEvent.click(action("Ready for collection — Jack"));
    expect(token("Jack")).toHaveAttribute("aria-busy", "true");

    await act(async () => resolveSave({ id: "b-selected", status: "Ready for pick-up" }));
    expect(token("Jack")).not.toHaveAttribute("aria-busy");
  });

  it("offers Undo on an ordinary workflow move and sends the dog back", async () => {
    const onUpdateBooking = vi.fn()
      .mockResolvedValueOnce({ ...selectedBooking, status: "Checked in" })
      .mockResolvedValueOnce({ ...selectedBooking, status: "Booked" });
    renderToday({ onUpdateBooking });

    openDog("Jack");
    fireEvent.click(action("Check in — Jack"));
    await waitFor(() => expect(onUpdateBooking).toHaveBeenCalledTimes(1));

    fireEvent.click(await screen.findByRole("button", { name: "Undo" }));
    await waitFor(() => expect(onUpdateBooking).toHaveBeenCalledTimes(2));
    expect(onUpdateBooking).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: "b-selected",
        status: "Booked",
        _skipCollectionPrompt: true,
      }),
      "2026-07-16",
      "2026-07-16",
    );
    expect(await screen.findByText("Jack moved back to arriving")).toBeInTheDocument();
  });

  it("warns about an unpaid balance without blocking collection", async () => {
    const onUpdateBooking = vi.fn().mockResolvedValue(true);
    renderToday({
      bookingsByDate: { "2026-07-16": [{ ...selectedBooking, status: "Ready for pick-up" }] },
      onUpdateBooking,
    });

    openDog("Jack");
    fireEvent.click(action("Mark collected — Jack"));
    expect(screen.getByRole("heading", { name: "£42 is still due for Jack" })).toBeInTheDocument();
    expect(onUpdateBooking).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Mark collected anyway" }));
    await waitFor(() => expect(onUpdateBooking).toHaveBeenCalledTimes(1));
    expect(onUpdateBooking).toHaveBeenCalledWith(
      expect.objectContaining({ id: "b-selected", status: "Completed", payment: "Due at Pick-up" }),
      "2026-07-16",
      "2026-07-16",
    );
  });

  it("records a staff confirmation and toasts it", async () => {
    const onUpdateBooking = vi.fn().mockResolvedValue(true);
    renderToday({
      bookingsByDate: {
        "2026-07-16": [{ ...selectedBooking, reminderState: "sent", confirmationChannel: "whatsapp" }],
      },
      onUpdateBooking,
    });

    openDog("Jack");
    fireEvent.click(action("Confirm booking — Jack"));

    await waitFor(() => expect(onUpdateBooking).toHaveBeenCalledTimes(1));
    expect(onUpdateBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "b-selected",
        _confirmArrival: true,
        reminderConfirmedBy: "staff",
        reminderState: "confirmed",
        reminderConfirmedAt: expect.any(String),
      }),
      "2026-07-16",
      "2026-07-16",
    );
    expect(await screen.findByText("Jack's booking confirmed")).toBeInTheDocument();
  });

  it("undoes a mis-tapped staff confirmation from the toast", async () => {
    const onUpdateBooking = vi.fn().mockResolvedValue(true);
    renderToday({
      bookingsByDate: {
        "2026-07-16": [{
          ...selectedBooking,
          reminderState: "sent",
          reminderSentAt: "2026-07-15T18:00:00Z",
          confirmationChannel: "whatsapp",
        }],
      },
      onUpdateBooking,
    });

    openDog("Jack");
    fireEvent.click(action("Confirm booking — Jack"));
    fireEvent.click(await screen.findByRole("button", { name: "Undo" }));

    await waitFor(() => expect(onUpdateBooking).toHaveBeenCalledTimes(2));
    expect(onUpdateBooking).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: "b-selected",
        _unconfirmArrival: true,
        reminderConfirmedAt: null,
        reminderConfirmedBy: null,
        reminderState: "sent",
      }),
      "2026-07-16",
      "2026-07-16",
    );
    expect(await screen.findByText("Jack's booking is unconfirmed again")).toBeInTheDocument();
  });

  it("offers Unconfirm for a staff-recorded confirmation, and never for a customer's own", () => {
    const staffConfirmed = {
      ...selectedBooking,
      reminderState: "confirmed",
      reminderConfirmedAt: "2026-07-16T07:40:00Z",
      reminderConfirmedBy: "staff",
    };
    const { unmount } = renderToday({ bookingsByDate: { "2026-07-16": [staffConfirmed] } });
    openDog("Jack");
    expect(action("Unconfirm booking — Jack")).toBeInTheDocument();
    unmount();

    renderToday({
      bookingsByDate: {
        "2026-07-16": [{ ...staffConfirmed, reminderConfirmedBy: "customer" }],
      },
    });
    openDog("Jack");
    expect(screen.queryByRole("button", { name: /Unconfirm booking/ })).not.toBeInTheDocument();
  });

  it("reports honestly when the unconfirm is refused because the customer confirmed", async () => {
    const onUpdateBooking = vi.fn().mockResolvedValue(null);
    renderToday({
      bookingsByDate: {
        "2026-07-16": [{
          ...selectedBooking,
          reminderState: "confirmed",
          reminderConfirmedAt: "2026-07-16T07:40:00Z",
          reminderConfirmedBy: "staff",
        }],
      },
      onUpdateBooking,
    });

    openDog("Jack");
    fireEvent.click(action("Unconfirm booking — Jack"));

    expect(
      await screen.findByText(/Couldn't undo — if the customer has just confirmed themselves/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("uses one configured guide price for the header money, the token and the invoice", () => {
    renderToday({
      bookingsByDate: { "2026-07-16": [{ ...selectedBooking, status: "Ready for pick-up" }] },
      configPricing: { "full-groom": { small: 5000 } },
    });

    expect(screen.getByRole("region", { name: "Day status" })).toHaveTextContent("£50 to collect");
    expect(screen.getByRole("group", { name: "End of day" })).toHaveTextContent("Expected £50");
    expect(document.querySelector('[data-booking-id="b-selected"] [data-token-balance]').textContent).toBe("£50");

    openDog("Jack");
    fireEvent.click(action("Take £50 payment — Jack"));
    expect(screen.getByLabelText("Base groom price")).toHaveValue(50);
  });

  it("saves the invoice through the selected-date booking mutation", async () => {
    const onUpdateBooking = vi.fn().mockResolvedValue(true);
    renderToday({
      bookingsByDate: { "2026-07-16": [{ ...selectedBooking, status: "Ready for pick-up" }] },
      onUpdateBooking,
    });

    openDog("Jack");
    fireEvent.click(action("Take £42 payment — Jack"));
    fireEvent.click(screen.getByRole("radio", { name: "Card" }));
    fireEvent.click(screen.getByRole("button", { name: "Save payment" }));

    await waitFor(() => expect(onUpdateBooking).toHaveBeenCalledTimes(1));
    expect(onUpdateBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "b-selected",
        payment: "Paid in Full",
        paymentMethod: "card",
        paidAmount: 42,
      }),
      "2026-07-16",
      "2026-07-16",
    );
  });

  it("uses the selected past date as the mutation fallback for legacy bookings", async () => {
    const onUpdateBooking = vi.fn().mockResolvedValue(true);
    renderToday({
      selectedDateObj: new Date(2026, 6, 13),
      selectedDateStr: "2026-07-13",
      bookingsByDate: { "2026-07-13": [{ ...selectedBooking, id: "b-past", _bookingDate: undefined }] },
      daySettings: { "2026-07-13": { extraSlots: [], immediateSlots: [] } },
      dayOpenState: { "2026-07-13": true },
      onUpdateBooking,
    });

    openDog("Jack");
    fireEvent.click(action("Check in — Jack"));
    await waitFor(() => expect(onUpdateBooking).toHaveBeenCalledTimes(1));
    expect(onUpdateBooking).toHaveBeenCalledWith(
      expect.objectContaining({ id: "b-past", status: "Checked in" }),
      "2026-07-13",
      "2026-07-13",
    );
  });

  it("routes booking details, the dog file, the human file and owner messaging", () => {
    const onOpenDog = vi.fn();
    const onOpenHuman = vi.fn();
    const onOpenBooking = vi.fn();
    renderToday({
      bookingsByDate: { "2026-07-16": [{ ...selectedBooking, status: "Ready for pick-up" }] },
      onOpenDog,
      onOpenHuman,
      onOpenBooking,
    });

    openDog("Jack");
    fireEvent.click(action("Booking details — Jack"));
    expect(onOpenBooking).toHaveBeenCalledWith("b-selected");

    openDog("Jack");
    fireEvent.click(action("Jack's file — Jack"));
    expect(onOpenDog).toHaveBeenCalledWith("d1");

    openDog("Jack");
    fireEvent.click(action("David Law's file — Jack"));
    expect(onOpenHuman).toHaveBeenCalledWith("h1");

    openDog("Jack");
    fireEvent.click(action("Message David — Jack"));
    expect(screen.getByRole("status", { name: "Current route" })).toHaveTextContent("/inbox?human=h1");
  });

  it("shows a load failure without also claiming the date is empty", () => {
    const onRefresh = vi.fn();
    renderToday({
      bookingsByDate: { "2026-07-16": [] },
      bookingsError: new Error("load failed"),
      onRefresh,
    });

    expect(screen.getByText("Couldn't load bookings for this date.")).toBeInTheDocument();
    expect(screen.queryByText("No bookings on this date")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("keeps the dogs on the board when a refetch fails", () => {
    renderToday({ bookingsError: new Error("refetch failed") });

    expect(screen.getByText("Couldn't load bookings for this date.")).toBeInTheDocument();
    expect(token("Jack")).toBeInTheDocument();
    expect(screen.queryByText("No bookings on this date")).not.toBeInTheDocument();
  });

  it("highlights the dogs needing attention in place, dimming the rest rather than hiding them", () => {
    const waiting = {
      ...selectedBooking,
      id: "b-action",
      dogName: "Ruby",
      _dogId: "d-action",
      status: "Ready for pick-up",
    };
    const calm = {
      ...selectedBooking,
      id: "b-calm",
      dogName: "Milo",
      _dogId: "d-calm",
      slot: "10:00",
      payment: "Paid in Full",
    };
    renderToday({
      bookingsByDate: { "2026-07-16": [waiting, calm] },
      dogs: {
        ...selectedViewProps.dogs,
        "d-action": { id: "d-action", name: "Ruby", size: "small", _humanId: "h1" },
        "d-calm": { id: "d-calm", name: "Milo", size: "small", _humanId: "h1" },
      },
    });

    const control = screen.getByRole("button", { name: /Highlight the 1 dog needing attention/ });
    expect(control).toHaveAttribute("aria-pressed", "false");
    expect(control).toHaveTextContent("1 thing needs you");
    fireEvent.click(control);

    const active = screen.getByRole("button", { name: /Stop highlighting/ });
    expect(active).toHaveAttribute("aria-pressed", "true");
    expect(active).toHaveTextContent("Highlighting 1 · Clear");
    // Both dogs are still on the board, in their own zones.
    expect(token("Ruby")).toBeInTheDocument();
    expect(token("Milo")).toBeInTheDocument();
    expect(token("Milo").className).toMatch(/opacity-35/);
    expect(
      screen.getByText(/Highlighting 1 dog that needs you/),
    ).toHaveAttribute("role", "status");

    fireEvent.click(active);
    expect(token("Milo").className).toMatch(/opacity-100/);
  });

  it.each([
    ["past", "2026-07-13", new Date(2026, 6, 13)],
    ["future", "2026-07-16", new Date(2026, 6, 16)],
  ])("keeps %s dates free of live-day surfaces while the journey actions remain", (_label, dateStr, dateObj) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-14T09:15:00Z"));
    const paid = {
      ...selectedBooking,
      id: `paid-${dateStr}`,
      slot: "10:30",
      payment: "Paid in Full",
      paymentMethod: "card",
      paidAmount: 42,
      _bookingDate: dateStr,
    };
    const awaiting = {
      ...selectedBooking,
      id: `awaiting-${dateStr}`,
      slot: "11:00",
      dogName: "Lucy",
      _dogId: "d-lucy",
      depositRequired: true,
      depositReference: "SDG-7K3M",
      depositDueBy: "2026-07-14T08:00:00Z",
      depositReceivedAt: null,
      _bookingDate: dateStr,
    };

    renderToday({
      selectedDateObj: dateObj,
      selectedDateStr: dateStr,
      bookingsByDate: { [dateStr]: [paid, awaiting] },
      dogs: {
        ...selectedViewProps.dogs,
        "d-lucy": { id: "d-lucy", name: "Lucy", size: "small", _humanId: "h1" },
      },
      daySettings: { [dateStr]: { extraSlots: [], immediateSlots: [] } },
      dayOpenState: { [dateStr]: true },
    });

    expect(screen.queryByText("Awaiting deposit")).not.toBeInTheDocument();
    expect(screen.queryByText("Everything's on track")).not.toBeInTheDocument();
    // A slot time on a browsed date is not a countdown: the group states the
    // time, and no live timing appears anywhere.
    expect(document.querySelector('[data-slot-group="10:30"] h3').textContent).toBe("10:30");
    expect(document.querySelector('[data-slot-group="10:30"] [data-slot-timing]')).toBeNull();
    expect(document.querySelector(`[data-booking-id="paid-${dateStr}"]`).dataset.tier).toBe("calm");

    const endOfDay = screen.getByRole("group", { name: "End of day" });
    expect(endOfDay).toHaveTextContent("Capacity 2/14");
    expect(endOfDay).toHaveTextContent("Taken £42");

    openDog("Lucy");
    expect(action("Check in — Lucy")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Start groom/ })).not.toBeInTheDocument();
  });

  it("opens an awaiting-deposit booking by id", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-14T09:15:00Z"));
    const onOpenBooking = vi.fn();
    renderToday({
      selectedDateObj: new Date(2026, 6, 14),
      selectedDateStr: "2026-07-14",
      bookingsByDate: {
        "2026-07-14": [{
          ...selectedBooking,
          id: "awaiting-today",
          slot: "10:30",
          depositRequired: true,
          depositReference: "SDG-7K3M",
          depositDueBy: "2026-07-14T11:15:00Z",
          depositReceivedAt: null,
          _bookingDate: "2026-07-14",
        }],
      },
      daySettings: { "2026-07-14": { extraSlots: [], immediateSlots: [] } },
      dayOpenState: { "2026-07-14": true },
      onOpenBooking,
    });

    fireEvent.click(screen.getByRole("button", { name: /SDG-7K3M/ }));
    expect(onOpenBooking).toHaveBeenCalledWith("awaiting-today");
  });

  it("never moves the viewport on load", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T08:25:00+01:00"));
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;

    renderToday({
      selectedDateObj: new Date(2026, 6, 15),
      selectedDateStr: "2026-07-15",
      bookingsByDate: { "2026-07-15": [{ ...selectedBooking, id: "b-today", slot: "08:30", _bookingDate: "2026-07-15" }] },
      daySettings: { "2026-07-15": { extraSlots: [], immediateSlots: [] } },
      dayOpenState: { "2026-07-15": true },
    });

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("keeps the minute tick from moving the viewport and updates the token's timing live", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T09:25:00+01:00"));
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;

    renderToday({
      selectedDateObj: new Date(2026, 6, 15),
      selectedDateStr: "2026-07-15",
      bookingsByDate: { "2026-07-15": [{ ...selectedBooking, id: "b-today", slot: "08:30", _bookingDate: "2026-07-15" }] },
      daySettings: { "2026-07-15": { extraSlots: [], immediateSlots: [] } },
      dayOpenState: { "2026-07-15": true },
    });

    const timing = () => document.querySelector('[data-slot-group="08:30"] [data-slot-timing]').textContent;
    expect(timing()).toBe("55 min late");
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(timing()).toBe("56 min late");
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});

describe("TodayHeader", () => {
  const attention = (over = {}) => ({ count: 0, headline: "Everything's on track", ids: [], ...over });
  const zoneCounts = [
    { zone: "due", label: "arriving", count: 3 },
    { zone: "withUs", label: "with us", count: 6 },
    { zone: "ready", label: "ready", count: 2 },
  ];

  it("keeps the page heading accessible and makes the date the picker control", () => {
    const onOpenDatePicker = vi.fn();
    const onToggleAttention = vi.fn();
    render(
      <TodayHeader
        dateLabel="Tuesday 14 July"
        dogsBooked={11}
        attention={attention({ count: 2, headline: "2 things need you", ids: ["a", "b"] })}
        zoneCounts={zoneCounts}
        collectedTotal={286}
        unpaidTotal={152}
        isDayOpen
        isToday
        onOpenDatePicker={onOpenDatePicker}
        onManageAvailability={vi.fn()}
        onToggleAttention={onToggleAttention}
      />,
    );

    expect(screen.getByRole("heading", { name: "Daily Brief" })).toHaveClass("sr-only");
    fireEvent.click(screen.getByRole("button", { name: "Tuesday 14 July — choose a different date" }));
    expect(onOpenDatePicker).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Manage availability — No online slots today" })).toBeInTheDocument();

    const status = screen.getByRole("region", { name: "Day status" });
    expect(status).toHaveTextContent("2 things need you");
    expect(status).toHaveTextContent("3 arriving");
    expect(status).toHaveTextContent("6 with us");
    expect(status).toHaveTextContent("2 ready");
    expect(status).toHaveTextContent("£286 collected");
    expect(status).toHaveTextContent("£152 to collect");

    fireEvent.click(within(status).getByRole("button", { name: /Highlight the 2 dogs needing attention/ }));
    expect(onToggleAttention).toHaveBeenCalledTimes(1);
  });

  it("reassures in a whole sentence when nothing needs doing, with no control to press", () => {
    render(
      <TodayHeader
        dateLabel="Thursday 2 July"
        dogsBooked={3}
        attention={attention()}
        zoneCounts={zoneCounts}
        unpaidTotal={0}
        isDayOpen
        isToday
        onOpenDatePicker={noop}
        onManageAvailability={noop}
        onToggleAttention={noop}
      />,
    );

    const status = screen.getByRole("region", { name: "Day status" });
    expect(status).toHaveTextContent("Everything's on track");
    expect(status).toHaveTextContent("All paid");
    expect(within(status).queryByRole("button")).not.toBeInTheDocument();
  });

  it("gives the highlight control an explicit visible selected state", () => {
    render(
      <TodayHeader
        dateLabel="Tuesday 14 July"
        dogsBooked={11}
        attention={attention({ count: 6, headline: "6 things need you", ids: ["a"] })}
        zoneCounts={zoneCounts}
        unpaidTotal={482}
        isDayOpen
        isToday
        attentionActive
        onOpenDatePicker={noop}
        onManageAvailability={noop}
        onToggleAttention={noop}
      />,
    );

    const control = screen.getByRole("button", { name: "Stop highlighting; 6 dogs need attention" });
    expect(control).toHaveAttribute("aria-pressed", "true");
    expect(control).toHaveAttribute("data-attention-state", "focused");
    expect(control).toHaveTextContent("Highlighting 6 · Clear");
  });

  it("skips the reassurance on a browsed non-today date", () => {
    render(
      <TodayHeader
        dateLabel="Thursday 2 July"
        dogsBooked={3}
        attention={attention({ headline: "Nothing outstanding" })}
        zoneCounts={zoneCounts}
        unpaidTotal={0}
        isDayOpen
        isToday={false}
        onOpenDatePicker={noop}
        onManageAvailability={noop}
        onToggleAttention={noop}
      />,
    );
    expect(screen.queryByText("Everything's on track")).not.toBeInTheDocument();
    expect(screen.queryByText("Nothing outstanding")).not.toBeInTheDocument();
  });

  it("announces an over-cap day in coral — the only state where capacity is actionable", () => {
    render(
      <TodayHeader
        dateLabel="Tuesday 14 July"
        dogsBooked={15}
        capacityTotal={14}
        attention={attention()}
        zoneCounts={zoneCounts}
        unpaidTotal={0}
        isDayOpen
        isToday
        onOpenDatePicker={noop}
        onManageAvailability={noop}
        onToggleAttention={noop}
      />,
    );

    const overCap = screen.getByText(/over the daily cap/);
    expect(overCap).toHaveTextContent("15/14 over the daily cap");
    expect(overCap).toHaveClass("text-brand-coral-text");
  });

  it("keeps availability management visible when the salon is closed", () => {
    render(
      <TodayHeader
        dateLabel="Thursday 2 July"
        dogsBooked={0}
        attention={attention()}
        zoneCounts={[]}
        isDayOpen={false}
        onOpenDatePicker={noop}
        onManageAvailability={noop}
        onToggleAttention={noop}
      />,
    );
    expect(screen.getByText(/salon closed/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Manage availability — Online booking closed/ })).toBeInTheDocument();
  });
});

describe("AvailabilityModal", () => {
  const view = {
    rows: [
      { slot: "09:00", slotMinutes: 540, seatsFree: 2, isOnline: true, customerReachable: true, sizes: { small: true, medium: true, large: false } },
      { slot: "09:30", slotMinutes: 570, seatsFree: 1, isOnline: false, customerReachable: false, sizes: { small: true, medium: true, large: false } },
      { slot: "12:30", slotMinutes: 750, seatsFree: 2, isOnline: true, customerReachable: true, sizes: { small: true, medium: true, large: true } },
    ],
    unbookedSlots: 3,
    onlineCount: 2,
    nextOnlineSlot: "09:00",
  };

  it("renders an accessible dialog with a title and derived counts", () => {
    render(<AvailabilityModal onClose={noop} view={view} dogsBooked={11} onToggleImmediate={noop} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Manage availability" })).toBeInTheDocument();
    const summary = screen.getByText(
      (_, node) => node?.tagName === "P" && /11\s*dogs booked/.test(node.textContent) && /3\s*unbooked slots/.test(node.textContent) && /2\s*online/.test(node.textContent),
    );
    expect(summary).toBeInTheDocument();
  });

  it("labels each toggle by its slot and time and fires onToggleImmediate", () => {
    const onToggle = vi.fn();
    render(<AvailabilityModal onClose={noop} view={view} dogsBooked={11} onToggleImmediate={onToggle} />);
    expect(screen.getByRole("button", { name: "Take 09:00 offline" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Put 09:30 online" }));
    expect(onToggle).toHaveBeenCalledWith("09:30");
  });

  it("shows Online/Hidden state and the sizes that fit (large only where eligible)", () => {
    render(<AvailabilityModal onClose={noop} view={view} dogsBooked={11} onToggleImmediate={noop} />);
    expect(screen.getAllByText("Online")).toHaveLength(2);
    expect(screen.getByText("Hidden")).toBeInTheDocument();
    const largeRow = screen.getByRole("button", { name: "Take 12:30 offline" }).closest("li");
    expect(within(largeRow).getByText("Large")).toBeInTheDocument();
    const nineRow = screen.getByRole("button", { name: "Take 09:00 offline" }).closest("li");
    expect(within(nineRow).queryByText("Large")).not.toBeInTheDocument();
  });

  it("closes from the header", () => {
    const onClose = vi.fn();
    render(<AvailabilityModal onClose={onClose} view={view} dogsBooked={11} onToggleImmediate={noop} />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("handles an empty day", () => {
    render(
      <AvailabilityModal
        onClose={noop}
        view={{ rows: [], unbookedSlots: 0, onlineCount: 0, nextOnlineSlot: null }}
        dogsBooked={0}
        onToggleImmediate={noop}
      />,
    );
    expect(screen.getByText(/No free slots left today/)).toBeInTheDocument();
    expect(screen.getByText(/none open/)).toBeInTheDocument();
  });
});
