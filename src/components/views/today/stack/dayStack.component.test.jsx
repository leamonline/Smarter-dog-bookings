// The day stack's rendering contract.
//
// Ordering and timing are unit-tested in src/engine/dayStack.test.ts. This file
// is about what a member of staff can actually see and reach: that colour is
// never carrying a meaning on its own, that the safety note is readable without
// a tap, and that the disclosure behaves.
import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { DayStack } from "./DayStack.jsx";
import { buildDayStack } from "../../../../engine/dayStack";
import { buildDailyBriefBoard } from "../../../../engine/dailyBrief";
import { BOARD_ZONES, buildBoardTokens } from "../../../../engine/salonBoard";
import { BOOKING_STATUS, NO_SHOW_REASON } from "../../../../constants/index";

const NOW = new Date("2026-07-02T09:15:00Z"); // 10:15 London, BST
const TODAY = "2026-07-02";

function agoIso(minutes) {
  return new Date(NOW.getTime() - minutes * 60_000).toISOString();
}

const BOOKINGS = [
  {
    id: "arriving",
    dogName: "Hugo",
    slot: "11:00",
    status: BOOKING_STATUS.BOOKED,
    service: "full-groom",
    payment: "Due at Pick-up",
    _dogId: "d1",
    _bookingDate: TODAY,
  },
  {
    id: "bathing",
    dogName: "Nell",
    slot: "09:30",
    status: BOOKING_STATUS.ARRIVED,
    service: "full-groom",
    payment: "Due at Pick-up",
    checkedInAt: agoIso(95),
    notes: "Check ears, she was sore last time.",
    _dogId: "d2",
    _bookingDate: TODAY,
  },
  {
    id: "waiting",
    dogName: "Bramble",
    slot: "08:30",
    status: BOOKING_STATUS.READY_FOR_COLLECTION,
    service: "full-groom",
    size: "small",
    payment: "Due at Pick-up",
    readyAt: agoIso(70),
    _dogId: "d3",
    _bookingDate: TODAY,
  },
  {
    id: "absent",
    dogName: "Otto",
    slot: "10:00",
    status: BOOKING_STATUS.NO_SHOW,
    cancelReason: NO_SHOW_REASON,
    service: "full-groom",
    _dogId: "d4",
    _bookingDate: TODAY,
  },
];

const WELFARE = {
  d2: { alerts: ["Bites / Nips"], pregnant: false, notes: "" },
};

/** The same token map TodayView builds, so actions come from the real engine. */
function tokenMap(bookings = BOOKINGS) {
  const board = buildDailyBriefBoard(bookings, TODAY, NOW);
  const tokens = buildBoardTokens({ board, now: NOW, isToday: true });
  const map = new Map();
  for (const zone of BOARD_ZONES) {
    for (const token of tokens[zone] || []) map.set(String(token.booking.id), token);
  }
  return map;
}

function renderStack(props = {}) {
  const rows = buildDayStack({
    bookings: BOOKINGS,
    dateStr: TODAY,
    now: NOW,
    breedById: { bathing: "Cocker spaniel", waiting: "Cockapoo" },
  });
  return render(
    <DayStack
      rows={rows}
      resolve={(b) => ({
        dogName: b.dogName,
        breed: "",
        owner: "Priya Raman",
        ownerPhone: "07700 900377",
        dogMissing: false,
        ownerMissing: false,
      })}
      getWelfare={(b) => WELFARE[b._dogId] || { alerts: [], pregnant: false, notes: "" }}
      paymentOf={(b) => (b.id === "waiting"
        ? { kind: "due", amountDue: 42, subtotal: 42 }
        : { kind: "due", amountDue: 42, subtotal: 42 })}
      lastVisitFor={() => "2026-06-12"}
      {...props}
    />,
  );
}

const card = (id) => document.querySelector(`[data-booking-id="${id}"]`);
const head = (id) => card(id).querySelector("[data-stack-head]");

describe("the stack renders the day in time order", () => {
  it("lists every ACTIVE booking, earliest first, and nothing else", () => {
    renderStack();
    const ids = [...document.querySelectorAll("[data-stack-card]")]
      .map((el) => el.getAttribute("data-booking-id"));
    // "absent" is a No-show: it has left the day, so it is not here. The
    // stack is an allow-list of the four active statuses.
    expect(ids).toEqual(["waiting", "bathing", "arriving"]);
  });

  it("shows an empty day as words, not a blank screen", () => {
    render(
      <DayStack
        rows={[]}
        resolve={() => ({})}
        getWelfare={() => ({})}
        paymentOf={() => ({})}
        lastVisitFor={() => null}
      />,
    );
    expect(screen.getByText("No bookings on this date")).toBeTruthy();
  });
});

