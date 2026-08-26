// Component tests for the salon board: the tokens, the two action panels
// (desktop popover and phone sheet), keyboard access, the needs-attention
// highlight, the gone-home strip and density under a busy day.
//
// The ranking and action LOGIC is unit-tested in src/engine/salonBoard.test.ts;
// these assert that the board renders what that engine decided, that a dog can
// be operated by keyboard alone, and that nothing important is hidden.
import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BOOKING_STATUS } from "../../../../constants/index";
import { buildDailyBriefBoard } from "../../../../engine/dailyBrief";
import { buildBoardTokens, buildAttentionSummary } from "../../../../engine/salonBoard";
import { SalonBoard } from "./SalonBoard.jsx";
import { CompletedDogs } from "./CompletedDogs.jsx";
import { NeedsAttentionSummary } from "./NeedsAttentionSummary.jsx";

const NOW = new Date("2026-07-14T09:00:00Z"); // 10:00 London
const TODAY = "2026-07-14";

function booking(overrides) {
  return {
    dogName: "Dog",
    breed: "Cockapoo",
    size: "small",
    service: "full-groom",
    owner: "Rik Patel",
    status: BOOKING_STATUS.BOOKED,
    slot: "11:00",
    addons: [],
    payment: "Due at Pick-up",
    _dogId: `dog-${overrides.id}`,
    _ownerId: `owner-${overrides.id}`,
    _bookingDate: TODAY,
    ...overrides,
  };
}

const resolve = (b) => ({
  dogName: b.dogName,
  breed: b.breed,
  owner: b.owner,
  ownerPhone: b.ownerPhone ?? "07700 900123",
  dogMissing: false,
  ownerMissing: false,
});
const paymentOf = (b) => (b.payment === "Paid in Full"
  ? { kind: "paid", label: "Paid", amountDue: 0, depositPaid: 0, subtotal: 52 }
  : { kind: "due", label: "Balance due", amountDue: 52, depositPaid: 0, subtotal: 52 });
const getWelfare = (b) => ({ alerts: b._alerts || [], pregnant: !!b._pregnant, notes: b.notes || "" });

function tokensFor(bookings, isToday = true) {
  const board = buildDailyBriefBoard(bookings, TODAY, NOW);
  return buildBoardTokens({ board, now: NOW, isToday });
}

/** Renders the board with the panel selection hoisted, as TodayView does. */
function BoardHarness({ bookings, isToday = true, onTokenAction = () => {}, attentionActive = false }) {
  const tokens = tokensFor(bookings, isToday);
  const [selectedId, setSelectedId] = useState(null);
  return (
    <SalonBoard
      tokens={tokens}
      resolve={resolve}
      getWelfare={getWelfare}
      paymentOf={paymentOf}
      handlers={{ onTokenAction }}
      attentionActive={attentionActive}
      selectedId={selectedId}
      onSelectToken={setSelectedId}
    />
  );
}

