import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BOOKING_STATUS } from "../../../constants/index";
import { buildDailyBriefBoard } from "../../../engine/dailyBrief";
import { paymentState } from "../../../engine/today";
import { StatusBoard } from "./StatusBoard.jsx";

const NOW = new Date("2026-07-14T10:15:00+01:00");

function booking(overrides = {}) {
  return {
    id: "b1",
    dogName: "Max",
    breed: "Cockapoo",
    size: "small",
    service: "full-groom",
    owner: "Dave Smith",
    status: BOOKING_STATUS.BOOKED,
    slot: "11:00",
    addons: [],
    pickupBy: "",
    payment: "Due at Pick-up",
    confirmed: true,
    dogNameSnapshot: null,
    breedSnapshot: null,
    ownerNameSnapshot: null,
    whatsappConversationId: null,
    whatsappMessageId: null,
    staffCapacityOverride: false,
    staffCapacityOverrideBy: null,
    staffCapacityOverrideAt: null,
    reminderConfirmedAt: null,
    _dogId: "d1",
    _ownerId: "h1",
    _pickupById: null,
    _bookingDate: "2026-07-14",
    _groupId: null,
    ...overrides,
  };
}

const displayById = {
  due: { dogName: "Max", breed: "Cockapoo", owner: "Dave Smith", ownerPhone: "07123 456789" },
  checked: { dogName: "Bella", breed: "Spaniel", owner: "Sarah Jones", ownerPhone: "" },
  bath: { dogName: "Charlie", breed: "Labradoodle", owner: "Tom Baker", ownerPhone: "" },
  ready: { dogName: "Daisy", breed: "Poodle", owner: "Lisa Brown", ownerPhone: "" },
  paid: { dogName: "Ralph", breed: "Terrier", owner: "Jo Green", ownerPhone: "" },
  home: { dogName: "Milo", breed: "Collie", owner: "Amy Stone", ownerPhone: "" },
  late: { dogName: "Luna", breed: "Cavapoo", owner: "Emma Wilson", ownerPhone: "07111 222333" },
  confirmed: { dogName: "Rosie", breed: "Poodle", owner: "Nina Moss", ownerPhone: "" },
};

function renderBoard(bookings, overrides = {}) {
  const board = buildDailyBriefBoard(bookings, "2026-07-14", NOW);
  const handlers = {
    onOpenDog: vi.fn(),
    onOpenHuman: vi.fn(),
    onOpenBooking: vi.fn(),
    onOpenInvoice: vi.fn(),
    onMessageOwner: vi.fn(),
    onJourneyAction: vi.fn(),
    onRequestCollected: vi.fn(),
    onDidntShow: vi.fn(),
    ...overrides.handlers,
  };
  render(
    <StatusBoard
      board={board}
      resolve={(item) => displayById[item.id] || {
        dogName: item.dogName,
        breed: item.breed,
        owner: item.owner,
        ownerPhone: "",
      }}
      getWelfare={() => ({ alerts: [], pregnant: false, notes: "" })}
      paymentOf={(item) => paymentState(item)}
      liveFocusId={overrides.liveFocusId || null}
      liveContext={overrides.liveContext || null}
      isToday
      handlers={handlers}
    />,
  );
  return { board, handlers };
}

