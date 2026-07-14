// Component tests for the redesigned Today command centre: the compact header,
// the single time-ordered booking feed (one card per booking, adaptive
// actions), and the Manage-availability modal. The feed/availability LOGIC is
// unit-tested in src/engine/today.ts; these assert the UI renders the right
// rows, chips, action hierarchy and fires its actions.
import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TodayHeader } from "./TodayHeader.jsx";
import { TodayNowStrip } from "./TodayNowStrip.jsx";
import { BookingFeed } from "./BookingFeed.jsx";
import { AvailabilityModal } from "./AvailabilityModal.jsx";
import { TodaySummaryStrip } from "./TodaySummaryStrip.jsx";
import { ClosedDayBrief } from "../TodayView.jsx";
import { CompactZeroState } from "./parts.jsx";

const resolve = (b) => ({ dogName: b.dogName, breed: b.breed || "", owner: b.owner || "Owner" });
const getWelfare = () => ({ alerts: [], pregnant: false, notes: "" });
const paidOf = () => ({ kind: "paid", label: "Paid", amountDue: 0, depositPaid: 0, subtotal: 42 });
const dueOf = () => ({ kind: "due", label: "Balance due", amountDue: 42, depositPaid: 0, subtotal: 42 });
const noop = () => {};

const baseHandlers = {
  resolve,
  getWelfare,
  paymentOf: paidOf,
  onMarkArrived: noop,
  onStartGroom: noop,
  onMarkReady: noop,
  onMarkCollected: noop,
  onSendCollection: noop,
  onMessageOwner: noop,
  onMarkPaid: noop,
  onDidntShow: noop,
  onOpenBooking: noop,
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

describe("TodayHeader", () => {
  it("shows a balanced semantic summary and the next online slot", () => {
    render(
      <TodayHeader
        dateLabel="Thursday 2 July"
        dogsBooked={11}
        actionCount={6}
        unpaidTotal={478}
        nextOnlineSlot="09:00"
        isDayOpen
        onManageAvailability={noop}
      />,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Today" })).toBeInTheDocument();
    expect(screen.getByText(/Thursday 2 July/)).toBeInTheDocument();
    const summary = screen.getByRole("list", { name: "Today's summary" });
    const items = within(summary).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("11 dogs booked");
    expect(items[1]).toHaveTextContent("6 need action");
    expect(items[2]).toHaveTextContent("£478 unpaid");
    expect(screen.getByText("09:00")).toBeInTheDocument();
  });

  it("uses a clear empty-slot message and keeps all three summary positions", () => {
    render(
      <TodayHeader
        dateLabel="Thursday 2 July"
        dogsBooked={1}
        actionCount={0}
        unpaidTotal={0}
        nextOnlineSlot={null}
        isDayOpen
        onManageAvailability={noop}
      />,
    );
    expect(screen.getByText("No online slots available")).toBeInTheDocument();
    const summary = screen.getByRole("list", { name: "Today's summary" });
    expect(within(summary).getAllByRole("listitem")).toHaveLength(3);
    expect(within(summary).getByText("All calm")).toBeInTheDocument();
    expect(within(summary).getByText("All paid")).toBeInTheDocument();
  });

  it("reads calm and opens the availability modal", () => {
    const onManage = vi.fn();
    render(
      <TodayHeader dateLabel="Thursday 2 July" dogsBooked={1} actionCount={0} isDayOpen onManageAvailability={onManage} />,
    );
    expect(screen.getByRole("list", { name: "Today's summary" }).firstElementChild).toHaveTextContent("1 dog booked");
    expect(screen.getByText(/all calm/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Manage availability/ }));
    expect(onManage).toHaveBeenCalled();
  });

  it("hides the availability control when the salon is closed", () => {
    render(<TodayHeader dateLabel="Thursday 2 July" dogsBooked={0} actionCount={0} isDayOpen={false} onManageAvailability={noop} />);
    expect(screen.getByText(/salon closed/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Manage availability/ })).not.toBeInTheDocument();
  });

  it("briefMode suppresses today's stats — the closed-day KPIs carry the target day's figures", () => {
    render(<TodayHeader dateLabel="Thursday 2 July" dogsBooked={11} actionCount={6} unpaidTotal={478} isDayOpen={false} briefMode onManageAvailability={noop} />);
    expect(screen.getByText(/Thursday 2 July/)).toBeInTheDocument();
    expect(screen.queryByText(/dogs booked/)).not.toBeInTheDocument();
    expect(screen.queryByText(/need action/)).not.toBeInTheDocument();
    expect(screen.queryByText(/unpaid/)).not.toBeInTheDocument();
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

describe("BookingFeed — slot-grouped diary", () => {
  const booking = { id: "b1", dogName: "Rex", breed: "Poodle", service: "Full Groom", slot: "08:30", status: "Booked", _dogId: "d1", size: "large" };

  it("renders slot headings with the dogs beneath them", () => {
    renderFeed([group("08:30", [entry(booking)]), group("09:00", [entry({ ...booking, id: "b2", dogName: "Bella" })])]);
    expect(screen.getByText("08:30")).toBeInTheDocument();
    expect(screen.getByText("09:00")).toBeInTheDocument();
    expect(screen.getByText("Rex")).toBeInTheDocument();
    expect(screen.getByText("Bella")).toBeInTheDocument();
  });

  it("collapsed row is a disclosure button; actions appear only when expanded", () => {
    const { container, rerender } = renderFeed([group("08:30", [entry(booking)])]);
    const toggle = container.querySelector("#today-card-b1-toggle");
    expect(toggle.tagName).toBe("BUTTON");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute("aria-controls", "today-card-b1-detail");
    expect(screen.queryByRole("button", { name: "Mark arrived" })).not.toBeInTheDocument();
    rerender(
      <BookingFeed groups={[group("08:30", [entry(booking)])]} dogs={dogsMap} ownerCounts={{}}
        expandedIds={new Set(["b1"])} onToggleExpand={noop} {...baseHandlers} />,
    );
    expect(container.querySelector("#today-card-b1-toggle")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Mark arrived" })).toBeInTheDocument();
  });

  it("no interactive control is nested inside the toggle button", () => {
    const { container } = renderFeed([group("08:30", [entry(booking, { isLate: true, overdueMinutes: 25 })])], { expandedIds: new Set(["b1"]) });
    const toggle = container.querySelector("#today-card-b1-toggle");
    expect(toggle.querySelector("button, a, input, select")).toBeNull();
  });

  it("tapping the toggle calls onToggleExpand with the booking id", () => {
    const onToggleExpand = vi.fn();
    const { container } = renderFeed([group("08:30", [entry(booking)])], { onToggleExpand });
    fireEvent.click(container.querySelector("#today-card-b1-toggle"));
    expect(onToggleExpand).toHaveBeenCalledWith("b1");
  });

  it("shows dog and breed together, removes the size letter, and standardises status pills", () => {
    const { container } = renderFeed([group("08:30", [entry(booking, { isLate: true, overdueMinutes: 25, owes: true, stage: "inSalon" })])], {
      ownerCounts: { h1: 2 },
    });
    // Late + payment due + large dog + shared owner = 4 signals → 2 pills + overflow.
    const toggle = container.querySelector("#today-card-b1-toggle");
    expect(toggle).toHaveTextContent("Rex — Poodle");
    expect(toggle).toHaveTextContent("Full Groom · Owner");
    expect(toggle).not.toHaveTextContent(/\bL\b/);
    const pills = container.querySelectorAll("[data-today-status-pill]");
    expect(pills.length).toBe(3);
    for (const pill of pills) expect(pill.className).toContain("h-6");
    const late = screen.getByText("25 min late").closest("[data-today-status-pill]");
    expect(late.querySelector("svg")).not.toBeNull();
    expect(screen.getByLabelText("2 more statuses")).toHaveTextContent("+");
  });

  it("readOnly mode renders no buttons at all and no time-relative chips", () => {
    renderFeed([group("08:30", [entry(booking)])], { readOnly: true });
    expect(screen.queryAllByRole("button")).toEqual([]);
    expect(screen.queryByText(/overdue/)).not.toBeInTheDocument();
    expect(screen.getByText("Large dog")).toBeInTheDocument();
  });

  it("an Unscheduled group renders its dogs", () => {
    renderFeed([group(null, [entry({ ...booking, id: "b9", slot: undefined })])]);
    expect(screen.getByText("Unscheduled")).toBeInTheDocument();
    expect(screen.getByText("Rex")).toBeInTheDocument();
  });

  it("highlights the next booking's row without a redundant Next chip", () => {
    const { container } = renderFeed([group("11:00", [entry({ ...booking, id: "n", dogName: "Bella", slot: "11:00" }, { isNext: true })])]);
    expect(screen.queryByText("Next")).not.toBeInTheDocument();
    expect(container.querySelector("#today-card-n").className).toMatch(/brand-teal/);
  });
});

describe("BookingFeed — expanded-row actions (same contextual set as before)", () => {
  const base = { id: "x", dogName: "Rex", breed: "Poodle", service: "Full Groom", slot: "09:00", status: "Booked", _dogId: "d1" };
  const open = (booking, entryOverrides = {}, extra = {}) =>
    renderFeed([group(booking.slot ?? "09:00", [entry(booking, entryOverrides)])], {
      expandedIds: new Set([booking.id]),
      ...extra,
    });

  it("a late row leads with Mark arrived and offers Didn't show under More", () => {
    const onMarkArrived = vi.fn();
    const onDidntShow = vi.fn();
    open(base, { isLate: true, needsAction: true, overdueMinutes: 20 }, { onMarkArrived, onDidntShow });
    fireEvent.click(screen.getByRole("button", { name: "Mark arrived" }));
    expect(onMarkArrived).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Didn't show" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /More actions for Rex/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Didn't show" }));
    expect(onDidntShow).toHaveBeenCalled();
  });

  it("a checked-in row leads with Start groom, Mark ready one tap behind", () => {
    const onStartGroom = vi.fn();
    const onMarkReady = vi.fn();
    open({ ...base, status: "Checked in" }, { stage: "inSalon" }, { onStartGroom, onMarkReady });
    fireEvent.click(screen.getByRole("button", { name: "Start groom" }));
    expect(onStartGroom).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Mark ready" }));
    expect(onMarkReady).toHaveBeenCalled();
  });

  it("an in-bath row leads with Mark ready (no Start groom)", () => {
    const onMarkReady = vi.fn();
    open({ ...base, status: "In bath" }, { stage: "inSalon" }, { onMarkReady });
    expect(screen.queryByRole("button", { name: "Start groom" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mark ready" }));
    expect(onMarkReady).toHaveBeenCalled();
  });

  it("a ready row runs the collection workflow with a two-step confirm", () => {
    const onSendCollection = vi.fn();
    const onMarkCollected = vi.fn();
    open({ ...base, status: "Ready for pick-up", collectionSentAt: null }, { stage: "ready", waitMinutes: 25, needsAction: true }, { onSendCollection, onMarkCollected });
    expect(screen.getByText(/waiting 25 min/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Send collection message" }));
    expect(onSendCollection).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Mark collected" }));
    expect(onMarkCollected).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm collected" }));
    expect(onMarkCollected).toHaveBeenCalledTimes(1);
  });

  it("a collected dog that still owes leads with Mark paid (with method)", () => {
    const onMarkPaid = vi.fn();
    open({ ...base, id: "cw", status: "Completed" }, { stage: "collected", owes: true }, { paymentOf: dueOf, onMarkPaid });
    fireEvent.click(screen.getByRole("button", { name: "Mark paid" }));
    fireEvent.click(screen.getByRole("button", { name: "Cash" }));
    expect(onMarkPaid).toHaveBeenCalledWith(expect.objectContaining({ id: "cw" }), "cash");
  });

  it("an unconfirmed row leads with Chase confirmation and can be hidden until tomorrow", () => {
    const onHide = vi.fn();
    const onMessageOwner = vi.fn();
    open({ ...base, id: "u", dogName: "Milo", reminderSentAt: null }, { isUnconfirmed: true, needsAction: true }, { onMessageOwner, onHideUntilTomorrow: onHide });
    fireEvent.click(screen.getByRole("button", { name: "Chase confirmation" }));
    expect(onMessageOwner).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /More actions for Milo/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Hide until tomorrow" }));
    expect(onHide).toHaveBeenCalledWith("u");
  });

  it("a plain booked row surfaces Message owner and Open booking as tiles", () => {
    const onMessageOwner = vi.fn();
    const onOpenBooking = vi.fn();
    open(base, {}, { onMessageOwner, onOpenBooking });
    expect(screen.getByRole("button", { name: "Mark arrived" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Message owner" }));
    expect(onMessageOwner).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Open booking" }));
    expect(onOpenBooking).toHaveBeenCalledWith("x");
  });

  it("the Paid tile appears only when money is owed", () => {
    const { unmount } = open(
      { ...base, id: "r1", status: "Ready for pick-up", collectionSentAt: null },
      { stage: "ready", owes: true },
      { paymentOf: dueOf },
    );
    expect(screen.getByRole("button", { name: "Mark paid" })).toBeInTheDocument();
    unmount();
    open({ ...base, id: "r2", status: "Ready for pick-up", collectionSentAt: null }, { stage: "ready", owes: false });
    expect(screen.queryByRole("button", { name: "Mark paid" })).not.toBeInTheDocument();
  });

  it("the Paid tile runs the method chooser before recording", () => {
    const onMarkPaid = vi.fn();
    open(
      { ...base, id: "rp", status: "Ready for pick-up", collectionSentAt: null },
      { stage: "ready", owes: true },
      { paymentOf: dueOf, onMarkPaid },
    );
    fireEvent.click(screen.getByRole("button", { name: "Mark paid" }));
    expect(onMarkPaid).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Card" }));
    expect(onMarkPaid).toHaveBeenCalledWith(expect.objectContaining({ id: "rp" }), "card");
  });

  it("rare actions never render as tiles — only inside More", () => {
    open(base, { isLate: true, needsAction: true, overdueMinutes: 20 });
    expect(screen.queryByRole("button", { name: "Didn't show" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hide until tomorrow" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /More actions for Rex/ }));
    expect(screen.getByRole("menuitem", { name: "Didn't show" })).toBeInTheDocument();
  });

  it("surfaces care notes on the expanded row", () => {
    open(base, {}, { getWelfare: () => ({ alerts: ["Nervous", "Bites/nips"], pregnant: false, notes: "" }) });
    expect(screen.getAllByText(/Nervous/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Bites\/nips/).length).toBeGreaterThan(0);
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

  it("shows the five status counters without restating expected revenue (the KPI row owns it)", () => {
    render(<TodaySummaryStrip summary={summary} />);
    expect(screen.getByText("Daily progress")).toBeInTheDocument();
    expect(screen.getByText("1 of 4 collected")).toBeInTheDocument();
    expect(screen.queryByText(/expected revenue/)).not.toBeInTheDocument();
    for (const label of ["Booked", "Arrived", "Expected", "Ready", "Collected"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
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
});

describe("TodayNowStrip", () => {
  // 10:15 London (BST) — matches the engine tests' fixed instant.
  const NOW = new Date("2026-07-02T09:15:00Z");

  it("shows the NOW booking as dog · breed + arrival time, with its contextual action and live context", () => {
    const onMarkArrived = vi.fn();
    const due = entry({ id: "d", dogName: "Charlie", breed: "Poodle", slot: "10:30", status: "Booked" }, { slotMinutes: 630 });
    render(
      <TodayNowStrip
        selection={{ now: due, nowReason: "dueSoon", next: null, readyCount: 0 }}
        now={NOW}
        resolve={resolve}
        onJumpTo={noop}
        {...{ onMarkArrived, onStartGroom: noop, onMarkReady: noop, onMarkCollected: noop, onSendCollection: noop, onMessageOwner: noop, onMarkPaid: noop }}
      />,
    );
    expect(screen.getByText("Now")).toBeInTheDocument();
    expect(screen.getByText("Charlie")).toBeInTheDocument();
    expect(screen.getByText(/Poodle/)).toBeInTheDocument(); // dog · breed
    expect(screen.getByText("10:30")).toBeInTheDocument(); // the appointment arrival time
    expect(screen.getByText(/due in 15 min/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mark arrived" }));
    expect(onMarkArrived).toHaveBeenCalled();
  });

  it("tapping the identity jumps to the booking card", () => {
    const onJumpTo = vi.fn();
    const due = entry({ id: "d", dogName: "Charlie", slot: "10:30", status: "Booked" });
    render(
      <TodayNowStrip
        selection={{ now: due, nowReason: "dueSoon", next: null, readyCount: 0 }}
        now={NOW}
        resolve={resolve}
        onJumpTo={onJumpTo}
        {...{ onMarkArrived: noop, onStartGroom: noop, onMarkReady: noop, onMarkCollected: noop, onSendCollection: noop, onMessageOwner: noop, onMarkPaid: noop }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Show Charlie's booking card" }));
    expect(onJumpTo).toHaveBeenCalledWith("d");
  });

  it("UP NEXT surfaces an unresolved issue as a labelled chip", () => {
    const nowE = entry({ id: "n1", dogName: "Charlie", slot: "10:30", status: "Booked" });
    const nextE = entry({ id: "n2", dogName: "Lucy", slot: "11:00", status: "Booked" }, { isUnconfirmed: true, needsAction: true });
    render(
      <TodayNowStrip
        selection={{ now: nowE, nowReason: "dueSoon", next: nextE, readyCount: 0 }}
        now={NOW}
        resolve={resolve}
        onJumpTo={noop}
        {...{ onMarkArrived: noop, onStartGroom: noop, onMarkReady: noop, onMarkCollected: noop, onSendCollection: noop, onMessageOwner: noop, onMarkPaid: noop }}
      />,
    );
    expect(screen.getByText("Up next")).toBeInTheDocument();
    expect(screen.getByText("Lucy")).toBeInTheDocument();
    expect(screen.getByText("Needs confirmation")).toBeInTheDocument();
  });

  it("a ready NOW keeps the two-step collection confirm", () => {
    const onMarkCollected = vi.fn();
    const ready = entry(
      { id: "r", dogName: "Teddy", slot: "09:00", status: "Ready for pick-up", collectionSentAt: "2026-07-02T09:00:00Z" },
      { stage: "ready", waitMinutes: 10 },
    );
    render(
      <TodayNowStrip
        selection={{ now: ready, nowReason: "active", next: null, readyCount: 1 }}
        now={NOW}
        resolve={resolve}
        onJumpTo={noop}
        {...{ onMarkArrived: noop, onStartGroom: noop, onMarkReady: noop, onMarkCollected, onSendCollection: noop, onMessageOwner: noop, onMarkPaid: noop }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Mark collected" }));
    expect(onMarkCollected).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm collected" }));
    expect(onMarkCollected).toHaveBeenCalledTimes(1);
  });

  it("reads calm when nothing is left, and louder when dogs wait for collection", () => {
    const empty = { now: null, nowReason: null, next: null, readyCount: 0 };
    const { rerender } = render(
      <TodayNowStrip
        selection={empty}
        now={NOW}
        resolve={resolve}
        onJumpTo={noop}
        {...{ onMarkArrived: noop, onStartGroom: noop, onMarkReady: noop, onMarkCollected: noop, onSendCollection: noop, onMessageOwner: noop, onMarkPaid: noop }}
      />,
    );
    expect(screen.getByText("No more arrivals scheduled today.")).toBeInTheDocument();
    rerender(
      <TodayNowStrip
        selection={{ ...empty, readyCount: 2 }}
        now={NOW}
        resolve={resolve}
        onJumpTo={noop}
        {...{ onMarkArrived: noop, onStartGroom: noop, onMarkReady: noop, onMarkCollected: noop, onSendCollection: noop, onMessageOwner: noop, onMarkPaid: noop }}
      />,
    );
    expect(screen.getByText("2 dogs are ready for collection.")).toBeInTheDocument();
  });
});

describe("CompactZeroState", () => {
  it("renders a one-line reassurance row", () => {
    render(<CompactZeroState>Nothing needs attention right now.</CompactZeroState>);
    expect(screen.getByText(/Nothing needs attention/)).toBeInTheDocument();
  });
});

describe("ClosedDayBrief", () => {
  const dogs = { d1: { id: "d1", _humanId: "h1", size: "small" } };
  const briefBookings = [
    { id: "m1", slot: "08:30", service: "Full Groom", size: "small", status: "Booked", payment: "Due at Pick-up", addons: null, priceOverride: null, dogName: "Rex", breed: "Poodle", owner: "Sam", _dogId: "d1", _bookingDate: "2026-07-13" },
  ];
  const paymentOf = () => ({ kind: "due", label: "Balance due", amountDue: 42, depositPaid: 0, subtotal: 42 });

  const base = {
    brief: { loading: false, available: true, dateStr: "2026-07-13", bookings: briefBookings, noOpenDay: false, refresh: noop },
    dogs, resolve, getWelfare, paymentOf,
  };

  it("shows the banner, the target-day KPIs and a read-only diary", () => {
    render(<ClosedDayBrief {...base} />);
    expect(screen.getByText(/Closed today/)).toBeInTheDocument();
    expect(screen.getByText(/Monday 13 July/)).toBeInTheDocument();
    // KPI count comes from the TARGET day's bookings (one dog), never today's.
    expect(screen.getByText("Booked").parentElement).toHaveTextContent("1");
    expect(screen.getByText("Rex")).toBeInTheDocument();
    // Read-only: no action buttons, no time-relative chips.
    expect(screen.queryByRole("button", { name: "Mark arrived" })).not.toBeInTheDocument();
    expect(screen.queryByText("Late")).not.toBeInTheDocument();
  });

  it("offers the calendar from the banner", () => {
    const onOpenCalendar = vi.fn();
    render(<ClosedDayBrief {...base} onOpenCalendar={onOpenCalendar} />);
    fireEvent.click(screen.getByRole("button", { name: /Open the calendar/ }));
    expect(onOpenCalendar).toHaveBeenCalled();
  });

  it("says the diary could not be loaded (with retry) instead of asserting empty", () => {
    const refresh = vi.fn();
    render(<ClosedDayBrief {...base} brief={{ ...base.brief, available: false, dateStr: null, bookings: [], refresh }} />);
    expect(screen.getByText(/Couldn't load the diary/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Try again/i }));
    expect(refresh).toHaveBeenCalled();
  });

  it("states plainly when no open day exists in the lookahead", () => {
    render(<ClosedDayBrief {...base} brief={{ ...base.brief, dateStr: null, bookings: [], noOpenDay: true }} />);
    expect(screen.getByText(/No open days in the next ten days/)).toBeInTheDocument();
  });

  it("shows the calm empty state for a verified-empty open day", () => {
    render(<ClosedDayBrief {...base} brief={{ ...base.brief, bookings: [] }} />);
    expect(screen.getByText(/Nothing booked in yet/)).toBeInTheDocument();
  });
});
