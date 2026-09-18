// The day stack's rendering contract.
//
// Ordering and timing are unit-tested in src/engine/dayStack.test.ts. This file
// is about what a member of staff can actually see and reach: that colour is
// never carrying a meaning on its own, that the safety note is readable without
// a tap, and that the disclosure behaves.
import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { DayStack } from "./DayStack.jsx";
import { buildDayStack } from "../../../../engine/dayStack";
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
    status: BOOKING_STATUS.IN_BATH,
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
    status: BOOKING_STATUS.READY_FOR_PICKUP,
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
    status: BOOKING_STATUS.CANCELLED,
    cancelReason: NO_SHOW_REASON,
    service: "full-groom",
    _dogId: "d4",
    _bookingDate: TODAY,
  },
];

const WELFARE = {
  d2: { alerts: ["Bites / Nips"], pregnant: false, notes: "" },
};

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
  it("lists every live booking, earliest first, including the no-show", () => {
    renderStack();
    const ids = [...document.querySelectorAll("[data-stack-card]")]
      .map((el) => el.getAttribute("data-booking-id"));
    expect(ids).toEqual(["waiting", "bathing", "absent", "arriving"]);
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
    ["bathing", "In the bath"],
    ["arriving", "Expected"],
    ["absent", "No-show"],
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
