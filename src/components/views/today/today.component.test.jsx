// Component tests for the Today command-centre queue sections. The queue LOGIC
// lives in src/engine/today.ts (unit-tested there); these assert each section
// renders the right rows, action hierarchy, and fires its actions.
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ToastProvider } from "../../../contexts/ToastContext.jsx";
import { TodayHeader } from "./TodayHeader.jsx";
import { AttentionPanel } from "./AttentionPanel.jsx";
import { NextUp } from "./NextUp.jsx";
import { InSalonNow } from "./InSalonNow.jsx";
import { CollectionQueue } from "./CollectionQueue.jsx";
import { PaymentsList } from "./PaymentsList.jsx";
import { CapacitySummary } from "./CapacitySummary.jsx";
import { TodaySummaryStrip } from "./TodaySummaryStrip.jsx";
import { CompactZeroState } from "./parts.jsx";

const resolve = (b) => ({ dogName: b.dogName, breed: b.breed || "", owner: b.owner || "Owner" });
const getWelfare = () => ({ alerts: [], pregnant: false, notes: "" });
const dueOf = () => ({ kind: "due", label: "Balance due", amountDue: 42, depositPaid: 0, subtotal: 42 });
const noop = () => {};

// 10:15 London (BST) — matches the engine tests' fixed instant.
const NOW = new Date("2026-07-02T09:15:00Z");

describe("TodayHeader", () => {
  it("shows the date, booking count and live action count", () => {
    render(<TodayHeader dateLabel="Thursday 2 July" dogsBooked={5} actionCount={1} isDayOpen />);
    expect(screen.getByRole("heading", { level: 1, name: "Today" })).toBeInTheDocument();
    expect(screen.getByText(/Thursday 2 July/)).toBeInTheDocument();
    expect(screen.getByText(/5 dogs booked/)).toBeInTheDocument();
    expect(screen.getByText(/1 action needed/)).toBeInTheDocument();
  });

  it("reads calm when nothing needs action", () => {
    render(<TodayHeader dateLabel="Thursday 2 July" dogsBooked={1} actionCount={0} isDayOpen />);
    expect(screen.getByText(/1 dog booked/)).toBeInTheDocument();
    expect(screen.getByText(/all calm/)).toBeInTheDocument();
  });
});

