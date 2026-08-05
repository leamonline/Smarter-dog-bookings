// Component tests for the redesigned Today command centre: the compact header,
// the single time-ordered booking feed (one card per booking, adaptive
// actions), and the Manage-availability modal. The feed/availability LOGIC is
// unit-tested in src/engine/today.ts; these assert the UI renders the right
// rows, chips, action hierarchy and fires its actions.
import { act, render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";
import { ToastProvider } from "../../../contexts/ToastContext.jsx";
import { TodayHeader } from "./TodayHeader.jsx";
import { BookingFeed } from "./BookingFeed.jsx";
import { AvailabilityModal } from "./AvailabilityModal.jsx";
import { TodaySummaryStrip } from "./TodaySummaryStrip.jsx";
import { TodayView } from "../TodayView.jsx";
import { CompactZeroState } from "./parts.jsx";

const resolve = (b) => ({ dogName: b.dogName, breed: b.breed || "", owner: b.owner || "Owner" });
const getWelfare = () => ({ alerts: [], pregnant: false, notes: "" });
const paidOf = () => ({ kind: "paid", label: "Paid", amountDue: 0, depositPaid: 0, subtotal: 42 });
const noop = () => {};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const baseHandlers = {
  resolve,
  getWelfare,
  paymentOf: paidOf,
  priceOf: () => 42,
  onMarkArrived: noop,
  onStartGroom: noop,
  onMarkReady: noop,
  onMarkCollected: noop,
  onSendCollection: noop,
  onMessageOwner: noop,
  onMarkPaid: noop,
  onDidntShow: noop,
  onOpenBooking: noop,
  onOpenDog: noop,
  onOpenHuman: noop,
  onOpenInvoice: noop,
  onJourneyAction: noop,
  onHideUntilTomorrow: noop,
  onTheWaySignals: {},
};

/** Build a TodayFeedEntry with sensible defaults. */
function entry(booking, overrides = {}) {
  return {
    booking,
    slotMinutes: 0,
    stage: "booked",
    isNext: false,
    isLate: false,
    isUnconfirmed: false,
    owes: false,
    needsAction: false,
    overdueMinutes: 0,
    waitMinutes: null,
    ...overrides,
  };
}

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

    fireEvent.click(screen.getByRole("button", { name: "Choose date, Thursday 16 July" }));
    expect(onOpenDatePicker).toHaveBeenCalledTimes(1);
    expect(screen.getByText("No bookings on this date")).toBeInTheDocument();
    expect(screen.queryByText(/next open day/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Manage availability" }));
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

  it("uses one configured guide price for the row, unpaid summary and mini invoice", () => {
    renderToday({
      bookingsByDate: {
        "2026-07-16": [{ ...selectedBooking, status: "Ready for pick-up" }],
      },
      configPricing: { "full-groom": { small: 5000 } },
    });

    expect(screen.queryByRole("button", { name: "Take £50 from Jack" })).not.toBeInTheDocument();
    const secondary = screen.getByRole("region", { name: "Daily Brief secondary totals" });
    expect(secondary).toHaveTextContent("£50 unpaid");
    expect(secondary).toHaveTextContent("£50 expected");

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
    expect(screen.getByRole("button", { name: "Open Jack's dog file" })).toBeInTheDocument();
    expect(screen.queryByText("No bookings on this date")).not.toBeInTheDocument();
  });

  it("filters the diary to the clearly defined need-action queue", () => {
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

    expect(screen.getByRole("button", { name: "Open Ruby's dog file" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Milo's dog file" })).toBeInTheDocument();

    const filter = screen.getByRole("button", { name: /Filter 1 booking needing action/i });
    expect(filter).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(filter);

    expect(filter).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Open Ruby's dog file" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open Milo's dog file" })).not.toBeInTheDocument();
    expect(
      screen.getByText(/Showing 1 booking needing action:/i),
    ).toHaveTextContent(
      "late arrivals, confirmation chases, overdue collections and unpaid bookings after arrival",
    );

    fireEvent.click(filter);
    expect(screen.getByRole("button", { name: "Open Milo's dog file" })).toBeInTheDocument();
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

    renderToday({
      selectedDateObj: dateObj,
      selectedDateStr: dateStr,
      bookingsByDate: { [dateStr]: [paidBooking, awaitingBooking] },
      daySettings: { [dateStr]: { extraSlots: [], immediateSlots: [] } },
      dayOpenState: { [dateStr]: true },
    });

    expect(screen.queryByRole("region", { name: "Happening now" })).not.toBeInTheDocument();
    expect(screen.queryByText("Awaiting deposit")).not.toBeInTheDocument();
    expect(screen.queryByText(/due in|overdue|booked today|taken today/i)).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Daily Brief secondary totals" })).toHaveTextContent("2/14 capacity");
    expect(screen.getByText("Taken £42")).toBeInTheDocument();
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

  it("routes dog, time, human, payment and owner-message destinations", () => {
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

    fireEvent.click(screen.getByRole("button", { name: "Open Jack's dog file" }));
    fireEvent.click(screen.getByRole("button", { name: "Open 09:00 booking" }));
    fireEvent.click(screen.getByRole("button", { name: "Open David Law's human file" }));
    fireEvent.click(screen.getByRole("button", { name: "Take £42 payment from Jack" }));
    fireEvent.click(screen.getByRole("button", { name: "More actions for Jack" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Message David" }));

    expect(onOpenDog).toHaveBeenCalledWith("d1");
    expect(onOpenHuman).toHaveBeenCalledWith("h1");
    expect(onOpenBooking).toHaveBeenCalledWith("b-selected");
    expect(screen.getByRole("heading", { name: "Invoice · Jack" })).toBeInTheDocument();
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

  it("scrolls to the live booking once without moving keyboard focus on minute ticks", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T08:25:00+01:00"));
    vi.stubGlobal("requestAnimationFrame", (callback) => callback());
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

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    expect(screen.getByLabelText("Jack — due to arrive in 5 min")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open 08:30 booking" })).not.toHaveFocus();

    await act(() => vi.advanceTimersByTimeAsync(60_000));

    expect(screen.getByLabelText("Jack — due to arrive in 4 min")).toBeInTheDocument();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Open 08:30 booking" })).not.toHaveFocus();
  });

  it("does not scroll when the needs-action filter changes the live candidate", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T08:25:00+01:00"));
    vi.stubGlobal("requestAnimationFrame", (callback) => callback());
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const upcoming = {
      ...selectedBooking,
      id: "b-upcoming",
      slot: "08:30",
      _bookingDate: "2026-07-15",
    };
    const overdueCollection = {
      ...selectedBooking,
      id: "b-ready",
      dogName: "Ruby",
      _dogId: "d-ready",
      slot: "08:00",
      status: "Ready for pick-up",
      readyAt: "2026-07-15T06:25:00Z",
      _bookingDate: "2026-07-15",
    };

    renderToday({
      selectedDateObj: new Date(2026, 6, 15),
      selectedDateStr: "2026-07-15",
      bookingsByDate: { "2026-07-15": [overdueCollection, upcoming] },
      dogs: {
        ...selectedViewProps.dogs,
        "d-ready": { id: "d-ready", name: "Ruby", size: "small", _humanId: "h1" },
      },
      daySettings: { "2026-07-15": { extraSlots: [], immediateSlots: [] } },
      dayOpenState: { "2026-07-15": true },
    });

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /Filter 1 booking needing action/i }));

    expect(screen.getByLabelText(/Ruby — waiting for collection/i)).toBeInTheDocument();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("does not scroll when a background booking refresh changes the live candidate", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T08:25:00+01:00"));
    vi.stubGlobal("requestAnimationFrame", (callback) => callback());
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const jack = {
      ...selectedBooking,
      id: "b-jack",
      slot: "08:30",
      _bookingDate: "2026-07-15",
    };
    const ruby = {
      ...selectedBooking,
      id: "b-ruby",
      dogName: "Ruby",
      _dogId: "d-ruby",
      slot: "09:00",
      _bookingDate: "2026-07-15",
    };
    const props = {
      selectedDateObj: new Date(2026, 6, 15),
      selectedDateStr: "2026-07-15",
      dogs: {
        ...selectedViewProps.dogs,
        "d-ruby": { id: "d-ruby", name: "Ruby", size: "small", _humanId: "h1" },
      },
      daySettings: { "2026-07-15": { extraSlots: [], immediateSlots: [] } },
      dayOpenState: { "2026-07-15": true },
    };
    const { rerender } = renderToday({
      ...props,
      bookingsByDate: { "2026-07-15": [jack, ruby] },
    });

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    rerender(todayTree({
      ...props,
      bookingsByDate: {
        "2026-07-15": [{ ...jack, status: "Checked in" }, ruby],
      },
    }));

    expect(screen.getByLabelText("Ruby — due to arrive in 35 min")).toBeInTheDocument();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("scrolls exactly once to the next focus after the focused booking checks in successfully", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T08:25:00+01:00"));
    vi.stubGlobal("requestAnimationFrame", (callback) => callback());
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const onUpdateBooking = vi.fn().mockResolvedValue(true);
    const jack = {
      ...selectedBooking,
      id: "b-jack",
      slot: "08:00",
      _bookingDate: "2026-07-15",
    };
    const ruby = {
      ...selectedBooking,
      id: "b-ruby",
      dogName: "Ruby",
      _dogId: "d-ruby",
      slot: "08:30",
      _bookingDate: "2026-07-15",
    };
    const props = {
      selectedDateObj: new Date(2026, 6, 15),
      selectedDateStr: "2026-07-15",
      dogs: {
        ...selectedViewProps.dogs,
        "d-ruby": { id: "d-ruby", name: "Ruby", size: "small", _humanId: "h1" },
      },
      daySettings: { "2026-07-15": { extraSlots: [], immediateSlots: [] } },
      dayOpenState: { "2026-07-15": true },
      onUpdateBooking,
    };
    const { rerender } = renderToday({
      ...props,
      bookingsByDate: { "2026-07-15": [jack, ruby] },
    });

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Check in Jack" }));
    expect(onUpdateBooking).toHaveBeenCalledTimes(1);
    await act(async () => Promise.resolve());
    rerender(todayTree({
      ...props,
      bookingsByDate: {
        "2026-07-15": [{ ...jack, status: "Checked in" }, ruby],
      },
    }));

    expect(scrollIntoView).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText("Ruby — due to arrive in 5 min")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open 08:30 booking" })).not.toHaveFocus();
  });

  it("repositions exactly once after the focused in-salon dog is marked Ready", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T08:25:00+01:00"));
    vi.stubGlobal("requestAnimationFrame", (callback) => callback());
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const onUpdateBooking = vi.fn().mockResolvedValue(true);
    const jack = {
      ...selectedBooking,
      id: "b-jack",
      slot: "08:00",
      status: "In bath",
      checkedInAt: "2026-07-15T06:30:00Z",
      _bookingDate: "2026-07-15",
    };
    const ruby = {
      ...selectedBooking,
      id: "b-ruby",
      dogName: "Ruby",
      _dogId: "d-ruby",
      slot: "08:30",
      status: "In bath",
      checkedInAt: "2026-07-15T07:00:00Z",
      _bookingDate: "2026-07-15",
    };
    const props = {
      selectedDateObj: new Date(2026, 6, 15),
      selectedDateStr: "2026-07-15",
      dogs: {
        ...selectedViewProps.dogs,
        "d-ruby": { id: "d-ruby", name: "Ruby", size: "small", _humanId: "h1" },
      },
      daySettings: { "2026-07-15": { extraSlots: [], immediateSlots: [] } },
      dayOpenState: { "2026-07-15": true },
      onUpdateBooking,
    };
    const { rerender } = renderToday({
      ...props,
      bookingsByDate: { "2026-07-15": [jack, ruby] },
    });

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Mark Jack ready for collection" }));
    await act(async () => Promise.resolve());
    rerender(todayTree({
      ...props,
      bookingsByDate: {
        "2026-07-15": [{ ...jack, status: "Ready for pick-up" }, ruby],
      },
    }));

    expect(scrollIntoView).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText(/Jack — waiting for collection/i)).toBeInTheDocument();
  });

  it("scrolls exactly once to the next focus after the focused booking is Collected", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T08:25:00+01:00"));
    vi.stubGlobal("requestAnimationFrame", (callback) => callback());
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const onUpdateBooking = vi.fn().mockResolvedValue(true);
    const jack = {
      ...selectedBooking,
      id: "b-jack",
      slot: "08:00",
      status: "Ready for pick-up",
      readyAt: "2026-07-15T06:00:00Z",
      payment: "Paid in Full",
      _bookingDate: "2026-07-15",
    };
    const ruby = {
      ...selectedBooking,
      id: "b-ruby",
      dogName: "Ruby",
      _dogId: "d-ruby",
      slot: "08:30",
      status: "In bath",
      checkedInAt: "2026-07-15T07:00:00Z",
      _bookingDate: "2026-07-15",
    };
    const props = {
      selectedDateObj: new Date(2026, 6, 15),
      selectedDateStr: "2026-07-15",
      dogs: {
        ...selectedViewProps.dogs,
        "d-ruby": { id: "d-ruby", name: "Ruby", size: "small", _humanId: "h1" },
      },
      daySettings: { "2026-07-15": { extraSlots: [], immediateSlots: [] } },
      dayOpenState: { "2026-07-15": true },
      onUpdateBooking,
    };
    const { rerender } = renderToday({
      ...props,
      bookingsByDate: { "2026-07-15": [jack, ruby] },
    });

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Mark Jack collected" }));
    await act(async () => Promise.resolve());
    rerender(todayTree({
      ...props,
      bookingsByDate: {
        "2026-07-15": [{ ...jack, status: "Completed" }, ruby],
      },
    }));

    expect(scrollIntoView).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText(/Ruby — checked in/i)).toBeInTheDocument();
  });

  it("does not scroll when a successful journey mutation was not on the current focus", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T08:25:00+01:00"));
    vi.stubGlobal("requestAnimationFrame", (callback) => callback());
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const onUpdateBooking = vi.fn().mockResolvedValue(true);
    const jack = {
      ...selectedBooking,
      id: "b-jack",
      slot: "08:00",
      _bookingDate: "2026-07-15",
    };
    const ruby = {
      ...selectedBooking,
      id: "b-ruby",
      dogName: "Ruby",
      _dogId: "d-ruby",
      slot: "08:30",
      status: "In bath",
      checkedInAt: "2026-07-15T07:00:00Z",
      _bookingDate: "2026-07-15",
    };
    const props = {
      selectedDateObj: new Date(2026, 6, 15),
      selectedDateStr: "2026-07-15",
      dogs: {
        ...selectedViewProps.dogs,
        "d-ruby": { id: "d-ruby", name: "Ruby", size: "small", _humanId: "h1" },
      },
      daySettings: { "2026-07-15": { extraSlots: [], immediateSlots: [] } },
      dayOpenState: { "2026-07-15": true },
      onUpdateBooking,
    };
    const { rerender } = renderToday({
      ...props,
      bookingsByDate: { "2026-07-15": [jack, ruby] },
    });

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Mark Ruby ready for collection" }));
    await act(async () => Promise.resolve());
    rerender(todayTree({
      ...props,
      bookingsByDate: {
        "2026-07-15": [jack, { ...ruby, status: "Ready for pick-up" }],
      },
    }));

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Jack — 25 min overdue")).toBeInTheDocument();
  });

  it("scrolls when the selected date changes to today", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T08:25:00+01:00"));
    vi.stubGlobal("requestAnimationFrame", (callback) => callback());
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const todayBooking = {
      ...selectedBooking,
      id: "b-today",
      slot: "08:30",
      _bookingDate: "2026-07-15",
    };
    const { rerender } = renderToday();

    expect(scrollIntoView).not.toHaveBeenCalled();
    rerender(todayTree({
      selectedDateObj: new Date(2026, 6, 15),
      selectedDateStr: "2026-07-15",
      bookingsByDate: { "2026-07-15": [todayBooking] },
      daySettings: { "2026-07-15": { extraSlots: [], immediateSlots: [] } },
      dayOpenState: { "2026-07-15": true },
    }));

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Open 08:30 booking" })).not.toHaveFocus();
  });
});

describe("TodayHeader", () => {
  it("keeps the page heading accessible without repeating it and groups the day controls", () => {
    const onToggleActionFilter = vi.fn();
    render(
      <TodayHeader
        dateLabel="Tuesday 14 July"
        dogsBooked={11}
        onSite={3}
        lateCount={2}
        readyCount={4}
        actionCount={6}
        unpaidTotal={482}
        expectedRevenue={638}
        nextOnlineSlot={null}
        isDayOpen
        onOpenDatePicker={vi.fn()}
        onManageAvailability={vi.fn()}
        onToggleActionFilter={onToggleActionFilter}
      />,
    );
    const fullHeader = screen.getByTestId("daily-brief-header-full");
    expect(screen.getByRole("heading", { name: "Daily Brief" })).toHaveClass("sr-only");
    expect(screen.getByTestId("daily-brief-date")).toHaveClass(
      "text-2xl",
      "font-black",
    );
    const dateControl = screen.getByRole("button", {
      name: /Choose date, Tuesday 14 July/i,
    });
    expect(dateControl).toHaveClass(
      "min-h-11",
      "border-slate-300",
      "bg-white",
      "text-brand-purple",
    );
    expect(screen.getByRole("button", { name: "Manage availability" })).toHaveClass("bg-brand-purple");
    expect(within(fullHeader).getByText("No online slots available")).toBeInTheDocument();
    const summary = screen.getByRole("region", { name: "Daily Brief operational status" });
    expect(within(summary).getByText("Late").parentElement).toHaveTextContent("2");
    expect(within(summary).getByText("On site").parentElement).toHaveTextContent("3");
    expect(within(summary).getByText("Ready").parentElement).toHaveTextContent("4");
    expect(within(summary).queryByText("Booked")).not.toBeInTheDocument();
    const secondary = screen.getByRole("region", { name: "Daily Brief secondary totals" });
    expect(secondary).toHaveTextContent("11/14 capacity");
    expect(secondary).toHaveTextContent("£482 unpaid");
    expect(secondary).toHaveTextContent("£638 expected");
    const filter = within(summary).getByRole("button", { name: "Filter 6 bookings needing action" });
    expect(filter).toHaveAttribute("aria-pressed", "false");
    expect(filter).toHaveAttribute("data-filter-selected", "false");
    fireEvent.click(filter);
    expect(onToggleActionFilter).toHaveBeenCalledTimes(1);
  });

  it("uses a clear empty-slot message and keeps all four summary positions", () => {
    render(
      <TodayHeader
        dateLabel="Thursday 2 July"
        dogsBooked={1}
        lateCount={0}
        readyCount={0}
        actionCount={0}
        unpaidTotal={0}
        nextOnlineSlot={null}
        isDayOpen
        onManageAvailability={noop}
      />,
    );
    expect(within(screen.getByTestId("daily-brief-header-full")).getByText("No online slots available")).toBeInTheDocument();
    const summary = screen.getByRole("region", { name: "Daily Brief operational status" });
    expect(within(summary).getByText("On time")).toBeInTheDocument();
    expect(within(summary).getByText("All calm")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Daily Brief secondary totals" })).toHaveTextContent("All paid");
  });

  it("gives the action filter an explicit visible selected state", () => {
    render(
      <TodayHeader
        dateLabel="Tuesday 14 July"
        dogsBooked={11}
        onSite={0}
        actionCount={6}
        unpaidTotal={482}
        expectedRevenue={638}
        isDayOpen
        actionFilterActive
        onOpenDatePicker={noop}
        onManageAvailability={noop}
        onToggleActionFilter={noop}
      />,
    );

    const filter = screen.getByRole("button", { name: "Show all bookings; 6 currently need action" });
    expect(filter).toHaveAttribute("aria-pressed", "true");
    expect(filter).toHaveAttribute("data-filter-selected", "true");
    expect(filter).toHaveTextContent("Filtering");
  });

  it("reads calm and opens the availability modal", () => {
    const onManage = vi.fn();
    render(
      <TodayHeader dateLabel="Thursday 2 July" dogsBooked={1} lateCount={0} readyCount={0} actionCount={0} isDayOpen onManageAvailability={onManage} />,
    );
    expect(screen.getByRole("region", { name: "Daily Brief operational status" })).toHaveTextContent("On time");
    expect(screen.getByRole("region", { name: "Daily Brief secondary totals" })).toHaveTextContent("1/14 capacity");
    expect(within(screen.getByTestId("daily-brief-header-full")).getByText(/all calm/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Manage availability/ }));
    expect(onManage).toHaveBeenCalled();
  });

  it("keeps availability management visible when the salon is closed", () => {
    render(<TodayHeader dateLabel="Thursday 2 July" dogsBooked={0} actionCount={0} isDayOpen={false} onOpenDatePicker={noop} onManageAvailability={noop} />);
    expect(within(screen.getByTestId("daily-brief-header-full")).getByText(/salon closed/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Manage availability/ })).toBeInTheDocument();
  });

  it("briefMode suppresses today's stats — the closed-day KPIs carry the target day's figures", () => {
    render(<TodayHeader dateLabel="Thursday 2 July" dogsBooked={11} actionCount={6} unpaidTotal={478} isDayOpen={false} briefMode onManageAvailability={noop} />);
    expect(within(screen.getByTestId("daily-brief-header-full")).getByText("Thursday 2 July")).toBeInTheDocument();
    expect(screen.queryByText(/dogs booked/)).not.toBeInTheDocument();
    expect(screen.queryByText(/need action/)).not.toBeInTheDocument();
    expect(screen.queryByText(/unpaid/)).not.toBeInTheDocument();
  });

  describe("compact mobile header", () => {
    function renderMobile(props = {}) {
      return render(
        <TodayHeader
          dateLabel="Wednesday 5 August"
          dogsBooked={7}
          actionCount={6}
          expectedRevenue={306}
          unpaidTotal={306}
          isDayOpen
          onOpenDatePicker={noop}
          onManageAvailability={noop}
          onToggleActionFilter={noop}
          {...props}
        />,
      );
    }

    function mobileHeader() {
      // The compact layout is the only sibling of the "full" header that
      // isn't itself the desktop block — select it by exclusion so this test
      // doesn't depend on an incidental class name.
      const full = screen.getByTestId("daily-brief-header-full");
      return full.parentElement.querySelector(":scope > div:not([data-testid='daily-brief-header-full'])");
    }

    it("opens the date picker from the mobile date control, with no separate Choose date button", () => {
      const onOpenDatePicker = vi.fn();
      renderMobile({ onOpenDatePicker });

      const mobile = within(mobileHeader());
      fireEvent.click(mobile.getByRole("button", { name: /Wednesday 5 August/ }));
      expect(onOpenDatePicker).toHaveBeenCalledTimes(1);
      expect(mobile.queryByText("Choose date")).not.toBeInTheDocument();
    });

    it("never shows both unpaid and expected totals together on the compact row", () => {
      renderMobile();
      const mobile = within(mobileHeader());
      expect(mobile.getByText("£306 expected")).toBeInTheDocument();
      expect(mobile.queryByText(/unpaid/)).not.toBeInTheDocument();
    });

    it("filters and clears the board from the mobile Need action control", () => {
      const onToggleActionFilter = vi.fn();
      const { rerender } = renderMobile({ onToggleActionFilter });

      const mobile = within(mobileHeader());
      const needAction = mobile.getByRole("button", { name: "6 need action" });
      expect(needAction).toHaveAttribute("aria-pressed", "false");
      fireEvent.click(needAction);
      expect(onToggleActionFilter).toHaveBeenCalledTimes(1);

      rerender(
        <TodayHeader
          dateLabel="Wednesday 5 August"
          dogsBooked={7}
          actionCount={6}
          expectedRevenue={306}
          isDayOpen
          actionFilterActive
          onOpenDatePicker={noop}
          onManageAvailability={noop}
          onToggleActionFilter={onToggleActionFilter}
        />,
      );
      const clear = within(mobileHeader()).getByRole("button", { name: "Showing 6 · Clear" });
      expect(clear).toHaveAttribute("aria-pressed", "true");
    });

    it("shows a calm, non-interactive state when nothing needs action", () => {
      renderMobile({ actionCount: 0 });
      const mobile = within(mobileHeader());
      expect(mobile.getByText("All calm")).toBeInTheDocument();
      expect(mobile.queryByRole("button", { name: /need action/ })).not.toBeInTheDocument();
    });

    it("opens availability from the compact 44px Availability button", () => {
      const onManageAvailability = vi.fn();
      renderMobile({ onManageAvailability });
      const button = within(mobileHeader()).getByRole("button", { name: "Availability" });
      expect(button).toHaveClass("min-h-11", "min-w-11");
      fireEvent.click(button);
      expect(onManageAvailability).toHaveBeenCalledTimes(1);
    });
  });
});

const dogsMap = { d1: { id: "d1", _humanId: "h1", size: "large" } };

function group(slot, entries) {
  return { slot, label: slot ?? "Unscheduled", slotMinutes: 0, entries };
}

function renderFeed(groups, extra = {}) {
  return render(
    <BookingFeed
      groups={groups}
      dogs={dogsMap}
      ownerCounts={{}}
      expandedIds={new Set()}
      onToggleExpand={noop}
      {...baseHandlers}
      {...extra}
    />,
  );
}

describe("BookingFeed — accessible journey rows", () => {
  const booking = {
    id: "b1",
    dogName: "Jack",
    breed: "Cockapoo",
    service: "Full groom",
    slot: "09:00",
    status: "Booked",
    payment: "Due at Pick-up",
    _dogId: "d1",
    _ownerId: "h1",
    owner: "David Law",
  };

  it("renders one full-width live divider before the focused time group", () => {
    const { container } = renderFeed([group("09:00", [
      entry({ ...booking, id: "b3", dogName: "Clover" }),
      entry({ ...booking, id: "b1", dogName: "Jack" }),
      entry({ ...booking, id: "b2", dogName: "Bertie" }),
    ])], {
      liveFocusId: "b2",
      liveContext: {
        text: "Due to arrive in 5 min",
        tone: "live",
        ariaLabel: "Bertie — due to arrive in 5 min",
      },
    });

    const divider = screen.getByLabelText("Bertie — due to arrive in 5 min");
    expect(divider).toHaveTextContent(
      "Due to arrive in 5 min",
    );
    expect(divider).toHaveAttribute("data-testid", "live-arrival-divider");
    expect(screen.queryByTestId("live-arrival-arrow")).not.toBeInTheDocument();
    expect(screen.queryByTestId("live-day-timeline")).not.toBeInTheDocument();
    const cards = screen.getAllByRole("article");
    expect(divider.compareDocumentPosition(cards[0]) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(container.querySelectorAll("[data-booking-feed-card-shell]")).toHaveLength(3);
  });

  it.each([
    [{ reminderConfirmedAt: "2026-07-15T07:20:00Z", status: "Booked" }, "success", true],
    [{ reminderConfirmedAt: null, status: "Checked in" }, "success", false],
    [{ reminderConfirmedAt: null, status: "In bath" }, "success", false],
    [{ reminderConfirmedAt: "2026-07-15T07:20:00Z", status: "Cancelled" }, "cancelled", true],
  ])(
    "applies the %s journey tone and confirmation tick independently",
    (patch, tone, hasTick) => {
      renderFeed([group("09:00", [entry({ ...booking, ...patch })])]);

      const card = screen.getByRole("article", { name: "Jack booking" });
      expect(card).toHaveAttribute("data-journey-tone", tone);
      const tick = within(card).queryByRole("img", { name: /customer confirmed/i });
      expect(tick !== null).toBe(hasTick);
      if (hasTick) {
        expect(tick).toHaveAccessibleName("Customer confirmed at 08:20");
      }
    },
  );

  it("exposes distinct row destinations and five journey actions before readiness", () => {
    renderFeed([group("09:00", [entry(booking)])]);
    expect(screen.getByRole("button", { name: "Open Jack's dog file" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Full groom booking" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open David Law's human file" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open £42 invoice" })).toBeInTheDocument();
    expect(screen.getAllByTestId("journey-action")).toHaveLength(5);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(
      screen.getAllByTestId("journey-action").every((button) => button.getAttribute("aria-pressed") === "false"),
    ).toBe(true);
    expect(screen.queryByRole("button", { name: /expand/i })).not.toBeInTheDocument();
  });

  it("gives every booking the compact sentence, time and message treatment", () => {
    renderFeed([
      group("09:00", [
        entry(booking),
        entry({ ...booking, id: "b2", dogName: "Ruby", owner: "Derrick Asquith" }),
      ]),
    ]);

    for (const dogName of ["Jack", "Ruby"]) {
      const dogButton = screen.getByRole("button", { name: `Open ${dogName}'s dog file` });
      expect(dogButton.closest("p")).toHaveClass("font-sans", "text-lg", "sm:text-xl");
    }
    for (const timeButton of screen.getAllByRole("button", { name: "Open 09:00 booking" })) {
      expect(timeButton).toHaveClass(
        "size-11",
        "border",
        "border-brand-purple",
        "bg-brand-purple",
      );
      expect(timeButton).toHaveAttribute("data-appointment-state", "scheduled");
    }
    for (const messageButton of [
      screen.getByRole("button", { name: "Message David Law" }),
      screen.getByRole("button", { name: "Message Derrick Asquith" }),
    ]) {
      expect(messageButton).toHaveClass(
        "size-11",
        "border-brand-purple/20",
        "bg-brand-purple/5",
        "text-brand-purple",
      );
      expect(messageButton.querySelector(".lucide-message-circle")).not.toBeNull();
      expect(messageButton.querySelector("svg")).toHaveAttribute("fill", "none");
    }
  });

  it("reserves coral and amber appointment controls for late and blocked bookings", () => {
    renderFeed([
      group("09:00", [entry(booking)]),
      group("09:30", [entry({ ...booking, id: "late", slot: "09:30" }, { isLate: true })]),
      group("10:00", [entry({ ...booking, id: "blocked", slot: "10:00" }, { isUnconfirmed: true })]),
    ]);

    expect(screen.getByRole("button", { name: "Open 09:00 booking" })).toHaveAttribute(
      "data-appointment-state",
      "scheduled",
    );
    expect(screen.getByRole("button", { name: "Open 09:30 booking — late" })).toHaveClass(
      "border-brand-coral",
      "bg-brand-coral",
    );
    expect(screen.getByRole("button", { name: "Open 10:00 booking — needs confirmation" })).toHaveClass(
      "border-brand-yellow-dark",
      "bg-brand-yellow",
    );
  });

  it("keeps time, journey actions and owner message in chronological DOM order", () => {
    renderFeed([group("09:00", [entry(booking)])]);
    const grid = screen.getByTestId("booking-journey-grid");
    expect(within(grid).getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual([
      "Open 09:00 booking",
      "Check-in",
      "Start groom",
      "Ready for collection",
      "Collected",
      "Record payment",
      "Message David Law",
    ]);
    expect(grid).toHaveAttribute("data-centres", "7");
  });

  it("keeps seven centres and replaces Ready with waiting at ready", () => {
    renderFeed([
      group("09:00", [
        entry(
          { ...booking, status: "Ready for pick-up" },
          { stage: "ready" },
        ),
      ]),
    ]);
    const waiting = screen.getByRole("button", { name: "Waiting to be collected" });
    expect(waiting).toBeInTheDocument();
    expect(waiting.querySelector(".lucide-scissors")).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Collected" }).querySelector(".lucide-car"),
    ).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Message for collection" })).not.toBeInTheDocument();
    expect(screen.getByTestId("booking-journey-grid")).toHaveAttribute("data-centres", "7");
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    const actions = screen.getAllByTestId("journey-action");
    expect(actions).toHaveLength(5);
    expect(actions.filter((button) => button.getAttribute("aria-pressed") === "true")).toHaveLength(3);
    for (const completed of actions.filter((button) => button.getAttribute("aria-pressed") === "true")) {
      expect(completed).toHaveClass("border-brand-teal", "bg-brand-teal", "text-white");
    }
  });

  it("offers a compact action key for touch screens without adding permanent labels", () => {
    renderFeed([group("09:00", [entry(booking)])]);
    const help = screen.getByRole("button", { name: "Show booking action key" });
    expect(help).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("region", { name: "Booking action key" })).not.toBeInTheDocument();

    fireEvent.click(help);
    expect(help).toHaveAttribute("aria-expanded", "true");
    const key = screen.getByRole("region", { name: "Booking action key" });
    for (const label of ["Check-in", "Grooming", "Ready", "Collected", "Paid"]) {
      expect(within(key).getByText(label)).toBeInTheDocument();
    }
    expect(within(key).queryByText("Collection message")).not.toBeInTheDocument();
  });

  it("shows the same label pill on hover and keyboard focus", () => {
    renderFeed([group("09:00", [entry(booking)])]);
    const checkIn = screen.getByRole("button", { name: "Check-in" });
    fireEvent.focus(checkIn);
    expect(screen.getByText("Check-in")).toHaveClass("group-focus-within:opacity-100");
  });

  it("renders legacy paid-without-method data neutrally and truthfully", () => {
    renderFeed([
      group("09:00", [
        entry({
          ...booking,
          status: "Completed",
          payment: "Paid in Full",
          paymentMethod: null,
          paidAmount: 42,
        }),
      ]),
    ]);
    const paid = screen.getByRole("button", { name: "Paid £42" });
    expect(paid).toHaveClass("border-brand-paper-line");
    expect(paid.querySelector(".lucide-pound-sterling")).not.toBeNull();
  });

  it.each([
    ["cash", "Paid £42 by cash", ["banknote", "coins"]],
    ["card", "Paid £42 by card", ["credit-card"]],
    ["bank_transfer", "Paid £42 by bank transfer", ["landmark"]],
  ])("renders %s payments with the approved Lucide icon mapping", (paymentMethod, label, icons) => {
    renderFeed([
      group("09:00", [
        entry({
          ...booking,
          payment: "Paid in Full",
          paymentMethod,
          paidAmount: 42,
        }),
      ]),
    ]);

    const paid = screen.getByRole("button", { name: label });
    expect(paid.querySelectorAll("svg")).toHaveLength(icons.length);
    for (const icon of icons) {
      expect(paid.querySelector(`.lucide-${icon}`)).not.toBeNull();
    }
  });

  it("routes each sentence destination through its matching handler", () => {
    const onOpenDog = vi.fn();
    const onOpenBooking = vi.fn();
    const onOpenHuman = vi.fn();
    const onOpenInvoice = vi.fn();
    renderFeed([group("09:00", [entry(booking)])], {
      onOpenDog,
      onOpenBooking,
      onOpenHuman,
      onOpenInvoice,
    });

    fireEvent.click(screen.getByRole("button", { name: "Open Jack's dog file" }));
    fireEvent.click(screen.getByRole("button", { name: "Open Full groom booking" }));
    fireEvent.click(screen.getByRole("button", { name: "Open David Law's human file" }));
    fireEvent.click(screen.getByRole("button", { name: "Open £42 invoice" }));

    expect(onOpenDog).toHaveBeenCalledWith("d1");
    expect(onOpenBooking).toHaveBeenCalledWith("b1");
    expect(onOpenHuman).toHaveBeenCalledWith("h1");
    expect(onOpenInvoice).toHaveBeenCalledWith(booking);
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

describe("TodaySummaryStrip", () => {
  const summary = { total: 4, arrived: 3, expected: 1, ready: 1, collected: 1, unpaidCount: 2, dogsBooked: 4, capacityUsedPct: 29, expectedRevenue: 168, collectedRevenue: 84 };

  it("keeps lifecycle progress without repeating the operational-header metrics", () => {
    render(<TodaySummaryStrip summary={summary} />);
    expect(screen.getByText("Daily progress")).toBeInTheDocument();
    expect(screen.getByText("1 collected")).toBeInTheDocument();
    for (const label of ["Arrived", "Ready", "Collected"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.queryByText("Booked")).not.toBeInTheDocument();
    expect(screen.queryByText("Expected")).not.toBeInTheDocument();
  });

  it("keeps the takings-by-method row", () => {
    render(
      <TodaySummaryStrip
        summary={summary}
        takings={{ total: 84, count: 2, byMethod: [{ method: "card", label: "Card", amount: 84, count: 2 }] }}
      />,
    );
    expect(screen.getByText(/Taken today £84/)).toBeInTheDocument();
    expect(screen.getByText("Card")).toBeInTheDocument();
  });

  it("uses compact zero-progress copy when nothing has arrived, been readied, collected or taken", () => {
    render(
      <TodaySummaryStrip
        summary={{ ...summary, arrived: 0, ready: 0, collected: 0 }}
        takings={{ total: 0, count: 0, byMethod: [] }}
      />,
    );
    expect(screen.getByText("Progress: no dogs have arrived yet")).toBeInTheDocument();
    expect(screen.queryByText("Daily progress", { selector: "h2" })).not.toBeInTheDocument();
    expect(screen.queryByText("Arrived")).not.toBeInTheDocument();
  });

  it("renders the detailed panel once any real progress exists", () => {
    render(<TodaySummaryStrip summary={{ ...summary, arrived: 1, ready: 0, collected: 0 }} />);
    expect(screen.getByText("Arrived")).toBeInTheDocument();
    expect(screen.queryByText("Progress: no dogs have arrived yet")).not.toBeInTheDocument();
  });
});

describe("CompactZeroState", () => {
  it("renders a one-line reassurance row", () => {
    render(<CompactZeroState>Nothing needs attention right now.</CompactZeroState>);
    expect(screen.getByText(/Nothing needs attention/)).toBeInTheDocument();
  });
});