describe("colour is never the only signal", () => {
  it.each([
    ["waiting", "Ready"],
    ["bathing", "Arrived"],
    ["arriving", "Expected"],
  ])("%s states its status as a word", (id, word) => {
    renderStack();
    expect(within(card(id)).getByText(word)).toBeTruthy();
  });

  it("puts the status into the card's accessible name too", () => {
    renderStack();
    expect(head("waiting").getAttribute("aria-label")).toContain("Ready");
  });

  it("carries urgency as weight on the rule, not as a different hue", () => {
    renderStack();
    // Bramble has waited 70 minutes; Hugo is not due for another 45.
    const overdue = card("waiting");
    const calm = card("arriving");
    expect(parseInt(overdue.style.borderLeftWidth, 10))
      .toBeGreaterThan(parseInt(calm.style.borderLeftWidth, 10));
    // Same hue family on both — the tint is the status, not the urgency.
    expect(overdue.getAttribute("data-status-key")).toBe("ready");
    expect(overdue.style.borderLeftColor).not.toBe(calm.style.borderLeftColor);
  });

  it("adds a clock to a collection that has run long", () => {
    renderStack();
    expect(card("waiting").querySelector("svg")).toBeTruthy();
    expect(head("waiting").getAttribute("aria-label")).toContain("waiting 1 hr 10 min");
  });
});

describe("the safety note", () => {
  it("is readable while the card is collapsed, in words", () => {
    renderStack();
    // Not behind the disclosure, and not an icon with a tooltip.
    expect(head("bathing").getAttribute("aria-expanded")).toBe("false");
    expect(within(card("bathing")).getByLabelText("Safety alert: Bites / Nips")).toBeTruthy();
  });

  it("sits outside the disclosure button so both stay tappable", () => {
    renderStack();
    const chip = within(card("bathing")).getByLabelText("Safety alert: Bites / Nips");
    expect(head("bathing").contains(chip)).toBe(false);
  });

  it("is spoken as part of the card's one sentence", () => {
    renderStack();
    expect(head("bathing").getAttribute("aria-label")).toContain("Safety note: Bites / Nips");
  });
});

describe("the outstanding balance", () => {
  it("appears from Ready onward, where it blocks the handover", () => {
    renderStack();
    expect(within(card("waiting")).getByText("£42 due")).toBeTruthy();
  });

  it("stays off a dog that has not finished — nobody can act on it yet", () => {
    renderStack();
    expect(within(card("bathing")).queryByText("£42 due")).toBeNull();
    expect(within(card("arriving")).queryByText("£42 due")).toBeNull();
  });

  it("says Paid rather than nothing once there is nothing to take", () => {
    const rows = buildDayStack({ bookings: BOOKINGS, dateStr: TODAY, now: NOW });
    render(
      <DayStack
        rows={rows}
        resolve={(b) => ({ dogName: b.dogName, dogMissing: false, ownerMissing: true })}
        getWelfare={() => ({ alerts: [], pregnant: false, notes: "" })}
        paymentOf={() => ({ kind: "paid", amountDue: 0, subtotal: 42 })}
        lastVisitFor={() => null}
      />,
    );
    expect(within(card("waiting")).getByText("Paid")).toBeTruthy();
  });
});