describe("AttentionPanel", () => {
  const baseHandlers = {
    resolve,
    getWelfare,
    paymentOf: dueOf,
    onMarkArrived: noop,
    onMarkCollected: noop,
    onSendCollection: noop,
    onMessageOwner: noop,
    onMarkPaid: noop,
    onDidntShow: noop,
    onOpenBooking: noop,
    onHideUntilTomorrow: noop,
  };

  it("renders a late row with the overdue time and a Mark arrived action", () => {
    const onMarkArrived = vi.fn();
    const lateItem = {
      booking: { id: "b1", dogName: "Rex", slot: "09:00", status: "Booked" },
      kinds: ["late"],
      primary: "late",
      overdueMinutes: 20,
      waitMinutes: null,
    };
    render(<AttentionPanel {...baseHandlers} items={[lateItem]} onMarkArrived={onMarkArrived} />);
    expect(screen.getByText("Rex")).toBeInTheDocument();
    expect(screen.getByText("Late arrival")).toBeInTheDocument();
    expect(screen.getByText(/20 min overdue/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mark arrived" }));
    expect(onMarkArrived).toHaveBeenCalledWith(lateItem.booking);
  });

  it("gives a payment row Mark paid + Open booking and no hide option", () => {
    const paymentItem = {
      booking: { id: "b2", dogName: "Max", slot: "10:00", status: "Checked in" },
      kinds: ["payment"],
      primary: "payment",
      overdueMinutes: 0,
      waitMinutes: null,
    };
    render(<AttentionPanel {...baseHandlers} items={[paymentItem]} />);
    expect(screen.getByText("Payment outstanding")).toBeInTheDocument();
    expect(screen.getByText(/£42 due/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark paid" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open booking" })).toBeInTheDocument();
    expect(screen.queryByText(/Hide until tomorrow/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Dismiss/)).not.toBeInTheDocument();
  });

  it("lets an unconfirmed row be hidden until tomorrow", () => {
    const onHide = vi.fn();
    const unconfirmedItem = {
      booking: { id: "b3", dogName: "Luna", slot: "11:00", status: "Booked", reminderSentAt: null },
      kinds: ["unconfirmed"],
      primary: "unconfirmed",
      overdueMinutes: 0,
      waitMinutes: null,
    };
    render(<AttentionPanel {...baseHandlers} items={[unconfirmedItem]} onHideUntilTomorrow={onHide} />);
    expect(screen.getByText("Not yet confirmed")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hide until tomorrow" }));
    expect(onHide).toHaveBeenCalledWith("b3");
  });
});

describe("NextUp", () => {
  const handlers = {
    resolve,
    getWelfare,
    paymentOf: () => ({ kind: "paid", label: "Paid", amountDue: 0, depositPaid: 0, subtotal: 42 }),
    onMarkArrived: noop,
    onUpdateBooking: noop,
    onOpenBooking: noop,
    onMessageOwner: noop,
    onMarkPaid: noop,
  };

  it("shows the next arrival with a countdown and per-dog Mark arrived", () => {
    const onMarkArrived = vi.fn();
    const next = {
      slot: "10:30",
      slotMinutes: 630,
      isPast: false,
      isCurrent: false,
      bookings: [
        { id: "n1", dogName: "Bella", status: "Booked", service: "Full Groom" },
        { id: "n2", dogName: "Coco", status: "Checked in", service: "Full Groom" },
      ],
    };
    render(<NextUp {...handlers} next={next} upcoming={[]} now={NOW} onMarkArrived={onMarkArrived} />);
    expect(screen.getByText("Next arrival")).toBeInTheDocument();
    expect(screen.getByText("10:30")).toBeInTheDocument();
    expect(screen.getByText(/due in 15 min/)).toBeInTheDocument();
    expect(screen.getByText("2 dogs")).toBeInTheDocument();
    // Only the still-Booked dog gets a Mark arrived button.
    const buttons = screen.getAllByRole("button", { name: "Mark arrived" });
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]);
    expect(onMarkArrived).toHaveBeenCalledWith(next.bookings[0]);
  });

  it("summarises an upcoming group on its collapsed, whole-row toggle", () => {
    const upcoming = {
      slot: "12:00",
      slotMinutes: 720,
      isPast: false,
      isCurrent: false,
      bookings: [{ id: "u1", dogName: "Alfie", status: "Booked", service: "Puppy Groom" }],
    };
    // Expanding renders BookingStatusBar, which needs the toast context.
    render(
      <ToastProvider>
        <NextUp {...handlers} next={null} upcoming={[upcoming]} now={NOW} />
      </ToastProvider>,
    );
    const row = screen.getByRole("button", { expanded: false });
    expect(row).toHaveTextContent("12:00");
    expect(row).toHaveTextContent("1 dog · due in 1 hr 45 min");
    expect(row).toHaveTextContent("Alfie");
    fireEvent.click(row);
    expect(row).toHaveAttribute("aria-expanded", "true");
  });
});

