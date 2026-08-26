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
function BoardHarness({ bookings, isToday = true, onTokenAction = () => {}, highlightIds = null }) {
  const tokens = tokensFor(bookings, isToday);
  const [selectedId, setSelectedId] = useState(null);
  return (
    <SalonBoard
      tokens={tokens}
      resolve={resolve}
      getWelfare={getWelfare}
      paymentOf={paymentOf}
      handlers={{ onTokenAction }}
      highlightIds={highlightIds}
      selectedId={selectedId}
      onSelectToken={setSelectedId}
    />
  );
}

/** Desktop/tablet: the popover path and all three zones side by side. */
function useWideViewport() {
  vi.stubGlobal("matchMedia", (query) => ({
    matches: /min-width: (768|1024)px/.test(query),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

/** A phone: no matchMedia match, so one lane at a time behind the switcher. */
function usePhoneViewport() {
  vi.stubGlobal("matchMedia", (query) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

function switchLane(title) {
  fireEvent.click(screen.getByRole("button", { name: new RegExp(`^Show ${title},`) }));
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("the board", () => {
  beforeEach(useWideViewport);

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

  it("marks urgency with a ring AND words, never colour alone", () => {
    render(<BoardHarness bookings={[booking({ id: "a", dogName: "Late", slot: "08:30" })]} />);
    const cell = document.querySelector('[data-booking-id="a"]');
    expect(cell.dataset.tier).toBe("urgent");
    // The lateness is a fact about the slot, so it is stated on the slot's
    // heading — in words, in coral — rather than under the dog.
    const timing = document.querySelector('[data-slot-group="08:30"] [data-slot-timing]');
    expect(timing.textContent).toBe("1 hr 30 min late");
    expect(timing.className).toMatch(/text-brand-coral-text/);
  });

  it("states a shared appointment time once, not under every dog booked into it", () => {
    render(<BoardHarness bookings={[
      booking({ id: "a", dogName: "Coco", slot: "09:00" }),
      booking({ id: "b", dogName: "Teddy", slot: "09:00" }),
      booking({ id: "c", dogName: "Rex", slot: "12:00" }),
    ]} />);

    const nine = document.querySelector('[data-slot-group="09:00"]');
    expect(within(nine).getByRole("heading", { level: 3 })).toHaveTextContent("09:00");
    expect(within(nine).getByText("2 dogs")).toBeInTheDocument();
    expect(nine.querySelectorAll("[data-token-cell]")).toHaveLength(2);
    // Neither of the two dogs repeats the time.
    expect(nine.querySelectorAll("[data-token-meta]")).toHaveLength(0);
    expect(document.querySelectorAll("[data-slot-group]")).toHaveLength(2);
  });

  it("prints on an arriving token only what its slot heading cannot say", () => {
    render(<BoardHarness bookings={[
      booking({ id: "a", dogName: "Poppy", slot: "12:00", reminderState: "sent", confirmationChannel: "whatsapp" }),
      booking({ id: "b", dogName: "Rex", slot: "12:00" }),
    ]} />);
    expect(
      document.querySelector('[data-booking-id="a"] [data-token-meta]').textContent,
    ).toBe("To confirm");
    expect(document.querySelector('[data-booking-id="b"] [data-token-meta]')).toBeNull();
  });

  it("keeps a slotless booking visible in a trailing Unscheduled group", () => {
    render(<BoardHarness bookings={[
      booking({ id: "a", dogName: "Timed", slot: "09:00" }),
      booking({ id: "b", dogName: "Slotless", slot: "" }),
    ]} />);
    const groups = [...document.querySelectorAll("[data-slot-group]")];
    expect(groups.at(-1).dataset.slotGroup).toBe("unscheduled");
    expect(within(groups.at(-1)).getByText("Slotless")).toBeInTheDocument();
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

  it("marks a settled Ready dog with a tick where the balance pill would sit", () => {
    render(<BoardHarness bookings={[
      booking({ id: "a", dogName: "Settled", status: BOOKING_STATUS.READY_FOR_PICKUP, readyAt: "2026-07-14T08:40:00Z", payment: "Paid in Full" }),
    ]} />);
    const cell = document.querySelector('[data-booking-id="a"]');
    expect(cell.querySelector("[data-token-paid]")).toBeInTheDocument();
    expect(cell.querySelector("[data-token-balance]")).toBeNull();
    expect(screen.getByRole("button", { name: /^Settled\. Ready.*Paid/ })).toBeInTheDocument();
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

describe("the action panel on a phone", () => {
  beforeEach(usePhoneViewport);

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

  it("reaches a Ready dog through the lane switcher and offers the right primary", () => {
    render(<BoardHarness bookings={[
      booking({ id: "a", dogName: "Daisy", status: BOOKING_STATUS.READY_FOR_PICKUP, readyAt: "2026-07-14T08:00:00Z" }),
    ]} />);
    // The phone shows one lane; Ready is one tap on the switcher, never
    // several screens below Arriving.
    switchLane("Ready");
    fireEvent.click(screen.getByRole("button", { name: /^Daisy\./ }));
    expect(screen.getByRole("button", { name: "Mark collected — Daisy" })).toBeInTheDocument();
  });

  it("shows one lane at a time with counts and an urgency dot on the others", () => {
    render(<BoardHarness bookings={[
      booking({ id: "a", dogName: "Oscar", slot: "12:00" }),
      booking({ id: "b", dogName: "Longwait", status: BOOKING_STATUS.READY_FOR_PICKUP, readyAt: "2026-07-14T07:30:00Z" }),
    ]} />);

    // Only the active lane renders its dogs…
    expect(screen.getByRole("region", { name: "Arriving, 1 dog" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /^Ready,/ })).not.toBeInTheDocument();
    // …but every lane stays readable from the switcher, urgency included:
    // Longwait has been ready 90 minutes, past the urgent threshold.
    expect(screen.getByRole("button", { name: "Show Ready, 1 dog, 1 urgent" })).toBeInTheDocument();

    switchLane("Ready");
    expect(screen.getByRole("region", { name: "Ready, 1 dog" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /^Arriving,/ })).not.toBeInTheDocument();
    expect(screen.getByText("Longwait")).toBeInTheDocument();
  });

  it("changes lane on a deliberate horizontal swipe, and never on a vertical scroll", () => {
    render(<BoardHarness bookings={[
      booking({ id: "a", dogName: "Oscar", slot: "12:00" }),
      booking({ id: "b", dogName: "Inside", status: BOOKING_STATUS.CHECKED_IN, checkedInAt: "2026-07-14T08:40:00Z" }),
    ]} />);
    const lanes = screen.getByRole("region", { name: "Arriving, 1 dog" }).parentElement;

    // A vertical scroll that drifts sideways stays put.
    fireEvent.touchStart(lanes, { touches: [{ clientX: 200, clientY: 100 }] });
    fireEvent.touchEnd(lanes, { changedTouches: [{ clientX: 140, clientY: 300 }] });
    expect(screen.getByRole("region", { name: "Arriving, 1 dog" })).toBeInTheDocument();

    // A real swipe left advances one lane.
    fireEvent.touchStart(lanes, { touches: [{ clientX: 300, clientY: 100 }] });
    fireEvent.touchEnd(lanes, { changedTouches: [{ clientX: 120, clientY: 110 }] });
    expect(screen.getByRole("region", { name: "With us, 1 dog" })).toBeInTheDocument();
    expect(screen.getByText("Inside")).toBeInTheDocument();
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
  beforeEach(useWideViewport);

  const attentionBookings = [
    booking({ id: "a", dogName: "Late", slot: "08:30" }),
    booking({ id: "b", dogName: "Calm", slot: "12:30", payment: "Paid in Full" }),
  ];

  it("dims the calm dogs instead of removing them — position is the point", () => {
    render(<BoardHarness bookings={attentionBookings} highlightIds={new Set(["a"])} />);
    expect(screen.getByText("Late")).toBeInTheDocument();
    expect(screen.getByText("Calm")).toBeInTheDocument();
    const calm = document.querySelector('[data-booking-id="b"] [data-dog-token]');
    const late = document.querySelector('[data-booking-id="a"] [data-dog-token]');
    // Softened deliberately: highlighting raises the important dogs; it must
    // not make the rest of the application look disabled.
    expect(calm.className).toMatch(/opacity-55/);
    expect(late.className).toMatch(/opacity-100/);
  });

  it("reassures instead of showing an empty warning area when nothing is wrong", () => {
    const summary = buildAttentionSummary(tokensFor([booking({ id: "b", slot: "12:30", payment: "Paid in Full" })]), true);
    render(<NeedsAttentionSummary summary={summary} isToday activeReason={null} onSelectReason={() => {}} />);
    expect(screen.getByText("Everything's on track")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("itemises the reasons so the number defines itself, one segment per press", () => {
    const onSelectReason = vi.fn();
    const at = (minutesAgo) => new Date(NOW.getTime() - minutesAgo * 60_000).toISOString();
    const summary = buildAttentionSummary(tokensFor([
      booking({ id: "a", dogName: "Late", slot: "08:30" }),
      booking({ id: "w", dogName: "Waiting", status: BOOKING_STATUS.READY_FOR_PICKUP, readyAt: at(30) }),
    ]), true);
    render(
      <NeedsAttentionSummary
        summary={summary}
        dueNow={52}
        isToday
        activeReason={null}
        onSelectReason={onSelectReason}
      />,
    );

    // No opaque total — each segment names its reason and count.
    expect(screen.queryByText(/things need you/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Highlight 1 late/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Highlight 1 waiting/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Highlight £52 due/ }));
    expect(onSelectReason).toHaveBeenCalledWith("unpaid");
  });

  it("marks the active segment and clears it on a second press", () => {
    const onSelectReason = vi.fn();
    const summary = buildAttentionSummary(tokensFor(attentionBookings), true);
    render(
      <NeedsAttentionSummary
        summary={summary}
        isToday
        activeReason="late"
        onSelectReason={onSelectReason}
      />,
    );
    const active = screen.getByRole("button", { name: "Stop highlighting 1 late" });
    expect(active).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(active);
    expect(onSelectReason).toHaveBeenCalledWith(null);
  });

  it("stays quiet on a browsed date — nothing on it is happening now", () => {
    const summary = buildAttentionSummary(tokensFor([booking({ id: "b", slot: "12:30" })], false), false);
    const { container } = render(
      <NeedsAttentionSummary summary={summary} isToday={false} activeReason={null} onSelectReason={() => {}} />,
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
