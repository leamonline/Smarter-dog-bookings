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
  const view = render(
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
  return { board, handlers, ...view };
}

describe("StatusBoard", () => {
  it("renders every operational lane, dog-first cards and compact completed history", () => {
    renderBoard([
      booking({ id: "due" }),
      booking({ id: "checked", status: BOOKING_STATUS.CHECKED_IN, checkedInAt: "2026-07-14T08:30:00Z" }),
      booking({ id: "bath", status: BOOKING_STATUS.IN_BATH, checkedInAt: "2026-07-14T08:00:00Z" }),
      booking({ id: "ready", status: BOOKING_STATUS.READY_FOR_PICKUP, readyAt: "2026-07-14T09:00:00Z" }),
      booking({ id: "home", status: BOOKING_STATUS.COMPLETED, completedAt: "2026-07-14T09:30:00Z", payment: "Paid in Full" }),
    ]);

    expect(screen.getByRole("region", { name: "Arriving, 1 dog" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "With us, 2 dogs" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Ready to go, 1 dog" })).toBeInTheDocument();
    const home = screen.getByRole("region", { name: "Home today, 1 dog" });
    const homeToggle = within(home).getByRole("button", { name: "Show 1 dog sent home" });
    expect(homeToggle).toHaveAttribute("aria-expanded", "false");
    expect(within(home).queryByRole("list")).not.toBeInTheDocument();
    fireEvent.click(homeToggle);
    expect(homeToggle).toHaveAttribute("aria-expanded", "true");
    expect(within(home).getByRole("button", { name: "Milo" })).toBeInTheDocument();

    const maxCard = screen.getByRole("article", { name: "Max, 11:00, Arriving" });
    expect(within(maxCard).getByRole("heading", { level: 3, name: "Max" })).toBeInTheDocument();
    expect(within(maxCard).getByRole("button", { name: "Open Dave Smith's human file" })).toHaveClass("text-slate-600");
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });

  it("shows an unpaid warning on Home today when a completed booking still owes money", () => {
    renderBoard([
      booking({ id: "home", status: BOOKING_STATUS.COMPLETED, completedAt: "2026-07-14T09:30:00Z" }),
    ]);

    const home = screen.getByRole("region", { name: "Home today, 1 dog, 1 unpaid" });
    expect(within(home).getByText("1 unpaid")).toBeInTheDocument();
  });

  it("shows no Home today warning once every completed booking is paid", () => {
    renderBoard([
      booking({ id: "home", status: BOOKING_STATUS.COMPLETED, completedAt: "2026-07-14T09:30:00Z", payment: "Paid in Full" }),
    ]);

    expect(screen.getByRole("region", { name: "Home today, 1 dog" })).toBeInTheDocument();
    expect(screen.queryByText("1 unpaid")).not.toBeInTheDocument();
  });

  it("uses lane context instead of repeating physical status on every card", () => {
    renderBoard([
      booking({ id: "due" }),
      booking({ id: "checked", status: BOOKING_STATUS.CHECKED_IN }),
      booking({ id: "ready", status: BOOKING_STATUS.READY_FOR_PICKUP, readyAt: "2026-07-14T09:00:00Z" }),
    ]);

    expect(within(screen.getByRole("article", { name: "Max, 11:00, Arriving" })).queryByText("Booked", { exact: true })).not.toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "Bella, 11:00, With us" })).queryByText("Checked in", { exact: true })).not.toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "Daisy, 11:00, Ready to go" })).queryByText("Ready", { exact: true })).not.toBeInTheDocument();
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

  it("keeps payment separate and moves collection payment into the overflow", () => {
    const { handlers } = renderBoard([
      booking({ id: "ready", status: BOOKING_STATUS.READY_FOR_PICKUP, readyAt: "2026-07-14T09:00:00Z" }),
      booking({ id: "paid", status: BOOKING_STATUS.READY_FOR_PICKUP, readyAt: "2026-07-14T09:30:00Z", payment: "Paid in Full" }),
    ]);

    expect(screen.queryByRole("button", { name: "Take £42 from Daisy" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "More actions for Daisy" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Take £42 payment" }));
    expect(handlers.onOpenInvoice).toHaveBeenCalledWith(expect.objectContaining({ id: "ready" }));
    expect(screen.queryByRole("button", { name: /Take £.* from Ralph/ })).not.toBeInTheDocument();
    expect(screen.getByText("£42 due")).toBeInTheDocument();
    expect(screen.getByText("Paid")).toBeInTheDocument();
  });

  it("offers a real call action for a late dog and keeps no-show manual", () => {
    const { handlers, container } = renderBoard([
      booking({ id: "late", slot: "09:00" }),
    ]);

    expect(screen.getByRole("link", { name: "Call Emma about Luna" })).toHaveAttribute("href", "tel:07111222333");
    expect(screen.getByRole("button", { name: "Check in Luna" })).toHaveAttribute("data-primary-action", "true");
    expect(container.querySelectorAll('[data-primary-action="true"]')).toHaveLength(1);
    expect(within(screen.getByRole("region", { name: "Arriving, 1 dog" })).getByText("1 late")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "More actions for Luna" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Didn't show" }));
    expect(handlers.onDidntShow).toHaveBeenCalledWith(expect.objectContaining({ id: "late" }));
  });

  it("preserves the customer-confirmed signal and one live divider", () => {
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
    expect(screen.getAllByTestId("live-arrival-divider")).toHaveLength(1);
    expect(screen.queryByTestId("live-arrival-arrow")).not.toBeInTheDocument();
  });

  it("places the live divider before the complete same-time group without narrowing cards", () => {
    const { container } = renderBoard(
      [
        booking({ id: "same-c", dogName: "Clover", slot: "11:00", payment: "Paid in Full" }),
        booking({ id: "same-a", dogName: "Alfie", slot: "11:00", payment: "Paid in Full" }),
        booking({ id: "same-b", dogName: "Bertie", slot: "11:00", payment: "Paid in Full" }),
      ],
      {
        liveFocusId: "same-b",
        liveContext: {
          text: "Due to arrive in 45 mins",
          tone: "live",
          ariaLabel: "Bertie — due to arrive in 45 mins",
        },
      },
    );

    const lane = screen.getByRole("region", { name: "Arriving, 3 dogs" });
    const divider = within(lane).getByTestId("live-arrival-divider");
    const cards = within(lane).getAllByRole("article");
    expect(divider.compareDocumentPosition(cards[0]) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(container.querySelectorAll("[data-status-card-shell]")).toHaveLength(3);
    for (const shell of container.querySelectorAll("[data-status-card-shell]")) {
      expect(shell).toHaveClass("w-full");
    }
  });

  it("shows the row-level reason that puts every actionable booking in the filter", () => {
    renderBoard([
      booking({ id: "upcoming", dogName: "Olive", slot: "12:00", payment: "Paid in Full" }),
      booking({
        id: "unconfirmed",
        dogName: "Pip",
        slot: "11:00",
        payment: "Paid in Full",
        reminderState: "sent",
        confirmationChannel: "whatsapp",
      }),
      booking({ id: "late", dogName: "Luna", slot: "09:00", payment: "Paid in Full" }),
      booking({ id: "checked", dogName: "Bella", status: BOOKING_STATUS.CHECKED_IN }),
      booking({
        id: "ready",
        dogName: "Daisy",
        status: BOOKING_STATUS.READY_FOR_PICKUP,
        readyAt: null,
        payment: "Paid in Full",
      }),
    ]);

    expect(within(screen.getByRole("article", { name: "Olive, 12:00, Arriving" })).queryByText("Upcoming")).not.toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "Olive, 12:00, Arriving" })).getByText(/Due in/)).toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "Pip, 11:00, Arriving" })).getByText("Needs confirmation")).toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "Luna, 09:00, Arriving" })).getByText("1 hr 15 mins late")).toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "Bella, 11:00, With us" })).getByText("£42 due")).toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "Daisy, 11:00, Ready to go" })).getByText("Waiting")).toBeInTheDocument();
  });

  it("opens each unknown-status booking directly and does not flag cancelled bookings", () => {
    const { handlers } = renderBoard([
      booking({ id: "home", status: BOOKING_STATUS.COMPLETED }),
      booking({ id: "cancelled", dogName: "Finn", status: BOOKING_STATUS.CANCELLED }),
      booking({ id: "unknown-a", dogName: "Rufus", slot: "12:30", status: "Awaiting magic" }),
      booking({ id: "unknown-b", dogName: "Nell", slot: "", status: "" }),
    ]);

    expect(screen.getByRole("region", { name: "Arriving, 0 dogs" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "With us, 0 dogs" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Ready to go, 0 dogs" })).toBeInTheDocument();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("2 bookings need their status fixed");
    expect(alert).toHaveTextContent("Rufus");
    expect(alert).toHaveTextContent("12:30");
    expect(alert).toHaveTextContent("Nell");
    expect(alert).toHaveTextContent("Time missing");
    expect(alert).not.toHaveTextContent("Finn");

    fireEvent.click(within(alert).getByRole("button", { name: "Fix Rufus's 12:30 booking" }));
    expect(handlers.onOpenBooking).toHaveBeenCalledWith("unknown-a");
  });

  it("bounds populated desktop lanes while empty lanes keep their natural height", () => {
    renderBoard([booking({ id: "due" })]);

    const arriving = screen.getByRole("region", { name: "Arriving, 1 dog" });
    const emptyWithUs = screen.getByRole("region", { name: "With us, 0 dogs" });
    expect(arriving).toHaveAttribute("data-lane-populated", "true");
    expect(arriving).toHaveClass("xl:max-h-[min(66vh,44rem)]", "xl:flex", "xl:min-h-0");
    expect(within(arriving).getByTestId("due-lane-body")).toHaveClass("xl:overflow-y-auto", "xl:min-h-0", "xl:flex-1");
    expect(emptyWithUs).toHaveAttribute("data-lane-populated", "false");
    expect(emptyWithUs).not.toHaveClass("xl:max-h-[min(66vh,44rem)]");
  });
});