describe("InSalonNow", () => {
  it("lists dogs being groomed with time in and a Mark ready action", () => {
    const onMarkReady = vi.fn();
    render(
      <InSalonNow
        entries={[{ booking: { id: "s1", dogName: "Poppy", status: "In bath" }, inSalonMinutes: 35 }]}
        resolve={resolve}
        getWelfare={getWelfare}
        onMarkReady={onMarkReady}
        onOpenBooking={noop}
      />,
    );
    expect(screen.getByText("Poppy")).toBeInTheDocument();
    expect(screen.getByText(/in 35 min/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mark ready" }));
    expect(onMarkReady).toHaveBeenCalled();
  });
});

describe("CollectionQueue", () => {
  it("leads with the collection message when the owner hasn't been told", () => {
    const onSendCollection = vi.fn();
    render(
      <CollectionQueue
        entries={[{ booking: { id: "c1", dogName: "Bella", status: "Ready for pick-up", collectionSentAt: null }, waitMinutes: 25 }]}
        resolve={resolve}
        paymentOf={() => ({ kind: "paid", amountDue: 0, depositPaid: 0, subtotal: 42, label: "Paid" })}
        onSendCollection={onSendCollection}
        onMarkCollected={noop}
        onOpenBooking={noop}
      />,
    );
    expect(screen.getByText("Bella")).toBeInTheDocument();
    expect(screen.getByText(/waiting 25 min/)).toBeInTheDocument();
    expect(screen.getByText(/Owner not messaged yet/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Send collection message" }));
    expect(onSendCollection).toHaveBeenCalled();
  });

  it("requires a confirm before marking collected", () => {
    const onMarkCollected = vi.fn();
    render(
      <CollectionQueue
        entries={[{ booking: { id: "c2", dogName: "Teddy", status: "Ready for pick-up", collectionSentAt: "2026-07-02T09:00:00Z" }, waitMinutes: 10 }]}
        resolve={resolve}
        paymentOf={() => ({ kind: "paid", amountDue: 0, depositPaid: 0, subtotal: 42, label: "Paid" })}
        onSendCollection={noop}
        onMarkCollected={onMarkCollected}
        onOpenBooking={noop}
      />,
    );
    // First click arms the confirm; only the second commits.
    fireEvent.click(screen.getByRole("button", { name: "Mark collected" }));
    expect(onMarkCollected).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm collected" }));
    expect(onMarkCollected).toHaveBeenCalledTimes(1);
  });

  it("shows an 'on the way' chip when the owner signalled they're coming", () => {
    render(
      <CollectionQueue
        entries={[{ booking: { id: "c3", dogName: "Rex", status: "Ready for pick-up", collectionSentAt: "2026-07-02T09:00:00Z", whatsappConversationId: "conv-1" }, waitMinutes: 15 }]}
        resolve={resolve}
        paymentOf={() => ({ kind: "paid", amountDue: 0, depositPaid: 0, subtotal: 42, label: "Paid" })}
        onSendCollection={noop}
        onMarkCollected={noop}
        onOpenBooking={noop}
        onTheWaySignals={{ "conv-1": { at: "2026-07-02T09:50:00Z", text: "on my way", minutesAgo: 10 } }}
      />,
    );
    expect(screen.getByText(/On the way · 10 min ago/)).toBeInTheDocument();
  });
});

describe("PaymentsList", () => {
  it("lists a balance due and records payment with a chosen method", () => {
    const onMarkPaid = vi.fn();
    render(
      <PaymentsList
        entries={[{ booking: { id: "p1", dogName: "Max", status: "Checked in" }, payment: dueOf() }]}
        resolve={resolve}
        paymentOf={dueOf}
        onMarkPaid={onMarkPaid}
        onOpenBooking={noop}
      />,
    );
    expect(screen.getByText("Max")).toBeInTheDocument();
    expect(screen.getByText(/£42 due at pick-up/)).toBeInTheDocument();
    // "Mark paid" now reveals a method chooser; picking a method records it.
    fireEvent.click(screen.getByRole("button", { name: "Mark paid" }));
    fireEvent.click(screen.getByRole("button", { name: "Card" }));
    expect(onMarkPaid).toHaveBeenCalledWith(expect.objectContaining({ id: "p1" }), "card");
  });
});

describe("CapacitySummary", () => {
  it("headlines the places booked and surfaces a customer-reachable slot", () => {
    const onToggleImmediate = vi.fn();
    render(
      <CapacitySummary
        opportunities={[{ slot: "11:00", slotMinutes: 660, isPast: false, isCurrent: false, seatsFree: 2, largeDogEligible: false, customerReachable: true, isBlocked: false }]}
        immediateSet={new Set(["11:00"])}
        nextAvailable={null}
        dogsBooked={11}
        onToggleImmediate={onToggleImmediate}
        onNewBooking={noop}
      />,
    );
    expect(screen.getByText("11 of 14 places booked")).toBeInTheDocument();
    expect(screen.getByText("2 spaces left today")).toBeInTheDocument();
    // "11:00" appears in the headline ("next free at 11:00") and the slot row.
    expect(screen.getAllByText("11:00").length).toBeGreaterThan(0);
    expect(screen.getByText(/customers can book now/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close last-minute" }));
    expect(onToggleImmediate).toHaveBeenCalledWith("11:00");
  });
});

describe("TodaySummaryStrip", () => {
  it("renders the day totals and money split", () => {
    render(
      <TodaySummaryStrip
        summary={{ total: 4, arrived: 3, expected: 1, ready: 1, collected: 1, unpaidCount: 2, dogsBooked: 4, capacityUsedPct: 29, expectedRevenue: 168, collectedRevenue: 84 }}
      />,
    );
    expect(screen.getByText("Booked in")).toBeInTheDocument();
    expect(screen.getByText("£168")).toBeInTheDocument();
    expect(screen.getByText("£84")).toBeInTheDocument();
  });
});

describe("CompactZeroState", () => {
  it("renders a one-line reassurance row", () => {
    render(<CompactZeroState>Nothing needs attention right now.</CompactZeroState>);
    expect(screen.getByText(/Nothing needs attention/)).toBeInTheDocument();
  });
});