describe("expanding a card", () => {
  it("opens in place and reports it", () => {
    renderStack();
    expect(head("bathing").getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(head("bathing"));
    expect(head("bathing").getAttribute("aria-expanded")).toBe("true");
  });

  it("animates the rows, not a height, so the drawer fits its own content", () => {
    renderStack();
    const drawer = () => document.getElementById("stack-drawer-bathing");
    expect(drawer().style.gridTemplateRows).toBe("0fr");
    fireEvent.click(head("bathing"));
    expect(drawer().style.gridTemplateRows).toBe("1fr");
  });

  it("closes the previous card — two open at once pushes the day off screen", () => {
    renderStack();
    fireEvent.click(head("bathing"));
    fireEvent.click(head("waiting"));
    expect(head("bathing").getAttribute("aria-expanded")).toBe("false");
    expect(head("waiting").getAttribute("aria-expanded")).toBe("true");
  });

  it("toggles shut when pressed again", () => {
    renderStack();
    fireEvent.click(head("bathing"));
    fireEvent.click(head("bathing"));
    expect(head("bathing").getAttribute("aria-expanded")).toBe("false");
  });

  it("shows owner, phone, last visit, price and notes", () => {
    renderStack();
    fireEvent.click(head("bathing"));
    const open = within(card("bathing"));
    expect(open.getByText("Priya Raman")).toBeTruthy();
    expect(open.getByText("07700 900377")).toBeTruthy();
    expect(open.getByText("12 June")).toBeTruthy();
    expect(open.getByText("£42")).toBeTruthy();
    expect(open.getByText("Check ears, she was sore last time.")).toBeTruthy();
  });

  it("links the phone number so it can be dialled one-handed", () => {
    renderStack();
    fireEvent.click(head("bathing"));
    const link = within(card("bathing")).getByText("07700 900377");
    expect(link.getAttribute("href")).toBe("tel:07700900377");
  });
});

describe("highlighting an attention reason", () => {
  it("dims the rest rather than hiding it", () => {
    renderStack({ highlightIds: new Set(["waiting"]) });
    expect(card("waiting").className).toContain("opacity-100");
    expect(card("bathing").className).toContain("opacity-50");
    // Still present: the list has to stay the day.
    expect(card("bathing")).toBeTruthy();
  });
});

describe("the owner-on-the-way signal", () => {
  it("survived the move off the board, and is spoken", () => {
    renderStack({ onTheWaySignals: { waiting: { onTheWay: true } } });
    expect(within(card("waiting")).getByText("On the way")).toBeTruthy();
    expect(head("waiting").getAttribute("aria-label")).toContain("Owner on the way");
  });
});

// ---- Status transitions -------------------------------------------------------
//
// `tokenActions` is the single source of what is legal. The stack asks it and
// renders the answer; it never invents a transition and never re-orders one.
// These tests pin that relationship rather than the specific list, so a change
// made in the engine shows up here as intended rather than as a surprise.

function renderWithActions(extra = {}) {
  const onAction = vi.fn();
  const utils = renderStack({ tokensById: tokenMap(), onAction, ...extra });
  return { ...utils, onAction };
}

/** The action labels inside a card's drawer, in the order they render. */
function actionsIn(id) {
  fireEvent.click(head(id));
  const list = card(id).querySelector("[data-stack-actions]");
  return list ? [...list.querySelectorAll("button, a")].map((el) => el.textContent.trim()) : [];
}

function press(id, label) {
  fireEvent.click(head(id));
  fireEvent.click(within(card(id)).getByLabelText(`${label} — ${BOOKINGS.find((b) => b.id === id).dogName}`));
}

describe("the actions a card offers", () => {
  it("offers the next care step on an expected dog", () => {
    renderWithActions();
    expect(actionsIn("arriving")).toContain("Arrived");
  });

  it("offers the next care step on a dog mid-groom", () => {
    renderWithActions();
    expect(actionsIn("bathing")).toContain("Mark ready");
  });

  it("does not claim that marking ready messages anyone", () => {
    renderWithActions();
    const labels = actionsIn("bathing");
    expect(labels).toContain("Mark ready");
    expect(labels.join(" ")).not.toMatch(/text|message the owner|notif/i);
  });

  it("hands payment and collection to the chain, not the action list", () => {
    renderWithActions();
    const labels = actionsIn("waiting");
    expect(labels).not.toContain("Take £42 payment");
    expect(labels).not.toContain("Mark collected");
    expect(card("waiting").querySelector("[data-checkout-chain]")).toBeTruthy();
  });

  it("keeps the engine's other actions underneath the chain", () => {
    renderWithActions();
    expect(actionsIn("waiting")).toContain("Booking details");
  });

  it("offers a no-show only on a dog that has not arrived", () => {
    renderWithActions();
    expect(actionsIn("arriving")).toContain("Didn't show");
    expect(actionsIn("bathing")).not.toContain("Didn't show");
    expect(actionsIn("waiting")).not.toContain("Didn't show");
  });
});

describe("pressing an action", () => {
  it.each([
    ["arriving", "Arrived", "checkIn"],
    ["bathing", "Mark ready", "ready"],
    ["arriving", "Didn't show", "didntShow"],
  ])("%s → %s runs the %s action", (id, label, actionId) => {
    const { onAction } = renderWithActions();
    press(id, label);
    expect(onAction).toHaveBeenCalledTimes(1);
    const [token, action] = onAction.mock.calls[0];
    expect(String(token.booking.id)).toBe(id);
    expect(action.id).toBe(actionId);
  });

  it("does not close the card underneath it", () => {
    renderWithActions();
    press("arriving", "Arrived");
    expect(head("arriving").getAttribute("aria-expanded")).toBe("true");
  });

  it("is blocked while a write for that dog is in flight", () => {
    const { onAction } = renderWithActions({ busyIds: new Set(["arriving"]) });
    fireEvent.click(head("arriving"));
    const button = within(card("arriving")).getByLabelText("Arrived — Hugo");
    expect(button.getAttribute("aria-busy")).toBe("true");
    fireEvent.click(button);
    expect(onAction).not.toHaveBeenCalled();
  });

  it("leaves a different dog's actions alone while one is busy", () => {
    renderWithActions({ busyIds: new Set(["arriving"]) });
    fireEvent.click(head("bathing"));
    expect(
      within(card("bathing")).getByLabelText("Mark ready — Nell").hasAttribute("disabled"),
    ).toBe(false);
  });
});

describe("a no-show", () => {
  it("has no card at all — it has left the day", () => {
    // It used to render as a card with no actions. Now it is simply not in
    // the stack: the screen shows work still in front of you, and a dog that
    // did not turn up is not that. Chasing it happens elsewhere.
    renderWithActions();
    expect(card("absent")).toBeNull();
  });
});

// ---- Check out ----------------------------------------------------------------

function chainLabels(id) {
  const chain = card(id).querySelector("[data-checkout-chain]");
  return chain ? [...chain.querySelectorAll("button")].map((b) => b.textContent.trim()) : [];
}

function pressChain(id, label) {
  fireEvent.click(
    within(card(id)).getByLabelText(`${label} — ${BOOKINGS.find((b) => b.id === id).dogName}`),
  );
}

function renderCheckout(extra = {}) {
  const onCollectWithPayment = vi.fn();
  const utils = renderStack({
    tokensById: tokenMap(),
    onAction: vi.fn(),
    onCollectWithPayment,
    ...extra,
  });
  fireEvent.click(head("waiting"));
  return { ...utils, onCollectWithPayment };
}

describe("the check-out chain", () => {
  it("starts as one button", () => {
    renderCheckout();
    expect(chainLabels("waiting")).toEqual(["Check out"]);
  });

  it("offers the balance by method once started", () => {
    renderCheckout();
    pressChain("waiting", "Check out");
    expect(chainLabels("waiting")).toEqual(["Cash £42", "Card £42", "Back"]);
  });

  it("confirms the method and the figure before writing anything", () => {
    const { onCollectWithPayment } = renderCheckout();
    pressChain("waiting", "Check out");
    pressChain("waiting", "Cash £42");
    expect(chainLabels("waiting")).toEqual(["Collected · £42 cash", "Back"]);
    expect(onCollectWithPayment).not.toHaveBeenCalled();
  });

  it("writes once, on the last press, with the method and the amount taken", () => {
    const { onCollectWithPayment } = renderCheckout();
    pressChain("waiting", "Check out");
    pressChain("waiting", "Card £42");
    pressChain("waiting", "Collected · £42 card");
    expect(onCollectWithPayment).toHaveBeenCalledTimes(1);
    const [booking, payload] = onCollectWithPayment.mock.calls[0];
    expect(booking.id).toBe("waiting");
    expect(payload).toEqual({ method: "card", amountTaken: 42 });
  });

  it("skips the payment step entirely when nothing is owed", () => {
    const { onCollectWithPayment } = renderCheckout({
      paymentOf: () => ({ kind: "paid", amountDue: 0, subtotal: 42, basePrice: 42, addonsTotal: 0 }),
    });
    expect(chainLabels("waiting")).toEqual(["Check out"]);
    pressChain("waiting", "Check out");
    expect(chainLabels("waiting")).toEqual(["Collected", "Back"]);
    pressChain("waiting", "Collected");

    // The chain reports "no method chosen, nothing handed over", which is the
    // truth about what happened at the till and is all this test claims.
    //
    // It is NOT a claim that the resulting write is correct. An earlier version
    // of this assertion was the only coverage of that path, and it passed while
    // the write destroyed the dog's existing payment (#878) — because the value
    // it asserted IS the input that caused the corruption. What gets written
    // for this input is asserted against the row itself, in
    // `useBookingActions.component.test.tsx`.
    expect(onCollectWithPayment.mock.calls[0][1]).toEqual({ method: null, amountTaken: 0 });
  });

  it("steps back to the method choice rather than abandoning the chain", () => {
    renderCheckout();
    pressChain("waiting", "Check out");
    pressChain("waiting", "Cash £42");
    pressChain("waiting", "Back");
    expect(chainLabels("waiting")).toEqual(["Cash £42", "Card £42", "Back"]);
  });

  it("backs all the way out from the method choice", () => {
    renderCheckout();
    pressChain("waiting", "Check out");
    pressChain("waiting", "Back");
    expect(chainLabels("waiting")).toEqual(["Check out"]);
  });

  it("is blocked while a write for that dog is in flight", () => {
    const { onCollectWithPayment } = renderCheckout({ busyIds: new Set(["waiting"]) });
    pressChain("waiting", "Check out");
    expect(onCollectWithPayment).not.toHaveBeenCalled();
  });

  it("does not appear on a dog that is not ready to go home", () => {
    renderStack({ tokensById: tokenMap(), onAction: vi.fn(), onCollectWithPayment: vi.fn() });
    fireEvent.click(head("bathing"));
    expect(card("bathing").querySelector("[data-checkout-chain]")).toBeNull();
  });
});

describe("the price on a card", () => {
  const withPrice = (props = {}) => {
    const onSetPrice = vi.fn();
    const utils = renderStack({
      tokensById: tokenMap(),
      onAction: vi.fn(),
      onCollectWithPayment: vi.fn(),
      onSetPrice,
      ...props,
    });
    fireEvent.click(head("waiting"));
    return { ...utils, onSetPrice };
  };

  it("writes the edited figure in pounds", () => {
    const { onSetPrice } = withPrice();
    fireEvent.click(within(card("waiting")).getByLabelText(/Change the price for Bramble/));
    const input = within(card("waiting")).getByLabelText("Price for Bramble, in pounds");
    fireEvent.change(input, { target: { value: "55" } });
    fireEvent.blur(input);
    expect(onSetPrice).toHaveBeenCalledWith(expect.objectContaining({ id: "waiting" }), 55);
  });

  it("edits the base price, not the total, so add-ons are not counted twice", () => {
    const { onSetPrice } = withPrice({
      paymentOf: () => ({ kind: "due", amountDue: 52, subtotal: 52, basePrice: 42, addonsTotal: 10 }),
    });
    fireEvent.click(within(card("waiting")).getByLabelText(/Change the price for Bramble/));
    const input = within(card("waiting")).getByLabelText("Price for Bramble, in pounds");
    // The field opens on the BASE price, not the £52 total shown on the row.
    expect(input.value).toBe("42");
    fireEvent.change(input, { target: { value: "48" } });
    fireEvent.blur(input);
    expect(onSetPrice).toHaveBeenCalledWith(expect.anything(), 48);
  });

  it("shows the arithmetic when there are add-ons", () => {
    withPrice({
      paymentOf: () => ({ kind: "due", amountDue: 52, subtotal: 52, basePrice: 42, addonsTotal: 10 }),
    });
    expect(within(card("waiting")).getByText(/\(£42 \+ £10\)/)).toBeTruthy();
  });

  it("writes nothing when the figure is unchanged", () => {
    const { onSetPrice } = withPrice();
    fireEvent.click(within(card("waiting")).getByLabelText(/Change the price for Bramble/));
    fireEvent.blur(within(card("waiting")).getByLabelText("Price for Bramble, in pounds"));
    expect(onSetPrice).not.toHaveBeenCalled();
  });

  it("stops being editable once the chain has started", () => {
    withPrice();
    expect(within(card("waiting")).queryByLabelText(/Change the price for Bramble/)).toBeTruthy();
    pressChain("waiting", "Check out");
    expect(within(card("waiting")).queryByLabelText(/Change the price for Bramble/)).toBeNull();
  });
});

describe("the route to the full invoice", () => {
  it("is offered quietly, for the add-on, split or discount the chain cannot do", () => {
    const onOpenInvoice = vi.fn();
    renderStack({ tokensById: tokenMap(), onAction: vi.fn(), onOpenInvoice });
    fireEvent.click(head("waiting"));
    fireEvent.click(within(card("waiting")).getByLabelText("Open full invoice — Bramble"));
    expect(onOpenInvoice).toHaveBeenCalledWith(expect.objectContaining({ id: "waiting" }));
  });
});

describe("fixed-header welfare disclosure", () => {
  it("reveals every long warning in the details area without putting text into the header", () => {
    const warnings = ["Nervous / Anxious", "Needs a quiet room and a slow introduction before grooming"];
    renderStack({ getWelfare: () => ({ alerts: warnings }) });
    const target = card("bathing");
    const safety = within(target).getByRole("button", { name: `Safety alert: ${warnings.join(", ")}` });
    fireEvent.click(safety);
    expect(head("bathing").getAttribute("aria-expanded")).toBe("true");
    const details = target.querySelector("[data-stack-details]");
    expect(details.textContent).toContain(warnings.join(", "));
    expect(target.querySelector("[data-stack-header]").contains(details)).toBe(false);
  });
});
