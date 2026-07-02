// Component tests for the Today command-centre queue sections. The queue LOGIC
// lives in src/engine/today.ts (unit-tested there); these assert each section
// renders the right rows, empty states, and fires its actions.
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ImmediateAttention } from "./ImmediateAttention.jsx";
import { CollectionQueue } from "./CollectionQueue.jsx";
import { PaymentsList } from "./PaymentsList.jsx";
import { CapacityOpportunities } from "./CapacityOpportunities.jsx";
import { TodaySummaryStrip } from "./TodaySummaryStrip.jsx";

const resolve = (b) => ({ dogName: b.dogName, breed: b.breed || "", owner: b.owner || "Owner" });
const getWelfare = () => ({ alerts: [], pregnant: false, notes: "" });
const dueOf = () => ({ kind: "due", label: "Balance due", amountDue: 42, depositPaid: 0, subtotal: 42 });
const noop = () => {};

describe("ImmediateAttention", () => {
  const lateItem = {
    booking: { id: "b1", dogName: "Rex", slot: "09:00", status: "Booked" },
    kinds: ["late"],
    primary: "late",
    overdueMinutes: 20,
    waitMinutes: null,
  };

  it("renders a late row with the overdue time and a Mark arrived action", () => {
    const onMarkArrived = vi.fn();
    render(
      <ImmediateAttention
        items={[lateItem]}
        resolve={resolve}
        getWelfare={getWelfare}
        paymentOf={dueOf}
        onMarkArrived={onMarkArrived}
        onMarkCollected={noop}
        onSendCollection={noop}
        onMessageOwner={noop}
        onMarkPaid={noop}
        onDidntShow={noop}
        onOpenBooking={noop}
        onDismiss={noop}
      />,
    );
    expect(screen.getByText("Rex")).toBeInTheDocument();
    expect(screen.getByText("20 min overdue")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mark arrived" }));
    expect(onMarkArrived).toHaveBeenCalledWith(lateItem.booking);
  });

  it("shows a calm empty state when nothing needs attention", () => {
    render(
      <ImmediateAttention
        items={[]}
        resolve={resolve}
        getWelfare={getWelfare}
        paymentOf={dueOf}
        onMarkArrived={noop}
        onMarkCollected={noop}
        onSendCollection={noop}
        onMessageOwner={noop}
        onMarkPaid={noop}
        onDidntShow={noop}
        onOpenBooking={noop}
        onDismiss={noop}
      />,
    );
    expect(screen.getByText(/Nothing needs chasing/i)).toBeInTheDocument();
  });
});

describe("CollectionQueue", () => {
  it("shows wait time and requires a confirm before marking collected", () => {
    const onMarkCollected = vi.fn();
    render(
      <CollectionQueue
        entries={[{ booking: { id: "c1", dogName: "Bella", status: "Ready for pick-up", collectionSentAt: null }, waitMinutes: 25 }]}
        resolve={resolve}
        paymentOf={() => ({ kind: "paid", amountDue: 0, depositPaid: 0, subtotal: 42, label: "Paid" })}
        onSendCollection={noop}
        onMarkCollected={onMarkCollected}
        onOpenBooking={noop}
      />,
    );
    expect(screen.getByText("Bella")).toBeInTheDocument();
    expect(screen.getByText(/waiting 25 min/)).toBeInTheDocument();
    // First click arms the confirm; only the second commits.
    fireEvent.click(screen.getByRole("button", { name: "Mark collected" }));
    expect(onMarkCollected).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm collected" }));
    expect(onMarkCollected).toHaveBeenCalledTimes(1);
  });

  it("shows an empty state when nobody is waiting", () => {
    render(<CollectionQueue entries={[]} resolve={resolve} paymentOf={dueOf} onSendCollection={noop} onMarkCollected={noop} onOpenBooking={noop} />);
    expect(screen.getByText(/All home/i)).toBeInTheDocument();
  });
});

describe("PaymentsList", () => {
  it("lists a balance due and fires Mark paid", () => {
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
    fireEvent.click(screen.getByRole("button", { name: "Mark paid" }));
    expect(onMarkPaid).toHaveBeenCalled();
  });
});

describe("CapacityOpportunities", () => {
  it("surfaces a customer-reachable slot and toggles last-minute", () => {
    const onToggleImmediate = vi.fn();
    render(
      <CapacityOpportunities
        opportunities={[{ slot: "11:00", slotMinutes: 660, isPast: false, isCurrent: false, seatsFree: 2, largeDogEligible: false, customerReachable: true, isBlocked: false }]}
        immediateSet={new Set(["11:00"])}
        nextAvailable={null}
        onToggleImmediate={onToggleImmediate}
        onNewBooking={noop}
      />,
    );
    expect(screen.getByText("11:00")).toBeInTheDocument();
    expect(screen.getByText(/2 seats free/)).toBeInTheDocument();
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
