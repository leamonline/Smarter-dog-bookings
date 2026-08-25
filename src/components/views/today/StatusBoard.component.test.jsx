import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BOOKING_STATUS } from "../../../constants/index";
import { buildDailyBriefBoard } from "../../../engine/dailyBrief";
import { buildDaySummary, buildTakingsByMethod, paymentState } from "../../../engine/today";
import { applyChatConfirmations } from "../../../engine/replyConfirmation";
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
  const built = buildDailyBriefBoard(bookings, "2026-07-14", NOW);
  // Mirrors TodayView: chat confirmations are folded into the built board.
  const signals = overrides.chatConfirmations || {};
  const board = {
    ...built,
    due: applyChatConfirmations(built.due, signals),
    withUs: applyChatConfirmations(built.withUs, signals),
    ready: applyChatConfirmations(built.ready, signals),
    home: applyChatConfirmations(built.home, signals),
  };
  const handlers = {
    onOpenDog: vi.fn(),
    onOpenHuman: vi.fn(),
    onOpenBooking: vi.fn(),
    onOpenInvoice: vi.fn(),
    onMessageOwner: vi.fn(),
    onConfirmArrival: vi.fn(),
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
      isToday={overrides.isToday ?? true}
      handlers={handlers}
      busyIds={overrides.busyIds || null}
      summary={overrides.summary ?? buildDaySummary(bookings)}
      takings={overrides.takings ?? buildTakingsByMethod(bookings)}
      capacityTotal={14}
    />,
  );
  return { board, handlers, ...view };
}