describe("StatusBoard", () => {
  it("renders every operational lane, dog-first cards and compact completed history", () => {
    renderBoard([
      booking({ id: "due" }),
      booking({ id: "checked", status: BOOKING_STATUS.CHECKED_IN, checkedInAt: "2026-07-14T08:30:00Z" }),
      booking({ id: "bath", status: BOOKING_STATUS.IN_BATH, checkedInAt: "2026-07-14T08:00:00Z" }),
      booking({ id: "ready", status: BOOKING_STATUS.READY_FOR_PICKUP, readyAt: "2026-07-14T09:00:00Z" }),
      booking({ id: "home", status: BOOKING_STATUS.COMPLETED, completedAt: "2026-07-14T09:30:00Z" }),
    ]);

    expect(screen.getByRole("region", { name: "Due and late, 1 dog" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "With us, 2 dogs" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Ready to go, 1 dog" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Home today, 1 dog" })).toBeInTheDocument();

    const maxCard = screen.getByRole("article", { name: "Max, 11:00, Due and late" });
    expect(within(maxCard).getByRole("heading", { level: 3, name: "Max" })).toBeInTheDocument();
    expect(within(maxCard).getByRole("button", { name: "Open Dave Smith's human file" })).toHaveClass("text-slate-600");
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });

  it("shows one outcome-led primary action for each active status", () => {
    const { handlers } = renderBoard([
      booking({ id: "due" }),
      booking({ id: "checked", status: BOOKING_STATUS.CHECKED_IN }),
      booking({ id: "bath", status: BOOKING_STATUS.IN_BATH }),
      booking({ id: "ready", status: BOOKING_STATUS.READY_FOR_PICKUP, readyAt: "2026-07-14T09:00:00Z" }),
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Check in Max" }));
    fireEvent.click(screen.getByRole("button", { name: "Start Bella's groom" }));
    fireEvent.click(screen.getByRole("button", { name: "Mark Charlie ready for collection" }));
    fireEvent.click(screen.getByRole("button", { name: "Mark Daisy collected" }));

    expect(handlers.onJourneyAction).toHaveBeenNthCalledWith(1, expect.objectContaining({ id: "due" }), expect.objectContaining({ id: "checkIn" }));
    expect(handlers.onJourneyAction).toHaveBeenNthCalledWith(2, expect.objectContaining({ id: "checked" }), expect.objectContaining({ id: "startGroom" }));
    expect(handlers.onJourneyAction).toHaveBeenNthCalledWith(3, expect.objectContaining({ id: "bath" }), expect.objectContaining({ id: "ready" }));
    expect(handlers.onRequestCollected).toHaveBeenCalledWith(expect.objectContaining({ id: "ready" }));
    expect(screen.queryByText("Next step")).not.toBeInTheDocument();
  });

  it("keeps payment separate with a calculated secondary action only when due", () => {
    const { handlers } = renderBoard([
      booking({ id: "ready", status: BOOKING_STATUS.READY_FOR_PICKUP, readyAt: "2026-07-14T09:00:00Z" }),
      booking({ id: "paid", status: BOOKING_STATUS.READY_FOR_PICKUP, readyAt: "2026-07-14T09:30:00Z", payment: "Paid in Full" }),
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Take £42 from Daisy" }));
    expect(handlers.onOpenInvoice).toHaveBeenCalledWith(expect.objectContaining({ id: "ready" }));
    expect(screen.queryByRole("button", { name: /Take £.* from Ralph/ })).not.toBeInTheDocument();
    expect(screen.getByText("£42 due")).toBeInTheDocument();
    expect(screen.getByText("Paid")).toBeInTheDocument();
  });

  it("offers a real call action for a late dog and keeps no-show manual", () => {
    const { handlers } = renderBoard([
      booking({ id: "late", slot: "09:00" }),
    ]);

    expect(screen.getByRole("link", { name: "Call Emma about Luna" })).toHaveAttribute("href", "tel:07111222333");
    fireEvent.click(screen.getByRole("button", { name: "More actions for Luna" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Didn't show" }));
    expect(handlers.onDidntShow).toHaveBeenCalledWith(expect.objectContaining({ id: "late" }));
  });

  it("preserves the customer-confirmed signal and one live marker", () => {
    renderBoard(
      [booking({ id: "confirmed", reminderConfirmedAt: "2026-07-14T08:05:00Z" })],
      {
        liveFocusId: "confirmed",
        liveContext: {
          text: "Due to arrive in 45 mins",
          tone: "live",
          ariaLabel: "Rosie — due to arrive in 45 mins",
        },
      },
    );

    expect(screen.getByLabelText("Customer confirmed at 09:05")).toBeInTheDocument();
    expect(screen.getByLabelText("Rosie — due to arrive in 45 mins")).toBeInTheDocument();
    expect(screen.getAllByTestId("live-arrival-label")).toHaveLength(1);
  });

  it("keeps all lane headings present when active lanes are empty", () => {
    renderBoard([
      booking({ id: "home", status: BOOKING_STATUS.COMPLETED }),
      booking({ id: "unknown", status: "Awaiting magic" }),
    ]);

    expect(screen.getByRole("region", { name: "Due and late, 0 dogs" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "With us, 0 dogs" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Ready to go, 0 dogs" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("1 booking has an unknown status");
  });
});
