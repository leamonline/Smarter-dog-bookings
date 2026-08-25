// Component tests for the redesigned Daily Brief: the one-anatomy header
// (date-as-picker, itemised status sentence, Next jump), the ranked status
// board composed by TodayView, and the Manage-availability modal. The
// feed/availability LOGIC is unit-tested in src/engine/today.ts; these assert
// the UI renders the right rows, chips, action hierarchy and fires its actions.
import { act, render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";
import { ToastProvider } from "../../../contexts/ToastContext.jsx";
import { TodayHeader } from "./TodayHeader.jsx";
import { AvailabilityModal } from "./AvailabilityModal.jsx";
import { TodayView } from "../TodayView.jsx";
import { CompactZeroState } from "./parts.jsx";

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

function todayTree(props = {}) {
  return (
    <MemoryRouter initialEntries={["/today?date=2026-07-16"]}>
      <ToastProvider>
        <TodayView {...selectedViewProps} {...props} />
        <LocationProbe />
      </ToastProvider>
    </MemoryRouter>
  );
}

function renderToday(props = {}) {
  return render(todayTree(props));
}

describe("TodayView — selected-date operations", () => {
  it("uses a closed selected date for the heading, empty state and new bookings", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-14T09:15:00Z"));
    const onOpenDatePicker = vi.fn();
    const onNewBooking = vi.fn();
    renderToday({
      bookingsByDate: { "2026-07-16": [] },
      onOpenDatePicker,
      onNewBooking,
    });

    fireEvent.click(screen.getByRole("button", { name: "Thursday 16 July — choose a different date" }));
    expect(onOpenDatePicker).toHaveBeenCalledTimes(1);
    expect(screen.getByText("No bookings on this date")).toBeInTheDocument();
    expect(screen.queryByText(/next open day/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Manage availability/ }));
    fireEvent.click(screen.getAllByRole("button", { name: "Book in" })[0]);
    expect(onNewBooking).toHaveBeenCalledWith({ dateStr: "2026-07-16", slot: "08:30" });
  });

  it("offers only the next care outcome and keeps payment independent", () => {
    const confirm = vi.spyOn(window, "confirm");
    renderToday({
      bookingsByDate: {
        "2026-07-16": [{ ...selectedBooking, status: "Ready for pick-up" }],
      },
    });

    expect(screen.queryByRole("button", { name: /Start .*groom/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Take £42 payment from Jack" }));
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Invoice · Jack" })).toBeInTheDocument();
  });

  it("opens collection messaging only after Ready saves", async () => {
    let resolveSave;
    const onUpdateBooking = vi.fn(() => new Promise((resolve) => {
      resolveSave = resolve;
    }));
    const onSendCollection = vi.fn();
    const confirm = vi.spyOn(window, "confirm");
    renderToday({
      bookingsByDate: {
        "2026-07-16": [{ ...selectedBooking, status: "In bath" }],
      },
      onUpdateBooking,
      onSendCollection,
    });

    fireEvent.click(screen.getByRole("button", { name: "Mark Jack ready for collection" }));
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
    resolveSave({ id: "b-selected", status: "Ready for pick-up" });
    await waitFor(() => expect(onSendCollection).toHaveBeenCalledWith(
      expect.objectContaining({ id: "b-selected", status: "Ready for pick-up" }),
    ));
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Message for collection" })).not.toBeInTheDocument();
  });

  it("records a staff confirmation from the unconfirmed card and toasts it", async () => {
    const onUpdateBooking = vi.fn().mockResolvedValue(true);
    renderToday({
      bookingsByDate: {
        "2026-07-16": [{
          ...selectedBooking,
          reminderState: "sent",
          confirmationChannel: "whatsapp",
        }],
      },
      onUpdateBooking,
    });

    fireEvent.click(screen.getByRole("button", { name: "Confirm Jack's booking" }));

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

    fireEvent.click(screen.getByRole("button", { name: "Confirm Jack's booking" }));
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

  it("unconfirms a staff-confirmed booking from the card's More menu", async () => {
    const onUpdateBooking = vi.fn().mockResolvedValue(true);
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

    fireEvent.click(screen.getByRole("button", { name: "More actions for Jack" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Unconfirm booking" }));

    await waitFor(() => expect(onUpdateBooking).toHaveBeenCalledTimes(1));
    expect(onUpdateBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "b-selected",
        _unconfirmArrival: true,
        reminderConfirmedAt: null,
        reminderConfirmedBy: null,
      }),
      "2026-07-16",
      "2026-07-16",
    );
  });

  it("reports honestly when the undo is refused because the customer confirmed", async () => {
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

    fireEvent.click(screen.getByRole("button", { name: "More actions for Jack" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Unconfirm booking" }));

    expect(
      await screen.findByText(/Couldn't undo — if the customer has just confirmed themselves/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("marks the pressed card busy while its write is in flight", async () => {
    let resolveSave;
    const onUpdateBooking = vi.fn(() => new Promise((resolve) => {
      resolveSave = resolve;
    }));
    renderToday({
      bookingsByDate: {
        "2026-07-16": [{ ...selectedBooking, status: "In bath" }],
      },
      onUpdateBooking,
    });

    const primary = screen.getByRole("button", { name: "Mark Jack ready for collection" });
    fireEvent.click(primary);
    expect(primary).toBeDisabled();
    expect(primary).toHaveAttribute("aria-busy", "true");

    await act(async () => {
      resolveSave({ id: "b-selected", status: "Ready for pick-up" });
    });
    expect(screen.getByRole("button", { name: "Mark Jack ready for collection" })).not.toBeDisabled();
  });

  it("does not open collection messaging when Ready fails to save", async () => {
    const onUpdateBooking = vi.fn().mockResolvedValue(null);
    const onSendCollection = vi.fn();
    renderToday({
      bookingsByDate: {
        "2026-07-16": [{ ...selectedBooking, status: "In bath" }],
      },
      onUpdateBooking,
      onSendCollection,
    });

    fireEvent.click(screen.getByRole("button", { name: "Mark Jack ready for collection" }));

    await waitFor(() => expect(onUpdateBooking).toHaveBeenCalledTimes(1));
    expect(onSendCollection).not.toHaveBeenCalled();
  });

  it("uses one configured guide price for the header money, the card and the mini invoice", () => {
    renderToday({
      bookingsByDate: {
        "2026-07-16": [{ ...selectedBooking, status: "Ready for pick-up" }],
      },
      configPricing: { "full-groom": { small: 5000 } },
    });

    expect(screen.queryByRole("button", { name: "Take £50 from Jack" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Daily Brief status" })).toHaveTextContent("£50 to collect");
    expect(screen.getByRole("region", { name: "End of day" })).toHaveTextContent("Expected £50");

    fireEvent.click(screen.getByRole("button", { name: "Take £50 payment from Jack" }));
    expect(screen.getByLabelText("Base groom price")).toHaveValue(50);
    expect(screen.getAllByText("£50", { selector: "dd" })).toHaveLength(2);
  });

  it("warns about an unpaid balance without blocking collection", async () => {
    const onUpdateBooking = vi.fn().mockResolvedValue(true);
    renderToday({
      bookingsByDate: {
        "2026-07-16": [{ ...selectedBooking, status: "Ready for pick-up" }],
      },
      onUpdateBooking,
    });

    fireEvent.click(screen.getByRole("button", { name: "Mark Jack collected" }));
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

  it("keeps confirmed rows visible when a refetch fails", () => {
    renderToday({ bookingsError: new Error("refetch failed") });

    expect(screen.getByText("Couldn't load bookings for this date.")).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Jack, 09:00, Arriving" })).toBeInTheDocument();
    expect(screen.queryByText("No bookings on this date")).not.toBeInTheDocument();
  });

  it("filters the diary from the itemised status sentence", () => {
    const actionBooking = {
      ...selectedBooking,
      id: "b-action",
      dogName: "Ruby",
      _dogId: "d-action",
      status: "Ready for pick-up",
    };
    const calmBooking = {
      ...selectedBooking,
      id: "b-calm",
      dogName: "Milo",
      _dogId: "d-calm",
      slot: "10:00",
    };
    renderToday({
      bookingsByDate: { "2026-07-16": [actionBooking, calmBooking] },
      dogs: {
        ...selectedViewProps.dogs,
        "d-action": { id: "d-action", name: "Ruby", size: "small", _humanId: "h1" },
        "d-calm": { id: "d-calm", name: "Milo", size: "small", _humanId: "h1" },
      },
    });

    expect(screen.getByRole("article", { name: "Ruby, 09:00, Ready to go" })).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Milo, 10:00, Arriving" })).toBeInTheDocument();

    const filter = screen.getByRole("button", { name: /Filter to the .* needing attention/i });
    expect(filter).toHaveAttribute("aria-pressed", "false");
    expect(filter).toHaveAttribute("data-filter-selected", "false");
    expect(filter).toHaveTextContent("1 waiting");
    fireEvent.click(filter);

    const activeFilter = screen.getByRole("button", { name: /Show all bookings/ });
    expect(activeFilter).toHaveAttribute("aria-pressed", "true");
    expect(activeFilter).toHaveAttribute("data-filter-selected", "true");
    expect(activeFilter).toHaveTextContent("Showing 1 · Clear");
    expect(screen.getByRole("article", { name: "Ruby, 09:00, Ready to go" })).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Milo, 10:00, Arriving" })).not.toBeInTheDocument();
    expect(
      screen.getByText(/Showing 1 booking needing attention — late, unconfirmed, waiting to be collected, or unpaid\./),
    ).toHaveAttribute("role", "status");

    fireEvent.click(activeFilter);
    expect(screen.getByRole("article", { name: "Milo, 10:00, Arriving" })).toBeInTheDocument();
  });

  it("keeps the row unchanged and offers an action-specific retry when check-in fails", async () => {
    const onUpdateBooking = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(selectedBooking);
    renderToday({ onUpdateBooking });

    fireEvent.click(screen.getByRole("button", { name: "Check in Jack" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Check-in could not be saved.");
    expect(screen.getByRole("button", { name: "Check in Jack" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(onUpdateBooking).toHaveBeenCalledTimes(2));
  });

  it("uses the selected past date as the mutation fallback for legacy bookings", async () => {
    const onUpdateBooking = vi.fn().mockResolvedValue(true);
    const legacyBooking = {
      ...selectedBooking,
      id: "b-past",
      _bookingDate: undefined,
    };
    renderToday({
      selectedDateObj: new Date(2026, 6, 13),
      selectedDateStr: "2026-07-13",
      bookingsByDate: { "2026-07-13": [legacyBooking] },
      daySettings: { "2026-07-13": { extraSlots: [], immediateSlots: [] } },
      dayOpenState: { "2026-07-13": true },
      onUpdateBooking,
    });

    fireEvent.click(screen.getByRole("button", { name: "Check in Jack" }));
    await waitFor(() => expect(onUpdateBooking).toHaveBeenCalledTimes(1));
    expect(onUpdateBooking).toHaveBeenCalledWith(
      expect.objectContaining({ id: "b-past", status: "Checked in" }),
      "2026-07-13",
      "2026-07-13",
    );
  });

  it.each([
    ["past", "2026-07-13", new Date(2026, 6, 13)],
    ["future", "2026-07-16", new Date(2026, 6, 16)],
  ])("keeps %s selected dates free of live-day surfaces and copy while journey controls remain", (_label, dateStr, dateObj) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-14T09:15:00Z"));
    const paidBooking = {
      ...selectedBooking,
      id: `paid-${dateStr}`,
      slot: "10:30",
      payment: "Paid in Full",
      paymentMethod: "card",
      paidAmount: 42,
      _bookingDate: dateStr,
    };
    const awaitingBooking = {
      ...selectedBooking,
      id: `awaiting-${dateStr}`,
      slot: "11:00",
      dogName: "Lucy",
      depositRequired: true,
      depositReference: "SDG-7K3M",
      depositDueBy: "2026-07-14T08:00:00Z",
      depositReceivedAt: null,
      _bookingDate: dateStr,
    };

    const { container } = renderToday({
      selectedDateObj: dateObj,
      selectedDateStr: dateStr,
      bookingsByDate: { [dateStr]: [paidBooking, awaitingBooking] },
      daySettings: { [dateStr]: { extraSlots: [], immediateSlots: [] } },
      dayOpenState: { [dateStr]: true },
    });

    expect(screen.queryByRole("region", { name: "Happening now" })).not.toBeInTheDocument();
    expect(screen.queryByText("Awaiting deposit")).not.toBeInTheDocument();
    expect(screen.queryByText(/due in|overdue|booked today|taken today/i)).not.toBeInTheDocument();
    // No "Next:" jump and not a single gold control on a non-today date —
    // nothing on a past or future day is happening now.
    expect(screen.queryByRole("button", { name: /^Next:/ })).not.toBeInTheDocument();
    expect(container.querySelectorAll(".bg-brand-yellow")).toHaveLength(0);
    const endOfDay = screen.getByRole("region", { name: "End of day" });
    expect(endOfDay).toHaveTextContent("Capacity 2/14");
    expect(endOfDay).toHaveTextContent("Taken £42");
    expect(screen.getAllByRole("button", { name: /Check in/ })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /Start .*groom/ })).not.toBeInTheDocument();
  });

  it("opens an awaiting-deposit booking by id", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-14T09:15:00Z"));
    const onOpenBooking = vi.fn();
    const awaitingBooking = {
      ...selectedBooking,
      id: "awaiting-today",
      slot: "10:30",
      depositRequired: true,
      depositReference: "SDG-7K3M",
      depositDueBy: "2026-07-14T11:15:00Z",
      depositReceivedAt: null,
      _bookingDate: "2026-07-14",
    };

    renderToday({
      selectedDateObj: new Date(2026, 6, 14),
      selectedDateStr: "2026-07-14",
      bookingsByDate: { "2026-07-14": [awaitingBooking] },
      daySettings: { "2026-07-14": { extraSlots: [], immediateSlots: [] } },
      dayOpenState: { "2026-07-14": true },
      onOpenBooking,
    });

    fireEvent.click(screen.getByRole("button", { name: /SDG-7K3M/ }));
    expect(onOpenBooking).toHaveBeenCalledWith("awaiting-today");
  });

  it("routes booking, dog-file, human-file, payment and owner-message destinations", () => {
    const onOpenDog = vi.fn();
    const onOpenHuman = vi.fn();
    const onOpenBooking = vi.fn();
    renderToday({
      bookingsByDate: {
        "2026-07-16": [{ ...selectedBooking, status: "Ready for pick-up" }],
      },
      onOpenDog,
      onOpenHuman,
      onOpenBooking,
    });

    // The card body is the open-booking target…
    fireEvent.click(screen.getByRole("button", { name: "Open Jack's 09:00 booking" }));
    expect(onOpenBooking).toHaveBeenCalledWith("b-selected");

    // …and the files live one tap away in More.
    fireEvent.click(screen.getByRole("button", { name: "More actions for Jack" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Open Jack's dog file" }));
    expect(onOpenDog).toHaveBeenCalledWith("d1");

    fireEvent.click(screen.getByRole("button", { name: "More actions for Jack" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Open David Law's human file" }));
    expect(onOpenHuman).toHaveBeenCalledWith("h1");

    fireEvent.click(screen.getByRole("button", { name: "Take £42 payment from Jack" }));
    expect(screen.getByRole("heading", { name: "Invoice · Jack" })).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("dialog", { name: "Invoice · Jack" })).getByRole("button", { name: "Cancel" }));

    fireEvent.click(screen.getByRole("button", { name: "More actions for Jack" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Message David" }));
    expect(screen.getByRole("status", { name: "Current route" })).toHaveTextContent("/inbox?human=h1");
  });

  it("saves the mini invoice through the selected-date booking mutation", async () => {
    const onUpdateBooking = vi.fn().mockResolvedValue(true);
    renderToday({
      bookingsByDate: {
        "2026-07-16": [{ ...selectedBooking, status: "Ready for pick-up" }],
      },
      onUpdateBooking,
    });

    fireEvent.click(screen.getByRole("button", { name: "Take £42 payment from Jack" }));
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

  it("never moves the viewport on load — the header's Next link jumps on request", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T08:25:00+01:00"));
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const booking = {
      ...selectedBooking,
      id: "b-today",
      slot: "08:30",
      _bookingDate: "2026-07-15",
    };

    renderToday({
      selectedDateObj: new Date(2026, 6, 15),
      selectedDateStr: "2026-07-15",
      bookingsByDate: { "2026-07-15": [booking] },
      daySettings: { "2026-07-15": { extraSlots: [], immediateSlots: [] } },
      dayOpenState: { "2026-07-15": true },
    });

    // No auto-scroll: the date and the status sentence stay where the eye is.
    expect(scrollIntoView).not.toHaveBeenCalled();

    const nextLink = screen.getByRole("button", { name: /Next: Jack — Due to arrive in 5 min/ });
    fireEvent.click(nextLink);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("article", { name: "Jack, 08:30, Arriving" })).toHaveFocus();
  });

  it("keeps the minute tick from moving the viewport and updates the Next text live", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T08:25:00+01:00"));
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const booking = {
      ...selectedBooking,
      id: "b-today",
      slot: "08:30",
      _bookingDate: "2026-07-15",
    };

    renderToday({
      selectedDateObj: new Date(2026, 6, 15),
      selectedDateStr: "2026-07-15",
      bookingsByDate: { "2026-07-15": [booking] },
      daySettings: { "2026-07-15": { extraSlots: [], immediateSlots: [] } },
      dayOpenState: { "2026-07-15": true },
    });

    expect(screen.getByRole("button", { name: /Next: Jack — Due to arrive in 5 min/ })).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(screen.getByRole("button", { name: /Next: Jack — Due to arrive in 4 min/ })).toBeInTheDocument();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("fills the gold primary only on the live focus card", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T09:25:00+01:00"));
    const late = {
      ...selectedBooking,
      id: "b-late",
      slot: "08:30",
      _bookingDate: "2026-07-15",
    };
    const upcoming = {
      ...selectedBooking,
      id: "b-upcoming",
      dogName: "Ruby",
      _dogId: "d-ruby",
      slot: "12:00",
      _bookingDate: "2026-07-15",
    };

    const { container } = renderToday({
      selectedDateObj: new Date(2026, 6, 15),
      selectedDateStr: "2026-07-15",
      bookingsByDate: { "2026-07-15": [late, upcoming] },
      dogs: {
        ...selectedViewProps.dogs,
        "d-ruby": { id: "d-ruby", name: "Ruby", size: "small", _humanId: "h1" },
      },
      daySettings: { "2026-07-15": { extraSlots: [], immediateSlots: [] } },
      dayOpenState: { "2026-07-15": true },
    });

    const gold = container.querySelectorAll('[data-primary-action="true"].bg-brand-yellow');
    expect(gold).toHaveLength(1);
    expect(gold[0]).toHaveAccessibleName("Check in Jack");
    expect(screen.getByRole("button", { name: "Check in Ruby" })).not.toHaveClass("bg-brand-yellow");
  });
});

describe("TodayHeader", () => {
  const nowCounts = (over = {}) => ({ late: 0, toConfirm: 0, waiting: 0, dogs: 0, ...over });

  it("keeps the page heading accessible and makes the date the picker control", () => {
    const onOpenDatePicker = vi.fn();
    const onToggleActionFilter = vi.fn();
    render(
      <TodayHeader
        dateLabel="Tuesday 14 July"
        dogsBooked={11}
        nowCounts={nowCounts({ late: 2, toConfirm: 1, waiting: 1, dogs: 4 })}
        actionCount={6}
        unpaidTotal={482}
        isDayOpen
        isToday
        onOpenDatePicker={onOpenDatePicker}
        onManageAvailability={vi.fn()}
        onToggleActionFilter={onToggleActionFilter}
      />,
    );

    expect(screen.getByRole("heading", { name: "Daily Brief" })).toHaveClass("sr-only");
    const dateControl = screen.getByRole("button", { name: "Tuesday 14 July — choose a different date" });
    fireEvent.click(dateControl);
    expect(onOpenDatePicker).toHaveBeenCalledTimes(1);

    // The availability button carries its own state as a sub-label.
    expect(screen.getByRole("button", { name: "Manage availability — No online slots today" })).toBeInTheDocument();

    // The status sentence itemises the act-now reasons — self-defining, no
    // tooltip required — and the cluster is the filter.
    const status = screen.getByRole("region", { name: "Daily Brief status" });
    expect(status).toHaveTextContent("11 booked");
    expect(status).toHaveTextContent("2 late");
    expect(status).toHaveTextContent("1 to confirm");
    expect(status).toHaveTextContent("1 waiting");
    expect(status).toHaveTextContent("£482 to collect");
    const filter = within(status).getByRole("button", { name: /Filter to the 6 bookings needing attention/ });
    expect(filter).toHaveAttribute("aria-pressed", "false");
    expect(filter).toHaveAttribute("data-filter-selected", "false");
    fireEvent.click(filter);
    expect(onToggleActionFilter).toHaveBeenCalledTimes(1);
  });

  it("gives the action filter an explicit visible selected state", () => {
    render(
      <TodayHeader
        dateLabel="Tuesday 14 July"
        dogsBooked={11}
        nowCounts={nowCounts({ late: 2, dogs: 2 })}
        actionCount={6}
        unpaidTotal={482}
        isDayOpen
        isToday
        actionFilterActive
        onOpenDatePicker={noop}
        onManageAvailability={noop}
        onToggleActionFilter={noop}
      />,
    );

    const filter = screen.getByRole("button", { name: "Show all bookings; 6 currently need attention" });
    expect(filter).toHaveAttribute("aria-pressed", "true");
    expect(filter).toHaveAttribute("data-filter-selected", "true");
    expect(filter).toHaveTextContent("Showing 6 · Clear");
  });

  it("reads calm with a whole sentence — never a value under a contradicting label", () => {
    render(
      <TodayHeader
        dateLabel="Thursday 2 July"
        dogsBooked={3}
        nowCounts={nowCounts()}
        actionCount={0}
        unpaidTotal={0}
        isDayOpen
        isToday
        onOpenDatePicker={noop}
        onManageAvailability={noop}
        onToggleActionFilter={noop}
      />,
    );

    const status = screen.getByRole("region", { name: "Daily Brief status" });
    expect(status).toHaveTextContent("Nothing needs you yet");
    expect(status).toHaveTextContent("All paid");
    // The old value/label grid ("On time" stacked over "LATE") is gone.
    expect(screen.queryByText("LATE")).not.toBeInTheDocument();
    expect(screen.queryByText("On time")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Daily Brief operational status" })).not.toBeInTheDocument();
  });

  it("skips the reassurance sentence on a browsed non-today date", () => {
    render(
      <TodayHeader
        dateLabel="Thursday 2 July"
        dogsBooked={3}
        nowCounts={nowCounts()}
        actionCount={0}
        unpaidTotal={0}
        isDayOpen
        isToday={false}
        onOpenDatePicker={noop}
        onManageAvailability={noop}
        onToggleActionFilter={noop}
      />,
    );
    expect(screen.queryByText("Nothing needs you yet")).not.toBeInTheDocument();
  });

  it("announces an over-cap day in coral — the only state where capacity is actionable", () => {
    render(
      <TodayHeader
        dateLabel="Tuesday 14 July"
        dogsBooked={15}
        capacityTotal={14}
        nowCounts={nowCounts()}
        actionCount={0}
        unpaidTotal={0}
        isDayOpen
        isToday
        onOpenDatePicker={noop}
        onManageAvailability={noop}
        onToggleActionFilter={noop}
      />,
    );

    const overCap = screen.getByText(/over the daily cap/);
    expect(overCap).toHaveTextContent("15/14 over the daily cap");
    expect(overCap).toHaveClass("text-brand-coral-text");
  });

  it("offers the Next jump only for today", () => {
    const onJumpToNext = vi.fn();
    const { rerender } = render(
      <TodayHeader
        dateLabel="Tuesday 14 July"
        dogsBooked={3}
        nowCounts={nowCounts({ late: 1, dogs: 1 })}
        actionCount={1}
        unpaidTotal={40}
        isDayOpen
        isToday
        nextUp={{ dogName: "Max", text: "2 hrs 30 min overdue", tone: "overdue" }}
        onJumpToNext={onJumpToNext}
        onOpenDatePicker={noop}
        onManageAvailability={noop}
        onToggleActionFilter={noop}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Next: Max — 2 hrs 30 min overdue" }));
    expect(onJumpToNext).toHaveBeenCalledTimes(1);

    rerender(
      <TodayHeader
        dateLabel="Tuesday 14 July"
        dogsBooked={3}
        nowCounts={nowCounts({ late: 1, dogs: 1 })}
        actionCount={1}
        unpaidTotal={40}
        isDayOpen
        isToday={false}
        nextUp={{ dogName: "Max", text: "2 hrs 30 min overdue", tone: "overdue" }}
        onJumpToNext={onJumpToNext}
        onOpenDatePicker={noop}
        onManageAvailability={noop}
        onToggleActionFilter={noop}
      />,
    );
    expect(screen.queryByRole("button", { name: /^Next:/ })).not.toBeInTheDocument();
  });

  it("keeps availability management visible when the salon is closed", () => {
    render(
      <TodayHeader
        dateLabel="Thursday 2 July"
        dogsBooked={0}
        nowCounts={nowCounts()}
        actionCount={0}
        isDayOpen={false}
        onOpenDatePicker={noop}
        onManageAvailability={noop}
        onToggleActionFilter={noop}
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
    // Online slot → "Take offline"; hidden slot → "Put online".
    expect(screen.getByRole("button", { name: "Take 09:00 offline" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Put 09:30 online" }));
    expect(onToggle).toHaveBeenCalledWith("09:30");
  });

  it("shows Online/Hidden state and the sizes that fit (large only where eligible)", () => {
    render(<AvailabilityModal onClose={noop} view={view} dogsBooked={11} onToggleImmediate={noop} />);
    expect(screen.getAllByText("Online")).toHaveLength(2);
    expect(screen.getByText("Hidden")).toBeInTheDocument();
    // The 12:30 row is the only one that fits Large.
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

describe("CompactZeroState", () => {
  it("renders a one-line reassurance row", () => {
    render(<CompactZeroState>Nothing needs attention right now.</CompactZeroState>);
    expect(screen.getByText(/Nothing needs attention/)).toBeInTheDocument();
  });
});