describe("StatusBoard", () => {
  it("renders every populated lane, dog-first cards and the end-of-day strip", () => {
    renderBoard([
      booking({ id: "due" }),
      booking({ id: "checked", status: BOOKING_STATUS.CHECKED_IN, checkedInAt: "2026-07-14T08:30:00Z" }),
      booking({ id: "bath", status: BOOKING_STATUS.IN_BATH, checkedInAt: "2026-07-14T08:00:00Z" }),
      booking({ id: "ready", status: BOOKING_STATUS.READY_FOR_PICKUP, readyAt: "2026-07-14T09:00:00Z" }),
      booking({ id: "home", status: BOOKING_STATUS.COMPLETED, completedAt: "2026-07-14T09:30:00Z", payment: "Paid in Full", paidAmount: 42, paymentMethod: "cash" }),
    ]);

    expect(screen.getByRole("region", { name: "Arriving, 1 dog" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "With us, 2 dogs" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Ready to go, 1 dog" })).toBeInTheDocument();

    // The end-of-day strip: cumulative progress + till + expected + capacity,
    // with the sent-home list behind one disclosure.
    const endOfDay = screen.getByRole("region", { name: "End of day" });
    expect(endOfDay).toHaveTextContent("4 arrived so far");
    expect(endOfDay).toHaveTextContent("Taken £42");
    expect(endOfDay).toHaveTextContent("Cash £42");
    expect(endOfDay).toHaveTextContent("Capacity 5/14");
    const home = screen.getByRole("group", { name: "Home today, 1 dog" });
    const homeToggle = within(home).getByRole("button", { name: "Show 1 dog sent home" });
    expect(homeToggle).toHaveAttribute("aria-expanded", "false");
    expect(within(home).queryByRole("list")).not.toBeInTheDocument();
    fireEvent.click(homeToggle);
    expect(homeToggle).toHaveAttribute("aria-expanded", "true");
    expect(within(home).getByText("Milo")).toBeInTheDocument();

    const maxCard = screen.getByRole("article", { name: "Max, 11:00, Arriving" });
    // Max's dog name is a level-4 heading nested under its slot group's
    // level-3 heading, itself under the lane's level-2 heading — a real
    // three-level hierarchy now that Arriving groups by appointment slot.
    expect(within(maxCard).getByRole("heading", { level: 4, name: "Max" })).toBeInTheDocument();
    // Names are calm text, not sub-24px buttons — the card body opens the
    // booking, and the files live one tap away in More.
    expect(within(maxCard).queryByRole("button", { name: "Open Dave Smith's human file" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });

  it("shows an unpaid warning on Home today when a completed booking still owes money", () => {
    renderBoard([
      booking({ id: "home", status: BOOKING_STATUS.COMPLETED, completedAt: "2026-07-14T09:30:00Z" }),
    ]);

    const home = screen.getByRole("group", { name: "Home today, 1 dog, 1 unpaid" });
    expect(within(home).getByText("1 unpaid")).toBeInTheDocument();
  });

  it("shows no Home today warning once every completed booking is paid", () => {
    renderBoard([
      booking({ id: "home", status: BOOKING_STATUS.COMPLETED, completedAt: "2026-07-14T09:30:00Z", payment: "Paid in Full" }),
    ]);

    expect(screen.getByRole("group", { name: "Home today, 1 dog" })).toBeInTheDocument();
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

  it("fills exactly one gold primary — the live focus — and outlines every other", () => {
    const { container } = renderBoard(
      [
        booking({ id: "late", dogName: "Luna", slot: "09:00" }),
        booking({ id: "due", slot: "12:00" }),
        booking({ id: "checked", status: BOOKING_STATUS.CHECKED_IN }),
      ],
      { liveFocusId: "late" },
    );

    const gold = container.querySelectorAll('[data-primary-action="true"].bg-brand-yellow');
    expect(gold).toHaveLength(1);
    expect(gold[0]).toHaveAccessibleName("Check in Luna");
    expect(screen.getByRole("button", { name: "Check in Max" })).not.toHaveClass("bg-brand-yellow");
    expect(screen.getByRole("button", { name: "Start Bella's groom" })).not.toHaveClass("bg-brand-yellow");
  });

  it("fills no gold primary at all on a non-today date", () => {
    const { container } = renderBoard(
      [booking({ id: "due", slot: "12:00" })],
      { isToday: false, liveFocusId: null },
    );
    expect(container.querySelectorAll(".bg-brand-yellow")).toHaveLength(0);
  });

  it("paints urgency on the rail: coral for late, emerald for ready, none while calm", () => {
    renderBoard([
      booking({ id: "late", dogName: "Luna", slot: "09:00" }),
      booking({ id: "due", slot: "12:00", payment: "Paid in Full" }),
      booking({ id: "ready", status: BOOKING_STATUS.READY_FOR_PICKUP, readyAt: "2026-07-14T09:00:00Z" }),
      booking({ id: "checked", status: BOOKING_STATUS.CHECKED_IN }),
    ]);

    expect(screen.getByRole("article", { name: "Luna, 09:00, Arriving" }).querySelector("[data-rail]")).toHaveAttribute("data-rail", "coral");
    expect(screen.getByRole("article", { name: "Daisy, 11:00, Ready to go" }).querySelector("[data-rail]")).toHaveAttribute("data-rail", "emerald");
    expect(screen.getByRole("article", { name: "Max, 12:00, Arriving" }).querySelector("[data-rail]")).toBeNull();
    expect(screen.getByRole("article", { name: "Bella, 11:00, With us" }).querySelector("[data-rail]")).toBeNull();
  });

  it("opens the booking from the card body and the files from More", () => {
    const { handlers } = renderBoard([booking({ id: "due" })]);

    fireEvent.click(screen.getByRole("button", { name: "Open Max's 11:00 booking" }));
    expect(handlers.onOpenBooking).toHaveBeenCalledWith("due");

    fireEvent.click(screen.getByRole("button", { name: "More actions for Max" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Open Max's dog file" }));
    expect(handlers.onOpenDog).toHaveBeenCalledWith("d1");

    fireEvent.click(screen.getByRole("button", { name: "More actions for Max" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Open Dave Smith's human file" }));
    expect(handlers.onOpenHuman).toHaveBeenCalledWith("h1");
  });

  it("dims the pressed card's actions while its write is in flight", () => {
    renderBoard([booking({ id: "due" })], { busyIds: new Set(["due"]) });

    const primary = screen.getByRole("button", { name: "Check in Max" });
    expect(primary).toBeDisabled();
    expect(primary).toHaveAttribute("aria-busy", "true");
  });

  it("promotes Take payment to primary when Ready still owes money, keeping Mark collected one tap away", () => {
    const { handlers } = renderBoard([
      booking({ id: "ready", status: BOOKING_STATUS.READY_FOR_PICKUP, readyAt: "2026-07-14T09:00:00Z" }),
      booking({ id: "paid", status: BOOKING_STATUS.READY_FOR_PICKUP, readyAt: "2026-07-14T09:30:00Z", payment: "Paid in Full" }),
    ]);

    const takePayment = screen.getByRole("button", { name: "Take £42 payment from Daisy" });
    expect(takePayment).toHaveAttribute("data-primary-action", "true");
    fireEvent.click(takePayment);
    expect(handlers.onOpenInvoice).toHaveBeenCalledWith(expect.objectContaining({ id: "ready" }));

    const markCollected = screen.getByRole("button", { name: "Mark Daisy collected" });
    expect(markCollected).not.toHaveAttribute("data-primary-action");
    fireEvent.click(markCollected);
    expect(handlers.onRequestCollected).toHaveBeenCalledWith(expect.objectContaining({ id: "ready" }));

    // Ralph is already paid — no payment button at all, Mark collected alone is primary.
    expect(screen.queryByRole("button", { name: /Take £.* payment from Ralph/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark Ralph collected" })).toHaveAttribute("data-primary-action", "true");

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

  it("preserves the customer-confirmed signal with no auto-scroll divider anywhere", () => {
    renderBoard(
      [booking({ id: "confirmed", reminderConfirmedAt: "2026-07-14T08:05:00Z" })],
      { liveFocusId: "confirmed" },
    );

    expect(screen.getByLabelText("Customer confirmed at 09:05")).toBeInTheDocument();
    expect(screen.queryAllByTestId("live-arrival-divider")).toHaveLength(0);
    expect(screen.queryByText("Next arrival")).not.toBeInTheDocument();
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

    // Countdown/lateness live once on the shared slot heading rather than
    // being repeated inside each dog's own article.
    const dueLane = screen.getByRole("region", { name: "Arriving, 3 dogs" });
    expect(within(dueLane).queryByText("Upcoming")).not.toBeInTheDocument();
    expect(within(dueLane).getByText("Due in 1 hr 45 min")).toBeInTheDocument();
    expect(within(dueLane).getByText("1 hr 15 min late")).toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "Olive, 12:00, Arriving" })).queryByText(/Due in/)).not.toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "Pip, 11:00, Arriving" })).getByText("Needs confirmation")).toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "Bella, 11:00, With us" })).getByText("£42 due")).toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "Daisy, 11:00, Ready to go" })).getByText("Waiting")).toBeInTheDocument();
  });

  it("keeps a mid-groom balance quiet — money is not an act-now state before Ready", () => {
    renderBoard([booking({ id: "checked", status: BOOKING_STATUS.CHECKED_IN })]);

    // The lane heading carries no "unpaid" warning while the dog is with us…
    const lane = screen.getByRole("region", { name: "With us, 1 dog" });
    expect(within(lane).queryByText(/unpaid/)).not.toBeInTheDocument();
    // …and the card's own money fact renders in the quiet register, without
    // the payment action-reason marker it gains at Ready.
    const money = within(lane).getByText("£42 due");
    expect(money).not.toHaveAttribute("data-action-reason");
  });

  it("offers a staff Confirm action on an unconfirmed card and routes it to the handler", () => {
    const { handlers } = renderBoard([
      booking({
        id: "unconfirmed",
        dogName: "Pip",
        slot: "11:00",
        reminderState: "sent",
        confirmationChannel: "whatsapp",
      }),
      booking({ id: "confirmed", slot: "12:00", reminderConfirmedAt: "2026-07-14T08:05:00Z" }),
    ]);

    const unconfirmedCard = screen.getByRole("article", { name: "Pip, 11:00, Arriving" });
    fireEvent.click(within(unconfirmedCard).getByRole("button", { name: "Confirm Pip's booking" }));
    expect(handlers.onConfirmArrival).toHaveBeenCalledWith(expect.objectContaining({ id: "unconfirmed" }));

    // A card the customer already confirmed has nothing to confirm.
    const confirmedCard = screen.getByRole("article", { name: "Rosie, 12:00, Arriving" });
    expect(within(confirmedCard).queryByRole("button", { name: /Confirm Rosie/ })).not.toBeInTheDocument();
  });

  it("labels the confirmed tick by who confirmed — staff or customer", () => {
    renderBoard([
      booking({
        id: "confirmed",
        slot: "11:00",
        reminderConfirmedAt: "2026-07-14T08:05:00Z",
        reminderConfirmedBy: "staff",
      }),
    ]);

    const tick = screen.getByLabelText("Confirmed by staff at 09:05");
    expect(tick).toHaveAttribute("data-confirmed-by", "staff");
    expect(screen.queryByLabelText(/Customer confirmed/)).not.toBeInTheDocument();
  });

  it("replaces Needs confirmation with the owner's inbox reply when they confirmed in chat", () => {
    const bookings = [
      booking({
        id: "confirmed",
        slot: "11:00",
        payment: "Paid in Full",
        reminderState: "sent",
        confirmationChannel: "whatsapp",
      }),
    ];

    // Without the signal the card chases, as it does today.
    const { unmount } = renderBoard(bookings);
    expect(
      within(screen.getByRole("article", { name: "Rosie, 11:00, Arriving" })).getByText("Needs confirmation"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("1 to confirm").length).toBeGreaterThan(0);
    unmount();

    // The owner typed "yes" in the inbox instead of tapping Confirm.
    renderBoard(bookings, {
      chatConfirmations: { confirmed: { at: "2026-07-14T08:20:00Z", text: "Yes see you at 11" } },
    });
    const card = screen.getByRole("article", { name: "Rosie, 11:00, Arriving" });
    expect(within(card).queryByText("Needs confirmation")).not.toBeInTheDocument();
    expect(within(card).getByText("Confirmed in chat · 09:20")).toHaveAttribute(
      "title",
      "“Yes see you at 11”",
    );
    expect(card).toHaveAttribute("data-needs-action", "false");
    expect(screen.queryByText("1 to confirm")).not.toBeInTheDocument();
  });

  it("opens each unknown-status booking directly and does not flag cancelled bookings", () => {
    const { handlers } = renderBoard([
      booking({ id: "home", status: BOOKING_STATUS.COMPLETED }),
      booking({ id: "cancelled", dogName: "Finn", status: BOOKING_STATUS.CANCELLED }),
      booking({ id: "unknown-a", dogName: "Rufus", slot: "12:30", status: "Awaiting magic" }),
      booking({ id: "unknown-b", dogName: "Nell", slot: "", status: "" }),
    ]);

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

  it("never scrolls a lane inside itself — one page scroll only", () => {
    renderBoard([booking({ id: "due" })]);

    const arriving = screen.getByRole("region", { name: "Arriving, 1 dog" });
    expect(arriving).toHaveAttribute("data-lane-populated", "true");
    expect(arriving.className).not.toMatch(/max-h|overflow/);
    expect(within(arriving).getByTestId("due-lane-body").className).not.toMatch(/overflow-y-auto/);
  });

  describe("Arriving grouped by slot", () => {
    it("shares one heading across multiple dogs booked into the same slot", () => {
      renderBoard([
        booking({ id: "a", dogName: "Alfie", slot: "12:00", payment: "Paid in Full" }),
        booking({ id: "b", dogName: "Bertie", slot: "12:00", payment: "Paid in Full" }),
      ]);

      const lane = screen.getByRole("region", { name: "Arriving, 2 dogs" });
      expect(within(lane).getByRole("heading", { level: 3, name: "12:00" })).toBeInTheDocument();
      expect(within(lane).getByText("2 dogs")).toBeInTheDocument();
      expect(within(lane).getByRole("article", { name: "Alfie, 12:00, Arriving" })).toBeInTheDocument();
      expect(within(lane).getByRole("article", { name: "Bertie, 12:00, Arriving" })).toBeInTheDocument();
    });

    it("suppresses the dog count on a single-card slot group", () => {
      renderBoard([
        booking({ id: "solo", dogName: "Alfie", slot: "12:00", payment: "Paid in Full" }),
      ]);

      const lane = screen.getByRole("region", { name: "Arriving, 1 dog" });
      expect(within(lane).queryByText("1 dog", { exact: true })).not.toBeInTheDocument();
    });

    it("keeps a missing-slot booking visible in a trailing Unscheduled group instead of hiding it", () => {
      renderBoard([
        booking({ id: "no-slot", dogName: "Nell", slot: "" }),
      ]);

      const lane = screen.getByRole("region", { name: "Arriving, 1 dog" });
      expect(within(lane).getByText("Unscheduled")).toBeInTheDocument();
      expect(within(lane).getByRole("article", { name: "Nell, Time missing, Arriving" })).toBeInTheDocument();
    });

    it("does not repeat the shared countdown once per card", () => {
      renderBoard([
        booking({ id: "a", dogName: "Alfie", slot: "12:00", payment: "Paid in Full" }),
        booking({ id: "b", dogName: "Bertie", slot: "12:00", payment: "Paid in Full" }),
      ]);

      const lane = screen.getByRole("region", { name: "Arriving, 2 dogs" });
      // 12:00 is 1 hr 45 min after NOW (10:15) — one countdown for the whole group.
      expect(within(lane).getAllByText("Due in 1 hr 45 min")).toHaveLength(1);
    });

    it("omits the countdown for a future selected date without fabricating one", () => {
      const board = buildDailyBriefBoard(
        [booking({ id: "future", dogName: "Otis", slot: "12:00" })],
        "2026-07-20",
        NOW,
      );
      render(
        <StatusBoard
          board={board}
          resolve={(item) => ({ dogName: item.dogName, breed: item.breed, owner: item.owner, ownerPhone: "" })}
          getWelfare={() => ({ alerts: [], pregnant: false, notes: "" })}
          paymentOf={(item) => paymentState(item)}
          isToday={false}
          handlers={{ onOpenBooking: vi.fn(), onOpenDog: vi.fn(), onOpenHuman: vi.fn(), onMessageOwner: vi.fn(), onJourneyAction: vi.fn(), onDidntShow: vi.fn() }}
          summary={buildDaySummary([booking({ id: "future", dogName: "Otis", slot: "12:00" })])}
          takings={buildTakingsByMethod([])}
          capacityTotal={14}
        />,
      );

      const lane = screen.getByRole("region", { name: "Arriving, 1 dog" });
      expect(within(lane).getByRole("article", { name: "Otis, 12:00, Arriving" })).toBeInTheDocument();
      expect(within(lane).queryByText(/Due in|late|Due now/)).not.toBeInTheDocument();
    });
  });

  describe("Arriving contact-action hierarchy", () => {
    it("shows Message but not Call for an unconfirmed, on-time booking", () => {
      renderBoard([
        booking({
          id: "unconfirmed",
          dogName: "Pip",
          slot: "12:00",
          payment: "Paid in Full",
          reminderState: "sent",
          confirmationChannel: "whatsapp",
        }),
      ]);

      expect(screen.getByRole("button", { name: /Message .* about Pip/ })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /Call .* about Pip/ })).not.toBeInTheDocument();
    });

    it("shows both Call and Message for a late booking with a valid phone number", () => {
      renderBoard([booking({ id: "late", dogName: "Luna", slot: "09:00" })]);

      expect(screen.getByRole("link", { name: "Call Emma about Luna" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Message Emma about Luna" })).toBeInTheDocument();
    });

    it("offers no contact action for an ordinary confirmed, on-time arrival", () => {
      renderBoard([
        booking({ id: "calm", dogName: "Rosie", slot: "12:00", payment: "Paid in Full" }),
      ]);

      expect(screen.queryByRole("link", { name: /Call/ })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Message .* about Rosie/ })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Check in Rosie" })).toBeInTheDocument();
    });
  });

  describe("empty-lane collapsing at every width", () => {
    it("collapses every empty lane into one reassurance line — no boxed 'no dogs' columns", () => {
      renderBoard([booking({ id: "due" })]);

      const summary = screen.getByText((_, el) => el?.getAttribute("aria-label") === "With us — nobody yet, Ready to go — nobody yet");
      expect(summary).toBeInTheDocument();
      // The old always-rendered empty lane regions are gone entirely.
      expect(screen.queryByRole("region", { name: "With us, 0 dogs" })).not.toBeInTheDocument();
      expect(screen.queryByRole("region", { name: "Ready to go, 0 dogs" })).not.toBeInTheDocument();
      // And the summary is not width-gated.
      expect(summary.closest("p").className).not.toMatch(/md:hidden/);
    });

    it("never names a populated lane in the empty summary", () => {
      renderBoard([
        booking({ id: "due" }),
        booking({ id: "checked", status: BOOKING_STATUS.CHECKED_IN }),
      ]);

      const summary = screen.getByText((_, el) => !!el?.getAttribute("aria-label")?.includes("nobody yet"));
      expect(summary).toHaveAttribute("aria-label", expect.not.stringContaining("With us"));
      expect(summary).toHaveAttribute("aria-label", expect.stringContaining("Ready to go"));
      expect(screen.getByRole("region", { name: "With us, 1 dog" })).toBeInTheDocument();
    });
  });
});