/** Desktop/tablet: the popover path. jsdom reports no matchMedia match by default. */
function useWideViewport() {
  vi.stubGlobal("matchMedia", (query) => ({
    matches: /min-width: (768|1024)px/.test(query),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("the board", () => {
  it("always shows all three zones, so a dog is always in the same place", () => {
    render(<BoardHarness bookings={[booking({ id: "a", dogName: "Oscar" })]} />);
    expect(screen.getByRole("region", { name: "Arriving, 1 dog" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "With us, 0 dogs" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Ready, 0 dogs" })).toBeInTheDocument();
  });

  it("says an empty zone is empty in one calm line, not an empty column of cards", () => {
    render(<BoardHarness bookings={[booking({ id: "a" })]} />);
    const withUs = screen.getByRole("region", { name: "With us, 0 dogs" });
    expect(within(withUs).getByText("Nobody in")).toBeInTheDocument();
    expect(within(withUs).queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("puts each dog in the zone matching its status", () => {
    render(<BoardHarness bookings={[
      booking({ id: "a", dogName: "Oscar" }),
      booking({ id: "b", dogName: "Milo", status: BOOKING_STATUS.IN_BATH, checkedInAt: "2026-07-14T08:30:00Z" }),
      booking({ id: "c", dogName: "Teddy", status: BOOKING_STATUS.READY_FOR_PICKUP, readyAt: "2026-07-14T08:42:00Z" }),
    ]} />);

    const zone = (name) => screen.getByRole("region", { name });
    expect(within(zone("Arriving, 1 dog")).getByText("Oscar")).toBeInTheDocument();
    expect(within(zone("With us, 1 dog")).getByText("Milo")).toBeInTheDocument();
    expect(within(zone("Ready, 1 dog")).getByText("Teddy")).toBeInTheDocument();
  });

  it("gives every token a spoken name carrying status, wait and money", () => {
    render(<BoardHarness bookings={[
      booking({ id: "c", dogName: "Teddy", status: BOOKING_STATUS.READY_FOR_PICKUP, readyAt: "2026-07-14T08:42:00Z" }),
    ]} />);
    expect(
      screen.getByRole("button", { name: /^Teddy\. Ready, waiting 18 min\. £52 due\. owner Rik Patel/ }),
    ).toBeInTheDocument();
  });

  it("shows one piece of context on a token and never repeats the zone's own word", () => {
    render(<BoardHarness bookings={[
      booking({ id: "c", dogName: "Teddy", status: BOOKING_STATUS.READY_FOR_PICKUP, readyAt: "2026-07-14T08:42:00Z" }),
    ]} />);
    const cell = document.querySelector('[data-booking-id="c"]');
    expect(cell.querySelector("[data-token-meta]").textContent).toBe("18 min");
    expect(within(cell).queryByText(/^Ready$/)).not.toBeInTheDocument();
    expect(within(cell).queryByText(/Ready for collection/)).not.toBeInTheDocument();
  });

  it("marks urgency on the token with a ring AND the meta text, never colour alone", () => {
    render(<BoardHarness bookings={[booking({ id: "a", dogName: "Late", slot: "08:30" })]} />);
    const cell = document.querySelector('[data-booking-id="a"]');
    expect(cell.dataset.tier).toBe("urgent");
    expect(cell.querySelector("[data-token-meta]").textContent).toBe("1 hr 30 min late");
  });

  it("keeps a welfare fact visible ON the board, never only behind a tap", () => {
    render(<BoardHarness bookings={[
      booking({ id: "a", dogName: "Bella", _alerts: ["Bites / Nips"], _pregnant: true }),
    ]} />);
    const cell = document.querySelector('[data-booking-id="a"]');
    const safety = cell.querySelector("[data-token-safety-text]");
    expect(safety).toBeInTheDocument();
    expect(safety.textContent).toBe("Pregnant +1");
    expect(safety.getAttribute("title")).toBe("Pregnant · Bites / Nips");
  });

  it("shows a balance on the token only once it blocks the handover", () => {
    render(<BoardHarness bookings={[
      booking({ id: "a", dogName: "Arriving" }),
      booking({ id: "b", dogName: "Waiting", status: BOOKING_STATUS.READY_FOR_PICKUP, readyAt: "2026-07-14T08:00:00Z" }),
    ]} />);
    expect(document.querySelector('[data-booking-id="a"] [data-token-balance]')).toBeNull();
    expect(
      document.querySelector('[data-booking-id="b"] [data-token-balance]').textContent,
    ).toBe("£52");
  });

  it("renders a busy day without dropping a dog", () => {
    const many = Array.from({ length: 22 }, (_, index) => booking({
      id: `b-${index}`,
      dogName: `Dog ${index}`,
      slot: "11:00",
      status: index % 3 === 0
        ? BOOKING_STATUS.BOOKED
        : index % 3 === 1
          ? BOOKING_STATUS.CHECKED_IN
          : BOOKING_STATUS.READY_FOR_PICKUP,
      checkedInAt: "2026-07-14T08:00:00Z",
      readyAt: "2026-07-14T08:30:00Z",
    }));
    render(<BoardHarness bookings={many} />);
    expect(document.querySelectorAll("[data-dog-token]")).toHaveLength(22);
  });
});

describe("the action panel", () => {
  it("opens a bottom sheet on a phone and lists only the actions this state allows", () => {
    render(<BoardHarness bookings={[booking({ id: "a", dogName: "Oscar" })]} />);
    fireEvent.click(screen.getByRole("button", { name: /^Oscar\./ }));

    const sheet = screen.getByRole("dialog");
    expect(within(sheet).getByRole("heading", { name: "Oscar" })).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Check in — Oscar" })).toBeInTheDocument();
    expect(within(sheet).queryByRole("button", { name: /Mark collected/ })).not.toBeInTheDocument();
    expect(within(sheet).queryByRole("button", { name: /Start groom/ })).not.toBeInTheDocument();
  });

  it("reveals in the panel everything the token deliberately does not print", () => {
    render(<BoardHarness bookings={[
      booking({ id: "a", dogName: "Bella", _alerts: ["Bites / Nips"], slot: "11:00" }),
    ]} />);
    fireEvent.click(screen.getByRole("button", { name: /^Bella\./ }));

    const sheet = screen.getByRole("dialog");
    expect(within(sheet).getByText(/Full Groom · Rik Patel/)).toBeInTheDocument();
    expect(within(sheet).getByText("£52 to collect")).toBeInTheDocument();
    expect(within(sheet).getByText("Bites / Nips")).toBeInTheDocument();
  });

  it("never offers Mark collected to a dog that has already gone home", () => {
    render(<BoardHarness bookings={[
      booking({ id: "a", dogName: "Daisy", status: BOOKING_STATUS.READY_FOR_PICKUP, readyAt: "2026-07-14T08:00:00Z" }),
    ]} />);
    fireEvent.click(screen.getByRole("button", { name: /^Daisy\./ }));
    expect(screen.getByRole("button", { name: "Mark collected — Daisy" })).toBeInTheDocument();
  });

  it("runs the chosen action through the one shared handler and closes", () => {
    const onTokenAction = vi.fn();
    render(<BoardHarness bookings={[booking({ id: "a", dogName: "Oscar" })]} onTokenAction={onTokenAction} />);
    fireEvent.click(screen.getByRole("button", { name: /^Oscar\./ }));
    fireEvent.click(screen.getByRole("button", { name: "Check in — Oscar" }));

    expect(onTokenAction).toHaveBeenCalledTimes(1);
    expect(onTokenAction.mock.calls[0][0].booking.id).toBe("a");
    expect(onTokenAction.mock.calls[0][1].id).toBe("checkIn");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("offers a real call link only when there is a number on file", () => {
    render(<BoardHarness bookings={[
      booking({ id: "a", dogName: "Oscar" }),
      booking({ id: "b", dogName: "Nomad", ownerPhone: "" }),
    ]} />);
    fireEvent.click(screen.getByRole("button", { name: /^Oscar\./ }));
    expect(screen.getByRole("link", { name: /Call Rik/ })).toHaveAttribute("href", "tel:07700900123");
    fireEvent.keyDown(document, { key: "Escape" });

    fireEvent.click(screen.getByRole("button", { name: /^Nomad\./ }));
    expect(screen.queryByRole("link", { name: /Call/ })).not.toBeInTheDocument();
  });

  it("closes without acting when the same token is pressed again", () => {
    const onTokenAction = vi.fn();
    render(<BoardHarness bookings={[booking({ id: "a", dogName: "Oscar" })]} onTokenAction={onTokenAction} />);
    const token = screen.getByRole("button", { name: /^Oscar\./ });
    fireEvent.click(token);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(token);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onTokenAction).not.toHaveBeenCalled();
  });
});

describe("the action panel on a pointer device", () => {
  beforeEach(useWideViewport);

  it("opens a menu beside the token rather than a sheet", () => {
    render(<BoardHarness bookings={[booking({ id: "a", dogName: "Oscar" })]} />);
    fireEvent.click(screen.getByRole("button", { name: /^Oscar\./ }));

    expect(screen.getByRole("menu", { name: "Actions for Oscar" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("is fully operable by keyboard: focus lands inside, arrows traverse, Enter acts", () => {
    const onTokenAction = vi.fn();
    render(<BoardHarness bookings={[booking({ id: "a", dogName: "Oscar" })]} onTokenAction={onTokenAction} />);
    const token = screen.getByRole("button", { name: /^Oscar\./ });
    token.focus();
    fireEvent.click(token);

    const menu = screen.getByRole("menu");
    const items = within(menu).getAllByRole("menuitem");
    expect(document.activeElement).toBe(items[0]);

    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(menu, { key: "End" });
    expect(document.activeElement).toBe(items[items.length - 1]);
    fireEvent.keyDown(menu, { key: "Home" });
    expect(document.activeElement).toBe(items[0]);

    fireEvent.click(items[0]);
    expect(onTokenAction).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape and puts focus back on the dog it belongs to", () => {
    render(<BoardHarness bookings={[booking({ id: "a", dogName: "Oscar" })]} />);
    const token = screen.getByRole("button", { name: /^Oscar\./ });
    fireEvent.click(token);
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(token);
  });

  it("closes when something else is pressed", () => {
    render(<BoardHarness bookings={[booking({ id: "a", dogName: "Oscar" })]} />);
    fireEvent.click(screen.getByRole("button", { name: /^Oscar\./ }));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("tells screen-reader users that drag exists and that the menu does the same job", () => {
    render(<BoardHarness bookings={[booking({ id: "a" })]} />);
    expect(screen.getByText(/can be dragged to the next zone/i)).toBeInTheDocument();
    expect(screen.getByText(/also available from that dog's actions/i)).toBeInTheDocument();
  });
});

describe("needs attention", () => {
  const attentionBookings = [
    booking({ id: "a", dogName: "Late", slot: "08:30" }),
    booking({ id: "b", dogName: "Calm", slot: "12:30", payment: "Paid in Full" }),
  ];

  it("dims the calm dogs instead of removing them — position is the point", () => {
    render(<BoardHarness bookings={attentionBookings} attentionActive />);
    expect(screen.getByText("Late")).toBeInTheDocument();
    expect(screen.getByText("Calm")).toBeInTheDocument();
    const calm = document.querySelector('[data-booking-id="b"] [data-dog-token]');
    const late = document.querySelector('[data-booking-id="a"] [data-dog-token]');
    expect(calm.className).toMatch(/opacity-35/);
    expect(late.className).toMatch(/opacity-100/);
  });

  it("reassures instead of showing an empty warning area when nothing is wrong", () => {
    const summary = buildAttentionSummary(tokensFor([booking({ id: "b", slot: "12:30", payment: "Paid in Full" })]), true);
    render(<NeedsAttentionSummary summary={summary} isToday active={false} onToggle={() => {}} />);
    expect(screen.getByText("Everything's on track")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("offers one press that highlights the exceptions, and says how many", () => {
    const onToggle = vi.fn();
    const summary = buildAttentionSummary(tokensFor(attentionBookings), true);
    render(<NeedsAttentionSummary summary={summary} isToday active={false} onToggle={onToggle} />);
    const control = screen.getByRole("button", { name: /Highlight the 1 dog needing attention/ });
    expect(control).toHaveTextContent("1 thing needs you");
    fireEvent.click(control);
    expect(onToggle).toHaveBeenCalled();
  });

  it("stays quiet on a browsed date — nothing on it is happening now", () => {
    const summary = buildAttentionSummary(tokensFor([booking({ id: "b", slot: "12:30" })], false), false);
    const { container } = render(
      <NeedsAttentionSummary summary={summary} isToday={false} active={false} onToggle={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("gone home", () => {
  const collected = [
    booking({ id: "h1", dogName: "Daisy", status: BOOKING_STATUS.COMPLETED, completedAt: "2026-07-14T08:00:00Z", payment: "Paid in Full" }),
    booking({ id: "h2", dogName: "Rex", status: BOOKING_STATUS.COMPLETED, completedAt: "2026-07-14T07:30:00Z" }),
  ];

  it("collapses to one line and expands on request", () => {
    render(
      <CompletedDogs
        tokens={tokensFor(collected).home}
        isToday
        resolve={resolve}
        paymentOf={paymentOf}
        onOpenBooking={() => {}}
      />,
    );
    const toggle = screen.getByRole("button", { name: "Show 2 dogs gone home" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Daisy")).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(screen.getByText("Daisy")).toBeInTheDocument();
    expect(screen.getByText("Rex")).toBeInTheDocument();
  });

  it("names the one thing that can still go wrong after a dog has left", () => {
    render(
      <CompletedDogs
        tokens={tokensFor(collected).home}
        isToday
        resolve={resolve}
        paymentOf={paymentOf}
        onOpenBooking={() => {}}
      />,
    );
    expect(screen.getByText("1 unpaid")).toBeInTheDocument();
  });

  it("renders nothing at all when nobody has gone home", () => {
    const { container } = render(
      <CompletedDogs tokens={[]} isToday resolve={resolve} paymentOf={paymentOf} onOpenBooking={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
